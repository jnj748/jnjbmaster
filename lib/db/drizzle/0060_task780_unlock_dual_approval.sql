-- [Task #780] T9 마감엔진 — 해제 이중승인(2-인 워크플로) 지원 컬럼.
--   첫 번째 승인자는 unlock 요청만 생성하고, 두 번째 승인자(반드시 다른 사람)가
--   확인하면 실제로 unlockMonth() 가 실행된다. 이 흐름을 추적할 컬럼들이다.

ALTER TABLE period_closings ADD COLUMN IF NOT EXISTS unlock_requested_at TIMESTAMPTZ;
ALTER TABLE period_closings ADD COLUMN IF NOT EXISTS unlock_requested_by_id INTEGER;
ALTER TABLE period_closings ADD COLUMN IF NOT EXISTS unlock_request_reason TEXT;
