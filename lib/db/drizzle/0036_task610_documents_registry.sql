-- [Task #610] 통합 문서 레지스트리 (documents) + 공고문 산출물 (notice_outputs)
--   + 4층 방어 중 1층(DB 트리거) + 백필. 모든 DDL은 멱등(IF NOT EXISTS)으로 작성.

-- 0) 사전 의존 컬럼 보정.
--   schema/rfqs.ts 에는 closed_at / closed_quote_id 가 정의되어 있지만 별도 마이그레이션이
--   누락되어 있다(Task #612 작업물 일부). documents 트리거가 이 컬럼을 참조하므로,
--   여기서 멱등하게 미리 보장한다(이미 있으면 no-op).
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "closed_at" timestamp with time zone;
ALTER TABLE "rfqs" ADD COLUMN IF NOT EXISTS "closed_quote_id" integer;

-- 1) documents 레지스트리 ----------------------------------------------------
CREATE TABLE IF NOT EXISTS "documents" (
  "id" serial PRIMARY KEY NOT NULL,
  "kind" text NOT NULL,
  "source_table" text NOT NULL,
  "source_id" integer NOT NULL,
  "state" text NOT NULL DEFAULT 'active',
  "title" text,
  "subtitle" text,
  "author_id" integer,
  "author_role" text,
  "building_id" integer,
  "period_start" date,
  "period_end" date,
  "href" text,
  "thumbnail_url" text,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "documents_source_unique"
  ON "documents" ("source_table", "source_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_kind_created_at_idx"
  ON "documents" ("kind", "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_building_kind_idx"
  ON "documents" ("building_id", "kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_author_idx"
  ON "documents" ("author_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_period_idx"
  ON "documents" ("period_start", "period_end");
--> statement-breakpoint

-- 2) notice_outputs (공고문 export 산출물) ----------------------------------
CREATE TABLE IF NOT EXISTS "notice_outputs" (
  "id" serial PRIMARY KEY NOT NULL,
  "template_id" integer NOT NULL,
  "building_id" integer NOT NULL,
  "author_id" integer NOT NULL,
  "author_role" text NOT NULL,
  "title" text NOT NULL,
  "formats" text[] NOT NULL DEFAULT ARRAY[]::text[],
  "output_date" date NOT NULL DEFAULT CURRENT_DATE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "notice_outputs_bundle_unique"
  ON "notice_outputs" ("template_id", "building_id", "output_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notice_outputs_building_idx"
  ON "notice_outputs" ("building_id");
--> statement-breakpoint

-- 3) 1층 방어: 트리거 함수들 ------------------------------------------------
--   각 원본 테이블에 AFTER INSERT/UPDATE 트리거를 걸어 documents 에 upsert.
--   트리거는 필수 키만 채우고, 표시 필드(title)는 서비스 단일 통로(2층) 가
--   채우도록 NULL 로 둔다. ON CONFLICT 시 표시 필드는 덮어쓰지 않는다.

-- 3.1) daily_journals → kind='journal' --------------------------------------
CREATE OR REPLACE FUNCTION trg_documents_daily_journals() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO documents (
    kind, source_table, source_id, state,
    author_id, building_id, period_start, period_end, href,
    created_at, updated_at, metadata
  ) VALUES (
    'journal', 'daily_journals', NEW.id, 'active',
    NEW.author_id, NEW.building_id, NEW.journal_date, NEW.journal_date, '/work-log?tab=daily',
    NEW.created_at, NEW.updated_at,
    jsonb_build_object('role', NEW.role, 'authorName', NEW.author_name)
  )
  ON CONFLICT (source_table, source_id) DO UPDATE SET
    state = EXCLUDED.state,
    period_start = EXCLUDED.period_start,
    period_end = EXCLUDED.period_end,
    building_id = EXCLUDED.building_id,
    author_id = EXCLUDED.author_id,
    metadata = documents.metadata || EXCLUDED.metadata,
    updated_at = now();
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS daily_journals_documents_trg ON daily_journals;
--> statement-breakpoint
CREATE TRIGGER daily_journals_documents_trg
AFTER INSERT OR UPDATE ON daily_journals
FOR EACH ROW EXECUTE FUNCTION trg_documents_daily_journals();
--> statement-breakpoint

-- 3.2) weekly_summary_reports → kind='weekly_report' ------------------------
CREATE OR REPLACE FUNCTION trg_documents_weekly_reports() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO documents (
    kind, source_table, source_id, state,
    author_id, period_start, period_end, href,
    title, created_at, updated_at, metadata
  ) VALUES (
    'weekly_report', 'weekly_summary_reports', NEW.id,
    CASE NEW.status WHEN 'draft' THEN 'draft' WHEN 'submitted' THEN 'submitted'
                    WHEN 'reviewed' THEN 'completed' WHEN 'forwarded' THEN 'completed'
                    ELSE 'active' END,
    NEW.author_id,
    NULLIF(NEW.week_start, '')::date,
    NULLIF(NEW.week_end, '')::date,
    '/report-system',
    NEW.title,
    NEW.created_at, NEW.updated_at,
    jsonb_build_object('authorName', NEW.author_name)
  )
  ON CONFLICT (source_table, source_id) DO UPDATE SET
    state = EXCLUDED.state,
    period_start = EXCLUDED.period_start,
    period_end = EXCLUDED.period_end,
    title = COALESCE(documents.title, EXCLUDED.title),
    author_id = EXCLUDED.author_id,
    metadata = documents.metadata || EXCLUDED.metadata,
    updated_at = now();
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS weekly_reports_documents_trg ON weekly_summary_reports;
--> statement-breakpoint
CREATE TRIGGER weekly_reports_documents_trg
AFTER INSERT OR UPDATE ON weekly_summary_reports
FOR EACH ROW EXECUTE FUNCTION trg_documents_weekly_reports();
--> statement-breakpoint

-- 3.3) monthly_summary_reports → kind='monthly_report' ----------------------
CREATE OR REPLACE FUNCTION trg_documents_monthly_reports() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  pstart date;
  pend date;
BEGIN
  -- report_month 가 'YYYY-MM' 형식이라고 가정. 잘못된 형식이면 NULL.
  BEGIN
    pstart := to_date(NEW.report_month || '-01', 'YYYY-MM-DD');
    pend := (pstart + interval '1 month - 1 day')::date;
  EXCEPTION WHEN OTHERS THEN
    pstart := NULL;
    pend := NULL;
  END;

  INSERT INTO documents (
    kind, source_table, source_id, state,
    author_id, building_id, period_start, period_end, href,
    title, created_at, updated_at, metadata
  ) VALUES (
    'monthly_report', 'monthly_summary_reports', NEW.id,
    CASE NEW.status WHEN 'draft' THEN 'draft' WHEN 'submitted' THEN 'submitted'
                    WHEN 'reviewed' THEN 'completed' WHEN 'forwarded' THEN 'completed'
                    ELSE 'active' END,
    NEW.author_id, NEW.building_id, pstart, pend, '/report-system',
    NEW.title,
    NEW.created_at, NEW.updated_at,
    jsonb_build_object('authorName', NEW.author_name, 'reportMonth', NEW.report_month)
  )
  ON CONFLICT (source_table, source_id) DO UPDATE SET
    state = EXCLUDED.state,
    period_start = EXCLUDED.period_start,
    period_end = EXCLUDED.period_end,
    title = COALESCE(documents.title, EXCLUDED.title),
    building_id = EXCLUDED.building_id,
    author_id = EXCLUDED.author_id,
    metadata = documents.metadata || EXCLUDED.metadata,
    updated_at = now();
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS monthly_reports_documents_trg ON monthly_summary_reports;
--> statement-breakpoint
CREATE TRIGGER monthly_reports_documents_trg
AFTER INSERT OR UPDATE ON monthly_summary_reports
FOR EACH ROW EXECUTE FUNCTION trg_documents_monthly_reports();
--> statement-breakpoint

-- 3.4) approvals → kind='draft' (is_draft=true) | 'approval' ----------------
CREATE OR REPLACE FUNCTION trg_documents_approvals() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  k text;
  s text;
BEGIN
  k := CASE WHEN NEW.is_draft THEN 'draft' ELSE 'approval' END;
  s := CASE NEW.status
         WHEN 'draft'      THEN 'draft'
         WHEN 'pending'    THEN 'submitted'
         WHEN 'in_progress' THEN 'submitted'
         WHEN 'approved'   THEN 'completed'
         WHEN 'rejected'   THEN 'rejected'
         ELSE 'active' END;

  INSERT INTO documents (
    kind, source_table, source_id, state,
    author_id, building_id, href,
    title, created_at, updated_at, metadata
  ) VALUES (
    k, 'approvals', NEW.id, s,
    NEW.requester_id, NEW.building_id, '/approvals?id=' || NEW.id,
    NEW.title,
    NEW.created_at, NEW.updated_at,
    jsonb_build_object(
      'requesterName', NEW.requester_name,
      'category', NEW.category,
      'triggerSource', NEW.trigger_source,
      'sourceEntityType', NEW.source_entity_type,
      'sourceEntityId', NEW.source_entity_id
    )
  )
  ON CONFLICT (source_table, source_id) DO UPDATE SET
    -- 임시저장(draft) → 상신(approval) 같은 kind 전환은 허용하지만,
    -- quote_bundle 처럼 서비스 단일 통로가 박은 특수 kind 는 보존한다.
    kind = CASE WHEN documents.kind = 'quote_bundle' THEN documents.kind ELSE EXCLUDED.kind END,
    state = EXCLUDED.state,
    building_id = EXCLUDED.building_id,
    author_id = EXCLUDED.author_id,
    title = COALESCE(documents.title, EXCLUDED.title),
    metadata = documents.metadata || EXCLUDED.metadata,
    updated_at = now();
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS approvals_documents_trg ON approvals;
--> statement-breakpoint
CREATE TRIGGER approvals_documents_trg
AFTER INSERT OR UPDATE ON approvals
FOR EACH ROW EXECUTE FUNCTION trg_documents_approvals();
--> statement-breakpoint

-- 3.5) external_documents → kind='external' ---------------------------------
CREATE OR REPLACE FUNCTION trg_documents_external() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO documents (
    kind, source_table, source_id, state,
    author_id, building_id, href, title, thumbnail_url,
    created_at, updated_at, metadata
  ) VALUES (
    'external', 'external_documents', NEW.id, 'active',
    NEW.uploaded_by, NEW.building_id, NEW.file_url, NEW.title,
    CASE WHEN COALESCE(NEW.mime_type, '') LIKE 'image/%' THEN NEW.file_url ELSE NULL END,
    NEW.created_at, NEW.created_at,
    jsonb_build_object('mimeType', NEW.mime_type)
  )
  ON CONFLICT (source_table, source_id) DO UPDATE SET
    title = COALESCE(documents.title, EXCLUDED.title),
    href = EXCLUDED.href,
    thumbnail_url = EXCLUDED.thumbnail_url,
    building_id = EXCLUDED.building_id,
    author_id = EXCLUDED.author_id,
    metadata = documents.metadata || EXCLUDED.metadata,
    updated_at = now();
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS external_documents_documents_trg ON external_documents;
--> statement-breakpoint
CREATE TRIGGER external_documents_documents_trg
AFTER INSERT OR UPDATE ON external_documents
FOR EACH ROW EXECUTE FUNCTION trg_documents_external();
--> statement-breakpoint

