-- [Task #537] Task #516 (호실·소유자 마스터) 가 SQL 마이그레이션 없이 머지되어
-- 발생한 dev/운영 스키마 드리프트 정합화.
--
-- 누락 컬럼:
--   1) buildings.register_dong_pks (jsonb)  — 다동 단지의 동(棟)별 표제부 PK 캐시.
--   2) units.dong (text NOT NULL DEFAULT '')  — 동(棟) 매칭 키. 단일 동 건물은 ''.
--
-- 또한 units 의 유니크 키를 (building_id, unit_number) 에서
-- (building_id, dong, unit_number) 로 교체해 다동 건물에서 동A 101 / 동B 101 을
-- 별도 행으로 보존할 수 있게 한다. 기존 행은 모두 dong='' 로 채워지므로 사실상
-- 동일한 유니크 범위가 유지된다(데이터 보존, 무손실).
--
-- 모든 DDL 은 IF NOT EXISTS / IF EXISTS 로 멱등하게 작성. 운영 DB 부팅 시
-- runMigrations 가 자동 적용한다.

ALTER TABLE "buildings"
  ADD COLUMN IF NOT EXISTS "register_dong_pks" jsonb;

ALTER TABLE "units"
  ADD COLUMN IF NOT EXISTS "dong" text NOT NULL DEFAULT '';

-- 구 유니크 (building_id, unit_number) 가 있으면 제거. 제약을 떨구면 동일 이름의
-- 인덱스도 함께 떨어진다.
ALTER TABLE "units"
  DROP CONSTRAINT IF EXISTS "units_building_unit_number";

-- 신 유니크 (building_id, dong, unit_number). 이미 존재해도 안전하게 패스.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'units_building_dong_unit_number'
      AND conrelid = 'units'::regclass
  ) THEN
    ALTER TABLE "units"
      ADD CONSTRAINT "units_building_dong_unit_number"
      UNIQUE ("building_id", "dong", "unit_number");
  END IF;
END$$;
