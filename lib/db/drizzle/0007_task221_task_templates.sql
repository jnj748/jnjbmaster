-- [Task #221] 본사 일괄 관리 업무 템플릿 + 변경이력 테이블
-- 멱등 적용: 환경에 이미 적용된 경우에도 안전.

CREATE TABLE IF NOT EXISTS "task_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "category" text NOT NULL,
  "classification" text DEFAULT 'internal' NOT NULL,
  "icon_name" text,
  "color" text,
  "frequency_type" text DEFAULT 'one_time' NOT NULL,
  "interval_value" integer,
  "fixed_month" integer,
  "fixed_day" integer,
  "start_date" text,
  "scope_type" text DEFAULT 'all' NOT NULL,
  "scope_values" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "priority" integer DEFAULT 50 NOT NULL,
  "advance_alert_days" integer DEFAULT 7 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by" integer,
  "created_by_name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "task_template_audit_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "template_id" integer,
  "template_title" text,
  "action" text NOT NULL,
  "changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "changed_by" integer,
  "changed_by_name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "task_template_audit_logs"
    ADD CONSTRAINT "task_template_audit_logs_changed_by_users_id_fk"
    FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "task_templates_active_idx"
  ON "task_templates" ("is_active");
CREATE INDEX IF NOT EXISTS "task_templates_category_idx"
  ON "task_templates" ("category");
CREATE INDEX IF NOT EXISTS "task_template_audit_logs_template_id_idx"
  ON "task_template_audit_logs" ("template_id");