-- 3.6) rfqs → kind='rfq' ----------------------------------------------------
CREATE OR REPLACE FUNCTION trg_documents_rfqs() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  s text;
BEGIN
  s := CASE NEW.status
         WHEN 'open'   THEN 'active'
         WHEN 'closed' THEN 'completed'
         WHEN 'cancelled' THEN 'archived'
         ELSE 'active' END;
  INSERT INTO documents (
    kind, source_table, source_id, state,
    building_id, href, title, created_at, updated_at, metadata
  ) VALUES (
    'rfq', 'rfqs', NEW.id, s,
    NEW.building_id, '/rfqs?id=' || NEW.id, NEW.title,
    NEW.created_at, NEW.updated_at,
    jsonb_build_object('category', NEW.category, 'serviceType', NEW.service_type, 'closedQuoteId', NEW.closed_quote_id)
  )
  ON CONFLICT (source_table, source_id) DO UPDATE SET
    state = EXCLUDED.state,
    title = COALESCE(documents.title, EXCLUDED.title),
    building_id = EXCLUDED.building_id,
    metadata = documents.metadata || EXCLUDED.metadata,
    updated_at = now();
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS rfqs_documents_trg ON rfqs;
--> statement-breakpoint
CREATE TRIGGER rfqs_documents_trg
AFTER INSERT OR UPDATE ON rfqs
FOR EACH ROW EXECUTE FUNCTION trg_documents_rfqs();
--> statement-breakpoint

