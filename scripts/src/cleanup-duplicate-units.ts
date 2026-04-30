// [Task #694] 일회성 데이터 정리 스크립트 — units 테이블의 중복 호실 행 제거.
//
// 배경:
//   #693 머지 이전의 호실 가져오기는 건축물대장 응답을 그룹핑하지 않아, 같은
//   (buildingId, dong, unitNumber) 호실(예: 2203, 505)이 응답 행 수만큼 5번씩
//   중복 등록되어 units 테이블에 남아 있을 수 있다. #693 신규 가져오기는 멱등이라
//   재실행해도 새 중복은 만들지 않지만, 이미 만들어진 중복 행은 자동으로 사라지지
//   않는다.
//
// 정책:
//   같은 (buildingId, dong, floor, unitNumber) 그룹이 2행 이상이면 그중 사용자
//   수기 정보(소유자/입주민/연락처/메모/입주일/사업자번호/온보딩카드 등)가 가장
//   많이 채워진 행을 보존(keep)하고 나머지를 삭제(drop) 대상으로 선정한다.
//   동점이면 createdAt 가 가장 이른 행(= 처음 등록된 행)을 우선 보존한다.
//
// 안전장치:
//   - drop 대상에 child 테이블 행(임차인/검침/카드토큰/민원/소유자/월수납/연체조치/
//     투표 등) 이 하나라도 붙어 있으면 그룹 전체를 SKIP 하고 리포트만 남긴다.
//     자동 재배치는 데이터 정합 위험이 커서 운영자가 수동으로 처리하도록 둔다.
//   - dryRun(default) 모드에서는 어떠한 DB 변경도 일어나지 않는다.
//   - --apply 모드는 그룹 단위 트랜잭션으로 삭제하고 빌딩별 삭제 행수를 로그에 남긴다.
//
// 호출 권한:
//   본 스크립트는 DATABASE_URL 에 직접 접근할 수 있는 운영자(= 사실상 platform_admin
//   권한자) 만 실행 가능하다. HTTP 엔드포인트가 아닌 CLI 형태로 두는 것이 사고 시
//   영향 반경을 좁히고, 기존 cleanup-building-duplicates.ts 패턴과도 일관된다.
//
// 실행:
//   pnpm --filter @workspace/scripts run cleanup-duplicate-units
//   pnpm --filter @workspace/scripts run cleanup-duplicate-units -- --apply

import { db, unitsTable, pool } from "@workspace/db";
import {
  tenantsTable,
  voteBallotsTable,
  tenantCardTokensTable,
  meterReadingsTable,
  complaintsTable,
  ownersTable,
  monthlyPaymentsTable,
  delinquencyActionsTable,
} from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";

type ApplyMode = "dry-run" | "apply";

const APPLY: ApplyMode = process.argv.slice(2).includes("--apply") ? "apply" : "dry-run";

function header(title: string): void {
  console.log("");
  console.log(`========== ${title} (${APPLY}) ==========`);
}

// drop 후보 행에 자식 데이터가 붙어 있는지 확인할 테이블 목록.
// monthly_payments 는 ON DELETE CASCADE 이지만 사용자 결제 이력이 사라지는 사고를
// 막기 위해 보수적으로 SKIP 신호로 간주한다(=결제 이력이 있으면 그 호실은 살아있는
// 호실이라는 뜻이므로 자동 삭제 대상이 아님).
const CHILD_TABLES_TO_CHECK = [
  { name: "tenants", table: tenantsTable, unitIdCol: tenantsTable.unitId },
  { name: "vote_ballots", table: voteBallotsTable, unitIdCol: voteBallotsTable.unitId },
  { name: "tenant_card_tokens", table: tenantCardTokensTable, unitIdCol: tenantCardTokensTable.unitId },
  { name: "meter_readings", table: meterReadingsTable, unitIdCol: meterReadingsTable.unitId },
  { name: "complaints", table: complaintsTable, unitIdCol: complaintsTable.unitId },
  { name: "owners", table: ownersTable, unitIdCol: ownersTable.unitId },
  { name: "monthly_payments", table: monthlyPaymentsTable, unitIdCol: monthlyPaymentsTable.unitId },
  { name: "delinquency_actions", table: delinquencyActionsTable, unitIdCol: delinquencyActionsTable.unitId },
] as const;

type UnitRow = typeof unitsTable.$inferSelect;

