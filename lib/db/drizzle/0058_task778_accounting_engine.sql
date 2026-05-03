-- [Task #778] T6 회계엔진 v01 — 계정과목·분개·총계정원장.
--   모든 DDL 은 멱등(IF NOT EXISTS / DO $$ ...).

CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id serial PRIMARY KEY,
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  parent_code text,
  is_header boolean NOT NULL DEFAULT false,
  is_standard boolean NOT NULL DEFAULT false,
  building_id integer,
  sort_order integer NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chart_of_accounts_code_building'
  ) THEN
    ALTER TABLE chart_of_accounts ADD CONSTRAINT chart_of_accounts_code_building UNIQUE (code, building_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS chart_of_accounts_type_idx ON chart_of_accounts(type);
CREATE INDEX IF NOT EXISTS chart_of_accounts_building_idx ON chart_of_accounts(building_id);

CREATE TABLE IF NOT EXISTS journal_entries (
  id serial PRIMARY KEY,
  building_id integer,
  entry_date date NOT NULL,
  memo text NOT NULL,
  source_event text NOT NULL DEFAULT 'manual',
  source_ref_type text,
  source_ref_id integer,
  locked boolean NOT NULL DEFAULT false,
  reversed_entry_id integer,
  is_reversal boolean NOT NULL DEFAULT false,
  total_debit real NOT NULL DEFAULT 0,
  total_credit real NOT NULL DEFAULT 0,
  is_balanced boolean NOT NULL DEFAULT true,
  created_by_id integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS journal_entries_building_idx ON journal_entries(building_id);
CREATE INDEX IF NOT EXISTS journal_entries_date_idx ON journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS journal_entries_source_idx ON journal_entries(source_event, source_ref_id);

CREATE TABLE IF NOT EXISTS journal_lines (
  id serial PRIMARY KEY,
  entry_id integer NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
  account_code text NOT NULL,
  account_name text NOT NULL,
  debit real NOT NULL DEFAULT 0,
  credit real NOT NULL DEFAULT 0,
  party_name text,
  unit_id integer,
  memo text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS journal_lines_entry_idx ON journal_lines(entry_id);
CREATE INDEX IF NOT EXISTS journal_lines_account_idx ON journal_lines(account_code);
CREATE INDEX IF NOT EXISTS journal_lines_party_idx ON journal_lines(party_name);
CREATE INDEX IF NOT EXISTS journal_lines_unit_idx ON journal_lines(unit_id);
