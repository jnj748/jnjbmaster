-- [Task #853] dispatch_jobs + auto_debit_results 누락 마이그레이션.
--
-- 배경:
--   T10(외부연동 엔진) 의 dispatchJobsTable 과 receivablesFullSet 의
--   autoDebitResultsTable 이 코드/스키마에는 존재하지만 운영 DB 에는
--   대응되는 마이그레이션 파일이 없어 "relation does not exist" 가
--   1분마다(scheduler 폴링) 찍히고 있었다.
--   - dispatch_jobs: scheduler.ts → maybeAlertStaleAutoDebitPoll 등에서
--     조회/INSERT.
--   - auto_debit_results: 자동이체 결과 저장. 향후 폴링에서 사용.
--
--   두 테이블 모두 멱등(IF NOT EXISTS) DDL 로 작성하여 dev/운영 어디서든
--   안전하게 재실행할 수 있다.

-- ── dispatch_jobs ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "dispatch_jobs" (
  "id" serial PRIMARY KEY,
  "building_id" integer REFERENCES "buildings"("id") ON DELETE SET NULL,
  "channel" text NOT NULL,
  "target" text NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "status" text NOT NULL DEFAULT 'queued',
  "attempts" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 5,
  "last_error" text,
  "provider_job_id" text,
  "provider_response" jsonb,
  "related_month" text,
  "related_entity_type" text,
  "related_entity_id" integer,
  "trigger_source" text,
  "scheduled_at" timestamp with time zone NOT NULL DEFAULT now(),
  "sent_at" timestamp with time zone,
  "created_by" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "dispatch_jobs_building_idx"  ON "dispatch_jobs" ("building_id");
CREATE INDEX IF NOT EXISTS "dispatch_jobs_status_idx"    ON "dispatch_jobs" ("status");
CREATE INDEX IF NOT EXISTS "dispatch_jobs_scheduled_idx" ON "dispatch_jobs" ("scheduled_at");
CREATE INDEX IF NOT EXISTS "dispatch_jobs_channel_idx"   ON "dispatch_jobs" ("channel");

-- ── auto_debit_results ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS "auto_debit_results" (
  "id" serial PRIMARY KEY,
  "building_id" integer NOT NULL REFERENCES "buildings"("id") ON DELETE CASCADE,
  "billing_month" text NOT NULL,
  "unit_id" integer NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
  "unit_number" text NOT NULL,
  "bill_id" integer REFERENCES "bills"("id") ON DELETE SET NULL,
  "request_ref" text,
  "bank_code" text,
  "account_masked" text,
  "amount" real NOT NULL DEFAULT 0,
  "attempt" integer NOT NULL DEFAULT 1,
  "status" text NOT NULL DEFAULT 'queued',
  "result_code" text,
  "result_message" text,
  "next_retry_at" timestamp with time zone,
  "payment_id" integer,
  "requested_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "auto_debit_uniq" UNIQUE ("building_id", "billing_month", "unit_id", "attempt")
);
