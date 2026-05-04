// [Task #833] 자동이체 폴링 잡 실행 이력.
//
//   매 polling tick(scheduler.runAutoDebitPollTick)마다 한 행을 적재한다.
//   본사 운영 화면에서 잡 가시성(마지막 실행/스캔/업데이트/실패/PG 미설정)을
//   확인하기 위한 운영 메타데이터다.
//
//   enabled=false 인 행은 PG_AUTO_DEBIT_POLL_URL 미설정 상태(잡 자체는 살아있되
//   no-op) 를 의미한다. 운영 화면에서 "PG 미연동" 배너로 노출.

import { pgTable, serial, integer, text, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const autoDebitPollRunsTable = pgTable(
  "auto_debit_poll_runs",
  {
    id: serial("id").primaryKey(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }).notNull().defaultNow(),
    durationMs: integer("duration_ms").notNull().default(0),
    enabled: boolean("enabled").notNull().default(false),
    scanned: integer("scanned").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    error: text("error"),
  },
  (t) => ({
    byStartedAt: index("auto_debit_poll_runs_started_idx").on(t.startedAt),
  }),
);

export type AutoDebitPollRun = typeof autoDebitPollRunsTable.$inferSelect;
export type InsertAutoDebitPollRun = typeof autoDebitPollRunsTable.$inferInsert;
