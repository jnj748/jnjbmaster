-- [Task #488] 공고문 템플릿 5종 추가 (공용시설 제한·소독·에어컨 세척·차량등록·층간소음).
--
-- 첨부된 실제 아파트 게시판 공고문 5종을 분석하여 동일한 HTML 양식
-- (Noto Sans KR, 가운데 정렬 h2 + 이모지, 14px line-height 1.7 본문,
--  line-height 1.8 ul, 우측 정렬 서명 블록) 으로 통일했다.
--
-- 4종은 INSERT (title 기준 NOT EXISTS 가드로 멱등 유지),
-- 1종(층간소음)은 기존 시드 행을 더 상세한 본문으로 UPDATE 한다 (새 행 추가하지 않음).
-- 모든 변경은 멱등이며 재실행해도 부작용이 없다.

-- ── 1. 공용시설 내 개인 물품 설치 제한 안내 ───────────────────────────────
INSERT INTO "building_notice_templates"
  ("title","category","icon","body_html","custom_field_labels","sort_order","is_active")
SELECT
  '공용시설 내 개인 물품 설치 제한 안내',
  '일반',
  '🚷',
  $html$<div style="font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#111827;padding:8px;">
<h2 style="text-align:center;margin:0 0 12px;">🚷 공용시설 내 개인 물품 설치 제한 안내</h2>
<p style="font-size:14px;line-height:1.7;">{{buildingName}} 입주민 여러분 안녕하십니까.</p>
<p style="font-size:14px;line-height:1.7;">항상 단지 내 공용시설을 깨끗하게 이용해 주셔서 감사드립니다.</p>
<p style="font-size:14px;line-height:1.7;">최근 야외 테이블·의자 등 공용시설에 이용 편의를 위한 방석 등 개인 물품이 놓여 있는 사례가 확인되고 있습니다. 입주민 여러분의 편의를 위한 배려로 생각되지만, 공용시설은 모든 입주민이 함께 사용하는 공간으로 미관·위생 및 관리상의 사유로 개인 물품의 임의 설치는 제한되고 있습니다.</p>
<ul style="font-size:14px;line-height:1.8;">
<li>방석·의자·돗자리 등 개인 물품 임의 설치 자제</li>
<li>공용시설에 비치된 개인 물품은 관리사무소에서 수시 정리</li>
<li>화분·자전거·유모차 등 통행에 지장을 주는 적치물 보관 금지</li>
<li>문의 사항은 관리사무소 {{managementOfficePhone}} 로 연락 부탁드립니다</li>
</ul>
<p style="font-size:14px;line-height:1.7;">앞으로도 쾌적하고 편안한 이용 환경이 유지될 수 있도록 입주민 여러분의 양해와 협조를 부탁드립니다.</p>
<p style="text-align:right;margin-top:16px;font-size:13px;">{{date}}<br/>{{buildingName}} 관리사무소</p>
</div>$html$,
  NULL,
  60,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "building_notice_templates" WHERE "title" = '공용시설 내 개인 물품 설치 제한 안내'
);
--> statement-breakpoint

-- ── 2. 정기 소독 안내 ───────────────────────────────────────────────────
INSERT INTO "building_notice_templates"
  ("title","category","icon","body_html","custom_field_labels","sort_order","is_active")
SELECT
  '정기 소독 안내',
  '위생',
  '🧴',
  $html$<div style="font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#111827;padding:8px;">
