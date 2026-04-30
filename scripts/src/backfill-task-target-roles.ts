// [Task #697] tasks.target_roles 백필 스크립트.
//
// 신규 컬럼은 default '{}' 로 추가됐기 때문에 기존 행들은 빈 배열을 가진다.
// 이 상태에서는 대시보드의 시설/회계 카드 필터(서버 추정 fallback) 가 alert
// 단계에서 한번 더 categoryToTargetRoles 로 채워주긴 하지만, 본부에서 명시적으로
// "이 업무는 시설기사한테도 보내라" 라고 지정한 효과를 데이터로 남기기 위해
// 한번 백필을 돌린다.
//
// 사용법:
//   pnpm --filter @workspace/scripts run backfill-task-target-roles -- --dry-run
//   pnpm --filter @workspace/scripts run backfill-task-target-roles
//
// --dry-run 모드는 카테고리별 카운트만 출력하고 DB 를 변경하지 않는다.

import { db, pool, tasksTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { categoryToTargetRoles } from "@workspace/shared/role-routing";

interface CountByCategory {
  category: string;
  count: number;
  willSet: string[];
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  // [Task #697] 빈 배열인 행만 대상. 이미 명시 지정된 행은 절대 덮어쓰지 않는다.
  const rows = await db
    .select({ id: tasksTable.id, category: tasksTable.category })
    .from(tasksTable)
    .where(sql`coalesce(array_length(${tasksTable.targetRoles}, 1), 0) = 0`);

  if (rows.length === 0) {
    console.log("[backfill-task-target-roles] No rows to backfill.");
    return;
  }

  const buckets = new Map<string, CountByCategory>();
  for (const r of rows) {
    const cat = (r.category ?? "") as string;
    const key = cat || "(null)";
    if (!buckets.has(key)) {
      buckets.set(key, {
        category: key,
        count: 0,
        willSet: categoryToTargetRoles(cat),
      });
    }
    const b = buckets.get(key)!;
    b.count += 1;
  }

  console.log(`[backfill-task-target-roles] Candidates: ${rows.length}`);
  console.log("[backfill-task-target-roles] Per-category plan:");
  for (const b of [...buckets.values()].sort((a, z) =>
    z.count - a.count,
  )) {
    console.log(
      `  - ${b.category.padEnd(20)} count=${String(b.count).padStart(5)} → ${JSON.stringify(b.willSet)}`,
    );
  }

  if (dryRun) {
    console.log("[backfill-task-target-roles] --dry-run: no rows updated.");
    return;
  }

  let updated = 0;
  for (const r of rows) {
    const next = categoryToTargetRoles(r.category ?? null);
    await db
      .update(tasksTable)
      .set({ targetRoles: next })
      .where(eq(tasksTable.id, r.id));
    updated += 1;
  }
  console.log(`[backfill-task-target-roles] Updated ${updated} rows.`);
}

main().then(
  async () => {
    await pool.end();
    process.exit(0);
  },
  async (err) => {
    console.error("[backfill-task-target-roles] FAILED:", err);
    await pool.end().catch(() => undefined);
    process.exit(1);
  },
);
