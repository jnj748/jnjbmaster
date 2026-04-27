-- [Task #475] 기존 건물 sido/sigungu 백필.
--
-- 배경:
--   addressFull 또는 addressJibun 텍스트는 저장돼 있으나, 구조화된 sido/sigungu
--   컬럼이 NULL 인 행 때문에 RFQ 화면이 "건물 정보가 비어 있다" 로 막다른 길에
--   빠지는 사고가 보고됐다. 본 마이그레이션은 한국어 주소 첫·둘째 토큰으로부터
--   sido/sigungu 를 도출해 NULL 인 칸만 채워 넣는다(이미 값이 있는 칸은 절대
--   덮어쓰지 않는다). 도출 불가 행은 그대로 두고 서버 로그에 NOTICE 만 남긴다.
--
-- 사용 자료:
--   `applySidoSigunguDerivation` (artifacts/api-server/src/routes/buildings.ts)
--   및 `deriveSidoSigungu` (lib/shared/src/derive-region.ts) 와 동일한 정책
--   (정식 명칭 + 짧은 별칭 + 복합 sigungu 일부 도시) 를 plpgsql 로 옮겼다.

DO $$
DECLARE
  r record;
  tokens text[];
  raw_sido text;
  norm_sido text;
  norm_sigungu text;
  full_sido_set CONSTANT text[] := ARRAY[
    '서울특별시','부산광역시','대구광역시','인천광역시','광주광역시','대전광역시','울산광역시',
    '세종특별자치시','경기도','강원특별자치도','강원도','충청북도','충청남도',
    '전북특별자치도','전라북도','전라남도','경상북도','경상남도','제주특별자치도','제주도'
  ];
  compound_cities CONSTANT text[] := ARRAY[
    '수원시','성남시','안양시','안산시','고양시','용인시','청주시','천안시','전주시','포항시','창원시'
  ];
  updated_count int := 0;
  failed_count int := 0;
BEGIN
  FOR r IN
    SELECT id, address_full, address_jibun, sido, sigungu
    FROM buildings
    WHERE (sido IS NULL OR sido = '' OR sigungu IS NULL OR sigungu = '')
      AND (
        (address_full IS NOT NULL AND address_full <> '')
        OR (address_jibun IS NOT NULL AND address_jibun <> '')
      )
  LOOP
    -- addressFull 우선, 없거나 도출 실패 시 addressJibun.
    tokens := regexp_split_to_array(trim(coalesce(r.address_full, r.address_jibun, '')), '\s+');
    norm_sido := NULL;
    norm_sigungu := NULL;
    IF array_length(tokens, 1) >= 1 THEN
      raw_sido := tokens[1];
      -- 정식 명칭 직매칭
      IF raw_sido = ANY(full_sido_set) THEN
        norm_sido := raw_sido;
      ELSE
        -- 짧은 별칭 정규화
        norm_sido := CASE raw_sido
          WHEN '서울' THEN '서울특별시'
          WHEN '부산' THEN '부산광역시'
          WHEN '대구' THEN '대구광역시'
          WHEN '인천' THEN '인천광역시'
          WHEN '광주' THEN '광주광역시'
          WHEN '대전' THEN '대전광역시'
          WHEN '울산' THEN '울산광역시'
          WHEN '세종' THEN '세종특별자치시'
          WHEN '세종시' THEN '세종특별자치시'
          WHEN '경기' THEN '경기도'
          WHEN '강원' THEN '강원특별자치도'
          WHEN '충북' THEN '충청북도'
          WHEN '충남' THEN '충청남도'
          WHEN '전북' THEN '전북특별자치도'
          WHEN '전남' THEN '전라남도'
          WHEN '경북' THEN '경상북도'
          WHEN '경남' THEN '경상남도'
          WHEN '제주' THEN '제주특별자치도'
          ELSE NULL
        END;
      END IF;
    END IF;

    -- addressFull 로 sido 도출 실패 시 addressJibun 으로 재시도
    IF norm_sido IS NULL AND r.address_jibun IS NOT NULL AND r.address_jibun <> '' AND r.address_full IS NOT NULL THEN
      tokens := regexp_split_to_array(trim(r.address_jibun), '\s+');
      IF array_length(tokens, 1) >= 1 THEN
        raw_sido := tokens[1];
        IF raw_sido = ANY(full_sido_set) THEN
          norm_sido := raw_sido;
        ELSE
          norm_sido := CASE raw_sido
            WHEN '서울' THEN '서울특별시' WHEN '부산' THEN '부산광역시'
            WHEN '대구' THEN '대구광역시' WHEN '인천' THEN '인천광역시'
            WHEN '광주' THEN '광주광역시' WHEN '대전' THEN '대전광역시'
            WHEN '울산' THEN '울산광역시' WHEN '세종' THEN '세종특별자치시'
            WHEN '세종시' THEN '세종특별자치시' WHEN '경기' THEN '경기도'
            WHEN '강원' THEN '강원특별자치도' WHEN '충북' THEN '충청북도'
            WHEN '충남' THEN '충청남도' WHEN '전북' THEN '전북특별자치도'
            WHEN '전남' THEN '전라남도' WHEN '경북' THEN '경상북도'
            WHEN '경남' THEN '경상남도' WHEN '제주' THEN '제주특별자치도'
            ELSE NULL
          END;
        END IF;
      END IF;
    END IF;

    -- sigungu 도출 (sido 가 잡혔을 때만 의미가 있음)
    IF norm_sido IS NOT NULL AND norm_sido <> '세종특별자치시' AND array_length(tokens, 1) >= 2 THEN
      IF tokens[2] = ANY(compound_cities)
         AND array_length(tokens, 1) >= 3
         AND (tokens[3] ~ '구$' OR tokens[3] ~ '군$') THEN
        norm_sigungu := tokens[2] || ' ' || tokens[3];
      ELSIF tokens[2] ~ '(구|군|시)$' THEN
        norm_sigungu := tokens[2];
      END IF;
    END IF;

    IF norm_sido IS NULL AND norm_sigungu IS NULL THEN
      failed_count := failed_count + 1;
      RAISE NOTICE 'task475 backfill: building id=% — could not derive (addr=%, jibun=%)',
        r.id, r.address_full, r.address_jibun;
      CONTINUE;
    END IF;

    -- NULL/빈 칸만 채우고, 이미 값이 있는 칸은 보존.
    UPDATE buildings
       SET sido = COALESCE(NULLIF(sido, ''), norm_sido),
           sigungu = COALESCE(NULLIF(sigungu, ''), norm_sigungu)
     WHERE id = r.id;
    updated_count := updated_count + 1;
  END LOOP;

  RAISE NOTICE 'task475 backfill: updated=%, failed=%', updated_count, failed_count;
END $$;
--> statement-breakpoint
-- 사용자 행 동기화: building 이 가진 sido/sigungu 를 매니저 사용자에 동일하게 채운다.
-- 사용자 컬럼이 NULL/빈 칸일 때만 채워서 기존 값(다른 건물 보유 등)은 건드리지 않는다.
UPDATE users u
   SET building_sido = b.sido,
       building_sigungu = b.sigungu
  FROM buildings b
 WHERE u.building_id = b.id
   AND (
     (u.building_sido IS NULL OR u.building_sido = '')
     OR (u.building_sigungu IS NULL OR u.building_sigungu = '')
   )
   AND (b.sido IS NOT NULL OR b.sigungu IS NOT NULL);
