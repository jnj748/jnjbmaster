-- [Task #779] T8 고지·수납엔진 v01 — bills/bill_items/bill_payments/bank_transactions/delinquency_stages.
-- 모두 IF NOT EXISTS 로 멱등 보장.

CREATE TABLE IF NOT EXISTS "bills" (
  "id" serial PRIMARY KEY,
  "building_id" integer NOT NULL,
  "unit_id" integer NOT NULL,
  "unit_number" text NOT NULL,
  "billing_month" text NOT NULL,
  "run_id" integer,
  "total_amount" real NOT NULL DEFAULT 0,
  "paid_amount" real NOT NULL DEFAULT 0,
  "due_date" date NOT NULL,
  "status" text NOT NULL DEFAULT 'issued',
  "public_token" text NOT NULL UNIQUE,
  "virtual_account" jsonb,
  "ai_body_text" text,
  "notes" text,
  "issued_at" timestamptz NOT NULL DEFAULT now(),
  "paid_at" timestamptz,
  "closed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "bills_unit_month" UNIQUE ("unit_id", "billing_month"),
  CONSTRAINT "bills_building_fk" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE,
  CONSTRAINT "bills_unit_fk" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE,
  CONSTRAINT "bills_run_fk" FOREIGN KEY ("run_id") REFERENCES "billing_runs"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "bills_building_month_idx" ON "bills" ("building_id", "billing_month");
CREATE INDEX IF NOT EXISTS "bills_status_idx" ON "bills" ("status");

CREATE TABLE IF NOT EXISTS "bill_items" (
  "id" serial PRIMARY KEY,
  "bill_id" integer NOT NULL,
  "category" text NOT NULL,
  "label" text NOT NULL,
  "amount" real NOT NULL DEFAULT 0,
  "meta" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "bill_items_bill_fk" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "bill_items_bill_idx" ON "bill_items" ("bill_id");

CREATE TABLE IF NOT EXISTS "bill_payments" (
  "id" serial PRIMARY KEY,
  "building_id" integer NOT NULL,
  "bill_id" integer,
  "unit_id" integer,
  "amount" real NOT NULL,
  "channel" text NOT NULL DEFAULT 'transfer',
  "paid_at" timestamptz NOT NULL DEFAULT now(),
  "bank_tx_id" integer,
  "is_partial" boolean NOT NULL DEFAULT false,
  "memo" text,
  "recorded_by_id" integer,
  "reversed_at" timestamptz,
  "reversal_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "bill_payments_building_fk" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE,
  CONSTRAINT "bill_payments_bill_fk" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE SET NULL,
  CONSTRAINT "bill_payments_unit_fk" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE SET NULL,
  CONSTRAINT "bill_payments_recorded_by_fk" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id")
);
CREATE INDEX IF NOT EXISTS "bill_payments_bill_idx" ON "bill_payments" ("bill_id");
CREATE INDEX IF NOT EXISTS "bill_payments_building_idx" ON "bill_payments" ("building_id");

CREATE TABLE IF NOT EXISTS "bank_transactions" (
  "id" serial PRIMARY KEY,
  "building_id" integer NOT NULL,
  "tx_date" date NOT NULL,
  "amount" real NOT NULL,
  "counterpart" text,
  "memo" text,
  "virtual_account_key" text,
  "matched_bill_id" integer,
  "matched_payment_id" integer,
  "match_status" text NOT NULL DEFAULT 'unmatched',
  "raw_data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "bank_tx_building_fk" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE,
  CONSTRAINT "bank_tx_bill_fk" FOREIGN KEY ("matched_bill_id") REFERENCES "bills"("id") ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS "bank_tx_building_idx" ON "bank_transactions" ("building_id");
CREATE INDEX IF NOT EXISTS "bank_tx_status_idx" ON "bank_transactions" ("match_status");

CREATE TABLE IF NOT EXISTS "delinquency_stages" (
  "id" serial PRIMARY KEY,
  "building_id" integer NOT NULL,
  "bill_id" integer,
  "unit_id" integer NOT NULL,
  "unit_number" text NOT NULL,
  "stage" integer NOT NULL DEFAULT 0,
  "overdue_days" integer NOT NULL DEFAULT 0,
  "overdue_amount" real NOT NULL DEFAULT 0,
  "late_fee_amount" real NOT NULL DEFAULT 0,
  "last_dispatch_at" timestamptz,
  "dispatch_log" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "resolved_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "delinquency_stages_bill" UNIQUE ("bill_id"),
  CONSTRAINT "delinquency_stages_building_fk" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE CASCADE,
  CONSTRAINT "delinquency_stages_unit_fk" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE,
  CONSTRAINT "delinquency_stages_bill_fk" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "delinquency_stages_building_idx" ON "delinquency_stages" ("building_id");
