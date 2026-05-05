-- [Task #852] 운영 데이터 정리(purge) 잡 실행 이력 audit 테이블.
--
-- 배경:
--   자동이체 폴링 / usage_events 등 보존 정책 정리 잡의 결과를 in-memory 상태가
--   아닌 영구 audit 테이블에 누적 보관한다. 서버 재시작 후에도 마지막 정리
--   시각/삭제 건수/소요 시간이 유지되어야 운영팀이 잡 정상성을 추적할 수 있다.
--
-- 멱등성:
--   모든 DDL 은 IF NOT EXISTS 로 작성되어 dev/운영 어디서든 안전하게 재실행 가능.

CREATE TABLE IF NOT EXISTS "operational_purge_runs" (
  "id" serial PRIMARY KEY,
  "job_name" text NOT NULL,
  "started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "finished_at" timestamp with time zone NOT NULL DEFAULT now(),
  "duration_ms" integer NOT NULL DEFAULT 0,
  "retention_days" integer NOT NULL,
  "deleted" integer NOT NULL DEFAULT 0,
  "error" text
);

CREATE INDEX IF NOT EXISTS "operational_purge_runs_job_started_idx"
  ON "operational_purge_runs" ("job_name", "started_at");
CREATE INDEX IF NOT EXISTS "operational_purge_runs_started_idx"
  ON "operational_purge_runs" ("started_at");
