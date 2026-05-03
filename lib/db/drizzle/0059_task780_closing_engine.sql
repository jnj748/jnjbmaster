-- [Task #780] T9 마감·보고엔진 v01 — period_closings / closing_snapshots / carry_forward_balances.
--   모든 DDL 은 멱등(IF NOT EXISTS / DO $$).

CREATE TABLE IF NOT EXISTS "closing_snapshots" (
  "id" serial PRIMARY KEY,
  "building_id" integer NOT NULL,
  "month" text NOT NULL,
  "summary" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "totals" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "closing_snapshots_building_fk" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "closing_snapshots_bm_idx" ON "closing_snapshots" ("building_id", "month");

CREATE TABLE IF NOT EXISTS "period_closings" (
  "id" serial PRIMARY KEY,
  "building_id" integer NOT NULL,
  "month" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "locked_at" timestamptz,
  "locked_by_id" integer,
  "lock_reason" text,
  "unlocked_at" timestamptz,
  "unlocked_by_id" integer,
  "unlock_reason" text,
  "snapshot_id" integer,
  "gate_results" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "period_closings_bm" UNIQUE ("building_id", "month"),
  CONSTRAINT "period_closings_building_fk" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE,
  CONSTRAINT "period_closings_snapshot_fk" FOREIGN KEY ("snapshot_id") REFERENCES "closing_snapshots"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "period_closings_status_idx" ON "period_closings" ("status");

CREATE TABLE IF NOT EXISTS "carry_forward_balances" (
  "id" serial PRIMARY KEY,
  "building_id" integer NOT NULL,
  "from_month" text NOT NULL,
  "to_month" text NOT NULL,
  "account_code" text NOT NULL,
  "account_name" text NOT NULL,
  "party_name" text,
  "unit_id" integer,
  "debit" real NOT NULL DEFAULT 0,
  "credit" real NOT NULL DEFAULT 0,
  "balance" real NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "carry_forward_building_fk" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "carry_forward_bm_idx" ON "carry_forward_balances" ("building_id", "to_month");
CREATE INDEX IF NOT EXISTS "carry_forward_account_idx" ON "carry_forward_balances" ("account_code");