<h2 style="text-align:center;margin:0 0 12px;">🧴 정기 소독 실시 안내</h2>
<p style="font-size:14px;line-height:1.7;">{{buildingName}} 입주민 여러분께 안내드립니다.</p>
<p style="font-size:14px;line-height:1.7;">「감염병의 예방 및 관리에 관한 법률」 제51조 제3항에 따라 우리 건물의 보건위생과 생활환경 개선을 위하여 아래와 같이 정기 소독을 실시하오니 협조하여 주시기 바랍니다.</p>
<ul style="font-size:14px;line-height:1.8;">
<li><b>소독 일자:</b> {{customA}}</li>
<li><b>소독 시간 / 동별 구분:</b> {{customB}}</li>
<li><b>비고:</b> {{customC}}</li>
</ul>
<p style="font-size:14px;line-height:1.7;">소독 시 다음 사항에 유의하여 주시기 바랍니다.</p>
<ul style="font-size:14px;line-height:1.8;">
<li>소독을 받으시는 세대는 어린이·유아 및 반려동물이 약품에 접촉하지 않도록 주의하여 주시기 바랍니다.</li>
<li>반려견을 사육하시는 세대는 방문 소독기사에게 피해가 가지 않도록 격리 또는 가두어 주시기 바랍니다.</li>
<li>확진자·자가격리자·의심 증상자가 있는 세대는 소독원의 방문을 거부하여 주시기 바랍니다.</li>
<li>정기 소독을 받지 못한 세대는 관리사무소에서 바퀴약(패치)을 수령하여 세대 내부에 부착하실 수 있습니다.</li>
</ul>
<p style="font-size:14px;line-height:1.7;">문의: 관리사무소 {{managementOfficePhone}}</p>
<p style="text-align:right;margin-top:16px;font-size:13px;">{{date}}<br/>{{buildingName}} 관리사무소</p>
</div>$html$,
  '["소독 일자","소독 시간/동별","비고"]',
  70,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "building_notice_templates" WHERE "title" = '정기 소독 안내'
);
--> statement-breakpoint

-- ── 3. 입주자 에어컨(FCU) 세척 안내 ─────────────────────────────────────
INSERT INTO "building_notice_templates"
  ("title","category","icon","body_html","custom_field_labels","sort_order","is_active")
SELECT
  '입주자 에어컨(FCU) 세척 안내',
  '일반',
  '❄️',
  $html$<div style="font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#111827;padding:8px;">
<h2 style="text-align:center;margin:0 0 12px;">❄️ 입주자 에어컨(FCU) 세척 안내</h2>
<p style="font-size:14px;line-height:1.7;">{{buildingName}} 입주민 여러분 안녕하십니까.</p>
<p style="font-size:14px;line-height:1.7;">세대 내에 설치된 에어컨 내부에 오염이 누적되어 냉방 효율이 저하(시원하지 않음)되는 사례가 확인되고 있습니다. 이에 세대 냉방 효율의 극대화·최적화를 위하여 에어컨 분해세척을 공동구매를 통해 저렴한 가격으로 제공하고자 하오니 필요하신 입주자께서는 아래 지정업체를 통해 신청하시기 바랍니다.</p>
<ul style="font-size:14px;line-height:1.8;">
<li>감염병 등 각종 질환 예방 및 실내공기질 개선</li>
<li>냉난방 사용요금 절감 및 에어컨 고장 예방</li>
<li>전문 공동구매 업체에서 입주자분께 개별 상담 후 결정</li>
</ul>
<p style="font-size:14px;line-height:1.7;"><b>공동구매 할인 요금 안내(VAT 별도):</b><br/>{{customA}}</p>
<p style="font-size:14px;line-height:1.7;"><b>신청 / 문의 연락처:</b> {{customB}}</p>
<p style="font-size:14px;line-height:1.7;">기타 안내가 필요하신 경우 관리사무소 {{managementOfficePhone}} 로 문의 바랍니다.</p>
<p style="text-align:right;margin-top:16px;font-size:13px;">{{date}}<br/>{{buildingName}} 관리사무소</p>
</div>$html$,
  '["요금 안내","신청/문의 연락처"]',
  80,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "building_notice_templates" WHERE "title" = '입주자 에어컨(FCU) 세척 안내'
);
--> statement-breakpoint

-- ── 4. 입주민 차량등록 상시 접수 안내 ───────────────────────────────────
INSERT INTO "building_notice_templates"
  ("title","category","icon","body_html","custom_field_labels","sort_order","is_active")
SELECT
  '입주민 차량등록 상시 접수 안내',
  '공지',
  '🚗',
  $html$<div style="font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#111827;padding:8px;">
