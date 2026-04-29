-- [Task #559] units.owner_address / owner_source 컬럼 누락 정합화.
--
-- Drizzle 스키마(lib/db/src/schema/units.ts) 는 ownerAddress(text), ownerSource(text)
-- 를 SELECT 절에 포함시키지만, 운영 DB 에는 두 컬럼이 존재하지 않아
-- /api/buildings/overview, /api/dashboard/analytics 등 호실 조회 라우트가
-- 모두 "column 'owner_address' does not exist" 로 500 을 던지는 상태였다.
--
-- 두 컬럼 모두 nullable text 로 추가한다. 기존 행은 NULL 로 둔다.
-- IF NOT EXISTS 로 멱등하게 작성 — 운영 부팅 시 runMigrations 가 안전하게 적용.

ALTER TABLE "units"
  ADD COLUMN IF NOT EXISTS "owner_address" text;

ALTER TABLE "units"
  ADD COLUMN IF NOT EXISTS "owner_source" text;
