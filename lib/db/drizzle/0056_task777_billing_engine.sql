-- [Task #777] T7 부과엔진 v01 — 환경/분할/실행/라인/조정 5개 테이블.
-- IF NOT EXISTS 로 멱등 보장. 이미 코드 push 로 생성된 환경에서도 안전.

CREATE TABLE IF NOT EXISTS "billing_settings" (
  "id" serial PRIMARY KEY,
  "building_id" integer NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "area_basis" text NOT NULL DEFAULT 'supply',
  "repair_reserve_unit_price" real NOT NULL DEFAULT 0,
  "meter_unit_prices" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "other_unit_prices" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "allocation_rules" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_by_id" integer,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "billing_settings_building_version" UNIQUE ("building_id", "version"),
  CONSTRAINT "billing_settings_building_fk"
    FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE,
  CONSTRAINT "billing_settings_created_by_fk"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
);

CREATE TABLE IF NOT EXISTS "billing_installments" (
  "id" serial PRIMARY KEY,
  "building_id" integer NOT NULL,
  "title" text NOT NULL,
  "total_amount" real NOT NULL,
  "amortization_months" integer NOT NULL,
  "monthly_amount" real NOT NULL,
  "start_month" text NOT NULL,
  "end_month" text NOT NULL,
  "category" text NOT NULL DEFAULT 'repair',
  "allocation_key" text NOT NULL DEFAULT 'area',
  "source_voucher_id" integer,
  "status" text NOT NULL DEFAULT 'active',
  "notes" text,
  "created_by_id" integer,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "billing_installments_building_fk"
    FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE,
  CONSTRAINT "billing_installments_created_by_fk"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
);

CREATE TABLE IF NOT EXISTS "billing_runs" (
  "id" serial PRIMARY KEY,
  "building_id" integer NOT NULL,
  "billing_month" text NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "settings_version" integer NOT NULL DEFAULT 1,
  "input_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "total_amount" real NOT NULL DEFAULT 0,
  "unit_count" integer NOT NULL DEFAULT 0,
  "finalized_at" timestamptz,
  "finalized_by_id" integer,
  "calculated_by_id" integer,
  "notes" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "billing_runs_building_month" UNIQUE ("building_id", "billing_month"),
  CONSTRAINT "billing_runs_building_fk"
    FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE,
  CONSTRAINT "billing_runs_finalized_by_fk"
    FOREIGN KEY ("finalized_by_id") REFERENCES "users"("id"),
  CONSTRAINT "billing_runs_calculated_by_fk"
    FOREIGN KEY ("calculated_by_id") REFERENCES "users"("id")
);

CREATE TABLE IF NOT EXISTS "billing_lines" (
  "id" serial PRIMARY KEY,
  "run_id" integer NOT NULL,
  "unit_id" integer NOT NULL,
  "unit_number" text NOT NULL,
  "area" real NOT NULL DEFAULT 0,
  "area_ratio" real NOT NULL DEFAULT 0,
  "common_charge" real NOT NULL DEFAULT 0,
  "meter_charges" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "repair_reserve" real NOT NULL DEFAULT 0,
  "installment_charge" real NOT NULL DEFAULT 0,
  "other_charges" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "total_amount" real NOT NULL DEFAULT 0,
  "manual_override" real,
  "manual_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "billing_lines_run_unit" UNIQUE ("run_id", "unit_id"),
  CONSTRAINT "billing_lines_run_fk"
    FOREIGN KEY ("run_id") REFERENCES "billing_runs"("id") ON DELETE CASCADE,
  CONSTRAINT "billing_lines_unit_fk"
    FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "billing_adjustments" (
  "id" serial PRIMARY KEY,
  "run_id" integer NOT NULL,
  "unit_id" integer NOT NULL,
  "unit_number" text NOT NULL,
  "adjustment_type" text NOT NULL,
  "amount" real NOT NULL,
  "reason" text NOT NULL,
  "reason_chip" text,
  "applied_at" date,
  "created_by_id" integer,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "billing_adjustments_run_fk"
    FOREIGN KEY ("run_id") REFERENCES "billing_runs"("id") ON DELETE CASCADE,
  CONSTRAINT "billing_adjustments_unit_fk"
    FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE,
  CONSTRAINT "billing_adjustments_created_by_fk"
    FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
);
