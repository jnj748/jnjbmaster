-- [Task #630] 검침 입력 기능 확장: 정기/중간 구분, 책임 구간, 입력 출처, 사진 OCR.
-- runMigrations 가 부팅 시 멱등하게 적용한다. 기존 행은 default 값으로 백필된다.

ALTER TABLE meter_readings
  ADD COLUMN IF NOT EXISTS reading_type text NOT NULL DEFAULT 'regular';

ALTER TABLE meter_readings
  ADD COLUMN IF NOT EXISTS period_start date;

ALTER TABLE meter_readings
  ADD COLUMN IF NOT EXISTS period_end date;

ALTER TABLE meter_readings
  ADD COLUMN IF NOT EXISTS tenant_id integer REFERENCES tenants(id);

ALTER TABLE meter_readings
  ADD COLUMN IF NOT EXISTS input_method text NOT NULL DEFAULT 'manual';

ALTER TABLE meter_readings
  ADD COLUMN IF NOT EXISTS photo_object_path text;

-- 기존 데이터는 모두 정기·수기 입력으로 간주(이미 default 가 같지만 명시적 백필).
UPDATE meter_readings SET reading_type = 'regular' WHERE reading_type IS NULL;
UPDATE meter_readings SET input_method = 'manual' WHERE input_method IS NULL;

-- 호실별·미터 종류별 최근 검침 조회 인덱스(입력 화면이 매번 호출).
CREATE INDEX IF NOT EXISTS idx_meter_readings_unit_recent
  ON meter_readings (building_id, unit_number, meter_type, reading_date DESC);

-- 책임 구간 시각화/이사 정산 보조 정보용 — building_id + unit_id + reading_type.
CREATE INDEX IF NOT EXISTS idx_meter_readings_unit_type
  ON meter_readings (building_id, unit_id, reading_type, reading_date DESC);
