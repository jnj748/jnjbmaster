// [Task #852] 운영 데이터 정리 이력 영구 기록.
//
//   각종 보존 정책(purge) 잡이 실행될 때마다 한 행을 적재한다.
//   - jobName: 어떤 잡이 실행됐는지 (예: "auto_debit_poll_runs", "usage_events").
//   - startedAt / finishedAt / durationMs: 시각 및 소요 시간.
//   - retentionDays: 적용된 보존 기간(일).
//   - deleted: 삭제된 행 수.
//   - error: 실패한 경우 에러 메시지(요약).
//
//   서버 재시작과 무관하게 누적 보관되며, 본사 운영 화면에서 최근 N건을
//   조회해 잡이 정상적으로 돌고 있는지 확인할 때 사용한다.

import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";

export const operationalPurgeRunsTable = pgTable(
  "operational_purge_runs",
  {
    id: serial("id").primaryKey(),
    jobName: text("job_name").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull().defaultNow(),
    durationMs: integer("duration_ms").notNull().default(0),
    retentionDays: integer("retention_days").notNull(),
    deleted: integer("deleted").notNull().default(0),
    error: text("error"),
  },
  (t) => ({
    byJobStarted: index("operational_purge_runs_job_started_idx").on(t.jobName, t.startedAt),
    byStartedAt: index("operational_purge_runs_started_idx").on(t.startedAt),
  }),
);

export type OperationalPurgeRun = typeof operationalPurgeRunsTable.$inferSelect;
export type InsertOperationalPurgeRun = typeof operationalPurgeRunsTable.$inferInsert;