-- 3.7) alert_actions → kind='alert_action_output' ---------------------------
CREATE OR REPLACE FUNCTION trg_documents_alert_actions() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO documents (
    kind, source_table, source_id, state,
    author_id, href, created_at, updated_at, metadata
  ) VALUES (
    'alert_action_output', 'alert_actions', NEW.id, 'completed',
    NEW.user_id, '/alerts',
    NEW.created_at, NEW.created_at,
    jsonb_build_object(
      'alertType', NEW.alert_type,
      'actionType', NEW.action_type,
      'relatedEntityType', NEW.related_entity_type,
      'relatedEntityId', NEW.related_entity_id,
      'rfqId', NEW.rfq_id
    )
  )
  ON CONFLICT (source_table, source_id) DO UPDATE SET
    metadata = documents.metadata || EXCLUDED.metadata,
    updated_at = now();
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS alert_actions_documents_trg ON alert_actions;
--> statement-breakpoint
CREATE TRIGGER alert_actions_documents_trg
AFTER INSERT OR UPDATE ON alert_actions
FOR EACH ROW EXECUTE FUNCTION trg_documents_alert_actions();
--> statement-breakpoint

-- 3.8) notice_outputs → kind='notice_output' --------------------------------
CREATE OR REPLACE FUNCTION trg_documents_notice_outputs() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO documents (
    kind, source_table, source_id, state,
    author_id, author_role, building_id, period_start, period_end, href,
    title, created_at, updated_at, metadata
  ) VALUES (
    'notice_output', 'notice_outputs', NEW.id, 'active',
    NEW.author_id, NEW.author_role, NEW.building_id, NEW.output_date, NEW.output_date,
    '/notices/templates?templateId=' || NEW.template_id,
    NEW.title,
    NEW.created_at, NEW.updated_at,
    jsonb_build_object('templateId', NEW.template_id, 'formats', NEW.formats)
  )
  ON CONFLICT (source_table, source_id) DO UPDATE SET
    title = EXCLUDED.title,
    period_start = EXCLUDED.period_start,
    period_end = EXCLUDED.period_end,
    building_id = EXCLUDED.building_id,
    author_id = EXCLUDED.author_id,
    author_role = EXCLUDED.author_role,
    metadata = documents.metadata || EXCLUDED.metadata,
    updated_at = now();
  RETURN NEW;
