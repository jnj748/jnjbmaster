// [Task #708] work_log_entries 호실 자동 매칭 백필.
//
// 신규 컬럼/테이블이 아닌, 신규 join 테이블 work_log_entry_units 를 처음 채우기
// 위한 일회성(또는 멱등 재실행 가능한) 백필. 이미 매칭된 entry+unit 쌍은
// 유니크 제약 + onConflictDoNothing 으로 건너뛴다.
//
// 사용법:
//   pnpm --filter @workspace/scripts run backfill-work-log-entry-units -- --dry-run
//   pnpm --filter @workspace/scripts run backfill-work-log-entry-units
//   pnpm --filter @workspace/scripts run backfill-work-log-entry-units -- --building-id=42
//
// --dry-run     : 빌딩별 매칭 건수만 출력하고 DB 를 변경하지 않음.
// --building-id : 특정 건물만 백필.

import { db, pool, workLogEntriesTable, workLogEntryUnitsTable, unitsTable } from "@workspace/db";
import { eq, isNotNull } from "drizzle-orm";
import { matchUnitsInMemo, type UnitRef } from "@workspace/shared/unit-parser";

interface BuildingStat {
  buildingId: number;
  units: number;
  entries: number;
  matchedEntries: number;
  insertedLinks: number;
}

async function loadUnitsForBuilding(buildingId: number): Promise<UnitRef[]> {
  const rows = await db
    .select({
      id: unitsTable.id,
      dong: unitsTable.dong,
      unitNumber: unitsTable.unitNumber,
    })
    .from(unitsTable)
    .where(eq(unitsTable.buildingId, buildingId));
  return rows.map((r) => ({ id: r.id, dong: r.dong ?? "", unitNumber: r.unitNumber }));
}

async function processBuilding(
  buildingId: number,
  dryRun: boolean,
): Promise<BuildingStat> {
  const units = await loadUnitsForBuilding(buildingId);
  const entries = await db
    .select({
      id: workLogEntriesTable.id,
      memo: workLogEntriesTable.memo,
      occurredAt: workLogEntriesTable.occurredAt,
    })
    .from(workLogEntriesTable)
    .where(eq(workLogEntriesTable.buildingId, buildingId));

  if (units.length === 0 || entries.length === 0) {
    return {
      buildingId,
      units: units.length,
      entries: entries.length,
      matchedEntries: 0,
      insertedLinks: 0,
    };
  }

  let matchedEntries = 0;
  let insertedLinks = 0;
  // 1000건씩 끊어 트랜잭션 부담을 줄인다.
  const CHUNK = 1000;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const batch = entries.slice(i, i + CHUNK);
    const valuesToInsert: Array<{
      workLogEntryId: number;
      unitId: number;
      buildingId: number;
      matchSource: "auto";
      occurredAt: Date;
    }> = [];
    for (const e of batch) {
      const matched = matchUnitsInMemo(e.memo, units);
      if (matched.length === 0) continue;
      matchedEntries += 1;
      const occurredAt = e.occurredAt instanceof Date ? e.occurredAt : new Date(e.occurredAt);
      for (const unitId of matched) {
        valuesToInsert.push({
          workLogEntryId: e.id,
          unitId,
          buildingId,
          matchSource: "auto",
          occurredAt,
        });
      }
    }
    if (valuesToInsert.length === 0) continue;
    if (dryRun) {
      insertedLinks += valuesToInsert.length;
      continue;
    }
    // 유니크 제약 (entry, unit) 으로 중복 백필을 안전하게 흡수.
    const inserted = await db
      .insert(workLogEntryUnitsTable)
      .values(valuesToInsert)
      .onConflictDoNothing()
      .returning({ id: workLogEntryUnitsTable.id });
    insertedLinks += inserted.length;
  }

  return {
    buildingId,
    units: units.length,
    entries: entries.length,
    matchedEntries,
    insertedLinks,
  };
}

function parseBuildingIdArg(): number | null {
  const arg = process.argv.find((a) => a.startsWith("--building-id="));
  if (!arg) return null;
  const v = Number(arg.split("=")[1]);
  return Number.isFinite(v) ? v : null;
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const onlyBuilding = parseBuildingIdArg();

  let buildingIds: number[];
  if (onlyBuilding !== null) {
    buildingIds = [onlyBuilding];
  } else {
    const distinct = await db
      .select({ buildingId: workLogEntriesTable.buildingId })
      .from(workLogEntriesTable)
      .where(isNotNull(workLogEntriesTable.buildingId))
      .groupBy(workLogEntriesTable.buildingId);
    buildingIds = distinct
      .map((r) => r.buildingId)
      .filter((v): v is number => v !== null);
  }

  console.log(
    `[backfill-work-log-entry-units] dryRun=${dryRun} buildings=${buildingIds.length}`,
  );

  let totalEntries = 0;
  let totalMatched = 0;
  let totalLinks = 0;
  for (const bid of buildingIds) {
    const stat = await processBuilding(bid, dryRun);
    totalEntries += stat.entries;
    totalMatched += stat.matchedEntries;
    totalLinks += stat.insertedLinks;
    console.log(
      `  building=${bid} units=${stat.units} entries=${stat.entries} matchedEntries=${stat.matchedEntries} ${dryRun ? "wouldInsert" : "inserted"}=${stat.insertedLinks}`,
    );
  }
  console.log(
    `[backfill-work-log-entry-units] DONE buildings=${buildingIds.length} entries=${totalEntries} matchedEntries=${totalMatched} ${dryRun ? "wouldInsert" : "inserted"}=${totalLinks}`,
  );
}

main().then(
  async () => {
    await pool.end();
    process.exit(0);
  },
  async (err) => {
    console.error("[backfill-work-log-entry-units] FAILED:", err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  },
);
