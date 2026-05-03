-- [Task #745] 협력업체 등록 시 사업자등록증 OCR 자동 채움 결과를 저장하기 위한 컬럼 추가.
--   업태(business_type) / 종목(business_item) / 개업연월일(opened_at).
-- 모두 NULL 허용 — 기존 vendor 행에 영향 없음. 멱등(IF NOT EXISTS)으로 작성.

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS business_type text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS business_item text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS opened_at date;
