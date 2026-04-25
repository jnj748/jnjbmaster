-- [Task #328] 건축물대장 표제부/총괄표제부 원본 응답 보관용 컬럼.
-- title=getBrTitleInfo, recap=getBrRecapTitleInfo 응답 items.item을 통째로 저장한다.
ALTER TABLE "buildings" ADD COLUMN IF NOT EXISTS "register_data" jsonb;
