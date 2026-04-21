-- [Task #178] 건물 단위 관리비 응대 자료(월별 5개 영역) 저장 + 감사 로그
-- 멱등 적용: 환경에 이미 적용된 경우에도 안전.

CREATE TABLE IF NOT EXISTS "building_monthly_records" (
  "id" serial PRIMARY KEY NOT NULL,
  "building_id" integer NOT NULL REFERENCES "buildings"("id") ON DELETE CASCADE,
  "billing_month" text NOT NULL,
  "energy" json,
  "discounts" json,
  "one_time_charges" json,
  "collection" json,
  "transparency" json,
  "manual_overrides" json DEFAULT '{}'::json NOT NULL,
  "evidence_links" json DEFAULT '{}'::json NOT NULL,
  "summary_draft" text,
  "last_edited_by_id" integer,
  "last_edited_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "building_monthly_records_building_id_billing_month_unique" UNIQUE ("building_id", "billing_month")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "building_monthly_record_audits" (
  "id" serial PRIMARY KEY NOT NULL,
  "record_id" integer NOT NULL REFERENCES "building_monthly_records"("id") ON DELETE CASCADE,
  "building_id" integer NOT NULL,
  "billing_month" text NOT NULL,
  "user_id" integer NOT NULL,
  "user_role" text NOT NULL,
  "action" text NOT NULL,
  "changes" json,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_bmr_audits_record" ON "building_monthly_record_audits" ("record_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bmr_audits_building_month" ON "building_monthly_record_audits" ("building_id","billing_month");
