-- [Task #740 가입흐름재설정] vendors 테이블에 숨고식 거리 매칭/본사 승인 게이트/인증 자료 컬럼 추가.
--   1) 도로명 주소 + 좌표(lat/lng) + 서비스 반경(km) — 거리 기반 매칭의 기반 데이터.
--   2) matching_enabled — 가입 위저드 통과 후 본사 검토 통과 전까지 false. 매칭 자동 제외.
--   3) business_cert_url / id_card_url — 본사 검토용 인증 자료(객체 스토리지 경로).
--   4) kakao_verified_at / kakao_phone — 카카오 본인확인 결과.
--
-- 정책:
--   - DESTRUCTIVE 변경 없음(컬럼 추가만). 기존 행은 NULL 또는 default 로 채워진다.
--   - 기존 platform vendor 는 매칭이 끊기면 안 되므로 matching_enabled=true 로 grandfather 한다.
--   - 기존 contracted/legacy vendor (type != 'platform') 는 매칭 대상이 아니라 false 유지(영향 없음).
--   - 좌표/반경 백필은 별도 단계(T6 이관 작업)에서 수행. 본 SQL 은 컬럼만 만든다.
--   - 모든 ALTER 는 IF NOT EXISTS — 재실행/머지 후 post-merge.sh 자동 실행 안전.

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS service_address_road text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS service_lat real;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS service_lng real;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS service_radius_km integer NOT NULL DEFAULT 50;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS matching_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS business_cert_url text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS id_card_url text;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS kakao_verified_at timestamp with time zone;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS kakao_phone text;

-- 기존 platform vendor 는 본사가 이미 승인해 사용 중인 상태로 간주해 매칭 활성으로 백필.
-- 이 UPDATE 는 컬럼 default 가 false 라서 첫 ALTER 적용 직후 1회만 의미가 있다.
-- 재실행해도 이미 true 인 행에는 영향이 없으므로 idempotent 안전.
UPDATE vendors SET matching_enabled = true WHERE type = 'platform' AND matching_enabled = false;
