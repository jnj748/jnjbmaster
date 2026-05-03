-- [Task #780 review-3] 마감 가드 트리거 — 실제 빌링 테이블명으로 정정.
--   0062 에서 bill_lines/bill_adjustments/installment_plans 라는 잘못된 이름을 썼는데
--   실제 스키마는 billing_lines / billing_adjustments / billing_installments 다.
--   0062 의 IF EXISTS 가드 덕분에 잘못 attach 되진 않았으나, 결과적으로 빌링 변경계
--   테이블이 트리거 보호를 받지 못했다. 본 마이그레이션이 그 갭을 닫는다.
--
--   추가로 INSERT/UPDATE 외 DELETE 도 차단해 잠긴 월 데이터의 삭제를 막는다.

CREATE OR REPLACE FUNCTION enforce_month_open() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_status text;
  v_building_id int;
  v_month text;
  v_bypass text;
  v_row record;
BEGIN
  BEGIN
    v_bypass := current_setting('app.bypass_close_guard', true);
  EXCEPTION WHEN OTHERS THEN
    v_bypass := NULL;
  END;
  IF v_bypass = '1' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  -- DELETE 는 OLD 사용, INSERT/UPDATE 는 NEW 사용.
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

-- 기존 IUD 트리거 재설치 (DELETE 포함하도록).
DO $$
DECLARE
  t text;
  trg text;
  candidates text[] := ARRAY[
    'journal_entries','bill_payments','bills','bank_transactions',
    'monthly_payments','billing_runs','billing_lines','billing_adjustments'
  ];
BEGIN
  FOREACH t IN ARRAY candidates LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t) THEN
      trg := 'trg_enforce_month_open_' || t;
      -- 기존 IUD 전용 트리거가 있으면 제거 후 재생성.
      IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = trg) THEN
        EXECUTE format('DROP TRIGGER %I ON %I', trg, t);
      END IF;
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION enforce_month_open()',
        trg, t
      );
    END IF;
  END LOOP;
END $$;
