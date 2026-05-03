-- [Task #797] 입주자관리 부가 기능 6종 — 키 발급/회수, 중간 정산서, 개인정보
--   접근 이력, 장기수선충당금. 차량 sticker/EV/연식·제조사·배기량 컬럼 보강.

CREATE TABLE IF NOT EXISTS key_issuances (
  id serial PRIMARY KEY,
  building_id integer NOT NULL REFERENCES buildings(id),
  unit text NOT NULL,
  tenant_name text,
  key_number text NOT NULL,
  issue_reason text,
  issued_at date,
  returned_at date,
  status text NOT NULL DEFAULT 'issued',
  handler_name text,
  handler_id integer REFERENCES users(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS key_issuances_building_idx ON key_issuances(building_id);
CREATE INDEX IF NOT EXISTS key_issuances_status_idx ON key_issuances(status);

CREATE TABLE IF NOT EXISTS interim_settlements (
  id serial PRIMARY KEY,
  building_id integer NOT NULL REFERENCES buildings(id),
  unit text NOT NULL,
  billing_month text NOT NULL,
  period_start date,
  period_end date,
  closing_amount integer NOT NULL DEFAULT 0,
  month_amount integer NOT NULL DEFAULT 0,
  supply_amount integer NOT NULL DEFAULT 0,
  vat_amount integer NOT NULL DEFAULT 0,
  non_tax_amount integer NOT NULL DEFAULT 0,
  exempt_amount integer NOT NULL DEFAULT 0,
  occurred_amount integer NOT NULL DEFAULT 0,
  apply_late_fee boolean NOT NULL DEFAULT FALSE,
  notes text,
  status text NOT NULL DEFAULT 'draft',
  created_by integer REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS interim_settlements_building_idx ON interim_settlements(building_id);
CREATE INDEX IF NOT EXISTS interim_settlements_month_idx ON interim_settlements(billing_month);

CREATE TABLE IF NOT EXISTS privacy_access_logs (
  id serial PRIMARY KEY,
  building_id integer REFERENCES buildings(id),
  user_id integer REFERENCES users(id),
  user_name text,
  page text NOT NULL,
  purpose text,
  reason text,
  ip text,
  unmasked boolean NOT NULL DEFAULT FALSE,
  printed boolean NOT NULL DEFAULT FALSE,
  downloaded boolean NOT NULL DEFAULT FALSE,
  target_type text,
  target_id integer,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS privacy_access_logs_building_idx ON privacy_access_logs(building_id);
CREATE INDEX IF NOT EXISTS privacy_access_logs_user_idx ON privacy_access_logs(user_id);
CREATE INDEX IF NOT EXISTS privacy_access_logs_created_idx ON privacy_access_logs(created_at);

CREATE TABLE IF NOT EXISTS long_term_repair_allocations (
  id serial PRIMARY KEY,
  building_id integer NOT NULL REFERENCES buildings(id),
  item_category text,
  calc_method text NOT NULL DEFAULT 'supply_area',
  calc_date date,
  period_start date,
  period_end date,
  unit_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  unit_prices jsonb NOT NULL DEFAULT '[]'::jsonb,
  disclosures jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_amount integer NOT NULL DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'draft',
  created_by integer REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ltr_allocations_building_idx ON long_term_repair_allocations(building_id);

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS sticker_number text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS sticker_issued_at timestamptz;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS is_electric boolean NOT NULL DEFAULT FALSE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS model_year integer;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS manufacturer text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS engine_displacement integer;
