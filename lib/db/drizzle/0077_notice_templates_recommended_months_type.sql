-- [공지 양식 개편] building_notice_templates 에 이달의 추천 + 양식 유형 컬럼 추가.
--
-- 변경:
--   - recommended_months jsonb NULL : int 배열 (1..12). 예 [3,9] = 3월·9월 추천.
--   - type text NOT NULL DEFAULT 'document' : "document"(작성형) / "infographic"(바로출력).
--
-- 안전성:
--   - 둘 다 신규 컬럼이며 기존 행은 모두 default(또는 NULL) 로 채워져 무중단.
--   - IF NOT EXISTS 로 멱등.

ALTER TABLE building_notice_templates
  ADD COLUMN IF NOT EXISTS recommended_months jsonb;

ALTER TABLE building_notice_templates
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'document';
