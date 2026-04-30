-- [Task #647 후속 part 3 — 전체 핵심 테이블 누락 점검]
  --
  -- 동기:
  --   rfqs/quotes 외 다른 테이블에도 동일한 schema↔SQL 마이그레이션 드리프트가
  --   있는지 schema 파일 1320개 컬럼과 lib/db/drizzle/*.sql 의 CREATE TABLE +
  --   ALTER TABLE ADD COLUMN 정의를 1:1 비교해 자동 점검한 결과:
  --     * 누락 테이블 18개 (코드 schema 에는 정의됐으나 어떤 SQL 마이그레이션
  --       에서도 CREATE TABLE 된 적이 없음)
  --     * 누락 컬럼 60개 (해당 테이블은 있지만 신규 컬럼 SQL 누락)
  --   18개 중 15개는 운영 DB 에 push --force 로 어찌어찌 들어가 있고,
  --   3개 (rfq_messages / rfq_message_threads / rfq_site_visits) 는 운영 DB
  --   에도 존재하지 않아 routes 호출 시 매번 500 일 잠재 버그.
  --   60개 컬럼은 운영 DB 에 모두 존재 — fresh DB 에서만 누락.
  --
  -- 정책 (#647 part 1·2 와 동일):
  --   - drizzle 스키마 일절 변경 없음
  --   - 모두 IF NOT EXISTS — 운영/dev 에 무영향, fresh DB 에서만 실제 적용
  --   - CREATE TABLE 안의 컬럼 정의는 schema 가 정의한 컬럼 순서 + 운영 DB 의
  --     pg_attribute / pg_get_expr 로 가져온 정확한 타입·NULL·DEFAULT 사용
  --   - 운영 DB 에도 없는 3 테이블은 schema 정의를 그대로 SQL 화
  --   - id 컬럼은 schema 의 serial 표기를 그대로 유지 (PostgreSQL 이 자동으로
  --     <table>_id_seq 생성 → 운영 DB 의 nextval 패턴과 동등)
  --   - PK 외 인덱스/FK/UNIQUE 는 본 파일 범위 외 (별 task)

  -- ============================================================
-- SECTION A — 신규 테이블 18개 (CREATE TABLE IF NOT EXISTS)
-- ============================================================

-- accounting_initial_files  [accountingInitialFiles.ts]
CREATE TABLE IF NOT EXISTS "accounting_initial_files" (
  "id" serial PRIMARY KEY,
  "building_id" integer NOT NULL,
  "category" text NOT NULL,
  "file_url" text NOT NULL,
  "original_name" text,
  "period_note" text,
  "uploaded_by" integer NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- commission_events  [commissionEvents.ts]
CREATE TABLE IF NOT EXISTS "commission_events" (
  "id" serial PRIMARY KEY,
  "commission_id" integer NOT NULL,
  "from_status" text,
  "to_status" text NOT NULL,
  "reason" text,
  "actor_id" integer,
  "actor_name" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- contract_documents  [contracts.ts]
CREATE TABLE IF NOT EXISTS "contract_documents" (
  "id" serial PRIMARY KEY,
  "contract_id" integer NOT NULL,
  "doc_type" text NOT NULL DEFAULT 'other'::text,
  "file_name" text NOT NULL,
  "file_url" text NOT NULL,
  "version" integer NOT NULL DEFAULT 1,
  "uploaded_by" integer,
  "uploaded_by_name" text,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- contracts  [contracts.ts]
CREATE TABLE IF NOT EXISTS "contracts" (
  "id" serial PRIMARY KEY,
  "building_id" integer,
  "building_name" text,
  "vendor_id" integer NOT NULL,
  "vendor_name" text NOT NULL,
  "category" text NOT NULL,
  "title" text NOT NULL,
  "rfq_id" integer,
  "quote_id" integer,
  "approval_id" integer,
  "contract_amount" real,
  "start_date" date,
  "end_date" date,
  "status" text NOT NULL DEFAULT 'draft'::text,
  "is_recurring" boolean NOT NULL DEFAULT false,
  "notes" text,
  "renewal_alert_sent" timestamp with time zone,
  "partner_agreed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- credit_ledger  [creditLedger.ts]
CREATE TABLE IF NOT EXISTS "credit_ledger" (
  "id" serial PRIMARY KEY,
  "vendor_id" integer NOT NULL,
  "amount" integer NOT NULL,
  "kind" text NOT NULL,
  "source" text NOT NULL DEFAULT 'system'::text,
  "points_amount" integer NOT NULL DEFAULT 0,
  "rfq_id" integer,
  "quote_id" integer,
  "related_ledger_id" integer,
  "notes" text,
  "actor_id" integer,
  "actor_name" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- daily_journals  [workLogs.ts]
CREATE TABLE IF NOT EXISTS "daily_journals" (
  "id" serial PRIMARY KEY,
  "building_id" integer NOT NULL,
  "journal_date" date NOT NULL,
  "role" text NOT NULL DEFAULT 'manager'::text,
  "author_id" integer NOT NULL,
  "author_name" text NOT NULL,
  "security_status" text NOT NULL DEFAULT 'ok'::text,
  "security_memo" text,
  "security_photo_url" text,
  "cleaning_status" text NOT NULL DEFAULT 'ok'::text,
  "cleaning_memo" text,
  "cleaning_photo_url" text,
  "facility_status" text NOT NULL DEFAULT 'ok'::text,
  "facility_memo" text,
  "facility_photo_url" text,
  "complaint_status" text NOT NULL DEFAULT 'ok'::text,
  "complaint_memo" text,
  "complaint_photo_url" text,
  "snapshot" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- external_documents  [externalDocuments.ts]
CREATE TABLE IF NOT EXISTS "external_documents" (
  "id" serial PRIMARY KEY,
  "building_id" integer,
  "title" text NOT NULL,
  "file_url" text NOT NULL,
  "mime_type" text,
  "uploaded_by" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- facility_staff_signup_requests  [facilityStaffSignupRequests.ts]
CREATE TABLE IF NOT EXISTS "facility_staff_signup_requests" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL,
  "requested_address" text NOT NULL,
  "sido" text,
  "sigungu" text,
  "target_building_id" integer,
  "target_manager_id" integer,
  "status" character varying(16) NOT NULL DEFAULT 'pending'::character varying,
  "decided_by" integer,
  "decided_at" timestamp with time zone,
  "note" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- monthly_bill_summaries  [monthlyBillSummaries.ts]
CREATE TABLE IF NOT EXISTS "monthly_bill_summaries" (
  "id" serial PRIMARY KEY,
  "building_id" integer NOT NULL,
  "billing_month" text NOT NULL,
  "total_amount" real NOT NULL DEFAULT 0,
  "unit_count" integer,
  "due_date" text,
  "line_items" json NOT NULL DEFAULT '{}'::json,
  "field_confidence" json NOT NULL DEFAULT '{}'::json,
  "ocr_raw_text" text,
  "source_file_url" text,
  "source_file_name" text,
  "confirmed" boolean NOT NULL DEFAULT false,
  "uploaded_by_id" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- platform_consent_documents  [platformConsents.ts]
CREATE TABLE IF NOT EXISTS "platform_consent_documents" (
  "id" serial PRIMARY KEY,
  "role" text NOT NULL,
  "consent_type" text NOT NULL,
  "version" text NOT NULL,
  "title" text NOT NULL,
  "body" text NOT NULL,
  "required" boolean NOT NULL DEFAULT false,
  "is_published" boolean NOT NULL DEFAULT false,
  "published_at" timestamp with time zone,
  "created_by" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- platform_knowledge_docs  [platformKnowledgeDocs.ts]
CREATE TABLE IF NOT EXISTS "platform_knowledge_docs" (
  "id" serial PRIMARY KEY,
  "title" text NOT NULL,
  "category" text NOT NULL DEFAULT '기타'::text,
  "summary" text,
  "body_text" text NOT NULL DEFAULT ''::text,
  "file_url" text,
  "file_name" text,
  "effective_date" text,
  "version" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "target_roles" text[],
  "file_hash" text,
  "created_by" integer,
  "created_by_name" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- rfq_message_threads  [rfqMessages.ts]
CREATE TABLE IF NOT EXISTS "rfq_message_threads" (
  id serial PRIMARY KEY,
  rfq_id integer NOT NULL,
  vendor_id integer NOT NULL,
  read_by_manager_at timestamp with time zone,
  read_by_partner_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- rfq_messages  [rfqMessages.ts]
CREATE TABLE IF NOT EXISTS "rfq_messages" (
  id serial PRIMARY KEY,
  rfq_id integer NOT NULL,
  vendor_id integer NOT NULL,
  sender_user_id integer NOT NULL,
  sender_role text NOT NULL,
  body text NOT NULL DEFAULT '',
  attachments text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- rfq_site_visits  [rfqSiteVisits.ts]
CREATE TABLE IF NOT EXISTS "rfq_site_visits" (
  id serial PRIMARY KEY,
  rfq_id integer NOT NULL,
  vendor_id integer NOT NULL,
  status text NOT NULL DEFAULT 'proposed',
  proposed_slots text NOT NULL DEFAULT '[]',
  confirmed_slot timestamp with time zone,
  confirmed_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- role_menu_overrides  [roleMenuOverrides.ts]
CREATE TABLE IF NOT EXISTS "role_menu_overrides" (
  "id" serial PRIMARY KEY,
  "role" text NOT NULL,
  "block_id" text NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "updated_by" integer,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- user_social_accounts  [userSocialAccounts.ts]
CREATE TABLE IF NOT EXISTS "user_social_accounts" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL,
  "provider" text NOT NULL,
  "provider_user_id" text NOT NULL,
  "email" text,
  "display_name" text,
  "connected_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- vendor_credit_wallets  [vendorCreditWallets.ts]
CREATE TABLE IF NOT EXISTS "vendor_credit_wallets" (
  "id" serial PRIMARY KEY,
  "vendor_id" integer NOT NULL,
  "balance" integer NOT NULL DEFAULT 0,
  "points_balance" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- work_log_entries  [workLogs.ts]
CREATE TABLE IF NOT EXISTS "work_log_entries" (
  "id" serial PRIMARY KEY,
  "building_id" integer,
  "author_id" integer NOT NULL,
  "author_name" text NOT NULL,
  "category" text NOT NULL,
  "memo" text NOT NULL,
  "photo_url" text,
  "occurred_at" timestamp with time zone NOT NULL DEFAULT now(),
  "occurred_date" date NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- ============================================================
-- SECTION B — 누락 컬럼 60개 (ADD COLUMN IF NOT EXISTS)
-- ============================================================

-- buildings
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "fire_grade" integer;
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "address_locked" boolean NOT NULL DEFAULT false;
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "area_basis" text;
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "normalized_address" text NOT NULL DEFAULT ''::text;
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "price_per_unit" integer NOT NULL DEFAULT 200;
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "plan" text NOT NULL DEFAULT 'basic'::text;
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "features_enabled" jsonb NOT NULL DEFAULT '{"vendor": true, "eVoting": false, "metering": true, "aiAnomaly": false, "complaint": true, "accounting": true}'::jsonb;
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "is_active" boolean NOT NULL DEFAULT true;
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "is_read_only" boolean NOT NULL DEFAULT false;
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "billing_day" integer NOT NULL DEFAULT 1;
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "subscription_status" text NOT NULL DEFAULT 'trial'::text;
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "last_paid_at" timestamp with time zone;
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "trial_ends_at" timestamp with time zone;

-- commissions
ALTER TABLE "commissions" ADD COLUMN IF NOT EXISTS "rfq_id" integer;
ALTER TABLE "commissions" ADD COLUMN IF NOT EXISTS "quote_id" integer;
ALTER TABLE "commissions" ADD COLUMN IF NOT EXISTS "category" text;
ALTER TABLE "commissions" ADD COLUMN IF NOT EXISTS "billed_at" timestamp with time zone;
ALTER TABLE "commissions" ADD COLUMN IF NOT EXISTS "collected_at" timestamp with time zone;
ALTER TABLE "commissions" ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;
ALTER TABLE "commissions" ADD COLUMN IF NOT EXISTS "invoice_number" text;
ALTER TABLE "commissions" ADD COLUMN IF NOT EXISTS "invoice_issued_at" timestamp with time zone;

-- credit_category_pricing
ALTER TABLE "credit_category_pricing" ADD COLUMN IF NOT EXISTS "sido" text;
ALTER TABLE "credit_category_pricing" ADD COLUMN IF NOT EXISTS "sigungu" text;
ALTER TABLE "credit_category_pricing" ADD COLUMN IF NOT EXISTS "no_view_refund_days" integer;
ALTER TABLE "credit_category_pricing" ADD COLUMN IF NOT EXISTS "no_view_refund_ratio_percent" integer;
ALTER TABLE "credit_category_pricing" ADD COLUMN IF NOT EXISTS "premium_surcharge_percent" integer;
ALTER TABLE "credit_category_pricing" ADD COLUMN IF NOT EXISTS "display_name_ko" text;
ALTER TABLE "credit_category_pricing" ADD COLUMN IF NOT EXISTS "updated_by" text;

-- maintenance_logs
ALTER TABLE "maintenance_logs" ADD COLUMN IF NOT EXISTS "close_up_photo_url" text;
ALTER TABLE "maintenance_logs" ADD COLUMN IF NOT EXISTS "wide_photo_url" text;

-- platform_consents
ALTER TABLE "platform_consents" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'agreed'::text;

-- platform_settings
ALTER TABLE "platform_settings" ADD COLUMN IF NOT EXISTS "updated_by" text;

-- safety_checklists
ALTER TABLE "safety_checklists" ADD COLUMN IF NOT EXISTS "close_up_photo_url" text;
ALTER TABLE "safety_checklists" ADD COLUMN IF NOT EXISTS "wide_photo_url" text;

-- settlements
ALTER TABLE "settlements" ADD COLUMN IF NOT EXISTS "contract_id" integer;

-- task_templates
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "task_type" text;
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "purpose" text NOT NULL DEFAULT ''::text;
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "weekdays" jsonb;
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "day_of_month" integer;
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "year_interval" integer;
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "nth_week" integer;
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "nth_weekday" integer;
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "building_usage_scopes" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "notice_template_id" integer;

-- units
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "owner_name" text;
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "owner_phone" text;
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "resident_name" text;
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "resident_phone" text;
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "supply_area" numeric DEFAULT 0;
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "entry_date" date;
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "building_section" text;
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "api_generated" boolean NOT NULL DEFAULT false;
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "occupancy_status" text NOT NULL DEFAULT '미등록'::text;
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "business_number" text;
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "has_onboarding_card" boolean NOT NULL DEFAULT false;
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "onboarding_signed_at" timestamp with time zone;
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "delinquent_months" integer NOT NULL DEFAULT 0;
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "delinquent_amount" integer NOT NULL DEFAULT 0;

-- vendors
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "profile_image_url" text;

-- work_reports
ALTER TABLE "work_reports" ADD COLUMN IF NOT EXISTS "contract_id" integer;

