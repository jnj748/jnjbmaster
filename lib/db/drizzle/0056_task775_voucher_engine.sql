-- [Task #775] 지출결의 엔진 v01 — 정기/비정기 분리 + 분할부과 ledger.
--
-- 1) expense_vouchers 에 정기지출 메타(is_recurring/recurrence_cycle/parent_voucher_id) 추가.
-- 2) expense_voucher_schedules 신설 — 결재 라인의 분납 입력이 있으면 1건 생성된다.
--    부과엔진(T7) 의 월별 분할부과 조회와 만기 임박/종료 알림이 이 ledger 를 본다.
-- 모든 DDL 은 멱등(IF NOT EXISTS).

ALTER TABLE "expense_vouchers"
  ADD COLUMN IF NOT EXISTS "is_recurring" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "recurrence_cycle" text,
  ADD COLUMN IF NOT EXISTS "parent_voucher_id" integer;

-- 결재 라인 본체에도 정기지출 메타를 둬서 issueDownstreamDocuments 가 단일 출처에서 복사한다.
ALTER TABLE "approvals"
  ADD COLUMN IF NOT EXISTS "is_recurring" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "recurrence_cycle" text,
  ADD COLUMN IF NOT EXISTS "parent_approval_id" integer;

CREATE INDEX IF NOT EXISTS "expense_vouchers_recurring_idx"
  ON "expense_vouchers" ("is_recurring");

CREATE TABLE IF NOT EXISTS "expense_voucher_schedules" (
  "id" serial PRIMARY KEY NOT NULL,
  "voucher_id" integer NOT NULL,
  "approval_id" integer,
  "building_id" integer,
  "total_amount" real NOT NULL,
  "months" integer NOT NULL,
  "current_round" integer NOT NULL DEFAULT 0,
  "monthly_amount" real NOT NULL,
  "start_month" text NOT NULL,
  "end_month" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "expense_voucher_schedules_voucher_idx"
  ON "expense_voucher_schedules" ("voucher_id");
CREATE INDEX IF NOT EXISTS "expense_voucher_schedules_building_idx"
  ON "expense_voucher_schedules" ("building_id");
CREATE INDEX IF NOT EXISTS "expense_voucher_schedules_status_idx"
  ON "expense_voucher_schedules" ("status");
