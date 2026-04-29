-- [Task #609] 일보 작성 독려(소프트 리마인더) — 사용자 토글 추가.
--   본인이 끌 수 있는 "일보 작성 독려 알림 받기" 토글. 기본 ON(true).
--   본사 관리자 측의 발송 시각 설정(저녁/오전)은 platform_settings 의
--     daily_journal_reminder_evening_at = "HH:MM"
--     daily_journal_reminder_morning_at = "HH:MM"
--   값으로 보관한다(런타임 upsert; DDL 불필요).
--
--   멱등하게 작성 — 이미 적용된 환경에서도 안전하게 재실행됨.

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "daily_journal_reminder_enabled" boolean NOT NULL DEFAULT true;
