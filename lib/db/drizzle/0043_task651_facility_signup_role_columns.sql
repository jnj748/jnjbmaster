-- [Task #651] facility_staff_signup_requests: 시설담당/경리 통합 큐 컬럼 추가.
--   Schema: lib/db/src/schema/facilityStaffSignupRequests.ts 와 정확히 일치.
--
--   - requested_role:   시설담당(facility_staff, default) / 경리(accountant) 구분.
--   - license_photo_url: 시설담당자 자격증 사진(signed object path). 경리는 NULL.
--   - decided_by_role:   마지막 결정자 role(승인/거절/재오픈) — 매니저↔본부장 권한
--                        위계 검증 근거. 본부장 결정은 매니저가 되돌릴 수 없다.
--
--   기존 행은 NULL/기본값으로 남는다(데이터 손실 없음). ADD COLUMN IF NOT EXISTS
--   로 멱등하게 추가해 부팅 시 이미 적용된 환경(개발 직접 ALTER) 에서도 안전.

ALTER TABLE "facility_staff_signup_requests"
  ADD COLUMN IF NOT EXISTS "requested_role" varchar(32) NOT NULL DEFAULT 'facility_staff';

ALTER TABLE "facility_staff_signup_requests"
  ADD COLUMN IF NOT EXISTS "license_photo_url" text;

ALTER TABLE "facility_staff_signup_requests"
  ADD COLUMN IF NOT EXISTS "decided_by_role" varchar(32);
