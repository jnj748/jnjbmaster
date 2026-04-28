-- [Task #532] notifications.recipient_type 정규화 + orphan 미읽음 정리.
--
-- 발신부 코드별로 'admin' / 'hq' / 'hq_executive' / 'facility_manager' /
-- 'vendor' / 'manager' / 'manager:<buildingId>' 같은 비표준 값을 적재해 와서
-- 수신부(/notifications, /notifications/unread-count) 가 행을 필터링할 수 없는
-- 상태였다. 이 마이그레이션은 모든 행을 다음 4가지 정규형으로 변환한다:
--
--   'all', 'role:<userRole>', 'user:<userId>', 'vendor:<partnerId>'
--
-- 멱등성: 정규형 값은 아래 모든 UPDATE 문의 매치 조건에 걸리지 않으므로
-- 재실행해도 안전하다. 'admin' fan-out INSERT 도 원본 'admin' 행이 같은 문장
-- 안에서 이미 'role:hq_executive' 로 갱신되기 때문에 다음 부팅 때는 매치
-- 대상 자체가 없어 중복 적재되지 않는다.

-- 1) 'admin' fan-out: platform_admin 행을 추가 적재한 뒤 원본을 hq_executive 로 갱신.
INSERT INTO "notifications" (
  "recipient_type", "notification_type", "title", "message", "is_read",
  "related_entity_type", "related_entity_id", "created_at"
)
SELECT
  'role:platform_admin', "notification_type", "title", "message", "is_read",
  "related_entity_type", "related_entity_id", "created_at"
FROM "notifications"
WHERE "recipient_type" = 'admin';
--> statement-breakpoint

UPDATE "notifications" SET "recipient_type" = 'role:hq_executive'
WHERE "recipient_type" = 'admin';
--> statement-breakpoint

-- 2) 단일 매핑 (legacy → role:<x>)
UPDATE "notifications" SET "recipient_type" = 'role:hq_executive'
WHERE "recipient_type" IN ('hq', 'hq_executive');
--> statement-breakpoint

UPDATE "notifications" SET "recipient_type" = 'role:platform_admin'
WHERE "recipient_type" = 'platform_admin';
--> statement-breakpoint

UPDATE "notifications" SET "recipient_type" = 'role:facility_staff'
WHERE "recipient_type" IN ('facility_manager', 'facility_staff');
--> statement-breakpoint

UPDATE "notifications" SET "recipient_type" = 'role:manager'
WHERE "recipient_type" = 'manager';
--> statement-breakpoint

UPDATE "notifications" SET "recipient_type" = 'role:accountant'
WHERE "recipient_type" = 'accountant';
--> statement-breakpoint

UPDATE "notifications" SET "recipient_type" = 'role:partner'
WHERE "recipient_type" IN ('partner', 'vendor');
--> statement-breakpoint

-- 3) 'manager:<buildingId>' fan-out: 해당 building 의 manager 유저 별 user:<id> 행 추가.
--    원본 manager:<bid> 행은 다음 단계 (4) 의 orphan 정리로 is_read=true 처리된다.
INSERT INTO "notifications" (
  "recipient_type", "notification_type", "title", "message", "is_read",
  "related_entity_type", "related_entity_id", "created_at"
)
SELECT
  'user:' || u."id", n."notification_type", n."title", n."message", n."is_read",
  n."related_entity_type", n."related_entity_id", n."created_at"
FROM "notifications" n
JOIN "users" u ON u."role" = 'manager'
  AND u."building_id" IS NOT NULL
  AND u."building_id" = NULLIF(SUBSTRING(n."recipient_type" FROM '^manager:([0-9]+)$'), '')::int
WHERE n."recipient_type" ~ '^manager:[0-9]+$';
--> statement-breakpoint

-- 4) 정규형으로 매핑되지 못한 잔여 비표준 recipient_type 의 미읽음 행을 읽음 처리.
--    (platform_announcements / platform_announcement_reads 는 별도 테이블이므로 영향 없음.)
UPDATE "notifications"
SET "is_read" = true
WHERE "is_read" = false
  AND "recipient_type" <> 'all'
  AND "recipient_type" NOT LIKE 'role:%'
  AND "recipient_type" NOT LIKE 'user:%'
  AND "recipient_type" NOT LIKE 'vendor:%';
