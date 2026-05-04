-- [Task #833] auto_debit_poll_runs — 자동이체 폴링 잡 실행 이력.
--   매 polling tick(scheduler.runAutoDebitPollTick) 결과를 영속 저장하여
--   본사 운영 화면에서 잡 가시성(스캔/업데이트/오류/실행시각) 을 제공한다.
CREATE TABLE IF NOT EXISTS "auto_debit_poll_runs" (
  "id" serial PRIMARY KEY,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "finished_at" timestamp with time zone NOT NULL DEFAULT now(),
  "duration_ms" integer NOT NULL DEFAULT 0,
  "enabled" boolean NOT NULL DEFAULT false,
  "scanned" integer NOT NULL DEFAULT 0,
  "updated" integer NOT NULL DEFAULT 0,
  "error" text
);
CREATE INDEX IF NOT EXISTS "auto_debit_poll_runs_started_idx"
  ON "auto_debit_poll_runs" ("started_at");