<h2 style="text-align:center;margin:0 0 12px;">🚗 입주민 차량등록 상시 접수 안내</h2>
<p style="font-size:14px;line-height:1.7;">{{buildingName}} 입주민 여러분 안녕하십니까.</p>
<p style="font-size:14px;line-height:1.7;">기간별로 나누어 진행하던 차량등록 기간이 종료됨에 따라 입주민 차량등록을 아래와 같이 상시 등록 방식으로 전환하여 운영합니다.</p>
<ul style="font-size:14px;line-height:1.8;">
<li><b>접수 시간:</b> {{customA}}</li>
<li><b>접수 장소:</b> {{customB}}</li>
<li><b>등록 대상:</b> 입주민 본인 소유 차량 / 동일 세대 가족 소유 차량(주민등록상 동일 세대) / 회사 소유 차량 / 장기렌트(리스) 차량</li>
<li><b>구비 서류:</b> 차량등록증(원본), 주민등록등본 또는 주소 기재 신분증, (회사차량) 재직증명서 또는 회사확인서, (렌트차량) 렌트계약서 등 입증서류</li>
<li>구비서류는 방문 시 확인만 진행하며, 전화·팩스·이메일 접수는 불가합니다.</li>
<li><b>비고:</b> {{customC}}</li>
</ul>
<p style="font-size:14px;line-height:1.7;">등록되지 않은 차량은 향후 주차관리 기준에 따라 출입 및 주차가 제한될 수 있습니다. 원활한 주차 운영을 위하여 입주민 여러분의 협조 부탁드립니다.</p>
<p style="font-size:14px;line-height:1.7;">문의: 관리사무소 {{managementOfficePhone}}</p>
<p style="text-align:right;margin-top:16px;font-size:13px;">{{date}}<br/>{{buildingName}} 관리사무소</p>
</div>$html$,
  '["접수 시간","접수 장소","비고"]',
  90,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM "building_notice_templates" WHERE "title" = '입주민 차량등록 상시 접수 안내'
);
--> statement-breakpoint

-- ── 5. 층간소음 예방 및 이웃 배려 안내 (기존 시드 UPDATE) ───────────────
-- 기존 '층간소음 협조 안내' (sort_order 50) 행을 더 상세한 3섹션 구조
-- (심야시간 금지 / 심야시간 자제 / 일상생활 사례) 로 갱신한다.
-- 이미 갱신된 환경에서도 결과가 동일하므로 멱등.
UPDATE "building_notice_templates"
SET
  "title" = '층간소음 예방 및 이웃 배려 안내',
  "icon" = '🔇',
  "category" = '공지',
  "body_html" = $html$<div style="font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#111827;padding:8px;">
<h2 style="text-align:center;margin:0 0 12px;">🔇 층간소음 예방 및 이웃 배려 안내</h2>
<p style="font-size:14px;line-height:1.7;">{{buildingName}} 입주민 여러분 안녕하십니까.</p>
<p style="font-size:14px;line-height:1.7;">최근 단지 내 층간소음으로 인한 입주민 간 불편 및 갈등 민원이 지속해서 발생하고 있습니다. 특히 심야시간에는 생활 소음이 크게 전달되어 이웃의 휴식과 수면을 방해할 수 있습니다.</p>
<p style="font-size:14px;line-height:1.7;">「공동주택관리규약」에 따라 입주자 등은 공동생활 질서유지 및 층간소음 방지를 위해 노력할 의무가 있습니다.</p>
<p style="font-size:14px;line-height:1.7;"><b>1. 심야시간(22:00 ~ 06:00) 금지 행위</b></p>
<ul style="font-size:14px;line-height:1.8;">
<li>뛰거나 문·창문 등을 크게 소리 나게 닫는 행위</li>
<li>망치질 등 세대 내부 수리 또는 가구 이동으로 인한 소음</li>
<li>피아노 등 악기 연주</li>
<li>헬스 기구·골프 연습기 등 운동기구 사용</li>
<li>반려동물 소음 방치</li>
</ul>
<p style="font-size:14px;line-height:1.7;"><b>2. 심야시간 자제 요청 사항</b></p>
<ul style="font-size:14px;line-height:1.8;">
<li>세탁·청소 등 소음을 유발하는 가사 활동</li>
<li>TV·오디오 등 음향기기 사용</li>
<li>주방 사용 및 샤워 시 발생하는 소음</li>
</ul>
<p style="font-size:14px;line-height:1.7;"><b>3. 일상생활 중 주요 소음 발생 사례</b></p>
<ul style="font-size:14px;line-height:1.8;">
<li>무심코 쿵쿵 걷는 발걸음</li>
<li>아이가 뛰거나 큰 소리를 내는 경우</li>
<li>집들이 및 모임 등으로 인한 일시적 소음 증가</li>
<li>생활기기 사용(세탁기·청소기·안마기 등)</li>
</ul>
<p style="font-size:14px;line-height:1.7;">나의 작은 배려가 이웃에게는 큰 편안함이 됩니다. 모두가 쾌적하고 조용한 주거환경에서 생활할 수 있도록 입주민 여러분의 협조를 부탁드립니다.</p>
<p style="font-size:14px;line-height:1.7;">분쟁 발생 시 직접 항의는 자제하시고 관리사무소 {{managementOfficePhone}} 로 연락 부탁드립니다.</p>
<p style="text-align:right;margin-top:16px;font-size:13px;">{{date}}<br/>{{buildingName}} 관리사무소</p>
</div>$html$,
  "updated_at" = now()
