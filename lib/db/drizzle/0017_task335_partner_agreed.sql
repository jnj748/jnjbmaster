-- [Task #335] 견적 도착 → 계약 체결 흐름: 파트너의 계약 내용 동의 시각 기록.
-- 멱등 적용: 동일 컬럼이 이미 있으면 무시한다.
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "partner_agreed_at" timestamp with time zone;
