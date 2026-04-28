-- [Task #523] task_templates 에 문서 출력용 분류 항목 추가.
--   공고문(입주민 노출, 포괄적): schedule_notice / legal_basis / default_status
--   보고서·기안서(내부, 상세): responsible_department / procedure_steps /
--                              required_attachments / report_items /
--                              risk_level / tags
--   기존 행 호환성을 위해 새 컬럼은 모두 NULL 또는 안전한 default 사용.
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "schedule_notice" text;
--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "legal_basis" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "default_status" text NOT NULL DEFAULT '발생';
--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "responsible_department" text;
--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "procedure_steps" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "required_attachments" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "report_items" jsonb NOT NULL DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "risk_level" text;
--> statement-breakpoint
ALTER TABLE "task_templates" ADD COLUMN IF NOT EXISTS "tags" jsonb NOT NULL DEFAULT '[]'::jsonb;
