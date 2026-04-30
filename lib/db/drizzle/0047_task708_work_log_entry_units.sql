-- [Task #708] 업무기록(work_log_entries) ↔ 호실(units) 다대다 연결.
--
-- 목적:
--   직원이 작성하는 업무기록 메모에 호실 표기("101호", "1동 101호" 등) 가
--   포함되면 자동으로 그 호실과 연결해, 호실관리 화면(호실 상세) 에서 해당
--   호실의 과거 업무 이력을 즉시 조회할 수 있도록 한다.
--
-- 설계:
--   * 한 건의 업무기록이 여러 호실(예: "101호, 102호 누수") 을 동시에 가리킬
--     수 있고, 한 호실도 여러 업무기록을 가질 수 있어 다대다 조인 테이블.
--   * match_source: 'auto' (서버 파서가 메모에서 자동 인식) /
--                   'manual' (작성자가 칩 UI 로 명시 선택).
--   * (entry_id, unit_id) 유니크 — 동일 entry → 동일 호실 중복 매칭 방지.
--   * (unit_id, occurred_at desc) 인덱스 — 호실 상세의 시간순 조회 핵심 경로.
--   * (entry_id) 인덱스 — entry 직렬화 시 linkedUnits 조회.
--   * occurred_at 은 work_log_entries 의 occurredAt 을 복제(역정규화) 해
--     호실별 조회에서 추가 JOIN 없이 정렬·페이지네이션 가능하도록 한다.
--
-- 멱등: 모든 DDL 은 IF NOT EXISTS 로 작성. 부팅 시 runMigrations 가 안전하게
-- 재실행해도 변화가 없다. 신규 테이블은 BASELINE_FILES 에 추가하지 않는다.

CREATE TABLE IF NOT EXISTS "work_log_entry_units" (
  "id" serial PRIMARY KEY,
  "work_log_entry_id" integer NOT NULL REFERENCES "work_log_entries"("id") ON DELETE CASCADE,
  "unit_id" integer NOT NULL REFERENCES "units"("id") ON DELETE CASCADE,
  "building_id" integer NOT NULL,
  "match_source" text NOT NULL DEFAULT 'auto',
  "occurred_at" timestamptz NOT NULL DEFAULT now(),
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "work_log_entry_units_entry_unit_uq"
  ON "work_log_entry_units" ("work_log_entry_id", "unit_id");

CREATE INDEX IF NOT EXISTS "work_log_entry_units_unit_occurred_idx"
  ON "work_log_entry_units" ("unit_id", "occurred_at" DESC);

CREATE INDEX IF NOT EXISTS "work_log_entry_units_entry_idx"
  ON "work_log_entry_units" ("work_log_entry_id");

CREATE INDEX IF NOT EXISTS "work_log_entry_units_building_unit_idx"
  ON "work_log_entry_units" ("building_id", "unit_id");
