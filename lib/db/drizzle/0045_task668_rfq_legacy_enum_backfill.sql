-- [Task #668] 견적요청(rfqs) 의 카테고리/용역종류 레거시 enum 백필.
--
-- 배경:
--   초기 RFQ 데이터는 자유 입력으로 들어가 (예: category="방수/도장",
--   service_type="옥상 방수") 현재 strict enum 과 충돌한다. 응답 zod 검증
--   단계에서 한 행이 GET /api/rfqs 전체를 500 으로 만들고 있어, 본 백필로
--   기존 행을 정규화한다. 신규 데이터는 CreateRfqBody 가 strict 검증하므로
--   이 마이그레이션 적용 후엔 비정상 enum 값이 더 이상 추가되지 않는다.
--
-- 매핑 규칙:
--   - category="방수/도장" → "waterproofing"
--   - 그 외 enum 밖 category → "other"
--   - service_type 자유 텍스트 → NULL,
--       단 description 끝에 "[legacy:<원본 service_type>]" 보존.
--
-- 멱등성: 모든 UPDATE 가 정규형(또는 NULL)이 아닌 행만 매치한다.
--   재실행 시 매치 대상 자체가 없으므로 안전하다.

-- 1) 자유 텍스트 service_type → description 끝에 [legacy:...] 1줄 추가.
--    다음 단계에서 service_type 을 NULL 로 정리하기 전에 흔적을 남긴다.
DO $$
DECLARE n integer;
BEGIN
  WITH upd AS (
    UPDATE "rfqs"
    SET "description" = CASE
      WHEN COALESCE("description", '') = '' THEN '[legacy:' || "service_type" || ']'
      ELSE "description" || E'\n[legacy:' || "service_type" || ']'
    END
    WHERE "service_type" IS NOT NULL
      AND "service_type" NOT IN ('breakdown', 'defect', 'replacement', 'inspection', 'other')
      AND ("description" IS NULL OR position('[legacy:' || "service_type" || ']' in COALESCE("description", '')) = 0)
    RETURNING 1
  )
  SELECT count(*) INTO n FROM upd;
  RAISE NOTICE '[task-668] step1 description marker appended for % rfq row(s)', n;
END $$;
--> statement-breakpoint

-- 2) 자유 텍스트 service_type → NULL.
DO $$
DECLARE n integer;
BEGIN
  WITH upd AS (
    UPDATE "rfqs"
    SET "service_type" = NULL
    WHERE "service_type" IS NOT NULL
      AND "service_type" NOT IN ('breakdown', 'defect', 'replacement', 'inspection', 'other')
    RETURNING 1
  )
  SELECT count(*) INTO n FROM upd;
  RAISE NOTICE '[task-668] step2 service_type nulled for % rfq row(s)', n;
END $$;
--> statement-breakpoint

-- 3) "방수/도장" → "waterproofing".
DO $$
DECLARE n integer;
BEGIN
  WITH upd AS (
    UPDATE "rfqs" SET "category" = 'waterproofing' WHERE "category" = '방수/도장'
    RETURNING 1
  )
  SELECT count(*) INTO n FROM upd;
  RAISE NOTICE '[task-668] step3 category 방수/도장 → waterproofing for % rfq row(s)', n;
END $$;
--> statement-breakpoint

-- 4) 그 외 enum 밖 category → "other".
DO $$
DECLARE n integer;
BEGIN
  WITH upd AS (
    UPDATE "rfqs" SET "category" = 'other'
    WHERE "category" NOT IN (
      'elevator', 'water_tank', 'fire_safety', 'electrical', 'gas', 'septic',
      'cleaning', 'security', 'waterproofing', 'maintenance_repair',
      'defect_diagnosis', 'building_maintenance', 'mechanical', 'other'
    )
    RETURNING 1
  )
  SELECT count(*) INTO n FROM upd;
  RAISE NOTICE '[task-668] step4 category fallback → other for % rfq row(s)', n;
END $$;
