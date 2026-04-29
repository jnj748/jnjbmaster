-- [Task #610 — code review fix] author_role 1회성 백필.
--   0036/0037 트리거가 들어오기 전부터 존재하던 documents 행은 author_role 이 NULL.
--   대시보드에서 "내 역할의 산출물" 필터가 NULL 행을 빠뜨리지 않도록 users 테이블에서
--   동기화한다. users.role enum 은 documentAuthorRoles 의 부분집합이라 안전하게 캐스팅 가능.
UPDATE documents d
SET author_role = u.role
FROM users u
WHERE d.author_role IS NULL
  AND d.author_id IS NOT NULL
  AND d.author_id = u.id
  AND u.role IN (
    'manager',
    'partner',
    'platform_admin',
    'hq_executive',
    'accountant',
    'facility_staff',
    'custodian'
  );
