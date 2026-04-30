// [Task #697] 역할별 알림 커버리지 진단 스크립트.
//
// tasks 테이블에 buildingId 컬럼이 없으므로(이 앱의 tasks 는 단일 건물 테넌트
// 컨텍스트에서 사용된다), 전체 활성 업무를 카테고리/역할 기준으로 집계해
// 시설(facility_staff)/회계(accountant)/관리소장(manager) 각 카드에 몇 건씩
// 노출될지를 한눈에 보여준다.
//
// 사용법:
//   pnpm --filter @workspace/scripts run audit-role-coverage
//
// 출력:
//   1) stdout 에 사람이 읽기 좋은 표/요약을 인쇄한다.
//   2) `.local/audits/role-coverage-<YYYYMMDD-HHmm>.md` 에 동일 결과를 마크다운
//      리포트로 저장한다 (PR 첨부/리뷰 트래킹용).
// 사용자가 지목한 임계값(facility>=3, accountant>=1) 도 자동으로 점검해
// 마지막 줄에 PASS/WARN 을 표시한다.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { db, pool, tasksTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import {
  categoryToTargetRoles,
  targetRolesIncludes,
} from "@workspace/shared/role-routing";

interface CategoryBucket {
  category: string;
  total: number;
  manager: number;
  facility: number;
  accountant: number;
  emptyTargetRoles: number;
}

async function main(): Promise<void> {
  const rows = await db
    .select({
      category: tasksTable.category,
      targetRoles: tasksTable.targetRoles,
    })
    .from(tasksTable)
    .where(sql`${tasksTable.status} <> 'completed'`);

  const buckets = new Map<string, CategoryBucket>();
  let manager = 0;
  let facility = 0;
  let accountant = 0;
  let empty = 0;

  for (const t of rows) {
    const cat = (t.category ?? "(null)") as string;
    if (!buckets.has(cat)) {
      buckets.set(cat, {
        category: cat,
        total: 0,
        manager: 0,
        facility: 0,
        accountant: 0,
        emptyTargetRoles: 0,
      });
    }
    const b = buckets.get(cat)!;
    b.total += 1;

    const explicit = Array.isArray(t.targetRoles) ? t.targetRoles : [];
    // [Task #697] 빈 배열은 카테고리 기반 fallback (서버 alert 빌더와 동일).
    const effective =
      explicit.length === 0
        ? categoryToTargetRoles(t.category ?? null)
        : explicit;
    if (explicit.length === 0) {
      b.emptyTargetRoles += 1;
      empty += 1;
    }
    if (targetRolesIncludes(effective, "manager")) {
      b.manager += 1;
      manager += 1;
    }
    if (targetRolesIncludes(effective, "facility_staff")) {
      b.facility += 1;
      facility += 1;
    }
    if (targetRolesIncludes(effective, "accountant")) {
      b.accountant += 1;
      accountant += 1;
    }
  }

  const sortedBuckets = [...buckets.values()].sort((a, z) => z.total - a.total);

  console.log("[audit-role-coverage] Active task count by category and role:");
  console.log(
    "category\ttotal\tmanager\tfacility\taccountant\temptyTargetRoles",
  );
  for (const b of sortedBuckets) {
    console.log(
      [b.category, b.total, b.manager, b.facility, b.accountant, b.emptyTargetRoles].join("\t"),
    );
  }

  console.log("\n[audit-role-coverage] Totals:");
  console.log(`  total active tasks    = ${rows.length}`);
  console.log(`  visible to manager    = ${manager}`);
  console.log(`  visible to facility   = ${facility}`);
  console.log(`  visible to accountant = ${accountant}`);
  console.log(`  empty targetRoles     = ${empty} (will fall back to category default)`);

  // [Task #697] 사용자가 지목한 임계값. 단일 건물(혹은 테넌트) 컨텍스트에서
  //   대시보드 "필수업무현황" 카드가 시설>=3, accountant>=1 을 충족하는지.
  console.log("\n[Task #697 임계값 점검]");
  const facOk = facility >= 3;
  const accOk = accountant >= 1;
  console.log(`  facility = ${facility} (>= 3 필요)  ${facOk ? "PASS" : "WARN"}`);
  console.log(`  accountant = ${accountant} (>= 1 필요)  ${accOk ? "PASS" : "WARN"}`);

  // [Task #697] 마크다운 리포트 저장 — `.local/audits/role-coverage-<ts>.md`.
  //   PR 리뷰/회귀 추적 시 첨부 가능하도록 stdout 과 동일 정보를 파일로 떨군다.
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "-")
    .slice(0, 13); // YYYYMMDD-HHmm
  const reportDir = path.resolve(process.cwd(), ".local", "audits");
  const reportPath = path.join(reportDir, `role-coverage-${ts}.md`);
  await mkdir(reportDir, { recursive: true });

  const md: string[] = [];
  md.push("# Task #697 — 역할별 활성 업무 커버리지 리포트");
  md.push("");
  md.push(`- 생성 시각: ${new Date().toISOString()}`);
  md.push(`- 대상: \`tasks\` 테이블의 \`status <> 'completed'\` 활성 업무`);
  md.push(`- 단위: 단일 테넌트(이 앱 \`tasks\` 에는 buildingId 가 없음)`);
  md.push("");
  md.push("## 카테고리별 분포");
  md.push("");
  md.push("| 카테고리 | 전체 | manager | facility_staff | accountant | targetRoles 미지정 |");
  md.push("|---|---:|---:|---:|---:|---:|");
  for (const b of sortedBuckets) {
    md.push(
      `| ${b.category} | ${b.total} | ${b.manager} | ${b.facility} | ${b.accountant} | ${b.emptyTargetRoles} |`,
    );
  }
  md.push("");
  md.push("## 합계");
  md.push("");
  md.push(`- 활성 업무 합계: **${rows.length}**`);
  md.push(`- manager 카드 노출: **${manager}**`);
  md.push(`- facility_staff 카드 노출: **${facility}**`);
  md.push(`- accountant 카드 노출: **${accountant}**`);
  md.push(`- targetRoles 미지정(=카테고리 기본값 폴백): **${empty}**`);
  md.push("");
  md.push("## 임계값 점검 (사용자 요건)");
  md.push("");
  md.push(`- facility_staff ≥ 3: **${facOk ? "PASS" : "WARN"}** (현재 ${facility})`);
  md.push(`- accountant ≥ 1: **${accOk ? "PASS" : "WARN"}** (현재 ${accountant})`);
  md.push("");
  if (!accOk) {
    md.push("> WARN 보충: accountant 카운트가 0 인 경우, 활성 회계/관리비 업무가");
    md.push("> 한 건도 없는 상태이거나 모두 `completed` 상태입니다. 새 회계 업무가");
    md.push("> 등록되면(서버 alert 빌더가 `targetRoles=[\"accountant\"]` 자동 부여)");
    md.push("> 자동으로 경리 카드에 표시됩니다.");
  }

  await writeFile(reportPath, md.join("\n") + "\n", "utf8");
  console.log(`\n[audit-role-coverage] markdown report → ${reportPath}`);
}

main().then(
  async () => {
    await pool.end();
    process.exit(0);
  },
  async (err) => {
    console.error("[audit-role-coverage] FAILED:", err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  },
);
