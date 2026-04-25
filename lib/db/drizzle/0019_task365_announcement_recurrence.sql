-- [Task #365] 본사 알림(공지) 반복주기 설정 추가.
-- 캠페인과 동일한 패턴으로 게시 윈도우 안에서도 특정 요일/일자에만
-- 노출되도록 recurrence / recurrence_days 컬럼을 더한다.
-- 기존 행은 default 'none' 으로 백필되어 동작 변경이 없다.
ALTER TABLE "platform_announcements"
  ADD COLUMN IF NOT EXISTS "recurrence" text NOT NULL DEFAULT 'none';
ALTER TABLE "platform_announcements"
  ADD COLUMN IF NOT EXISTS "recurrence_days" jsonb;
