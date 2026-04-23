-- [Task #305] task_templates 에 eligibility (자격 기준 규칙 배열) JSON 컬럼 추가.
--   형태: [{"field":"electricCapacityKw","op":">=","value":75}, ...]
--   AND 조건. 빈 배열/NULL = 자격 기준 없음(전체 적용).
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "eligibility" jsonb NOT NULL DEFAULT '[]'::jsonb;
