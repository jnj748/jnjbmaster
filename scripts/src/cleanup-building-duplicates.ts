// [Task #642] 일회성 데이터 정리 스크립트.
//
// 두 가지 누적 회귀를 정리한다:
//   1) 같은 (address_jibun, name) 조합으로 buildings 행이 여러 개 있고, 그중 사용자
//      연결이 0명인 "고아" 행. 자식 데이터(회계/검침/청구 등)가 붙어 있으면 건너뛰고
//      따로 리포트한다. 안전한 행은 archive 처리 — 이름 끝에 [archived@TS] 표식을
//      붙이고 address_jibun/address_full 을 비워 향후 중복 검사에서 제외시킨다(soft
//      delete; FK ON DELETE 로 자식이 함께 사라지는 사고를 막기 위함).
//   2) 같은 building_id 에 동일 role(manager/accountant) 활성 사용자가 2명 이상이면,
//      created_at 이 가장 늦거나 이메일이 placeholder(@manager.local 등) 인 쪽을
//      비활성(approval_status='inactive') 으로 내려 1명만 남긴다.
//
// 기본은 dry-run. 실제 적용은 `--apply`.
//
// 실행:
//   pnpm --filter @workspace/scripts run cleanup-building-duplicates
//   pnpm --filter @workspace/scripts run cleanup-building-duplicates -- --apply

import { db, buildingsTable, usersTable, pool } from "@workspace/db";
import {
  accountingInitialFilesTable,
  buildingMonthlyRecordsTable,
  monthlyBillSummariesTable,
  inspectionsTable,
  safetyChecklistsTable,
  maintenanceLogsTable,
  unitsTable,
  vehiclesTable,
  workReportsTable,
  complaintsTable,
  rfqsTable,
  contractsTable,
  paymentRequestsTable,
  expenseVouchersTable,
  documentsTable,
  buildingWarrantiesTable,
  workLogEntriesTable,
  dailyJournalsTable,
  approvalsTable,
} from "@workspace/db";
import { eq, and, sql, inArray, ne } from "drizzle-orm";

type ApplyMode = "dry-run" | "apply";

const APPLY: ApplyMode = process.argv.slice(2).includes("--apply") ? "apply" : "dry-run";

function header(title: string): void {
  console.log("");
  console.log(`========== ${title} (${APPLY}) ==========`);
}

// 자식 행이 있는지 확인할 테이블 목록(있으면 건너뛰고 리포트만).
// 임의 truncate 사고를 막기 위해 보수적으로 넓게 잡는다.
// 각 child 테이블 항목은 자기 자신의 typed buildingId 컬럼 참조를 함께 들고 다닌다.
// 그 덕에 countChildrenForBuilding 안에서 `as any` 없이 drizzle 의 SQLWrapper 타입으로
// `eq(...)` 를 호출할 수 있고, 향후 컬럼 이름이 바뀌면 이 배열에서 컴파일 타임에 잡힌다.
const CHILD_TABLES_TO_CHECK = [
  { name: "accounting_initial_files", table: accountingInitialFilesTable, buildingIdCol: accountingInitialFilesTable.buildingId },
  { name: "building_monthly_records", table: buildingMonthlyRecordsTable, buildingIdCol: buildingMonthlyRecordsTable.buildingId },
  { name: "monthly_bill_summaries", table: monthlyBillSummariesTable, buildingIdCol: monthlyBillSummariesTable.buildingId },
  { name: "inspections", table: inspectionsTable, buildingIdCol: inspectionsTable.buildingId },
  { name: "safety_checklists", table: safetyChecklistsTable, buildingIdCol: safetyChecklistsTable.buildingId },
  { name: "maintenance_logs", table: maintenanceLogsTable, buildingIdCol: maintenanceLogsTable.buildingId },
  { name: "units", table: unitsTable, buildingIdCol: unitsTable.buildingId },
  { name: "vehicles", table: vehiclesTable, buildingIdCol: vehiclesTable.buildingId },
  { name: "work_reports", table: workReportsTable, buildingIdCol: workReportsTable.buildingId },
  { name: "complaints", table: complaintsTable, buildingIdCol: complaintsTable.buildingId },
  { name: "rfqs", table: rfqsTable, buildingIdCol: rfqsTable.buildingId },
  { name: "contracts", table: contractsTable, buildingIdCol: contractsTable.buildingId },
  { name: "payment_requests", table: paymentRequestsTable, buildingIdCol: paymentRequestsTable.buildingId },
  { name: "expense_vouchers", table: expenseVouchersTable, buildingIdCol: expenseVouchersTable.buildingId },
  { name: "documents", table: documentsTable, buildingIdCol: documentsTable.buildingId },
  { name: "building_warranties", table: buildingWarrantiesTable, buildingIdCol: buildingWarrantiesTable.buildingId },
  { name: "work_log_entries", table: workLogEntriesTable, buildingIdCol: workLogEntriesTable.buildingId },
  { name: "daily_journals", table: dailyJournalsTable, buildingIdCol: dailyJournalsTable.buildingId },
  { name: "approvals", table: approvalsTable, buildingIdCol: approvalsTable.buildingId },
] as const;

