-- [Task #213] 일일 일지 4개 섹션(보안·청소·시설·민원) 사진 URL 컬럼 추가
-- 멱등 적용: 환경에 이미 적용된 경우에도 안전.

ALTER TABLE "daily_journals"
  ADD COLUMN IF NOT EXISTS "security_photo_url" text,
  ADD COLUMN IF NOT EXISTS "cleaning_photo_url" text,
  ADD COLUMN IF NOT EXISTS "facility_photo_url" text,
  ADD COLUMN IF NOT EXISTS "complaint_photo_url" text;
