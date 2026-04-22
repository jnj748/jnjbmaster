-- [Task #222] RFQ에 용역종류(service_type) 컬럼 추가
-- 허용 값: breakdown, defect, replacement, inspection, other
-- 멱등 적용: 환경에 이미 적용된 경우에도 안전.

ALTER TABLE "rfqs"
  ADD COLUMN IF NOT EXISTS "service_type" text;
