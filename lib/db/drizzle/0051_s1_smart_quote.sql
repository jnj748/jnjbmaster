-- [S1 스마트견적] 파트너의 스마트견적 가입 정보 + 자동 제출 시도 이력.
--   1) vendor_smart_quote: vendor 당 1행 (vendor_id PK). 토글/일일 한도/대상 카테고리.
--   2) rfq_smart_quote_log: 자동 제출 시도 이력 (sent/skipped/failed + 사유 + 차감 캐시).
--
-- 정책(사장님 합의):
--   - 캐시는 일반 견적 대비 0.9배 차감(자동화 할인). 본 SQL 은 데이터 모델만 만들고
--     자동 제출 엔진은 S3 단계에서 따로 켠다.
--   - 신규 가입자 기본값: status='paused' (직접 켜기 전엔 동작 안 함),
--     daily_credit_budget=9000, daily_max_count=3.
--   - 기존 vendors/rfqs/quotes 테이블 컬럼은 추가하지 않는다 (DESTRUCTIVE 변경 없음).
--   - 모든 DDL 은 IF NOT EXISTS — 멱등.

CREATE TABLE IF NOT EXISTS vendor_smart_quote (
  vendor_id integer PRIMARY KEY REFERENCES vendors(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'paused' CHECK (status IN ('active','paused')),
  daily_credit_budget integer NOT NULL DEFAULT 9000,
  daily_max_count integer NOT NULL DEFAULT 3,
  target_categories text[] NOT NULL DEFAULT '{}',
  target_regions jsonb,
  paused_reason text,
  last_paused_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS rfq_smart_quote_log (
  id serial PRIMARY KEY,
  rfq_id integer NOT NULL REFERENCES rfqs(id) ON DELETE CASCADE,
  vendor_id integer NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  quote_id integer REFERENCES quotes(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('sent','skipped','failed')),
  credits_used integer NOT NULL DEFAULT 0,
  skip_reason text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rfq_smart_quote_log_rfq_id_idx ON rfq_smart_quote_log(rfq_id);
CREATE INDEX IF NOT EXISTS rfq_smart_quote_log_vendor_id_idx ON rfq_smart_quote_log(vendor_id);
CREATE INDEX IF NOT EXISTS rfq_smart_quote_log_vendor_created_idx ON rfq_smart_quote_log(vendor_id, created_at);
