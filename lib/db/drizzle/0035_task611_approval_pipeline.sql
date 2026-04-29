-- [Task #611] 기안서 → 본부장/관리인 결재 → 지출결의서·입금요청서 자동 발행 라인.
--   모든 DDL 은 멱등(IF NOT EXISTS) 하게 작성한다.

-- 1) approvals 테이블 보강 ---------------------------------------------------
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "building_id" integer;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "trigger_source" text NOT NULL DEFAULT 'manual';
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "source_entity_type" text;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "source_entity_id" integer;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "urgent_execution" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "urgent_consent_memo" text;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "urgent_task_id" integer;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "hq_threshold_snapshot" real;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "hq_approver_id" integer;
--> statement-breakpoint
ALTER TABLE "approvals" ADD COLUMN IF NOT EXISTS "custodian_approver_id" integer;
--> statement-breakpoint

-- 2) approval_steps 보강 -----------------------------------------------------
ALTER TABLE "approval_steps" ADD COLUMN IF NOT EXISTS "path" text NOT NULL DEFAULT 'offline';
--> statement-breakpoint
ALTER TABLE "approval_steps" ADD COLUMN IF NOT EXISTS "decided_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "approval_steps" ADD COLUMN IF NOT EXISTS "signed_copy_missing" boolean NOT NULL DEFAULT false;
--> statement-breakpoint

-- 3) 서명본 첨부 -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "approval_signed_copies" (
  "id" serial PRIMARY KEY NOT NULL,
  "approval_id" integer NOT NULL,
  "step_id" integer NOT NULL,
  "page_number" integer NOT NULL DEFAULT 1,
  "file_name" text NOT NULL,
  "file_url" text NOT NULL,
  "mime_type" text,
  "file_hash" text,
  "upload_method" text NOT NULL DEFAULT 'file_picker',
  "kind" text NOT NULL DEFAULT 'offline_scan',
  "uploaded_by" integer NOT NULL,
  "uploaded_by_name" text NOT NULL,
  "replaced_by_id" integer,
  "replace_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_signed_copies_step_idx"
  ON "approval_signed_copies" ("step_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_signed_copies_approval_idx"
  ON "approval_signed_copies" ("approval_id");
--> statement-breakpoint

-- 4) 본부장 임계 금액 ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS "hq_approval_thresholds" (
  "id" serial PRIMARY KEY NOT NULL,
  "hq_user_id" integer NOT NULL,
  "building_id" integer,
  "threshold_amount" real NOT NULL,
  "updated_by_user_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hq_approval_thresholds_unique"
  ON "hq_approval_thresholds" ("hq_user_id", "building_id");
--> statement-breakpoint

-- 5) 지출결의서 ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "expense_vouchers" (
  "id" serial PRIMARY KEY NOT NULL,
  "approval_id" integer NOT NULL,
  "building_id" integer,
  "title" text NOT NULL,
  "description" text,
  "vendor_name" text,
  "amount" real NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "awaiting_post_approval" boolean NOT NULL DEFAULT false,
  "paid_at" date,
  "payment_method" text,
  "account_memo" text,
  "receipt_file_url" text,
  "recorded_by_user_id" integer,
  "recorded_by_name" text,
  "recorded_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_vouchers_approval_idx" ON "expense_vouchers" ("approval_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expense_vouchers_building_idx" ON "expense_vouchers" ("building_id");
--> statement-breakpoint

-- 6) 입금요청서 ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS "payment_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "approval_id" integer NOT NULL,
  "expense_voucher_id" integer,
  "building_id" integer,
  "title" text NOT NULL,
  "description" text,
  "vendor_name" text,
  "amount" real NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "awaiting_post_approval" boolean NOT NULL DEFAULT false,
  "remitted_at" date,
  "remittance_receipt_url" text,
  "remitted_by_user_id" integer,
  "remitted_by_name" text,
  "remittance_memo" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_requests_approval_idx" ON "payment_requests" ("approval_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_requests_building_idx" ON "payment_requests" ("building_id");
