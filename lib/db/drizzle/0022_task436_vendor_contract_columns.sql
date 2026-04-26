-- [Task #436] 협력업체 등록 500 오류 해결: 운영 DB 에 빠져 있는 컬럼 보강.
--   * vendors.contract_building_name / contract_start_date / contract_end_date
--     은 0000 초기 마이그레이션에 포함되어 있으나 운영 DB 에 적용되지 않은 환경이
--     존재해, select * 가 "column does not exist" 로 500 을 던진다.
--   * contracts.renewal_alert_sent / partner_agreed_at 도 같은 사유로 누락된
--     환경에서 협력업체 주소록 로딩이 실패한다.
--   모두 ADD COLUMN IF NOT EXISTS 로 멱등 적용한다.
ALTER TABLE "vendors"
  ADD COLUMN IF NOT EXISTS "contract_building_name" text;
--> statement-breakpoint
ALTER TABLE "vendors"
  ADD COLUMN IF NOT EXISTS "contract_start_date" date;
--> statement-breakpoint
ALTER TABLE "vendors"
  ADD COLUMN IF NOT EXISTS "contract_end_date" date;
--> statement-breakpoint
ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "renewal_alert_sent" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "contracts"
  ADD COLUMN IF NOT EXISTS "partner_agreed_at" timestamp with time zone;
