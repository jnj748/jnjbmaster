-- [Task #348] 호실(units) 출처/마지막 동기화/관리건축물대장PK 추가.
-- source: 'register'(건축물대장 가져오기) | 'csv' | 'manual'
-- last_register_synced_at: 마지막으로 대장에서 동기화된 시각
-- mgm_bldrgst_pk: 동기화에 사용한 관리건축물대장PK (층+호실번호 매칭의 보조 키)
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'manual';
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "last_register_synced_at" timestamptz;
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "mgm_bldrgst_pk" text;

-- 기존 api_generated=true 행은 'register' 출처로 표시(이전 가져오기 결과 일관성 유지).
UPDATE "units" SET "source" = 'register' WHERE "api_generated" = true AND "source" = 'manual';
