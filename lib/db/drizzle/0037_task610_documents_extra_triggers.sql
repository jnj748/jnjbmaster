-- [Task #610] documents 레지스트리 보강: quotes / contracts / platform_announcements
--
-- 배경:
--   0036 의 신규 sections 3.8/3.9/3.10 + 4.8/4.9/4.10 은 0036 이 이미 적용된 환경
--   에서는 더 이상 다시 실행되지 않는다(_app_migrations 멱등 트래킹). 새 트리거와
--   백필을 보장하기 위해 0037 로 분리한다. 모든 객체는 CREATE OR REPLACE / DROP
--   IF EXISTS / ON CONFLICT DO NOTHING 으로 멱등 보장.
--
-- 새 documents.kind 값 'quote', 'contract', 'announcement' 는 0036 enum 정의에
--   포함되어 있으므로 enum ALTER 가 별도 필요 없다.

-- ---------------------------------------------------------------------------
-- 1) quotes 트리거 — kind='quote'
-- ---------------------------------------------------------------------------
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
--> statement-breakpoint
CREATE TRIGGER documents_quotes_aiu
AFTER INSERT OR UPDATE ON quotes
FOR EACH ROW EXECUTE FUNCTION trg_documents_quotes();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2) contracts 트리거 — kind='contract'
-- ---------------------------------------------------------------------------
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
--> statement-breakpoint
CREATE TRIGGER documents_contracts_aiu
AFTER INSERT OR UPDATE ON contracts
FOR EACH ROW EXECUTE FUNCTION trg_documents_contracts();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3) platform_announcements 트리거 — kind='announcement'
--    본사 → 전체 앱 사용자에게 보내는 공지. building_id 는 NULL(전사 범위).
-- ---------------------------------------------------------------------------
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
--> statement-breakpoint
CREATE TRIGGER documents_platform_announcements_aiu
AFTER INSERT OR UPDATE ON platform_announcements
FOR EACH ROW EXECUTE FUNCTION trg_documents_platform_announcements();
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4) 백필 — quotes / contracts / platform_announcements
-- ---------------------------------------------------------------------------
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