WHERE "title" IN (
  '층간소음 협조 안내',
  '층간소음 예방 안내',
  '층간소음 예방 및 이웃 배려 안내'
)
  -- 본문/제목/아이콘/카테고리가 이미 신규 버전과 동일하면 SKIP — updated_at 까지
  -- 멱등하게 만들기 위함(코드리뷰 #488 의견 반영).
  AND (
    "title" <> '층간소음 예방 및 이웃 배려 안내'
    OR "icon" IS DISTINCT FROM '🔇'
    OR "category" <> '공지'
    OR "body_html" <> $html$<div style="font-family:'Noto Sans KR','Malgun Gothic',sans-serif;color:#111827;padding:8px;">
<h2 style="text-align:center;margin:0 0 12px;">🔇 층간소음 예방 및 이웃 배려 안내</h2>
<p style="font-size:14px;line-height:1.7;">{{buildingName}} 입주민 여러분 안녕하십니까.</p>
<p style="font-size:14px;line-height:1.7;">최근 단지 내 층간소음으로 인한 입주민 간 불편 및 갈등 민원이 지속해서 발생하고 있습니다. 특히 심야시간에는 생활 소음이 크게 전달되어 이웃의 휴식과 수면을 방해할 수 있습니다.</p>
<p style="font-size:14px;line-height:1.7;">「공동주택관리규약」에 따라 입주자 등은 공동생활 질서유지 및 층간소음 방지를 위해 노력할 의무가 있습니다.</p>
<p style="font-size:14px;line-height:1.7;"><b>1. 심야시간(22:00 ~ 06:00) 금지 행위</b></p>
<ul style="font-size:14px;line-height:1.8;">
<li>뛰거나 문·창문 등을 크게 소리 나게 닫는 행위</li>
<li>망치질 등 세대 내부 수리 또는 가구 이동으로 인한 소음</li>
<li>피아노 등 악기 연주</li>
<li>헬스 기구·골프 연습기 등 운동기구 사용</li>
<li>반려동물 소음 방치</li>
</ul>
<p style="font-size:14px;line-height:1.7;"><b>2. 심야시간 자제 요청 사항</b></p>
<ul style="font-size:14px;line-height:1.8;">
<li>세탁·청소 등 소음을 유발하는 가사 활동</li>
<li>TV·오디오 등 음향기기 사용</li>
<li>주방 사용 및 샤워 시 발생하는 소음</li>
</ul>
<p style="font-size:14px;line-height:1.7;"><b>3. 일상생활 중 주요 소음 발생 사례</b></p>
<ul style="font-size:14px;line-height:1.8;">
<li>무심코 쿵쿵 걷는 발걸음</li>
<li>아이가 뛰거나 큰 소리를 내는 경우</li>
<li>집들이 및 모임 등으로 인한 일시적 소음 증가</li>
<li>생활기기 사용(세탁기·청소기·안마기 등)</li>
</ul>
<p style="font-size:14px;line-height:1.7;">나의 작은 배려가 이웃에게는 큰 편안함이 됩니다. 모두가 쾌적하고 조용한 주거환경에서 생활할 수 있도록 입주민 여러분의 협조를 부탁드립니다.</p>
<p style="font-size:14px;line-height:1.7;">분쟁 발생 시 직접 항의는 자제하시고 관리사무소 {{managementOfficePhone}} 로 연락 부탁드립니다.</p>
<p style="text-align:right;margin-top:16px;font-size:13px;">{{date}}<br/>{{buildingName}} 관리사무소</p>
</div>$html$
  );
