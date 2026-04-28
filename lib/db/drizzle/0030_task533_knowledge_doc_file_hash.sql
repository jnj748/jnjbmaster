-- [Task #533] AI 공통 자료실 중복 감지를 위한 file_hash 컬럼.
--
-- 같은 PDF/DOCX 가 두 번 등록되어 자료가 중복으로 쌓이는 문제를 막기 위해
-- 업로드된 파일의 SHA-256 해시(소문자 64자 hex)를 보존한다.
-- 기존 행은 NULL 로 둔다 (이전에 업로드된 파일은 해시가 없으므로).
-- 인덱스는 NULL 비포함 부분 인덱스로 만들어 비어 있는 다수의 NULL 값
-- 사이의 검색 비용을 절약한다.

ALTER TABLE "platform_knowledge_docs"
  ADD COLUMN IF NOT EXISTS "file_hash" text;

CREATE INDEX IF NOT EXISTS "ix_platform_knowledge_docs_file_hash"
  ON "platform_knowledge_docs" ("file_hash")
  WHERE "file_hash" IS NOT NULL;
