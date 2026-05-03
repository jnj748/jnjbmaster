-- [Task #773] 감사로그 — 권한·감사로그 엔진 v01.
--   모든 변경계 도메인 엔진(T3~T10)이 자동 기록하는 단일 테이블.
--   멱등(IF NOT EXISTS) — runMigrations 가 운영 DB 에서도 안전 적용.

CREATE TABLE IF NOT EXISTS "audit_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "actor_id" integer,
  "role" text NOT NULL,
  "action" text NOT NULL,
  "target_type" text,
  "target_id" integer,
  "building_id" integer,
  "before_json" jsonb,
  "after_json" jsonb,
  "reason" text,
  "ip" text,
  "user_agent" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "audit_logs_actor_idx" ON "audit_logs" ("actor_id");
CREATE INDEX IF NOT EXISTS "audit_logs_action_idx" ON "audit_logs" ("action");
CREATE INDEX IF NOT EXISTS "audit_logs_building_idx" ON "audit_logs" ("building_id");
CREATE INDEX IF NOT EXISTS "audit_logs_created_idx" ON "audit_logs" ("created_at");
