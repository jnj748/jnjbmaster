-- [Task #775] approvals 본체에도 정기지출 메타를 두어 issueDownstreamDocuments 가
--   단일 출처에서 voucher 로 복사하도록 한다.
--   0056 이 먼저 부분 적용된 환경(DEV)을 위해 별도 파일로 분리.
-- 모든 DDL 은 멱등(IF NOT EXISTS).

ALTER TABLE "approvals"
  ADD COLUMN IF NOT EXISTS "is_recurring" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "recurrence_cycle" text,
  ADD COLUMN IF NOT EXISTS "parent_approval_id" integer;
