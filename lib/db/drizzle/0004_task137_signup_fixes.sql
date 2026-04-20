-- [Task #137] 회원가입 실패·온보딩 연결·전화번호/비밀번호확인 보강
-- 운영 DB 에 누락된 users 컬럼 및 platform_settings, vendor_categories 등
-- seed/가입 흐름이 의존하는 테이블을 추가한다.
-- (drizzle push 가 무관한 monthly_payments unique 인덱스 추가에서 인터랙티브
--  프롬프트를 띄우는 문제로 인해 본 마이그레이션을 직접 작성한다.)

-- 일부 환경(과거 DB) 에 누락되어 있을 수 있는 users 컬럼들. 모두 IF NOT EXISTS 로 멱등 처리.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "approval_status" varchar(16) DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "role_selected" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "building_sido" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "building_sigungu" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarding_preference" varchar(16);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "vendor_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "building_id" integer;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "platform_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "key" text NOT NULL,
  "value" text NOT NULL,
  "description" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "platform_settings_key_unique" UNIQUE ("key")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "vendor_categories" (
  "id" serial PRIMARY KEY NOT NULL,
  "code" text NOT NULL,
  "label" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "vendor_categories_code_unique" UNIQUE ("code")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "credit_category_pricing" (
  "id" serial PRIMARY KEY NOT NULL,
  "category" text NOT NULL,
  "tier" integer DEFAULT 1 NOT NULL,
  "credit_cost" integer DEFAULT 1 NOT NULL,
  "description" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "credit_category_pricing_category_unique" UNIQUE ("category")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "commission_rates" (
  "id" serial PRIMARY KEY NOT NULL,
  "category" text NOT NULL,
  "rate_type" text DEFAULT 'fixed' NOT NULL,
  "fixed_rate" real DEFAULT 5 NOT NULL,
  "sliding_rules" text,
  "description" text,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "commission_rates_category_unique" UNIQUE ("category")
);
