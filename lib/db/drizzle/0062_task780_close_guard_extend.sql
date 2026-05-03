-- [Task #780 review-2] 마감 가드 트리거 — 레거시/주변 변경계 테이블까지 보호 확장.
--   1) monthly_payments  : 레거시 /fees/calculate, /fees/record-payment 가 쓴다.
--   2) bill_lines        : 청구 라인 직접 변조 차단.
--   3) bill_adjustments  : 가감 조정 차단.
--   4) installment_plans : 분납 계획 변조 차단(마감월 해당 분).
--   enforce_month_open() 본체에 케이스를 추가하고 트리거를 attach 한다.

CREATE OR REPLACE FUNCTION enforce_month_open() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_status text;
  v_building_id int;
  v_month text;
  v_bypass text;
BEGIN
  BEGIN
    v_bypass := current_setting('app.bypass_close_guard', true);
  EXCEPTION WHEN OTHERS THEN
    v_bypass := NULL;
  END;
  IF v_bypass = '1' THEN RETURN NEW; END IF;

  IF TG_TABLE_NAME = 'journal_entries' THEN
    v_building_id := NEW.building_id;
    v_month := to_char(NEW.entry_date::date, 'YYYY-MM');
  ELSIF TG_TABLE_NAME = 'bill_payments' THEN
    v_building_id := NEW.building_id;
    v_month := to_char(NEW.paid_at::date, 'YYYY-MM');
  ELSIF TG_TABLE_NAME = 'bills' THEN
    v_building_id := NEW.building_id;
    v_month := NEW.billing_month;
  ELSIF TG_TABLE_NAME = 'bank_transactions' THEN
    v_building_id := NEW.building_id;
    v_month := to_char(NEW.tx_date::date, 'YYYY-MM');
  ELSIF TG_TABLE_NAME = 'monthly_payments' THEN
    -- monthly_payments 는 unit_id → buildings 매핑이라 building_id 가 없을 수 있다.
    SELECT u.building_id INTO v_building_id FROM units u WHERE u.id = NEW.unit_id;
    v_month := NEW.billing_month;
  ELSIF TG_TABLE_NAME = 'bill_lines' THEN
    SELECT b.building_id, b.billing_month INTO v_building_id, v_month
      FROM bills b WHERE b.id = NEW.bill_id;
  ELSIF TG_TABLE_NAME = 'bill_adjustments' THEN
    SELECT b.building_id, b.billing_month INTO v_building_id, v_month
      FROM bills b WHERE b.id = NEW.bill_id;
  ELSIF TG_TABLE_NAME = 'installment_plans' THEN
    SELECT b.building_id, b.billing_month INTO v_building_id, v_month
      FROM bills b WHERE b.id = NEW.bill_id;
  ELSE
    RETURN NEW;
  END IF;

  IF v_building_id IS NULL OR v_month IS NULL OR v_month !~ '^\d{4}-\d{2}$' THEN
    RETURN NEW;
  END IF;

  SELECT status INTO v_status FROM period_closings
    WHERE building_id = v_building_id AND month = v_month
    FOR SHARE;

  IF v_status = 'locked' THEN
    RAISE EXCEPTION 'closing_locked: building=% month=% table=%', v_building_id, v_month, TG_TABLE_NAME
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
  candidates text[] := ARRAY['monthly_payments','bill_lines','bill_adjustments','installment_plans'];
BEGIN
  FOREACH t IN ARRAY candidates LOOP
    -- 테이블이 실제 존재하지 않을 수도 있으므로 가드.
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
      IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_month_open_' || t) THEN
        EXECUTE format(
          'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION enforce_month_open()',
          'trg_enforce_month_open_' || t, t
        );
      END IF;
    END IF;
  END LOOP;
END $$;
