-- [Task #630] 검침 입력 가시성·연동 정책 v2:
--   1) 같은 건물 직원 누구나 입력 가능. "누가 입력했는지" 행에 영구 기록.
--      → meter_readings.author_id, author_role 추가. 백필은 NULL 허용
--        (구 데이터는 입력자 미상으로 표기).
--   2) 본부장 읽기·본사 단건 조회 가능. 파트너 비가시. 라우트에서 처리.
--   3) 수정·삭제 감사로그(meter_reading_audits) 영구 보관.
--      회계 근거이므로 행이 삭제되어도 감사 행은 남도록 FK 미설정.

ALTER TABLE meter_readings
  ADD COLUMN IF NOT EXISTS author_id integer REFERENCES users(id);

ALTER TABLE meter_readings
  ADD COLUMN IF NOT EXISTS author_role text;

CREATE INDEX IF NOT EXISTS idx_meter_readings_author
  ON meter_readings (author_id);

CREATE TABLE IF NOT EXISTS meter_reading_audits (
  id serial PRIMARY KEY,
  meter_reading_id integer NOT NULL,
  building_id integer NOT NULL REFERENCES buildings(id),
  action text NOT NULL, -- 'create' | 'update' | 'delete'
  actor_id integer REFERENCES users(id),
  actor_role text,
  before_json jsonb,
  after_json jsonb,
  diff_summary text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meter_reading_audits_reading
  ON meter_reading_audits (meter_reading_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_meter_reading_audits_building
  ON meter_reading_audits (building_id, created_at DESC);
