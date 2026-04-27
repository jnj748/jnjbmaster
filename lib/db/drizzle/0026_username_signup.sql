-- [Username 가입] 회원가입에서 이메일 대신 아이디(username)를 받도록 변경.
--
-- 변경 요약
--   1) users.username 컬럼 추가(text, nullable). 신규 가입자는 이 값을 채우고,
--      기존(이메일 가입) 사용자/소셜 가입자는 NULL 인 채로 둔다.
--   2) users.email NOT NULL 제약 완화. 신규 가입은 이메일을 받지 않으므로
--      이메일 컬럼이 NULL 일 수 있다(기존 행은 그대로 값이 유지된다).
--   3) users.username 에 UNIQUE 제약 추가. PostgreSQL 의 UNIQUE 는 NULL 을
--      여러 번 허용하므로 기존(=NULL) 사용자들에게는 무해하고, 신규 가입은
--      대소문자 구분 없이 소문자 정규화한 값으로 저장돼 충돌이 차단된다.
--
-- 멱등성
--   - ADD COLUMN IF NOT EXISTS, DROP NOT NULL, IF NOT EXISTS 가드로 재실행
--     안전. UNIQUE 제약은 pg_constraint 조회로 중복 추가를 방지한다.

ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" text;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_username_unique'
  ) THEN
    ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE ("username");
  END IF;
END $$;
