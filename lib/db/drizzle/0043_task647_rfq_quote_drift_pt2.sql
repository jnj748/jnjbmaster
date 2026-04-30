-- [Task #647 후속] rfqs / quotes 스키마 ↔ 마이그레이션 드리프트 복구 part 2.
--
--   #647 part 1 (0042) 에서 발견·복구한 드리프트와 동일한 패턴:
--   schema/rfqs.ts·quotes.ts 에는 정의돼 있지만 lib/db/drizzle/ 에는
--   대응 SQL 이 한 번도 추가된 적 없는 컬럼 9개를 멱등하게 보강한다.
--
--   운영·개발 DB 에는 과거에 `pnpm --filter db push --force` 로 어찌어찌
--   들어가 있어 지금은 사고가 안 나지만, 새 환경 (백업 복원, 별도 스테이징,
--   신규 리전) 을 띄우면 #647 과 동일한 500 / 부팅 크래시가 다시 난다.
--   이걸 막기 위해 SQL 파일을 정식으로 추가한다.
--
--   컬럼명·타입·NOT NULL/DEFAULT 는 lib/db/src/schema/rfqs.ts 와
--   lib/db/src/schema/quotes.ts 정의, 그리고 현재 dev DB
--   information_schema.columns 양쪽과 1:1 일치 (작성 직전 비교 확인).
--   기존 행은 NULL / false 로 남아 데이터 손실 없음.
--   같은 패턴: 0042_task647_rfq_quote_drift.sql.

-- rfqs 추가 컬럼 4개
ALTER TABLE "rfqs"
  ADD COLUMN IF NOT EXISTS "building_id" integer;

ALTER TABLE "rfqs"
  ADD COLUMN IF NOT EXISTS "estimated_amount" real;

ALTER TABLE "rfqs"
  ADD COLUMN IF NOT EXISTS "is_premium" boolean NOT NULL DEFAULT false;

ALTER TABLE "rfqs"
  ADD COLUMN IF NOT EXISTS "premium_slot_limit" integer;

-- quotes 추가 컬럼 5개
ALTER TABLE "quotes"
  ADD COLUMN IF NOT EXISTS "contract_file_path" text;

ALTER TABLE "quotes"
  ADD COLUMN IF NOT EXISTS "contract_uploaded_at" timestamp with time zone;

ALTER TABLE "quotes"
  ADD COLUMN IF NOT EXISTS "required_docs_complete" boolean NOT NULL DEFAULT false;

ALTER TABLE "quotes"
  ADD COLUMN IF NOT EXISTS "first_viewed_at" timestamp with time zone;

ALTER TABLE "quotes"
  ADD COLUMN IF NOT EXISTS "no_view_refunded_at" timestamp with time zone;
