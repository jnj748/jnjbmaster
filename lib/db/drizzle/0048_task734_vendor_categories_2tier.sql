-- [Task #734] 파트너 카테고리 마스터 2단(대분류·자식) 확장 + 활성/비활성 플래그.
--
-- 사장님 결정 반영:
--   - 기존 9개 대분류는 모두 유지 (parent_code = NULL).
--   - 'security' (경비) 는 active=false 로 신규 가입 옵션에서만 숨김 (기존 vendor 데이터는 보존).
--   - 신규 대분류 3개: telecom (정보통신) / water_leak (누수) / hvac (냉난방).
--   - 정보통신 자식 5개 시드. 누수·냉난방 자식은 비움 (본사 관리자가 화면에서 직접 추가).
--   - 'mechanical' 의 '냉난방/온수' 는 hvac 대분류로 분리 — 기존 vendors.sub_categories
--     의 mechanical 텍스트 매칭은 자식↔부모 자동 포함 로직(rfq-vendor-matching.ts)으로
--     단절 없이 통과됨.
--
-- 멱등성: ADD COLUMN IF NOT EXISTS / ON CONFLICT DO NOTHING / IF NOT EXISTS 인덱스.

-- 1) 컬럼 추가
ALTER TABLE "vendor_categories" ADD COLUMN IF NOT EXISTS "parent_code" text;
ALTER TABLE "vendor_categories" ADD COLUMN IF NOT EXISTS "active" boolean NOT NULL DEFAULT true;

-- 2) security 비활성 (기존 데이터 보존)
UPDATE "vendor_categories" SET "active" = false WHERE "code" = 'security' AND "active" = true;

-- 3) 신규 대분류
INSERT INTO "vendor_categories" ("code", "label", "parent_code", "sort_order", "active") VALUES
  ('telecom', '정보통신', NULL, 85, true),
  ('water_leak', '누수', NULL, 90, true),
  ('hvac', '냉난방', NULL, 95, true)
ON CONFLICT ("code") DO NOTHING;

-- 4) 자식(소분류) 시드
INSERT INTO "vendor_categories" ("code", "label", "parent_code", "sort_order", "active") VALUES
  -- 시설 및 영선
  ('fm_general_repair', '일반 보수', 'facility_maintenance', 1, true),
  ('fm_painting', '도장', 'facility_maintenance', 2, true),
  ('fm_waterproofing', '방수', 'facility_maintenance', 3, true),
  ('fm_tile', '미장/타일', 'facility_maintenance', 4, true),
  ('fm_carpentry', '목공', 'facility_maintenance', 5, true),
  ('fm_maintenance_repair', '수선유지', 'facility_maintenance', 6, true),
  -- 소모품 공급
  ('cs_cleaning_supplies', '청소 소모품', 'consumables', 1, true),
  ('cs_paper_detergent', '화장지/세제', 'consumables', 2, true),
  ('cs_lighting', '형광등/전구', 'consumables', 3, true),
  ('cs_filters', '필터류', 'consumables', 4, true),
  -- 청소
  ('cl_move_in', '입주청소', 'cleaning', 1, true),
  ('cl_regular', '정기청소', 'cleaning', 2, true),
  ('cl_special', '특수청소', 'cleaning', 3, true),
  ('cl_exterior', '외벽 청소', 'cleaning', 4, true),
  ('cl_window', '유리창 청소', 'cleaning', 5, true),
  ('cl_carpet', '카펫 청소', 'cleaning', 6, true),
  -- 소방
  ('fs_general_inspection', '종합점검', 'fire_safety', 1, true),
  ('fs_function_inspection', '작동기능 점검', 'fire_safety', 2, true),
  ('fs_extinguisher', '소화기 점검', 'fire_safety', 3, true),
  ('fs_detection_system', '자탐설비 점검', 'fire_safety', 4, true),
  ('fs_sprinkler', '스프링클러 점검', 'fire_safety', 5, true),
  -- 승강기
  ('ev_regular_inspection', '정기 점검', 'elevator', 1, true),
  ('ev_emergency', '긴급 출동', 'elevator', 2, true),
  ('ev_parts_replacement', '부품 교체', 'elevator', 3, true),
  ('ev_modernization', '현대화 공사', 'elevator', 4, true),
  -- 전기
  ('el_substation', '변전실 관리', 'electrical', 1, true),
  ('el_safety_inspection', '전기안전점검', 'electrical', 2, true),
  ('el_lighting_replacement', '조명 교체', 'electrical', 3, true),
  ('el_construction', '전기공사', 'electrical', 4, true),
  -- 기계설비
  ('me_machine_room', '기계실 관리', 'mechanical', 1, true),
  ('me_pump_motor', '펌프/모터', 'mechanical', 2, true),
  ('me_boiler', '보일러', 'mechanical', 3, true),
  -- 정보통신
  ('tc_maintenance', '정보통신유지관리', 'telecom', 1, true),
  ('tc_performance_inspection', '정보통신성능점검', 'telecom', 2, true),
  ('tc_equipment_repair', '정보통신설비 수리', 'telecom', 3, true),
  ('tc_internet_repair', '인터넷 수리', 'telecom', 4, true),
  ('tc_internet_install', '인터넷 신규 설치', 'telecom', 5, true)
ON CONFLICT ("code") DO NOTHING;

-- 5) 인덱스 (조회 가속: 자식 lookup, 활성 항목 정렬 조회)
CREATE INDEX IF NOT EXISTS "vendor_categories_parent_code_idx" ON "vendor_categories" ("parent_code");
CREATE INDEX IF NOT EXISTS "vendor_categories_active_sort_idx" ON "vendor_categories" ("active", "sort_order");
