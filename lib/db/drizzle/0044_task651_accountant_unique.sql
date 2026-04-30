-- [Task #651] 한 건물에 활성(approval_status='active') accountant 1명만 허용.
--   승인 핸들러의 사전 점검(findExistingActiveUserForAddress)은 race window 가
--   존재해, HQ↔manager 동시 승인 시 두 명의 accountant 가 동시에 active 가 될 수
--   있다. DB 레벨에서 partial unique index 로 동시 활성화를 차단한다.
--
--   적용 대상: role='accountant' AND approval_status='active' AND building_id IS NOT NULL.
--   기존 데이터(중복 없음 확인) 와 충돌하지 않도록 partial 조건을 동일하게 명시.
--
--   주의: manager 도 1건물 1인 정책이지만, 본 마이그레이션 시점 운영 DB 에 manager
--   중복 1건이 데이터로 남아 있어 동일 인덱스를 거는 경우 실패한다(스코프 밖).
--   본 작업은 Task #651 의 accountant 1건물 1인 race-safe 보장만 다룬다.

CREATE UNIQUE INDEX IF NOT EXISTS "users_one_active_accountant_per_building"
  ON "users" ("building_id")
  WHERE role = 'accountant'
    AND approval_status = 'active'
    AND building_id IS NOT NULL;
