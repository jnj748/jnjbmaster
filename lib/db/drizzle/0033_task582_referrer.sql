-- [Task #582] 회원가입 시 추천인 연락처 입력 + 본사 추천인 관리 대시보드.
--
-- 1) users.referrer_phone (정규화된 11자리 휴대폰 번호) — nullable.
-- 2) referral_benefits 테이블 신설 — referrer_phone 별 베네핏 지급 이력.
--
-- 모두 멱등하게 작성 — 이미 적용된 환경에서도 안전하게 재실행됨.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "referrer_phone" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "users_referrer_phone_idx" ON "users" ("referrer_phone");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "referral_benefits" (
  "id" serial PRIMARY KEY NOT NULL,
  "referrer_phone" text NOT NULL,
  "granted_by_user_id" integer NOT NULL,
  "kind" text NOT NULL,
  "amount" integer NOT NULL,
  "memo" text,
  "granted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "referral_benefits_referrer_phone_idx" ON "referral_benefits" ("referrer_phone");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "referral_benefits" ADD CONSTRAINT "referral_benefits_granted_by_user_id_users_id_fk"
    FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
