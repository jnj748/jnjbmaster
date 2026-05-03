-- [Task #776] 예산·집행통제 엔진 v01.
--
-- budgets / budget_versions / budget_lines / budget_executions 4테이블.
-- 모든 DDL 은 멱등(IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "budgets" (
  "id" serial PRIMARY KEY NOT NULL,
  "building_id" integer NOT NULL,
  "year" integer NOT NULL,
  "active_version_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "budgets_building_year_unique"
  ON "budgets" ("building_id", "year");

CREATE TABLE IF NOT EXISTS "budget_versions" (
  "id" serial PRIMARY KEY NOT NULL,
  "budget_id" integer NOT NULL,
  "version_no" integer NOT NULL,
  "note" text,
  "source_type" text,
  "source_id" integer,
  "approved_at" timestamp with time zone,
  "approved_by_user_id" integer,
  "approved_by_name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "budget_versions_budget_idx"
  ON "budget_versions" ("budget_id");
CREATE UNIQUE INDEX IF NOT EXISTS "budget_versions_budget_version_unique"
  ON "budget_versions" ("budget_id", "version_no");

CREATE TABLE IF NOT EXISTS "budget_lines" (
  "id" serial PRIMARY KEY NOT NULL,
  "version_id" integer NOT NULL,
  "category" text NOT NULL,
  "month" integer NOT NULL,
  "amount" real NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS "budget_lines_version_idx"
  ON "budget_lines" ("version_id");
CREATE UNIQUE INDEX IF NOT EXISTS "budget_lines_version_cat_month_unique"
  ON "budget_lines" ("version_id", "category", "month");

CREATE TABLE IF NOT EXISTS "budget_executions" (
  "id" serial PRIMARY KEY NOT NULL,
  "budget_id" integer NOT NULL,
  "building_id" integer NOT NULL,
  "category" text NOT NULL,
  "month" integer NOT NULL,
  "amount" real NOT NULL DEFAULT 0,
  "voucher_count" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "budget_executions_budget_idx"
  ON "budget_executions" ("budget_id");
CREATE INDEX IF NOT EXISTS "budget_executions_building_idx"
  ON "budget_executions" ("building_id");
CREATE UNIQUE INDEX IF NOT EXISTS "budget_executions_budget_cat_month_unique"
  ON "budget_executions" ("budget_id", "category", "month");