END $$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS notice_outputs_documents_trg ON notice_outputs;
--> statement-breakpoint
CREATE TRIGGER notice_outputs_documents_trg
AFTER INSERT OR UPDATE ON notice_outputs
FOR EACH ROW EXECUTE FUNCTION trg_documents_notice_outputs();
--> statement-breakpoint

-- 4) 멱등 백필 ---------------------------------------------------------------
--   기존 행을 documents 레지스트리에 채운다. 이미 있으면 ON CONFLICT 로 패스.

-- 4.1) daily_journals 백필
INSERT INTO documents (
  kind, source_table, source_id, state, author_id, building_id,
  period_start, period_end, href, created_at, updated_at, metadata
)
SELECT
  'journal', 'daily_journals', dj.id, 'active', dj.author_id, dj.building_id,
  dj.journal_date, dj.journal_date, '/work-log?tab=daily',
  dj.created_at, dj.updated_at,
  jsonb_build_object('role', dj.role, 'authorName', dj.author_name)
FROM daily_journals dj
ON CONFLICT (source_table, source_id) DO NOTHING;
--> statement-breakpoint

-- 4.2) weekly_summary_reports 백필
INSERT INTO documents (
  kind, source_table, source_id, state, author_id,
  period_start, period_end, href, title, created_at, updated_at, metadata
)
SELECT
  'weekly_report', 'weekly_summary_reports', w.id,
  CASE w.status WHEN 'draft' THEN 'draft' WHEN 'submitted' THEN 'submitted'
                WHEN 'reviewed' THEN 'completed' WHEN 'forwarded' THEN 'completed'
                ELSE 'active' END,
  w.author_id,
  CASE WHEN w.week_start ~ '^\d{4}-\d{2}-\d{2}$' THEN w.week_start::date ELSE NULL END,
  CASE WHEN w.week_end ~ '^\d{4}-\d{2}-\d{2}$' THEN w.week_end::date ELSE NULL END,
  '/report-system', w.title, w.created_at, w.updated_at,
  jsonb_build_object('authorName', w.author_name)
