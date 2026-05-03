-- [Task #796] 호실관리·환경설정 풀세트.
--   1) units 7개 컬럼 추가 (호실용도/주거용도/소유구분/키발송일/거래처명/대표자/우편번호).
--   2) 환경설정 7개 신규 테이블 — buildingId 1:1 (5종) + 호실별 (선수관리·출입카드).
--   모든 테이블은 기존 closings 트리거의 영향을 받지 않는다 (월 컬럼 없음).

-- 1. units 신규 컬럼 -----------------------------------------------------
ALTER TABLE units ADD COLUMN IF NOT EXISTS unit_usage         text;        -- 주거 / 상가 / 업무
ALTER TABLE units ADD COLUMN IF NOT EXISTS residence_usage    text;        -- 자가 / 임차 / 공실
ALTER TABLE units ADD COLUMN IF NOT EXISTS ownership_type     text;        -- 개인 / 법인 / 임차인
ALTER TABLE units ADD COLUMN IF NOT EXISTS key_sent_at        date;        -- 키 발송일
ALTER TABLE units ADD COLUMN IF NOT EXISTS vendor_name        text;        -- 거래처명
ALTER TABLE units ADD COLUMN IF NOT EXISTS representative_name text;       -- 대표자
ALTER TABLE units ADD COLUMN IF NOT EXISTS postal_code        text;        -- 우편번호

-- 2. 검침환경 (1:1 buildingId) ------------------------------------------
CREATE TABLE IF NOT EXISTS metering_environment (
  id            serial PRIMARY KEY,
  building_id   integer NOT NULL UNIQUE REFERENCES buildings(id),
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,    -- 검침항목별 설정(전기/온수/수도/난방/가스/정수)
  kepco_terms   jsonb NOT NULL DEFAULT '[]'::jsonb,    -- 한전요금 조건표 행
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 3. 검침사용현황설정 (1:1) ---------------------------------------------
CREATE TABLE IF NOT EXISTS metering_usage_settings (
  id            serial PRIMARY KEY,
  building_id   integer NOT NULL UNIQUE REFERENCES buildings(id),
  config        jsonb NOT NULL DEFAULT '{}'::jsonb,    -- 검침종류별 LED/감소율/적용분 등
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 4. 고지서출력환경 (1:1) -----------------------------------------------
CREATE TABLE IF NOT EXISTS notice_output_settings (
  id                  serial PRIMARY KEY,
  building_id         integer NOT NULL UNIQUE REFERENCES buildings(id),
  show_alias          boolean NOT NULL DEFAULT false,
  alias_name          text,
  delivery_postal     boolean NOT NULL DEFAULT true,
  delivery_direct     boolean NOT NULL DEFAULT false,
  delivery_email      boolean NOT NULL DEFAULT false,
  registered_no       text,
  auto_transfer_org   text,
  vat_included        boolean NOT NULL DEFAULT false,
  positions           jsonb NOT NULL DEFAULT '{}'::jsonb,  -- 35개 위치조정 항목
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- 5. 관리비부과환경 (1:1) -----------------------------------------------
CREATE TABLE IF NOT EXISTS billing_environment_settings (
  id                serial PRIMARY KEY,
  building_id       integer NOT NULL UNIQUE REFERENCES buildings(id),
  category_config   jsonb NOT NULL DEFAULT '{}'::jsonb,   -- 합계/검침/기타 카테고리
  vat_threshold_m2  numeric DEFAULT 135,                  -- 단지전용면적 N㎡ 초과 부가세
  esco_config       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- LED 설치원금/TV수신료 등
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 6. 연말정산기본정보 (1:1) ---------------------------------------------
CREATE TABLE IF NOT EXISTS year_end_tax_info (
  id                serial PRIMARY KEY,
  building_id       integer NOT NULL UNIQUE REFERENCES buildings(id),
  settlement_year   integer,
  business_number   text,
  company_name      text,
  representative    text,
  business_address  text,
  industry_type     text,
  business_item     text,
  contact_person    text,
  tax_office_code   text,
  deduction_method  text,
  quarterly_pay     boolean NOT NULL DEFAULT false,
  invoice_status    jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- 7. 선수관리비(관리예치금) — 호실별 -------------------------------------
CREATE TABLE IF NOT EXISTS prepaid_deposits (
  id                serial PRIMARY KEY,
  building_id       integer NOT NULL REFERENCES buildings(id),
  unit_id           integer NOT NULL REFERENCES units(id),
  deposit_date      date,
  receipt_period    text,
  supply_area       numeric,
  move_in_date      date,
  prepaid_amount    integer NOT NULL DEFAULT 0,
  received_amount   integer NOT NULL DEFAULT 0,
  unpaid_amount     integer NOT NULL DEFAULT 0,
  paid_at           date,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (building_id, unit_id)
);
CREATE INDEX IF NOT EXISTS prepaid_deposits_building_idx ON prepaid_deposits(building_id);

-- 8. 출입카드발급 — 호실별(여러 카드 가능) ------------------------------
CREATE TABLE IF NOT EXISTS access_cards (
  id              serial PRIMARY KEY,
  building_id     integer NOT NULL REFERENCES buildings(id),
  unit_id         integer REFERENCES units(id),
  serial_no       text NOT NULL,
  issued_at       date,
  revoked_at      date,
  card_registered boolean NOT NULL DEFAULT true,
  deposit_amount  integer NOT NULL DEFAULT 0,
  issue_fee       integer NOT NULL DEFAULT 0,
  recipient_name  text,
  recipient_phone text,
  bank_name       text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS access_cards_building_idx ON access_cards(building_id);
CREATE INDEX IF NOT EXISTS access_cards_unit_idx ON access_cards(unit_id);
