// [Task #854] 런타임 마이그레이션 러너 추적 테이블의 schema 선언.
//
// 배경:
//   `artifacts/api-server/src/lib/runMigrations.ts` 가 부팅 시
//   `_app_migrations(filename text PK, applied_at timestamptz)` 를 직접
//   `CREATE TABLE IF NOT EXISTS` 로 생성·관리한다 (drizzle 의 기본
//   `__drizzle_migrations` 와는 의도적으로 분리 — task #454 참조).
//
//   그 결과 `pnpm --filter @workspace/db run push` 를 돌리면 drizzle-kit 이
//   "DB 에는 있지만 schema 에는 없는" 고아 테이블로 `_app_migrations` 를
//   잡고, 새로 추가된 schema-only 테이블(예: bank_reconciliations,
//   operational_purge_runs 등)을 그것의 rename 후보로 의심해 인터랙티브
//   프롬프트를 띄운다. 이 때문에 운영/CI 환경에서 push 가 멈춘다.
//
// 해결:
//   `_app_migrations` 를 schema 에 똑같이 등록해 둠으로써 drizzle-kit 이
//   더 이상 고아 테이블로 인식하지 않게 한다. 런타임 러너의 기존 동작은
//   그대로 (CREATE TABLE IF NOT EXISTS) 두므로 충돌 없음.

import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const appMigrationsTable = pgTable("_app_migrations", {
  filename: text("filename").primaryKey(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AppMigration = typeof appMigrationsTable.$inferSelect;
export type InsertAppMigration = typeof appMigrationsTable.$inferInsert;
