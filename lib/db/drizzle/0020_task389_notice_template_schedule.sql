-- [Task #389] 공고문 템플릿에 정기 게시 스케줄 설정.
--   scheduleType: none/yearly/monthly/before_inspection
--   scheduleConfig: jsonb (yearly={month,day} | monthly={day} | before_inspection={inspectionName})
--   leadDays: 발생일 기준 N일 전부터 매니저 대시보드 "제안업무"에 노출.
--   requiresReport: true 면 처리완료 다이얼로그 기본 양식이 "보고서"로 열린다.
ALTER TABLE "building_notice_templates"
  ADD COLUMN IF NOT EXISTS "schedule_type" text NOT NULL DEFAULT 'none';
--> statement-breakpoint
ALTER TABLE "building_notice_templates"
  ADD COLUMN IF NOT EXISTS "schedule_config" jsonb;
--> statement-breakpoint
ALTER TABLE "building_notice_templates"
  ADD COLUMN IF NOT EXISTS "lead_days" integer NOT NULL DEFAULT 7;
--> statement-breakpoint
ALTER TABLE "building_notice_templates"
  ADD COLUMN IF NOT EXISTS "requires_report" boolean NOT NULL DEFAULT false;
