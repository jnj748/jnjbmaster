-- [Task #511] alert_actions 에 처리예정 액션 지원.
--
-- 변경 요약
--   1) alert_actions.scheduled_date 컬럼 추가(date, nullable).
--      action_type = 'scheduled' 인 행에서 사용자가 예정한 처리일을 저장한다.
--   2) 기존 action_type(completed / postponed / rfq_requested) 행은 영향을
--      받지 않으며, 새 'scheduled' 값은 컬럼 free-text(text) 이므로 enum
--      변경 없이 그대로 들어간다.
--
-- 멱등성
--   - ADD COLUMN IF NOT EXISTS 가드로 재실행 안전.

ALTER TABLE "alert_actions"
  ADD COLUMN IF NOT EXISTS "scheduled_date" date;
