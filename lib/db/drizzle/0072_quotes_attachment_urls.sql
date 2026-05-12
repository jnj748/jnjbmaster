-- [Task #견적-첨부v2] quotes.attachment_urls — 다중 첨부 (string[] JSON).
-- 멱등 보장. prod runMigrations 가 _app_migrations 에 1회 기록.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS attachment_urls text;
