-- [Task #780] T9 마감 가드 — DB 레벨 원자 집행.
--   미들웨어/라우트의 `isMonthLocked` 인라인 체크는 두 SQL(읽기→쓰기) 사이에 race
--   가 있어, 동시 마감 트랜잭션이 commit 되는 짧은 구간에 변경이 끼어들 수 있다.
--   이 트리거는 INSERT/UPDATE 시점에 같은 트랜잭션에서 period_closings 행을
--   `FOR SHARE` 로 읽고 status='locked' 면 예외를 발생시킨다. lockMonth() 의
--   UPDATE(status→locked) 는 같은 행에 EXCLUSIVE 를 걸기 때문에 SHARE 와 자연
--   직렬화되며, "체크 → 변경" 사이의 race 가 닫힌다.
--
--   lockMonth() 자신은 trigger 로 자기 잠금을 막아서는 안 되므로 세션 GUC
--   `app.bypass_close_guard='1'` 일 때 트리거를 건너뛰도록 한다.

CREATE OR REPLACE FUNCTION enforce_month_open() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_status text;
  v_building_id int;
  v_month text;
  v_bypass text;
BEGIN
  -- lockMonth 가 SET LOCAL app.bypass_close_guard='1' 로 일시 우회 가능.
  BEGIN
    v_bypass := current_setting('app.bypass_close_guard', true);
  EXCEPTION WHEN OTHERS THEN
    v_bypass := NULL;
  END;
  IF v_bypass = '1' THEN
    RETURN NEW;
  END IF;

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
    RAISE EXCEPTION 'closing_locked: building=% month=%', v_building_id, v_month
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_month_open_journal_entries') THEN
    CREATE TRIGGER trg_enforce_month_open_journal_entries
      BEFORE INSERT OR UPDATE ON journal_entries
      FOR EACH ROW EXECUTE FUNCTION enforce_month_open();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_month_open_bill_payments') THEN
    CREATE TRIGGER trg_enforce_month_open_bill_payments
      BEFORE INSERT OR UPDATE ON bill_payments
      FOR EACH ROW EXECUTE FUNCTION enforce_month_open();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_month_open_bills') THEN
    CREATE TRIGGER trg_enforce_month_open_bills
      BEFORE INSERT OR UPDATE ON bills
      FOR EACH ROW EXECUTE FUNCTION enforce_month_open();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_enforce_month_open_bank_transactions') THEN
    CREATE TRIGGER trg_enforce_month_open_bank_transactions
      BEFORE INSERT OR UPDATE ON bank_transactions
      FOR EACH ROW EXECUTE FUNCTION enforce_month_open();
  END IF;
END $$;
