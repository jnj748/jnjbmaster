-- [Task #774] OCR/문서엔진 v01 — 횡단 자료처리 보관함.
-- documents(#610) 와는 의도적으로 분리: 그쪽은 산출물 레지스트리, 이쪽은 OCR 원본+추출 결과.
CREATE TABLE IF NOT EXISTS "document_ingestions" (
  "id" serial PRIMARY KEY,
  "building_id" integer,
  "uploaded_by" integer,
  "kind" text NOT NULL,
  "status" text NOT NULL DEFAULT 'extracted',
  "object_path" text NOT NULL,
  "file_name" text,
  "mime_type" text,
  "content_hash" text NOT NULL,
  "extraction" jsonb NOT NULL,
  "linked_refs" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "llm_accounting" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "document_ingestions_hash_idx"
  ON "document_ingestions" ("building_id", "content_hash");
CREATE INDEX IF NOT EXISTS "document_ingestions_kind_created_idx"
  ON "document_ingestions" ("kind", "created_at");
CREATE INDEX IF NOT EXISTS "document_ingestions_building_created_idx"
  ON "document_ingestions" ("building_id", "created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "document_ingestions_dedup_idx"
  ON "document_ingestions" ("building_id", "content_hash", "kind");
