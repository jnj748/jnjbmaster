-- [Task #647] rfqs / quotes 스키마 → 마이그레이션 드리프트 복구.
--   Task #612 (표준 견적 양식 + 현장방문 견적) 가 lib/db/src/schema/rfqs.ts,
--   quotes.ts 에는 컬럼을 추가했지만 lib/db/drizzle/ 에는 대응 SQL 이 한 번도
--   생성되지 않은 채 머지되어, 운영/개발 DB 양쪽에 컬럼 자체가 존재하지 않았다.
--
--   증상:
--     - POST /api/rfqs 가 항상 500 (column "requires_site_visit" does not exist) →
--       관리소장 모드 "견적 요청 생성" 흐름이 막힘.
--     - 부팅 직후 refundUnviewedQuotes 가 매번 500 (column "line_items" does not
--       exist) 으로 죽어 미열람 견적 환불 정책이 동작 안 함.
--
--   컬럼 이름·타입은 lib/db/src/schema/rfqs.ts:27, quotes.ts:29-34 정의와
--   정확히 일치. 모두 ADD COLUMN IF NOT EXISTS 로 멱등하게 추가하고,
--   기존 행은 NULL / 기본값(false) 으로 남는다 — 데이터 손실 없음.
--   같은 패턴: 0041_task646_usage_events.sql.

ALTER TABLE "rfqs"
  ADD COLUMN IF NOT EXISTS "requires_site_visit" boolean NOT NULL DEFAULT false;

ALTER TABLE "quotes"
  ADD COLUMN IF NOT EXISTS "line_items" text;

ALTER TABLE "quotes"
  ADD COLUMN IF NOT EXISTS "subtotal" real;

ALTER TABLE "quotes"
  ADD COLUMN IF NOT EXISTS "vat_amount" real;

ALTER TABLE "quotes"
  ADD COLUMN IF NOT EXISTS "valid_until" date;

ALTER TABLE "quotes"
  ADD COLUMN IF NOT EXISTS "warranty_terms" text;

ALTER TABLE "quotes"
  ADD COLUMN IF NOT EXISTS "attachment_url" text;