FROM weekly_summary_reports w
ON CONFLICT (source_table, source_id) DO NOTHING;
--> statement-breakpoint

-- 4.3) monthly_summary_reports 백필
INSERT INTO documents (
  kind, source_table, source_id, state, author_id, building_id,
  period_start, period_end, href, title, created_at, updated_at, metadata
)
SELECT
  'monthly_report', 'monthly_summary_reports', m.id,
  CASE m.status WHEN 'draft' THEN 'draft' WHEN 'submitted' THEN 'submitted'
                WHEN 'reviewed' THEN 'completed' WHEN 'forwarded' THEN 'completed'
                ELSE 'active' END,
  m.author_id, m.building_id,
  CASE WHEN m.report_month ~ '^\d{4}-\d{2}$'
       THEN to_date(m.report_month || '-01', 'YYYY-MM-DD') ELSE NULL END,
  CASE WHEN m.report_month ~ '^\d{4}-\d{2}$'
       THEN (to_date(m.report_month || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date
       ELSE NULL END,
  '/report-system', m.title, m.created_at, m.updated_at,
  jsonb_build_object('authorName', m.author_name, 'reportMonth', m.report_month)
FROM monthly_summary_reports m
ON CONFLICT (source_table, source_id) DO NOTHING;
--> statement-breakpoint

-- 4.4) approvals 백필
INSERT INTO documents (
  kind, source_table, source_id, state, author_id, building_id,
  href, title, created_at, updated_at, metadata
)
SELECT
  CASE WHEN a.is_draft THEN 'draft' ELSE 'approval' END,
  'approvals', a.id,
  CASE a.status WHEN 'draft' THEN 'draft' WHEN 'pending' THEN 'submitted'
                WHEN 'in_progress' THEN 'submitted' WHEN 'approved' THEN 'completed'
                WHEN 'rejected' THEN 'rejected' ELSE 'active' END,
  a.requester_id, a.building_id,
  '/approvals?id=' || a.id, a.title, a.created_at, a.updated_at,
  jsonb_build_object(
    'requesterName', a.requester_name,
    'category', a.category,
    'triggerSource', a.trigger_source,
    'sourceEntityType', a.source_entity_type,
    'sourceEntityId', a.source_entity_id
  )
FROM approvals a
ON CONFLICT (source_table, source_id) DO NOTHING;
--> statement-breakpoint

-- 4.5) external_documents 백필
INSERT INTO documents (
  kind, source_table, source_id, state, author_id, building_id,
  href, title, thumbnail_url, created_at, updated_at, metadata
)
SELECT
  'external', 'external_documents', e.id, 'active',
  e.uploaded_by, e.building_id, e.file_url, e.title,
  CASE WHEN COALESCE(e.mime_type, '') LIKE 'image/%' THEN e.file_url ELSE NULL END,
  e.created_at, e.created_at,
  jsonb_build_object('mimeType', e.mime_type)
FROM external_documents e
ON CONFLICT (source_table, source_id) DO NOTHING;
--> statement-breakpoint

-- 4.6) rfqs 백필
INSERT INTO documents (
  kind, source_table, source_id, state, building_id,
  href, title, created_at, updated_at, metadata
)
SELECT
  'rfq', 'rfqs', r.id,
  CASE r.status WHEN 'open' THEN 'active' WHEN 'closed' THEN 'completed'
                WHEN 'cancelled' THEN 'archived' ELSE 'active' END,
  r.building_id, '/rfqs?id=' || r.id, r.title,
  r.created_at, r.updated_at,
  jsonb_build_object('category', r.category, 'serviceType', r.service_type, 'closedQuoteId', r.closed_quote_id)
