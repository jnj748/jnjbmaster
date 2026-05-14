-- RFQ 카테고리 ↔ vendor_categories 정합성 맞추기.
--   RFQ 폼에 있던 대분류 (방수 / 하자진단 / 건물관리) 를 vendor_categories 에 추가하고,
--   facility_maintenance 라벨을 "시설 및 영선" → "영선/수선유지" 로 통일.
-- 멱등: ON CONFLICT (code) / 단순 UPDATE.

INSERT INTO "vendor_categories" ("code", "label", "parent_code", "sort_order", "active") VALUES
  ('waterproofing', '방수', NULL, 93, true),
  ('defect_diagnosis', '하자진단', NULL, 94, true),
  ('building_maintenance', '건물관리', NULL, 95, true)
ON CONFLICT ("code") DO UPDATE SET
  "label" = EXCLUDED."label",
  "active" = EXCLUDED."active";

UPDATE "vendor_categories"
SET "label" = '영선/수선유지'
WHERE "code" = 'facility_maintenance';
