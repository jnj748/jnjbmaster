-- [Task #339] 파트너 별점·한줄평 평가 시스템 (5점 0.5단위)
-- 멱등 적용: 동일 객체가 이미 존재하면 무시한다 (개발 환경에서는
-- 이미 executeSql 로 생성되어 있을 수 있음).

CREATE TABLE IF NOT EXISTS "vendor_reviews" (
  "id" serial PRIMARY KEY NOT NULL,
  "vendor_id" integer NOT NULL,
  "work_report_id" integer NOT NULL,
  "rfq_id" integer,
  "quote_id" integer,
  "building_id" integer,
  "reviewer_user_id" integer,
  "rating" real NOT NULL,
  "comment" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- work_report 1건당 평가는 단 한 건만 허용한다.
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_reviews_work_report_unique"
  ON "vendor_reviews" ("work_report_id");

-- 0.5 단위 1.0 ~ 5.0 범위 강제 (애플리케이션 검증 + DB 이중 보호).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendor_reviews_rating_range'
  ) THEN
    ALTER TABLE "vendor_reviews"
      ADD CONSTRAINT "vendor_reviews_rating_range"
      CHECK ("rating" >= 1.0 AND "rating" <= 5.0 AND ("rating" * 2) = floor("rating" * 2));
  END IF;
END$$;

-- 검수자(승인자) 사용자 ID — 별점 등록 시 본인 검증에 사용한다.
ALTER TABLE "work_reports" ADD COLUMN IF NOT EXISTS "reviewer_user_id" integer;