FROM rfqs r
ON CONFLICT (source_table, source_id) DO NOTHING;
--> statement-breakpoint

-- 4.7) alert_actions 백필
INSERT INTO documents (
  kind, source_table, source_id, state, author_id,
  href, created_at, updated_at, metadata
)
SELECT
  'alert_action_output', 'alert_actions', aa.id, 'completed',
  aa.user_id, '/alerts', aa.created_at, aa.created_at,
  jsonb_build_object(
    'alertType', aa.alert_type,
    'actionType', aa.action_type,
    'relatedEntityType', aa.related_entity_type,
    'relatedEntityId', aa.related_entity_id,
    'rfqId', aa.rfq_id
  )
FROM alert_actions aa
ON CONFLICT (source_table, source_id) DO NOTHING;
--> statement-breakpoint

-- 3.8) quotes 트리거 — kind='quote'.
--   파트너가 비교견적에 제출한 견적서. RFQ 단위가 아닌 개별 견적서를 추적한다.
CREATE OR REPLACE FUNCTION trg_documents_quotes() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO documents (
    kind, source_table, source_id, state, building_id, href, title, created_at, updated_at, metadata
  )
  SELECT
    'quote', 'quotes', NEW.id,
    CASE NEW.status WHEN 'submitted' THEN 'submitted'
                    WHEN 'accepted' THEN 'completed'
                    WHEN 'rejected' THEN 'rejected'
                    ELSE 'active' END,
    r.building_id,
    '/rfqs?id=' || NEW.rfq_id,
    '[견적] ' || COALESCE(r.title, 'RFQ #' || NEW.rfq_id) || ' - ' || NEW.vendor_name,
    NEW.created_at, NEW.updated_at,
    jsonb_build_object(
      'rfqId', NEW.rfq_id,
      'vendorId', NEW.vendor_id,
      'vendorName', NEW.vendor_name,
      'totalAmount', NEW.total_amount,
      'status', NEW.status
    )
  FROM rfqs r WHERE r.id = NEW.rfq_id
  ON CONFLICT (source_table, source_id) DO UPDATE SET
    state = EXCLUDED.state,
    metadata = documents.metadata || EXCLUDED.metadata,
    updated_at = now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS documents_quotes_aiu ON quotes;
CREATE TRIGGER documents_quotes_aiu
AFTER INSERT OR UPDATE ON quotes
FOR EACH ROW EXECUTE FUNCTION trg_documents_quotes();
--> statement-breakpoint

-- 3.9) contracts 트리거 — kind='contract'.
CREATE OR REPLACE FUNCTION trg_documents_contracts() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO documents (
    kind, source_table, source_id, state, building_id, href, title, created_at, updated_at, metadata
  ) VALUES (
    'contract', 'contracts', NEW.id,
    CASE NEW.status WHEN 'draft' THEN 'draft'
                    WHEN 'in_approval' THEN 'submitted'
                    WHEN 'active' THEN 'active'
                    WHEN 'expired' THEN 'archived'
                    WHEN 'cancelled' THEN 'archived'
                    ELSE 'active' END,
    NEW.building_id,
    '/contracts?id=' || NEW.id,
    NEW.title,
    NEW.created_at, NEW.updated_at,
    jsonb_build_object(
      'category', NEW.category,
      'vendorId', NEW.vendor_id,
      'vendorName', NEW.vendor_name,
      'rfqId', NEW.rfq_id,
      'quoteId', NEW.quote_id,
      'approvalId', NEW.approval_id,
      'amount', NEW.contract_amount,
      'status', NEW.status
    )
  )
  ON CONFLICT (source_table, source_id) DO UPDATE SET
    state = EXCLUDED.state,
    metadata = documents.metadata || EXCLUDED.metadata,
    updated_at = now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS documents_contracts_aiu ON contracts;
CREATE TRIGGER documents_contracts_aiu
AFTER INSERT OR UPDATE ON contracts
FOR EACH ROW EXECUTE FUNCTION trg_documents_contracts();
--> statement-breakpoint