async function countChildrenForUnits(unitIds: number[]): Promise<Map<number, { table: string; count: number }[]>> {
  const out = new Map<number, { table: string; count: number }[]>();
  for (const id of unitIds) out.set(id, []);
  if (unitIds.length === 0) return out;
  for (const t of CHILD_TABLES_TO_CHECK) {
    // (vote_ballots / meter_reading_audits 처럼) unit_id 컬럼이 nullable 이어도 inArray 로 안전.
    const rows = await db
      .select({ unitId: t.unitIdCol, cnt: sql<number>`count(*)::int` })
      .from(t.table)
      .where(inArray(t.unitIdCol, unitIds))
      .groupBy(t.unitIdCol);
    for (const r of rows) {
      if (r.unitId == null) continue;
      const c = r.cnt ?? 0;
      if (c <= 0) continue;
      const list = out.get(r.unitId);
      if (list) list.push({ table: t.name, count: c });
    }
  }
  return out;
}

// 사용자 수기 입력 신호의 가중치 합계. 점수가 높을수록 보존(keep) 우선.
// 동점이면 createdAt 가 더 이른 행(= 먼저 등록된 행)을 우선 보존한다.
//   - ownerSource ∈ (manual, csv) 는 명백한 수기 출처 → 가장 큰 가중치.
//   - resident*/owner*/notes/businessNumber/onboarding 은 운영자가 채웠을 신호.
//   - delinquentMonths/Amount, status, occupancyStatus 도 운영 흔적.
function userDataScore(u: UnitRow): number {
  let s = 0;
  if (u.ownerSource === "manual" || u.ownerSource === "csv") s += 100;
  if (u.residentName) s += 10;
  if (u.residentPhone) s += 10;
  if (u.ownerName) s += 5;
  if (u.ownerPhone) s += 5;
  if (u.ownerAddress) s += 3;
  if (u.notes) s += 2;
  if (u.entryDate) s += 2;
  if (u.businessNumber) s += 2;
  if (u.hasOnboardingCard) s += 5;
  if (u.onboardingSignedAt) s += 3;
  if ((u.delinquentMonths ?? 0) > 0) s += 1;
  if ((u.delinquentAmount ?? 0) > 0) s += 1;
  if (u.status && u.status !== "vacant") s += 1;
  if (u.occupancyStatus && u.occupancyStatus !== "미등록") s += 1;
  return s;
}

function compactSummary(u: UnitRow): string {
  const tags: string[] = [];
  if (u.ownerSource) tags.push(`ownerSource=${u.ownerSource}`);
  if (u.ownerName) tags.push("owner");
  if (u.residentName) tags.push("resident");
  if (u.notes) tags.push("notes");
  if (u.entryDate) tags.push("entryDate");
  if (u.businessNumber) tags.push("biz#");
  if (u.hasOnboardingCard) tags.push("onboardingCard");
  if (u.source) tags.push(`source=${u.source}`);
  return tags.length > 0 ? tags.join(",") : "(empty)";
}

async function findDuplicateGroups(): Promise<
  Array<{ buildingId: number; dong: string; floor: string; unitNumber: string; cnt: number }>
> {
  // 빈 dong 도 동일 그룹으로 묶기 위해 NULL/공백 정규화 없이 컬럼 그대로 사용.
  // floor 는 정규화 없이 raw 값으로 그룹핑한다(같은 응답 행에서 5번 복제된 케이스가
  // 본 정리의 주된 타깃이며, 그 경우 floor 는 동일한 raw 문자열이다).
  return db
    .select({
      buildingId: unitsTable.buildingId,
      dong: unitsTable.dong,
      floor: unitsTable.floor,
      unitNumber: unitsTable.unitNumber,
      cnt: sql<number>`count(*)::int`,
    })
    .from(unitsTable)
    .groupBy(unitsTable.buildingId, unitsTable.dong, unitsTable.floor, unitsTable.unitNumber)
    .having(sql`count(*) > 1`);
}

