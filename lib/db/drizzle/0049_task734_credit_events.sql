-- [Task #734] 이벤트 크레딧 일괄 지급 + 가입 기본 지급 무결성 보강.
--
--   1) credit_events / credit_event_recipients 테이블 신설
--      (이미 executeSql 로 dev DB 에 만들었지만 production 부팅 시 마이그레이션이
--      반드시 실행되어야 하므로 IF NOT EXISTS 로 안전하게 보강한다)
--   2) 이벤트 이름 UNIQUE — 동일 이름 이벤트 재실행으로 인한 중복 지급 방지
--   3) credit_event_recipients(event_id, vendor_id) UNIQUE — 같은 이벤트
--      내 동일 vendor 중복 지급 차단
--   4) credit_ledger 의 (vendor_id) UNIQUE WHERE kind='signup_bonus'
--      — DB 레벨에서 가입 기본 1회 지급 보장 (concurrent insert 도 안전)

CREATE TABLE IF NOT EXISTS "credit_events" (
  "id" serial PRIMARY KEY,
  "name" text NOT NULL,
  "reason" text,
  "credits_per_vendor" integer NOT NULL,
  "points_per_vendor" integer NOT NULL,
  "recipient_count" integer NOT NULL,
  "total_credits" integer NOT NULL,
  "total_points" integer NOT NULL,
  "actor_id" integer,
  "actor_name" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_event_recipients" (
  "id" serial PRIMARY KEY,
  "event_id" integer NOT NULL,
  "vendor_id" integer NOT NULL,
  "ledger_id" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "credit_event_recipients_event_vendor_unique"
  ON "credit_event_recipients" ("event_id", "vendor_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "credit_event_recipients_event_id_idx"
  ON "credit_event_recipients" ("event_id");
--> statement-breakpoint
-- 동일 이벤트 이름 재실행 차단 — 운영자가 실수로 두 번 누르거나, 같은 정책을 두 번
-- 등록해 vendor 가 두 번 받는 사고를 막는다. 이름은 운영자가 직접 정하므로
-- 의도적으로 같은 이름을 다시 쓰지 않는 한 안전.
CREATE UNIQUE INDEX IF NOT EXISTS "credit_events_name_unique"
  ON "credit_events" ("name");
--> statement-breakpoint
-- 가입 기본 1회 보장 (idempotent + race-safe).
--   기존 데이터에 동일 vendor 의 signup_bonus 행이 2개 이상 있다면 인덱스
--   생성이 실패한다 — 그때는 별도 정리 마이그레이션이 필요하지만, 이번 task
--   에서 처음 도입되는 kind 이므로 해당 데이터는 존재하지 않는다.
CREATE UNIQUE INDEX IF NOT EXISTS "credit_ledger_signup_bonus_unique_vendor"
  ON "credit_ledger" ("vendor_id")
  WHERE kind = 'signup_bonus';
