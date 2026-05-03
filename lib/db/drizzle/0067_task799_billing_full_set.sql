-- [Task #799] 부과관리 풀세트 — 5종 신규 도메인 (CREATE IF NOT EXISTS 로 보존).
--
-- 1) billing_items            : 부과항목 마스터
-- 2) billing_late_fee_rates   : 연체율 정책 (기간 × 일수 범위 × 누진)
-- 3) billing_months           : 부과월 카드 (생성→산출→고지→마감 4단계)
-- 4) billing_extra_charges    : 호실별 일회성 별도 부과 (CSV 일괄)
-- 5) notice_deliveries        : 채널별 발송 결과 (이메일/SMS/카카오/우편)

CREATE TABLE IF NOT EXISTS billing_items (
  id serial PRIMARY KEY,
  building_id integer NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  parent_code text,
  category text NOT NULL DEFAULT 'maintenance',
  basis text NOT NULL DEFAULT 'area',
  unit_price real NOT NULL DEFAULT 0,
  is_progressive boolean NOT NULL DEFAULT false,
  is_daily_based boolean NOT NULL DEFAULT false,
  exemption_rate real NOT NULL DEFAULT 0,
  opt_out_allowed boolean NOT NULL DEFAULT false,
  is_taxable boolean NOT NULL DEFAULT false,
  print_on_notice boolean NOT NULL DEFAULT true,
  print_on_adjustment boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_items_building_code UNIQUE (building_id, code)
);
CREATE INDEX IF NOT EXISTS billing_items_building_idx ON billing_items(building_id);
CREATE INDEX IF NOT EXISTS billing_items_active_idx ON billing_items(building_id, is_active);

CREATE TABLE IF NOT EXISTS billing_late_fee_rates (
  id serial PRIMARY KEY,
  building_id integer NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  notice_kind text NOT NULL DEFAULT 'all',
  period_start date NOT NULL,
  period_end date,
  base_rate real NOT NULL DEFAULT 0,
  tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  apply_calculation boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS billing_late_fee_rates_building_idx ON billing_late_fee_rates(building_id);
CREATE INDEX IF NOT EXISTS billing_late_fee_rates_period_idx ON billing_late_fee_rates(building_id, period_start);

CREATE TABLE IF NOT EXISTS billing_months (
  id serial PRIMARY KEY,
  building_id integer NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  billing_month text NOT NULL,
  period_start date,
  period_end date,
  due_date date,
  notice_format text NOT NULL DEFAULT 'integrated',
  stage text NOT NULL DEFAULT 'created',
  auto_close boolean NOT NULL DEFAULT false,
  auto_debit_enabled boolean NOT NULL DEFAULT false,
  print_requested_at timestamptz,
  notice_issued_at timestamptz,
  closed_at timestamptz,
  closed_by_id integer REFERENCES users(id),
  run_id integer REFERENCES billing_runs(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  CONSTRAINT billing_months_building_month UNIQUE (building_id, billing_month)
);
CREATE INDEX IF NOT EXISTS billing_months_stage_idx ON billing_months(building_id, stage);

CREATE TABLE IF NOT EXISTS billing_extra_charges (
  id serial PRIMARY KEY,
  building_id integer NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  unit_id integer NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  unit_number text NOT NULL,
  billing_month text NOT NULL,
  item_code text,
  label text NOT NULL,
  amount real NOT NULL DEFAULT 0,
  applied_to_run boolean NOT NULL DEFAULT false,
  notes text,
  created_by_id integer REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS billing_extra_charges_month_idx ON billing_extra_charges(building_id, billing_month);
CREATE INDEX IF NOT EXISTS billing_extra_charges_unit_idx ON billing_extra_charges(unit_id);

CREATE TABLE IF NOT EXISTS notice_deliveries (
  id serial PRIMARY KEY,
  building_id integer NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  bill_id integer REFERENCES bills(id) ON DELETE SET NULL,
  unit_id integer REFERENCES units(id) ON DELETE SET NULL,
  unit_number text,
  billing_month text NOT NULL,
  channel text NOT NULL,
  recipient text,
  status text NOT NULL DEFAULT 'queued',
  sent_at timestamptz,
  read_at timestamptz,
  result_code text,
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  job_id integer,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notice_deliveries_month_idx ON notice_deliveries(building_id, billing_month);
CREATE INDEX IF NOT EXISTS notice_deliveries_status_idx ON notice_deliveries(building_id, status);
CREATE INDEX IF NOT EXISTS notice_deliveries_bill_idx ON notice_deliveries(bill_id);
