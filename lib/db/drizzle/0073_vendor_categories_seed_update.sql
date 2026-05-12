-- Vendor category seed update: gas / water_tank / septic / landscaping parents + children,
--   water_leak + hvac children, consumables branch deactivated (MRO Phase 3).
-- 멱등: ON CONFLICT(code) / 조건부 UPDATE.

-- 1) 소모품 대분류·자식 비활성 (견적 BM에서 제외)
UPDATE "vendor_categories" SET "active" = false WHERE "code" = 'consumables';
UPDATE "vendor_categories" SET "active" = false WHERE "parent_code" = 'consumables';

-- 2) 신규 대분류
INSERT INTO "vendor_categories" ("code", "label", "parent_code", "sort_order", "active") VALUES
  ('gas', '가스', NULL, 96, true),
  ('water_tank', '저수조', NULL, 97, true),
  ('septic', '정화조', NULL, 98, true),
  ('landscaping', '조경', NULL, 99, true)
ON CONFLICT ("code") DO UPDATE SET
  "label" = EXCLUDED."label",
  "parent_code" = EXCLUDED."parent_code",
  "sort_order" = EXCLUDED."sort_order",
  "active" = EXCLUDED."active";

-- 3) 자식 카테고리
INSERT INTO "vendor_categories" ("code", "label", "parent_code", "sort_order", "active") VALUES
  ('gas_safety_inspection', '가스안전점검', 'gas', 1, true),
  ('gas_facility_repair', '가스설비 수리', 'gas', 2, true),
  ('gas_pipe_replacement', '배관 교체', 'gas', 3, true),
  ('wt_cleaning', '저수조 청소', 'water_tank', 1, true),
  ('wt_inspection', '수질 검사', 'water_tank', 2, true),
  ('wt_repair', '저수조 보수', 'water_tank', 3, true),
  ('st_cleaning', '정화조 청소', 'septic', 1, true),
  ('st_inspection', '정화조 점검', 'septic', 2, true),
  ('ls_regular', '정기 조경관리', 'landscaping', 1, true),
  ('ls_tree_pruning', '수목 전지·제거', 'landscaping', 2, true),
  ('ls_planting', '식재', 'landscaping', 3, true),
  ('ls_pest_control', '병해충 방제', 'landscaping', 4, true),
  ('wl_detection', '누수 탐지', 'water_leak', 1, true),
  ('wl_repair', '누수 보수', 'water_leak', 2, true),
  ('wl_waterproofing', '방수 처리', 'water_leak', 3, true),
  ('hv_maintenance', '냉난방 유지관리', 'hvac', 1, true),
  ('hv_repair', '냉난방 수리', 'hvac', 2, true),
  ('hv_replacement', '냉난방 교체', 'hvac', 3, true),
  ('hv_inspection', '냉난방 점검', 'hvac', 4, true)
ON CONFLICT ("code") DO UPDATE SET
  "label" = EXCLUDED."label",
  "parent_code" = EXCLUDED."parent_code",
  "sort_order" = EXCLUDED."sort_order",
  "active" = EXCLUDED."active";
