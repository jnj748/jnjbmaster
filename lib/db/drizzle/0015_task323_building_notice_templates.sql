-- [Task #323] 관리소장 공지문 템플릿 (불조심/분리수거 등) — 플랫폼 관리, 매니저 사용.
CREATE TABLE IF NOT EXISTS "building_notice_templates" (
  "id" serial PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "category" text DEFAULT '일반' NOT NULL,
  "icon" text,
  "body_html" text NOT NULL,
  "custom_field_labels" text,
  "sort_order" integer DEFAULT 100 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- 시드 5종: 카테고리 안전(2)/위생(1)/공지(2). 본문은 manager-notice-templates UI 가
-- {{buildingName}} {{addressFull}} {{managementOfficePhone}} {{date}} {{customA/B/C}} 토큰을 치환한다.
INSERT INTO "building_notice_templates" ("title","category","icon","body_html","custom_field_labels","sort_order","is_active")
SELECT * FROM (VALUES
  (
    '불조심 안내',
    '안전',
    '🔥',
    '<div style="font-family:''Noto Sans KR'',''Malgun Gothic'',sans-serif;color:#111827;padding:8px;">'
      || '<h2 style="text-align:center;margin:0 0 12px;">🔥 화재 예방 안내</h2>'
      || '<p style="font-size:14px;line-height:1.7;">{{buildingName}} 입주민 여러분,</p>'
      || '<p style="font-size:14px;line-height:1.7;">건조한 계절을 맞아 화재 예방에 각별히 유의해 주시기 바랍니다.</p>'
      || '<ul style="font-size:14px;line-height:1.8;">'
      || '<li>외출 전 가스밸브 잠금, 전기 콘센트 점검</li>'
      || '<li>복도·계단 적치물 즉시 제거 (피난로 확보)</li>'
      || '<li>흡연 후 담배꽁초 완전 소화</li>'
      || '<li>비상시 119, 관리사무소 {{managementOfficePhone}}</li>'
      || '</ul>'
      || '<p style="text-align:right;margin-top:16px;font-size:13px;">{{date}}<br/>{{buildingName}} 관리사무소</p>'
      || '</div>',
    NULL,
    10,
    true
  ),
  (
    '쓰레기 분리수거 안내',
    '위생',
    '♻️',
    '<div style="font-family:''Noto Sans KR'',''Malgun Gothic'',sans-serif;color:#111827;padding:8px;">'
      || '<h2 style="text-align:center;margin:0 0 12px;">♻️ 분리수거 협조 안내</h2>'
      || '<p style="font-size:14px;line-height:1.7;">{{buildingName}} 입주민 여러분 안녕하십니까.</p>'
      || '<p style="font-size:14px;line-height:1.7;">쾌적한 생활환경 조성을 위해 아래와 같이 분리수거에 협조 부탁드립니다.</p>'
      || '<ul style="font-size:14px;line-height:1.8;">'
      || '<li><b>요일별 배출:</b> {{customA}}</li>'
      || '<li><b>장소:</b> {{customB}}</li>'
      || '<li>종이/플라스틱/캔/유리 — 이물질 제거 후 배출</li>'
      || '<li>음식물 쓰레기는 전용 용기에만 배출</li>'
      || '</ul>'
      || '<p style="text-align:right;margin-top:16px;font-size:13px;">{{date}}<br/>{{buildingName}} 관리사무소 ({{managementOfficePhone}})</p>'
      || '</div>',
    '["배출 요일","배출 장소"]',
    20,
    true
  ),
  (
    '소방훈련 실시 안내',
    '안전',
    '🧯',
    '<div style="font-family:''Noto Sans KR'',''Malgun Gothic'',sans-serif;color:#111827;padding:8px;">'
      || '<h2 style="text-align:center;margin:0 0 12px;">🧯 합동 소방훈련 실시 안내</h2>'
      || '<p style="font-size:14px;line-height:1.7;">{{buildingName}}에서는 다음과 같이 소방훈련을 실시합니다.</p>'
      || '<ul style="font-size:14px;line-height:1.8;">'
      || '<li><b>일시:</b> {{customA}}</li>'
      || '<li><b>장소:</b> {{customB}}</li>'
      || '<li><b>대상:</b> 전 입주민 및 관계자</li>'
      || '<li>훈련 중 비상벨이 울리더라도 당황하지 마시고 안내방송에 따라 대피해 주세요.</li>'
      || '</ul>'
      || '<p style="text-align:right;margin-top:16px;font-size:13px;">{{date}}<br/>{{buildingName}} 관리사무소 ({{managementOfficePhone}})</p>'
      || '</div>',
    '["일시","장소"]',
    30,
    true
  ),
  (
    '단수·단전 안내',
    '공지',
    '🚱',
    '<div style="font-family:''Noto Sans KR'',''Malgun Gothic'',sans-serif;color:#111827;padding:8px;">'
      || '<h2 style="text-align:center;margin:0 0 12px;">🚱 단수·단전 작업 안내</h2>'
      || '<p style="font-size:14px;line-height:1.7;">{{buildingName}} 입주민 여러분께 양해 말씀 드립니다.</p>'
      || '<p style="font-size:14px;line-height:1.7;">시설 점검을 위해 아래와 같이 단수(또는 단전)이 발생합니다.</p>'
      || '<ul style="font-size:14px;line-height:1.8;">'
      || '<li><b>일시:</b> {{customA}}</li>'
      || '<li><b>구분:</b> {{customB}}</li>'
      || '<li><b>사유:</b> {{customC}}</li>'
      || '<li>사전에 생활용수 확보 및 전기제품 사용에 유의해 주시기 바랍니다.</li>'
      || '</ul>'
      || '<p style="text-align:right;margin-top:16px;font-size:13px;">{{date}}<br/>{{buildingName}} 관리사무소 ({{managementOfficePhone}})</p>'
      || '</div>',
    '["일시","단수/단전 구분","사유"]',
    40,
    true
  ),
  (
    '층간소음 협조 안내',
    '공지',
    '🔇',
    '<div style="font-family:''Noto Sans KR'',''Malgun Gothic'',sans-serif;color:#111827;padding:8px;">'
      || '<h2 style="text-align:center;margin:0 0 12px;">🔇 층간소음 예방 협조 안내</h2>'
      || '<p style="font-size:14px;line-height:1.7;">{{buildingName}} 입주민 여러분 안녕하십니까.</p>'
      || '<p style="font-size:14px;line-height:1.7;">서로를 배려하는 마음으로 아래 사항에 협조 부탁드립니다.</p>'
      || '<ul style="font-size:14px;line-height:1.8;">'
      || '<li>야간(22:00 ~ 06:00) 세탁기·청소기 사용 자제</li>'
      || '<li>아이 뛰기·가구 끌기 시 소음방지 매트 활용</li>'
      || '<li>분쟁 발생 시 직접 항의 자제, 관리사무소 {{managementOfficePhone}}로 연락</li>'
      || '</ul>'
      || '<p style="text-align:right;margin-top:16px;font-size:13px;">{{date}}<br/>{{buildingName}} 관리사무소</p>'
      || '</div>',
    NULL,
    50,
    true
  )
) AS s(title,category,icon,body_html,custom_field_labels,sort_order,is_active)
WHERE NOT EXISTS (SELECT 1 FROM "building_notice_templates");
