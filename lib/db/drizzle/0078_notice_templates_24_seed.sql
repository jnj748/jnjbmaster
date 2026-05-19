-- 24종 공지 양식 일괄 INSERT (멱등: title 기준 WHERE NOT EXISTS).
-- category 는 manager-notice-templates 페이지 고정 탭 코드와 일치
--   (fire_safety / lifestyle / environment / facility / management_fee / meeting).
-- type: 'document' 작성형 / 'infographic' 바로출력.
-- recommended_months: 1-12 의 jsonb 배열, 계절성 없는 항목은 NULL.

BEGIN;

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '소방종합 정밀점검 일정 안내', 'fire_safety',
  '<p>안녕하세요. 관리사무소입니다.</p><p>소방시설법에 따른 <b>소방종합 정밀점검</b>을 아래와 같이 실시하오니, 입주민 여러분의 협조 부탁드립니다.</p><ul><li>점검일시: ${점검일시}</li><li>점검범위: 전 세대 및 공용부 소방시설</li><li>점검업체: ${점검업체}</li></ul><p>세대 내부 점검이 필요한 경우 사전에 안내드릴 예정입니다.</p>',
  110, 'document', '[3,9]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='소방종합 정밀점검 일정 안내');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '음식물 주방배기덕트 화재예방 안내', 'fire_safety',
  '<p>겨울철 주방 화재의 주요 원인 중 하나는 <b>배기덕트 내부 기름때 누적</b>입니다.</p><p>아래 사항을 반드시 지켜주시기 바랍니다.</p><ul><li>주방 후드 필터를 정기적으로 청소해 주세요.</li><li>장시간 가열 조리 시 자리를 비우지 마세요.</li><li>덕트 내 이상 소음·냄새 발생 시 관리사무소로 즉시 연락 바랍니다.</li></ul>',
  120, 'document', '[11,12,1,2]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='음식물 주방배기덕트 화재예방 안내');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '방화문 개방 금지 안내', 'fire_safety',
  '<p><b>방화문은 화재 시 연기·화염 확산을 막는 핵심 시설입니다.</b></p><p>계단실·복도의 방화문을 임의로 개방하거나 고임목·물건 등으로 고정하는 행위는 <b>소방시설법 위반</b>입니다.</p><p>적발 시 과태료가 부과될 수 있으니 항상 닫힌 상태를 유지해 주시기 바랍니다.</p>',
  130, 'infographic', NULL
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='방화문 개방 금지 안내');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '금연 안내', 'lifestyle',
  '<p>본 건물은 <b>금연 건물</b>입니다.</p><p>공용부(계단실, 복도, 엘리베이터, 주차장, 옥상 등)에서의 흡연은 금지되어 있습니다.</p><p>입주민 여러분의 건강과 쾌적한 환경을 위해 협조 부탁드립니다.</p>',
  210, 'infographic', NULL
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='금연 안내');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '흡연으로 인한 피해 호소문', 'lifestyle',
  '<p>최근 일부 세대 및 공용부에서 흡연으로 인한 <b>간접흡연 피해</b>를 호소하는 민원이 다수 접수되고 있습니다.</p><p>특히 베란다·화장실 환풍구를 통한 담배 연기는 인접 세대로 그대로 전달됩니다.</p><p>이웃을 배려하는 마음으로 지정된 장소 외에서의 흡연을 자제해 주시기 바랍니다.</p>',
  220, 'document', NULL
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='흡연으로 인한 피해 호소문');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '담배꽁초 무단투기 금지 안내', 'lifestyle',
  '<p>건물 출입구·화단·주차장 등에 <b>담배꽁초 무단투기</b>가 빈번하게 발생하고 있습니다.</p><p>꽁초는 화재의 직접적 원인이며, 환경 미관을 크게 훼손합니다.</p><p>적발 시 <b>경범죄처벌법에 따라 과태료가 부과</b>될 수 있으니 반드시 지정된 재떨이를 이용해 주시기 바랍니다.</p>',
  230, 'infographic', NULL
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='담배꽁초 무단투기 금지 안내');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '공용부 무단 적치물 회수 단속 안내', 'lifestyle',
  '<p>계단실, 복도, 비상구 등 <b>공용부에 개인 물품을 적치</b>하는 행위는 피난로를 가로막아 화재 시 인명피해로 이어질 수 있습니다.</p><ul><li>회수 기한: ${회수기한}</li><li>이후 미회수 물품은 관리사무소에서 일괄 정리 처분 예정입니다.</li></ul><p>입주민 여러분의 적극적인 협조 부탁드립니다.</p>',
  240, 'document', NULL
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='공용부 무단 적치물 회수 단속 안내');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '공동현관 낙서 금지 안내', 'lifestyle',
  '<p>최근 공동현관 및 엘리베이터 내부에 <b>낙서·스티커 부착</b>이 반복되고 있습니다.</p><p>이는 공용 시설물 훼손에 해당하며 복구 비용이 관리비에서 지출됩니다.</p><p>CCTV로 적발 시 손해배상 책임이 부과될 수 있습니다.</p>',
  250, 'infographic', NULL
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='공동현관 낙서 금지 안내');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '쓰레기 불법투기 절대 금지', 'environment',
  '<p>지정된 장소 외 <b>쓰레기 불법투기</b>가 적발되고 있습니다.</p><p>불법투기 시 <b>폐기물관리법에 따라 100만원 이하의 과태료</b>가 부과됩니다.</p><p>CCTV 단속 중이며, 적발 시 즉시 신고 조치됩니다.</p>',
  310, 'infographic', NULL
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='쓰레기 불법투기 절대 금지');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '쓰레기 배출 안내', 'environment',
  '<p>쾌적한 주거환경을 위해 아래 배출 요령을 지켜주시기 바랍니다.</p><ul><li>배출 장소: ${배출장소}</li><li>배출 시간: ${배출시간}</li><li>일반 종량제봉투를 사용하고, 음식물·재활용은 별도 분리</li></ul><p>봉투 미사용 또는 분리배출 위반 시 수거되지 않습니다.</p>',
  320, 'document', NULL
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='쓰레기 배출 안내');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '재활용품 배출 안내', 'environment',
  '<p>재활용품은 종류별로 분리해 깨끗이 비우고 배출해 주시기 바랍니다.</p><ul><li>종이류: 물기 제거 후 끈으로 묶어서 배출</li><li>플라스틱·페트병: 내용물 비우고 라벨 제거</li><li>유리병: 깨지지 않도록 별도 수거함에 배출</li><li>스티로폼: 이물질 제거 후 배출</li></ul>',
  330, 'document', NULL
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='재활용품 배출 안내');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '정기 소독 안내문', 'environment',
  '<p>건물 내 위생관리를 위한 <b>정기 소독</b>을 아래와 같이 실시합니다.</p><ul><li>소독일시: ${소독일시}</li><li>소독범위: 공용부 전체 및 지하주차장</li><li>소독업체: ${소독업체}</li></ul><p>소독 시간 동안 환기에 유의해 주시고, 알레르기 등 민감자는 외출을 권장합니다.</p>',
  340, 'document', NULL
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='정기 소독 안내문');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '동절기 주차장 누수 및 안전사고 예방', 'facility',
  '<p>동절기에는 외부에서 유입된 눈·빙판으로 인해 <b>지하주차장 바닥 결빙·누수</b>가 발생할 수 있습니다.</p><ul><li>주차 시 결빙 구간을 주의하시고 천천히 주행해 주세요.</li><li>차량에서 떨어지는 눈·물기로 인한 미끄럼 사고에 유의 바랍니다.</li><li>누수·결빙 발견 시 즉시 관리사무소로 연락 주시기 바랍니다.</li></ul>',
  410, 'document', '[12,1,2]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='동절기 주차장 누수 및 안전사고 예방');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '승강기 정기점검 안내', 'facility',
  '<p>승강기 안전관리법에 따른 <b>정기점검</b>을 아래와 같이 실시합니다.</p><ul><li>점검일시: ${점검일시}</li><li>점검대상: ${점검대상호기}</li><li>점검 중 해당 승강기 운행 일시 중단</li></ul><p>점검 시간 동안 다른 호기 또는 계단을 이용해 주시기 바랍니다.</p>',
  420, 'document', NULL
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='승강기 정기점검 안내');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '에어컨 가동 시 갤러리창 개방 안내', 'facility',
  '<p>에어컨(FCU) 가동 시 <b>실외기 통풍구(갤러리창)를 반드시 개방</b>해 주시기 바랍니다.</p><p>갤러리창이 닫힌 상태에서 에어컨을 가동하면 실외기 과열로 화재 또는 고장의 원인이 됩니다.</p>',
  430, 'document', '[6,7,8]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='에어컨 가동 시 갤러리창 개방 안내');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '전기차 충전구역 이용 안내', 'facility',
  '<p>전기차 충전구역은 <b>충전 중인 전기차 전용</b>입니다.</p><ul><li>일반 차량 주차 시 과태료 10만원이 부과됩니다.</li><li>충전 완료 후에도 장시간 점유 시 단속 대상이 됩니다.</li><li>충전기 고장·파손 발견 시 관리사무소로 신고 부탁드립니다.</li></ul>',
  440, 'document', NULL
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='전기차 충전구역 이용 안내');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '난방공급 실시 안내', 'facility',
  '<p>본격적인 추위에 대비해 아래와 같이 <b>난방공급을 개시</b>합니다.</p><ul><li>난방 개시일: ${난방개시일}</li><li>공급 시간: ${공급시간}</li><li>난방비 절감을 위해 적정 온도(20℃) 유지를 권장합니다.</li></ul><p>난방 미가동·이상 발생 시 즉시 관리사무소로 연락 주시기 바랍니다.</p>',
  450, 'document', '[10,11]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='난방공급 실시 안내');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '관리비 납부 안내', 'management_fee',
  '<p>이번 달 관리비 납부 안내드립니다.</p><ul><li>납부 기한: ${납부기한}</li><li>납부 방법: 자동이체 / 가상계좌 / 무통장입금</li><li>가상계좌: ${가상계좌번호}</li></ul><p>기한 내 미납 시 연체료가 부과될 수 있으니 참고 부탁드립니다.</p>',
  510, 'document', NULL
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='관리비 납부 안내');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '관리위원회 정기회의 개최 공고', 'meeting',
  '<p>아래와 같이 <b>관리위원회 정기회의</b>를 개최합니다.</p><ul><li>일시: ${회의일시}</li><li>장소: ${회의장소}</li><li>안건: ${안건}</li></ul><p>입주민 여러분의 많은 참여를 부탁드립니다.</p>',
  610, 'document', NULL
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='관리위원회 정기회의 개최 공고');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '불조심 강조의 달 안내', 'fire_safety',
  '<p>11월은 <b>「불조심 강조의 달」</b>입니다.</p><p>건조한 날씨로 화재 위험이 가장 높은 시기이므로 아래 사항을 점검해 주시기 바랍니다.</p><ul><li>전기 콘센트 문어발식 사용 금지</li><li>가스 밸브 사용 후 잠금 확인</li><li>난방기·전기장판 외출 시 전원 OFF</li><li>주방 후드 필터 청소</li></ul>',
  140, 'infographic', '[11]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='불조심 강조의 달 안내');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '여름철 안전관리 안내', 'facility',
  '<p>본격적인 여름철을 맞아 아래 사항에 유의 부탁드립니다.</p><ul><li>전력 과부하로 인한 정전·화재 예방 — 에어컨 동시 가동 자제</li><li>고온다습 환경에서 식중독·곰팡이 발생 주의</li><li>실외기 주변 가연물 제거</li><li>어린이 물놀이 안전사고 예방</li></ul>',
  460, 'document', '[6,7,8]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='여름철 안전관리 안내');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '장마철 대비 안내', 'facility',
  '<p>장마철을 대비하여 아래 사항을 점검·협조해 주시기 바랍니다.</p><ul><li>베란다 배수구 청소 — 낙엽·이물질 제거</li><li>창문 틈새 방수 점검</li><li>지하주차장 차량은 침수 우려 시 사전 이동</li><li>옥상·외벽 누수 의심 시 관리사무소로 즉시 연락</li></ul>',
  470, 'document', '[6,7]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='장마철 대비 안내');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '봄철 환경정비 안내', 'environment',
  '<p>봄을 맞아 <b>건물 환경정비</b>를 아래와 같이 실시합니다.</p><ul><li>정비일시: ${정비일시}</li><li>정비범위: 화단 정리, 외벽 청소, 공용부 대청소</li><li>입주민 참여 환영 — 참여 희망 시 관리사무소로 신청</li></ul>',
  350, 'document', '[3,4]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='봄철 환경정비 안내');

INSERT INTO building_notice_templates (title, category, body_html, sort_order, type, recommended_months)
SELECT '주차 질서 안내', 'lifestyle',
  '<p>원활한 주차장 운영을 위해 아래 사항을 지켜주시기 바랍니다.</p><ul><li>지정 주차구역 준수 — 타인 자리 무단 사용 금지</li><li>이중주차 시 핸드폰 번호 필수 부착</li><li>장애인·전기차·임산부 전용구역 일반차량 주차 금지</li><li>방문차량은 사전 등록 후 이용 부탁드립니다.</li></ul>',
  260, 'document', NULL
WHERE NOT EXISTS (SELECT 1 FROM building_notice_templates WHERE title='주차 질서 안내');

COMMIT;
