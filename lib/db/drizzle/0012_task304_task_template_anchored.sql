-- [Task #304] task_templates 에 anchored frequency 컬럼 추가.
--   사용승인일(buildings.approval_date) + N년 기준으로 만료를 계산하기 위함.
--   안전하게 IF NOT EXISTS 로 멱등 보장.
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "anchor_type" text;
--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "anchor_offset_years" integer;
