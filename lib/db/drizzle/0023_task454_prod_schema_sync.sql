-- [Task #454] 운영 DB 스키마 동기화 (협력업체/계약 등록 500 재발 해소).
--
-- 운영 PostgreSQL 에 누락된 컬럼/테이블을 한 번에 멱등 보강한다.
-- 모든 문장이 IF NOT EXISTS 또는 ON CONFLICT DO NOTHING 형태라
-- 이미 적용된 환경(개발 등)에서 재실행돼도 부작용이 없다.
--
-- 이 파일은 새로 추가된 첫 번째 "런타임 마이그레이션 러너" 대상 파일이며,
-- 기존 0000~0022 마이그레이션은 베이스라인으로 표시되어 다시 적용되지 않는다.
-- (자세한 내용은 artifacts/api-server/src/lib/runMigrations.ts 참조)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) contracts.partner_agreed_at  ([Task #335])
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "partner_agreed_at" timestamp with time zone;
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) contracts.renewal_alert_sent  ([Task #436] - 일부 환경에서 누락)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "renewal_alert_sent" timestamp with time zone;
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) vendors.contract_* ([Task #436] - 일부 환경에서 누락)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "vendors"
  ADD COLUMN IF NOT EXISTS "contract_building_name" text;
--> statement-breakpoint
ALTER TABLE "vendors"
  ADD COLUMN IF NOT EXISTS "contract_start_date" date;
--> statement-breakpoint
ALTER TABLE "vendors"
  ADD COLUMN IF NOT EXISTS "contract_end_date" date;
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) units 출처/동기화 컬럼 ([Task #348])
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "units"
  ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'manual';
--> statement-breakpoint
ALTER TABLE "units"
  ADD COLUMN IF NOT EXISTS "last_register_synced_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "units"
  ADD COLUMN IF NOT EXISTS "mgm_bldrgst_pk" text;
--> statement-breakpoint
-- 기존 api_generated=true 행은 'register' 출처로 표시(이전 가져오기 결과 일관성).
-- WHERE 가드로 멱등성 유지.
UPDATE "units"
  SET "source" = 'register'
  WHERE "api_generated" = true AND "source" = 'manual';
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) platform_announcements 본체 + 반복 주기 컬럼 ([Task #365])
--    드리프트가 심한 환경에서는 테이블 자체가 없을 수도 있어, ALTER 전에
--    CREATE TABLE IF NOT EXISTS 로 본체를 보장한다.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "platform_announcements" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "audience" jsonb DEFAULT '["all"]'::jsonb NOT NULL,
  "starts_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ends_at" timestamp with time zone,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by" integer,
  "created_by_name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "platform_announcements"
  ADD COLUMN IF NOT EXISTS "recurrence" text NOT NULL DEFAULT 'none';
--> statement-breakpoint
ALTER TABLE "platform_announcements"
  ADD COLUMN IF NOT EXISTS "recurrence_days" jsonb;
--> statement-breakpoint
-- 1알림이 N명에게 fan-out 되는 구조라 사용자별 read 추적이 필요하다.
-- ([Task #365] 알림 unread-count 계산이 이 테이블에 의존)
CREATE TABLE IF NOT EXISTS "platform_announcement_reads" (
  "id" serial PRIMARY KEY NOT NULL,
  "announcement_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'platform_announcement_reads_announcement_id_fk'
  ) THEN
    ALTER TABLE "platform_announcement_reads"
      ADD CONSTRAINT "platform_announcement_reads_announcement_id_fk"
      FOREIGN KEY ("announcement_id") REFERENCES "public"."platform_announcements"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'platform_announcement_reads_user_id_fk'
  ) THEN
    ALTER TABLE "platform_announcement_reads"
      ADD CONSTRAINT "platform_announcement_reads_user_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ux_announcement_reads_user"
  ON "platform_announcement_reads" ("announcement_id", "user_id");
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) platform_campaigns / platform_campaign_user_states 테이블
--    (드리즐 0009 에서 만들어졌으나 운영에 적용되지 않은 환경 보강)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "platform_campaigns" (
  "id" serial PRIMARY KEY NOT NULL,
  "target_role" text NOT NULL,
  "type" text DEFAULT 'other' NOT NULL,
  "audience_filter" text DEFAULT 'all' NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "image_url" text,
  "channels" jsonb DEFAULT '["modal"]'::jsonb NOT NULL,
  "starts_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ends_at" timestamp with time zone,
  "recurrence" text DEFAULT 'none' NOT NULL,
  "recurrence_days" jsonb,
  "max_impressions_per_user" integer DEFAULT 3 NOT NULL,
  "cta_label" text,
  "cta_url" text,
  "achievement_text" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "is_stopped" boolean DEFAULT false NOT NULL,
  "created_by" integer,
  "created_by_name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_campaign_user_states" (
  "id" serial PRIMARY KEY NOT NULL,
  "campaign_id" integer NOT NULL,
  "user_id" integer NOT NULL,
  "impression_count" integer DEFAULT 0 NOT NULL,
  "last_impression_at" timestamp with time zone,
  "dismissed_until" timestamp with time zone,
  "dont_show_again" boolean DEFAULT false NOT NULL,
  "read_at" timestamp with time zone,
  "cta_clicked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'platform_campaign_user_states_campaign_id_platform_campaigns_id_fk'
  ) THEN
    ALTER TABLE "platform_campaign_user_states"
      ADD CONSTRAINT "platform_campaign_user_states_campaign_id_platform_campaigns_id_fk"
      FOREIGN KEY ("campaign_id") REFERENCES "public"."platform_campaigns"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'platform_campaign_user_states_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "platform_campaign_user_states"
      ADD CONSTRAINT "platform_campaign_user_states_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ux_campaign_user_states"
  ON "platform_campaign_user_states" ("campaign_id", "user_id");
--> statement-breakpoint

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) vendor_reviews 테이블 ([Task #339])
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "vendor_reviews" (
  "id" serial PRIMARY KEY NOT NULL,
  "vendor_id" integer NOT NULL,
  "work_report_id" integer NOT NULL,
  "rfq_id" integer,
  "quote_id" integer,
  "building_id" integer,
  "reviewer_user_id" integer,
  "rating" real NOT NULL,
  "comment" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_reviews_work_report_unique"
  ON "vendor_reviews" ("work_report_id");
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendor_reviews_rating_range'
  ) THEN
    ALTER TABLE "vendor_reviews"
      ADD CONSTRAINT "vendor_reviews_rating_range"
      CHECK ("rating" >= 1.0 AND "rating" <= 5.0
        AND ("rating" * 2) = floor("rating" * 2));
  END IF;
END $$;
