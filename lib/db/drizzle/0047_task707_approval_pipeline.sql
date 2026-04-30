-- [Task #707] 결재→자금 흐름 파이프라인 정비.
--
-- 1) 결재 라인 본체에 "계약·증빙 등록 대기 / 계약·세금계산서 첨부 / 분납 자리표시"
--    컬럼 추가.
-- 2) 긴급집행 라인의 "계약·증빙 사후등록" 필수업무 포인터(urgent_evidence_task_id)
--    추가 — 기존 urgent_task_id (서명본 첨부 사후업무) 와 분리.
-- 3) issueDownstreamDocuments 가 결재의 분납 정보를 그대로 복사하므로
--    expense_vouchers / payment_requests 도 동일 컬럼 보유.
-- 4) 다중 계약/세금계산서 첨부 자식 테이블 approval_contract_files 추가.
--
-- 모든 DDL 은 ADD COLUMN/CREATE TABLE/CREATE INDEX IF NOT EXISTS 로 멱등 적용.

-- 1) approvals
ALTER TABLE "approvals"
  ADD COLUMN IF NOT EXISTS "awaiting_contract_evidence" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "contract_evidence_registered_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "contract_evidence_registered_by_id" integer,
  ADD COLUMN IF NOT EXISTS "contract_evidence_registered_by_name" text,
  ADD COLUMN IF NOT EXISTS "contract_file_url" text,
  ADD COLUMN IF NOT EXISTS "contract_file_name" text,
  ADD COLUMN IF NOT EXISTS "tax_invoice_file_url" text,
  ADD COLUMN IF NOT EXISTS "tax_invoice_file_name" text,
  ADD COLUMN IF NOT EXISTS "tax_invoice_pending" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "tax_invoice_pending_reason" text,
  ADD COLUMN IF NOT EXISTS "contract_start_date" date,
  ADD COLUMN IF NOT EXISTS "contract_end_date" date,
  ADD COLUMN IF NOT EXISTS "installment_total_amount" real,
  ADD COLUMN IF NOT EXISTS "installment_months" integer,
  ADD COLUMN IF NOT EXISTS "installment_monthly_amount" real,
  ADD COLUMN IF NOT EXISTS "installment_start_date" date,
  ADD COLUMN IF NOT EXISTS "installment_end_date" date,
  ADD COLUMN IF NOT EXISTS "urgent_evidence_task_id" integer;

-- 2) expense_vouchers — 분납 자리표시(부속명세서 근거).
ALTER TABLE "expense_vouchers"
  ADD COLUMN IF NOT EXISTS "installment_total_amount" real,
  ADD COLUMN IF NOT EXISTS "installment_months" integer,
  ADD COLUMN IF NOT EXISTS "installment_monthly_amount" real,
  ADD COLUMN IF NOT EXISTS "installment_start_date" date,
  ADD COLUMN IF NOT EXISTS "installment_end_date" date;

-- 3) payment_requests — 분납 자리표시.
ALTER TABLE "payment_requests"
  ADD COLUMN IF NOT EXISTS "installment_total_amount" real,
  ADD COLUMN IF NOT EXISTS "installment_months" integer,
  ADD COLUMN IF NOT EXISTS "installment_monthly_amount" real,
  ADD COLUMN IF NOT EXISTS "installment_start_date" date,
  ADD COLUMN IF NOT EXISTS "installment_end_date" date;

-- 4) approval_contract_files — 계약서/세금계산서 다중 파일.
CREATE TABLE IF NOT EXISTS "approval_contract_files" (
  "id" serial PRIMARY KEY,
  "approval_id" integer NOT NULL,
  "kind" text NOT NULL,
  "file_url" text NOT NULL,
  "file_name" text NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0,
  "uploaded_by_id" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "approval_contract_files_approval_idx"
  ON "approval_contract_files"("approval_id");
CREATE INDEX IF NOT EXISTS "approval_contract_files_approval_kind_idx"
  ON "approval_contract_files"("approval_id", "kind");
