-- [Task #319] 파트너 크레딧 충전결제 (TossPayments)
--   credit_topup_packages: DB 편집 가능한 충전 패키지 카탈로그.
--   credit_topup_orders: 토스 결제 주문 (tossOrderId UNIQUE → 멱등성 보장).
CREATE TABLE IF NOT EXISTS "credit_topup_packages" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "credits" integer NOT NULL,
  "price_krw" integer NOT NULL,
  "bonus_points" integer DEFAULT 0 NOT NULL,
  "highlight" text,
  "sort_order" integer DEFAULT 100 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_topup_orders" (
  "id" serial PRIMARY KEY NOT NULL,
  "vendor_id" integer NOT NULL,
  "user_id" integer,
  "package_id" integer,
  "package_name" text NOT NULL,
  "credits" integer NOT NULL,
  "bonus_points" integer DEFAULT 0 NOT NULL,
  "amount_krw" integer NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "toss_order_id" text NOT NULL,
  "toss_payment_key" text,
  "toss_method" text,
  "fail_reason" text,
  "ledger_credit_id" integer,
  "ledger_bonus_id" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "paid_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_topup_orders_toss_order_id_idx" ON "credit_topup_orders" ("toss_order_id");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "credit_topup_orders" ADD CONSTRAINT "credit_topup_orders_vendor_id_vendors_id_fk"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "credit_topup_orders" ADD CONSTRAINT "credit_topup_orders_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "credit_topup_orders" ADD CONSTRAINT "credit_topup_orders_package_id_credit_topup_packages_id_fk"
    FOREIGN KEY ("package_id") REFERENCES "credit_topup_packages"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
