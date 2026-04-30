-- [Task #646] usage_events 테이블 신규 생성.
--   Task #296 에서 lib/db/src/schema/usageEvents.ts 는 추가됐지만 SQL
--   마이그레이션이 한 번도 생성되지 않아 운영/개발 DB 양쪽에 테이블이
--   존재하지 않았다. 그 결과 GET /api/platform/usage-analytics 가 항상
--   500 으로 떨어지고, POST /api/usage-events 적재가 매번 조용히 실패해
--   데이터도 전혀 쌓이지 않았다.
--
--   컬럼·인덱스 이름은 lib/db/src/schema/usageEvents.ts 정의와 정확히 일치.

CREATE TABLE IF NOT EXISTS "usage_events" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL,
  "role" text NOT NULL,
  "path" text NOT NULL,
  "menu_key" text,
  "occurred_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ix_usage_events_role_time"
  ON "usage_events" ("role", "occurred_at");

CREATE INDEX IF NOT EXISTS "ix_usage_events_path"
  ON "usage_events" ("path");

CREATE INDEX IF NOT EXISTS "ix_usage_events_time"
  ON "usage_events" ("occurred_at");
