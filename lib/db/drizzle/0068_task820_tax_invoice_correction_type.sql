-- [Task #820] tax_invoices.correction_type — 국세청 수정세금계산서 사유 코드.
--   값: supply_change | return | contract_termination | misentry | duplicate | local_lc | other
--   tax_invoices 테이블이 아직 만들어지지 않은 환경(태스크 #803 이전)도 있어
--   `IF EXISTS` 가드를 둔다. 신규 환경은 schema 정의로부터 직접 생성된다.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tax_invoices'
  ) THEN
    ALTER TABLE "tax_invoices" ADD COLUMN IF NOT EXISTS "correction_type" text;
  END IF;
END
$$;
