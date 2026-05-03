-- [Task #780 review-4] 마감 가드 트리거 — billing_installments 까지 확장.
--   분할부과 row 하나가 startMonth~endMonth 사이의 여러 월에 영향을 주므로,
--   해당 범위에 잠긴 월이 하나라도 있으면 INSERT/UPDATE/DELETE 를 차단한다.

CREATE OR REPLACE FUNCTION enforce_month_open() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_status text;
  v_building_id int;
  v_month text;
  v_start text;
  v_end text;
  v_bypass text;
  v_row record;
  v_locked_month text;
BEGIN
  BEGIN
    v_bypass := current_setting('app.bypass_close_guard', true);
  EXCEPTION WHEN OTHERS THEN
    v_bypass := NULL;
  END;
  IF v_bypass = '1' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;

  IF TG_TABLE_NAME = 'journal_entries' THEN
    v_building_id := v_row.building_id;
    v_month := to_char(v_row.entry_date::date, 'YYYY-MM');
  ELSIF TG_TABLE_NAME = 'bill_payments' THEN
    v_building_id := v_row.building_id;
    v_month := to_char(v_row.paid_at::date, 'YYYY-MM');
  ELSIF TG_TABLE_NAME = 'bills' THEN
    v_building_id := v_row.building_id;
    v_month := v_row.billing_month;
  ELSIF TG_TABLE_NAME = 'bank_transactions' THEN
    v_building_id := v_row.building_id;
    v_month := to_char(v_row.tx_date::date, 'YYYY-MM');
  ELSIF TG_TABLE_NAME = 'monthly_payments' THEN
    SELECT u.building_id INTO v_building_id FROM units u WHERE u.id = v_row.unit_id;
    v_month := v_row.billing_month;
  ELSIF TG_TABLE_NAME = 'billing_lines' THEN
    SELECT br.building_id, br.billing_month INTO v_building_id, v_month
      FROM billing_runs br WHERE br.id = v_row.run_id;
  ELSIF TG_TABLE_NAME = 'billing_adjustments' THEN
    SELECT br.building_id, br.billing_month INTO v_building_id, v_month
      FROM billing_runs br WHERE br.id = v_row.run_id;
  ELSIF TG_TABLE_NAME = 'billing_runs' THEN
    v_building_id := v_row.building_id;
    v_month := v_row.billing_month;
  ELSIF TG_TABLE_NAME = 'billing_installments' THEN
    -- 범위 검사: startMonth~endMonth 사이 잠긴 월이 하나라도 있으면 거부.
    v_building_id := v_row.building_id;
    v_start := v_row.start_month;
    v_end := v_row.end_month;
    IF v_building_id IS NOT NULL AND v_start ~ '^\d{4}-\d{2}$' AND v_end ~ '^\d{4}-\d{2}$' THEN
      SELECT month INTO v_locked_month FROM period_closings
        WHERE building_id = v_building_id
          AND status = 'locked'
          AND month >= v_start AND month <= v_end
        ORDER BY month
        LIMIT 1
        FOR SHARE;
      IF v_locked_month IS NOT NULL THEN
        RAISE EXCEPTION 'closing_locked: building=% month=% table=billing_installments op=%',
          v_building_id, v_locked_month, TG_OP
          USING ERRCODE = 'P0001';
      END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF v_building_id IS NULL OR v_month IS NULL OR v_month !~ '^\d{4}-\d{2}$' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  SELECT status INTO v_status FROM period_closings
    WHERE building_id = v_building_id AND month = v_month
    FOR SHARE;

  IF v_status = 'locked' THEN
    RAISE EXCEPTION 'closing_locked: building=% month=% table=% op=%',
      v_building_id, v_month, TG_TABLE_NAME, TG_OP
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'billing_installments') THEN
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_month_open_billing_installments') THEN
      DROP TRIGGER trg_enforce_month_open_billing_installments ON billing_installments;
    END IF;
    CREATE TRIGGER trg_enforce_month_open_billing_installments
      BEFORE INSERT OR UPDATE OR DELETE ON billing_installments
      FOR EACH ROW EXECUTE FUNCTION enforce_month_open();
  END IF;
END $$;