async function main(): Promise<void> {
  console.log(`[cleanup-duplicate-units] mode=${APPLY}`);
  console.log("Tip: run without --apply first to preview changes; add --apply to commit.");

  header("Scan duplicate (buildingId, dong, floor, unitNumber) groups");
  const groups = await findDuplicateGroups();
  if (groups.length === 0) {
    console.log("(no duplicate unit groups found)");
    await pool.end();
    return;
  }
  console.log(`Found ${groups.length} duplicate group(s).`);

  // 빌딩별 통계.
  const perBuilding = new Map<
    number,
    { groups: number; rowsScanned: number; deleted: number; skipped: number }
  >();
  function bumpBuilding(buildingId: number, key: "groups" | "rowsScanned" | "deleted" | "skipped", n = 1): void {
    const cur = perBuilding.get(buildingId) ?? { groups: 0, rowsScanned: 0, deleted: 0, skipped: 0 };
    cur[key] += n;
    perBuilding.set(buildingId, cur);
  }

  let totalDeleted = 0;
  let totalSkippedGroups = 0;

  for (const g of groups) {
    bumpBuilding(g.buildingId, "groups");

    // 그룹 내 모든 행 로드.
    const rows = await db
      .select()
      .from(unitsTable)
      .where(
        and(
          eq(unitsTable.buildingId, g.buildingId),
          eq(unitsTable.dong, g.dong),
          eq(unitsTable.floor, g.floor),
          eq(unitsTable.unitNumber, g.unitNumber),
        ),
      );
    bumpBuilding(g.buildingId, "rowsScanned", rows.length);

    if (rows.length <= 1) continue; // 동시 변경 보호.

    // 점수순 + createdAt 오름차순 정렬 → 첫 번째가 keep.
    const sorted = [...rows].sort((a, b) => {
      const sa = userDataScore(a);
      const sb = userDataScore(b);
      if (sa !== sb) return sb - sa;
      const ta = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const tb = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      if (ta !== tb) return ta - tb;
      return a.id - b.id;
    });
    const keep = sorted[0];
    const drop = sorted.slice(1);

    // drop 후보의 자식 행 카운트.
    const dropIds = drop.map((u) => u.id);
    const childMap = await countChildrenForUnits(dropIds);
    const dropsWithChildren = drop.filter((u) => (childMap.get(u.id) ?? []).length > 0);

    console.log(
      `\n[group] building#${g.buildingId} dong="${g.dong}" floor="${g.floor}" unit="${g.unitNumber}" total=${rows.length}`,
    );
    console.log(
      `  KEEP   unit#${keep.id} score=${userDataScore(keep)} created=${keep.createdAt.toISOString()} ${compactSummary(keep)}`,
    );

    if (dropsWithChildren.length > 0) {
      // 안전 SKIP — 자식 데이터 보존을 위해 그룹 전체를 건드리지 않는다.
      bumpBuilding(g.buildingId, "skipped", drop.length);
      totalSkippedGroups++;
      console.log(
        `  SKIP   group: ${dropsWithChildren.length}/${drop.length} drop candidate(s) have child rows; manual reconciliation required.`,
      );
      for (const u of drop) {
        const ch = childMap.get(u.id) ?? [];
        const tag = ch.length > 0 ? ch.map((c) => `${c.table}=${c.count}`).join(", ") : "(no children)";
        console.log(`    - drop? unit#${u.id} score=${userDataScore(u)} children: ${tag}`);
      }
      continue;
    }

    // 삭제 실행(또는 dry-run 로깅).
    for (const u of drop) {
      console.log(`  DROP   unit#${u.id} score=${userDataScore(u)} created=${u.createdAt.toISOString()} ${compactSummary(u)}`);
    }
    if (APPLY === "apply") {
      await db.transaction(async (tx) => {
        await tx.delete(unitsTable).where(inArray(unitsTable.id, dropIds));
      });
    }
    bumpBuilding(g.buildingId, "deleted", drop.length);
    totalDeleted += drop.length;
  }

  header("Summary per building");
  const buildingIds = [...perBuilding.keys()].sort((a, b) => a - b);
  for (const id of buildingIds) {
    const s = perBuilding.get(id)!;
    console.log(
      `  building#${id}: groups=${s.groups} rows=${s.rowsScanned} ${APPLY === "apply" ? "deleted" : "wouldDelete"}=${s.deleted} skippedRows=${s.skipped}`,
    );
  }

  console.log("");
  console.log(
    `[cleanup-duplicate-units] done (${APPLY}): groups=${groups.length} ${APPLY === "apply" ? "deleted" : "wouldDelete"}Rows=${totalDeleted} skippedGroups=${totalSkippedGroups}`,
  );
  await pool.end();
}

main().catch(async (e) => {
  console.error("[cleanup-duplicate-units] failed:", e);
  try { await pool.end(); } catch { /* noop */ }
  process.exit(1);
});
