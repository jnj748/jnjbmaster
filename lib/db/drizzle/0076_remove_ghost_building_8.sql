-- [송정 케이스 fix] 프로덕션 buildings.id=8 고스트 행 제거.
--
-- 배경:
--   송정태왕아너스타워가 프로덕션에 id=8 (매니저 미배정 고스트) + id=34 (정상,
--   김진오 관리소장 매핑) 로 중복 등록되어, responsible-staff 가 같은 주소
--   후보 중 첫 행(id=8) 을 잡아 시설담당 가입 위저드에 "등록안된 건물" 류
--   안내가 노출되는 사고가 있었다. 코드 가드(같은 commit 시리즈) 와 함께
--   고스트 행 자체도 제거해 데이터 정합을 회복한다.
--
-- 안전성:
--   - 사전 점검 결과: id=8 을 참조하는 48개 FK 테이블 + users +
--     hq_building_assignments 모두 0건. 외래키 위반 없음.
--   - 멱등: WHERE id=8 만 매치되므로 이미 삭제되었거나 dev DB 처럼 행이
--     없어도 0 rows affected 로 조용히 통과.
--   - 추가 안전망: users 가 building_id=8 을 참조하는 경우(미래에 누가 잘못
--     붙였을 경우) 삭제하지 않도록 NOT EXISTS 가드.

DELETE FROM buildings
WHERE id = 8
  AND NOT EXISTS (SELECT 1 FROM users WHERE users.building_id = 8);
