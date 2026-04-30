-- [Task #661] 파트너 위저드/내 정보 재구성
--   1) vendors.intro 컬럼 추가 (1줄 소개글, NULL 허용, 최대 30자는 앱 레벨 검증)
--   2) vendor_change_requests 테이블 생성 (사업자정보 변경 신청 큐)
--   3) 동일 vendor 에 pending 신청은 1건만 허용하는 partial unique index

ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "intro" text;

CREATE TABLE IF NOT EXISTS "vendor_change_requests" (
  "id" serial PRIMARY KEY NOT NULL,
  "vendor_id" integer NOT NULL,
  "requested_by" integer NOT NULL,
  "status" varchar(16) DEFAULT 'pending' NOT NULL,
  "fields" jsonb NOT NULL,
  "biz_cert_url" text NOT NULL,
  "reason" text,
  "decided_by" integer,
  "decided_at" timestamp with time zone,
  "decision_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "vendor_change_requests_vendor_id_idx"
  ON "vendor_change_requests" ("vendor_id");

CREATE INDEX IF NOT EXISTS "vendor_change_requests_status_idx"
  ON "vendor_change_requests" ("status");

-- 동일 vendor 에 동시에 pending 인 신청은 1건만 가능하도록 제약.
CREATE UNIQUE INDEX IF NOT EXISTS "vendor_change_requests_one_pending_per_vendor"
  ON "vendor_change_requests" ("vendor_id")
  WHERE status = 'pending';
