-- [Task #697] tasks.target_roles 컬럼 추가.
--
-- 대시보드 "필수업무현황" 카드를 역할(manager / facility_staff / accountant)
-- 별로 라우팅하기 위해 각 수동업무가 어떤 역할의 카드에 노출돼야 하는지를
-- 배열로 저장한다. 빈 배열(default)이면 서버가 카테고리 기반 기본값으로
-- 자동 채워서 응답한다(`@workspace/shared/role-routing` SoT 사용).
--
-- 멱등 적용: ADD COLUMN IF NOT EXISTS.
ALTER TABLE "tasks"
  ADD COLUMN IF NOT EXISTS "target_roles" text[] NOT NULL DEFAULT '{}'::text[];