async function countChildrenForBuilding(buildingId: number): Promise<{ table: string; count: number }[]> {
  const out: { table: string; count: number }[] = [];
  for (const t of CHILD_TABLES_TO_CHECK) {
    const rows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(t.table)
      .where(eq(t.buildingIdCol, buildingId));
    const c = rows[0]?.count ?? 0;
    if (c > 0) out.push({ table: t.name, count: c });
  }
  return out;
}

async function passOneOrphanBuildings(): Promise<void> {
  header("PASS 1: orphan duplicate buildings (same address_jibun + name, 0 users)");
  // 같은 (address_jibun, name) 으로 묶이는 buildings 그룹을 찾는다.
  const groupRows = await db
    .select({
      addressJibun: buildingsTable.addressJibun,
      name: buildingsTable.name,
      cnt: sql<number>`count(*)::int`,
    })
    .from(buildingsTable)
    .groupBy(buildingsTable.addressJibun, buildingsTable.name)
    .having(sql`count(*) > 1`);

  if (groupRows.length === 0) {
    console.log("(no duplicate (address_jibun, name) groups found)");
    return;
  }

  for (const g of groupRows) {
    const groupBuildings = await db
      .select({ id: buildingsTable.id, name: buildingsTable.name, addressJibun: buildingsTable.addressJibun, addressFull: buildingsTable.addressFull, createdAtName: buildingsTable.name })
      .from(buildingsTable)
      .where(and(
        // sql template-safe equality on possibly-null address_jibun
        g.addressJibun == null ? sql`address_jibun IS NULL` : eq(buildingsTable.addressJibun, g.addressJibun),
        eq(buildingsTable.name, g.name),
      ));

    const ids = groupBuildings.map(b => b.id);
    // 사용자 연결 카운트.
    const userCounts = await db
      .select({ buildingId: usersTable.buildingId, cnt: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(inArray(usersTable.buildingId, ids))
      .groupBy(usersTable.buildingId);
    const userCountByBuildingId = new Map<number, number>();
    for (const row of userCounts) {
      if (row.buildingId != null) userCountByBuildingId.set(row.buildingId, row.cnt);
    }

    console.log(
      `\n[group] address_jibun=${g.addressJibun ?? "(null)"} name="${g.name}" buildings=${ids.join(",")}`,
    );

    for (const b of groupBuildings) {
      const userCount = userCountByBuildingId.get(b.id) ?? 0;
      if (userCount > 0) {
        console.log(`  - keep   building#${b.id}: users=${userCount}`);
        continue;
      }
      const childCounts = await countChildrenForBuilding(b.id);
      if (childCounts.length > 0) {
        const summary = childCounts.map(c => `${c.table}=${c.count}`).join(", ");
        console.log(`  - SKIP   building#${b.id}: orphan but has child rows — ${summary}`);
        continue;
      }
      // archive 대상.
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const archivedName = `${b.name} [archived@${ts}]`;
      console.log(`  - ARCHIVE building#${b.id}: 0 users, 0 child rows → set name="${archivedName}", clear address_jibun/address_full`);
      if (APPLY === "apply") {
        await db
          .update(buildingsTable)
          .set({ name: archivedName, addressJibun: null, addressFull: null })
          .where(eq(buildingsTable.id, b.id));
      }
    }
  }
}

async function passTwoDuplicateActiveUsers(): Promise<void> {
  header("PASS 2: duplicate active users on same (building_id, role)");
  for (const role of ["manager", "accountant"] as const) {
    const groups = await db
      .select({ buildingId: usersTable.buildingId, cnt: sql<number>`count(*)::int` })
      .from(usersTable)
      .where(and(
        eq(usersTable.role, role),
        eq(usersTable.approvalStatus, "active"),
      ))
      .groupBy(usersTable.buildingId)
      .having(sql`count(*) > 1`);

    const trueGroups = groups.filter(g => g.buildingId != null);
    if (trueGroups.length === 0) {
      console.log(`(no duplicate active ${role} groups)`);
      continue;
    }

    for (const g of trueGroups) {
      if (g.buildingId == null) continue;
      const users = await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          username: usersTable.username,
          name: usersTable.name,
          createdAt: usersTable.createdAt,
        })
        .from(usersTable)
        .where(and(
          eq(usersTable.buildingId, g.buildingId),
          eq(usersTable.role, role),
          eq(usersTable.approvalStatus, "active"),
        ));

      // 정렬 우선순위(살릴 1명을 결정):
      //   1) 이메일이 placeholder(@manager.local / @accountant.local) 가 아닌 쪽
      //   2) created_at 이 더 이른 쪽(먼저 가입한 진짜 주인)
      const score = (u: { email: string | null; createdAt: Date }): [number, number] => {
        const isPlaceholder = !!u.email && /@(manager|accountant)\.local$/i.test(u.email);
        return [isPlaceholder ? 1 : 0, u.createdAt.getTime()];
      };
      const sorted = [...users].sort((a, b) => {
        const [pa, ta] = score(a);
        const [pb, tb] = score(b);
        if (pa !== pb) return pa - pb;
        return ta - tb;
      });
      const keep = sorted[0];
      const drop = sorted.slice(1);

      console.log(`\n[${role}] building#${g.buildingId}: ${users.length} active ${role}s`);
      console.log(`  KEEP   user#${keep.id} email=${keep.email ?? "(null)"} username=${keep.username ?? "(null)"} created=${keep.createdAt.toISOString()}`);
      for (const u of drop) {
        console.log(`  INACTIVATE user#${u.id} email=${u.email ?? "(null)"} username=${u.username ?? "(null)"} created=${u.createdAt.toISOString()}`);
        if (APPLY === "apply") {
          await db
            .update(usersTable)
            .set({ approvalStatus: "rejected" })
            .where(and(eq(usersTable.id, u.id), ne(usersTable.id, keep.id)));
        }
      }
    }
  }
}

async function main(): Promise<void> {
  console.log(`[cleanup-building-duplicates] mode=${APPLY}`);
  console.log("Tip: run without --apply first to preview changes; add --apply to commit.");

  await passOneOrphanBuildings();
  await passTwoDuplicateActiveUsers();

  console.log("");
  console.log(`[cleanup-building-duplicates] done (${APPLY})`);
  await pool.end();
}

main().catch(async (e) => {
  console.error("[cleanup-building-duplicates] failed:", e);
  try { await pool.end(); } catch { /* noop */ }
  process.exit(1);
});