-- 3.10) platform_announcements 트리거 — kind='announcement'.
--   본사 → 전체 앱 사용자에게 보내는 공지. building_id 는 NULL(전사 범위).
CREATE OR REPLACE FUNCTION trg_documents_platform_announcements() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO documents (
    kind, source_table, source_id, state, author_id, building_id,
    href, title, subtitle, created_at, updated_at, metadata
  ) VALUES (
    'announcement', 'platform_announcements', NEW.id,
    CASE WHEN NEW.is_active THEN 'active' ELSE 'archived' END,
    NEW.created_by, NULL,
    '/announcements?id=' || NEW.id, NEW.title,
    NEW.created_by_name,
    NEW.created_at, NEW.updated_at,
    jsonb_build_object(
      'audience', NEW.audience,
      'recurrence', NEW.recurrence,
      'startsAt', NEW.starts_at,
      'endsAt', NEW.ends_at
    )
  )
  ON CONFLICT (source_table, source_id) DO UPDATE SET
    state = EXCLUDED.state,
    metadata = documents.metadata || EXCLUDED.metadata,
    updated_at = now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS documents_platform_announcements_aiu ON platform_announcements;
CREATE TRIGGER documents_platform_announcements_aiu
AFTER INSERT OR UPDATE ON platform_announcements
FOR EACH ROW EXECUTE FUNCTION trg_documents_platform_announcements();
--> statement-breakpoint

-- 4.8) quotes 백필
INSERT INTO documents (
  kind, source_table, source_id, state, building_id, href, title, created_at, updated_at, metadata
)
SELECT
  'quote', 'quotes', q.id,
  CASE q.status WHEN 'submitted' THEN 'submitted'
                WHEN 'accepted' THEN 'completed'
                WHEN 'rejected' THEN 'rejected'
                ELSE 'active' END,
  r.building_id,
  '/rfqs?id=' || q.rfq_id,
  '[견적] ' || COALESCE(r.title, 'RFQ #' || q.rfq_id) || ' - ' || q.vendor_name,
  q.created_at, q.updated_at,
  jsonb_build_object('rfqId', q.rfq_id, 'vendorId', q.vendor_id, 'vendorName', q.vendor_name,
                     'totalAmount', q.total_amount, 'status', q.status)
FROM quotes q
LEFT JOIN rfqs r ON r.id = q.rfq_id
ON CONFLICT (source_table, source_id) DO NOTHING;
--> statement-breakpoint

-- 4.9) contracts 백필
INSERT INTO documents (
  kind, source_table, source_id, state, building_id, href, title, created_at, updated_at, metadata
)
SELECT
  'contract', 'contracts', c.id,
  CASE c.status WHEN 'draft' THEN 'draft'
                WHEN 'in_approval' THEN 'submitted'
                WHEN 'active' THEN 'active'
                WHEN 'expired' THEN 'archived'
                WHEN 'cancelled' THEN 'archived'
                ELSE 'active' END,
  c.building_id, '/contracts?id=' || c.id, c.title,
  c.created_at, c.updated_at,
  jsonb_build_object('category', c.category, 'vendorId', c.vendor_id, 'vendorName', c.vendor_name,
                     'rfqId', c.rfq_id, 'quoteId', c.quote_id, 'approvalId', c.approval_id,
                     'amount', c.contract_amount, 'status', c.status)
FROM contracts c
ON CONFLICT (source_table, source_id) DO NOTHING;
--> statement-breakpoint

-- 4.10) platform_announcements 백필
INSERT INTO documents (
  kind, source_table, source_id, state, author_id, href, title, subtitle, created_at, updated_at, metadata
)
SELECT
  'announcement', 'platform_announcements', pa.id,
  CASE WHEN pa.is_active THEN 'active' ELSE 'archived' END,
  pa.created_by, '/announcements?id=' || pa.id, pa.title, pa.created_by_name,
  pa.created_at, pa.updated_at,
  jsonb_build_object('audience', pa.audience, 'recurrence', pa.recurrence,
                     'startsAt', pa.starts_at, 'endsAt', pa.ends_at)
FROM platform_announcements pa
ON CONFLICT (source_table, source_id) DO NOTHING;
--> statement-breakpoint
