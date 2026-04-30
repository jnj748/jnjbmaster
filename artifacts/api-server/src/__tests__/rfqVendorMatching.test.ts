// [Task #698] Unit tests for the unified vendor↔RFQ matching helper.
//   사장님 보고 케이스(파트너 화면에 6 RFQ 중 1건만 보이던 문제) 의 회귀 방지가
//   주요 목표. 옛 단일값 vendor + 신규 service_area JSON + subCategories 콤마
//   리스트 + 한글 카테고리 라벨 정규화 4가지를 모두 커버한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  vendorMatchesRfq,
  vendorCoversCategory,
  vendorCoversRegion,
  normalizeRfqCategory,
  type VendorMatchProfile,
  type RfqMatchProfile,
} from "@workspace/shared/rfq-vendor-matching";

const BASE_RFQ_GUMI: RfqMatchProfile = {
  category: "water_tank",
  sido: "경북",
  sigungu: "구미시",
  geoScope: "sigungu",
};

const BASE_RFQ_GANGNAM: RfqMatchProfile = {
  category: "waterproofing",
  sido: "서울특별시",
  sigungu: "강남구",
  geoScope: "sigungu",
};

// ────────────────────────────────────────────────────────────────────────
// normalizeRfqCategory
// ────────────────────────────────────────────────────────────────────────
test("normalizeRfqCategory — 영문 코드는 그대로", () => {
  assert.equal(normalizeRfqCategory("waterproofing"), "waterproofing");
  assert.equal(normalizeRfqCategory("water_tank"), "water_tank");
  assert.equal(normalizeRfqCategory("defect_diagnosis"), "defect_diagnosis");
});

test("normalizeRfqCategory — 한글 라벨은 코드로 변환", () => {
  assert.equal(normalizeRfqCategory("방수"), "waterproofing");
  assert.equal(normalizeRfqCategory("방수/도장"), "waterproofing");
  assert.equal(normalizeRfqCategory("저수조"), "water_tank");
  assert.equal(normalizeRfqCategory("소방"), "fire_safety");
  assert.equal(normalizeRfqCategory("하자진단"), "defect_diagnosis");
});

test("normalizeRfqCategory — null/empty 보호", () => {
  assert.equal(normalizeRfqCategory(null), null);
  assert.equal(normalizeRfqCategory(""), null);
  assert.equal(normalizeRfqCategory("   "), null);
});

test("normalizeRfqCategory — 모르는 값은 trim 만 하고 그대로", () => {
  assert.equal(normalizeRfqCategory("  unknown_x  "), "unknown_x");
});

// ────────────────────────────────────────────────────────────────────────
// vendorCoversCategory
// ────────────────────────────────────────────────────────────────────────
test("vendorCoversCategory — single category 정확 일치", () => {
  const v: VendorMatchProfile = { category: "water_tank" };
  assert.equal(vendorCoversCategory(v, "water_tank"), true);
  assert.equal(vendorCoversCategory(v, "fire_safety"), false);
});

test("vendorCoversCategory — subCategories 콤마 리스트에 포함되면 매칭", () => {
  const v: VendorMatchProfile = {
    category: "waterproofing",
    subCategories: "electrical,water_tank,fire_safety,defect_diagnosis",
  };
  assert.equal(vendorCoversCategory(v, "water_tank"), true);
  assert.equal(vendorCoversCategory(v, "fire_safety"), true);
  assert.equal(vendorCoversCategory(v, "defect_diagnosis"), true);
  assert.equal(vendorCoversCategory(v, "waterproofing"), true);
  assert.equal(vendorCoversCategory(v, "elevator"), false);
});

test("vendorCoversCategory — vendor 한글 카테고리도 정규화 후 매칭", () => {
  const v: VendorMatchProfile = { category: "방수/도장" };
  assert.equal(vendorCoversCategory(v, "waterproofing"), true);
});

test("vendorCoversCategory — vendor subCategories 한글 혼합도 매칭", () => {
  const v: VendorMatchProfile = {
    category: null,
    subCategories: "저수조,소방,방수/도장",
  };
  assert.equal(vendorCoversCategory(v, "water_tank"), true);
  assert.equal(vendorCoversCategory(v, "fire_safety"), true);
  assert.equal(vendorCoversCategory(v, "waterproofing"), true);
});

// ────────────────────────────────────────────────────────────────────────
// vendorCoversRegion
// ────────────────────────────────────────────────────────────────────────
test("vendorCoversRegion — RFQ 시도 비어 있으면 모든 vendor 통과", () => {
  const v: VendorMatchProfile = {};
  assert.equal(vendorCoversRegion(v, null, null, null), true);
});

test("vendorCoversRegion — serviceArea.nationwide=true 면 무조건 통과", () => {
  const v: VendorMatchProfile = {
    serviceArea: '{"nationwide":true,"bySido":{}}',
  };
  assert.equal(vendorCoversRegion(v, "경북", "구미시", "sigungu"), true);
  assert.equal(vendorCoversRegion(v, "서울특별시", "강남구", "sigungu"), true);
});

test("vendorCoversRegion — bySido 시군구 일치", () => {
  const v: VendorMatchProfile = {
    serviceArea: '{"bySido":{"서울특별시":["강남구","서초구"]}}',
  };
  assert.equal(vendorCoversRegion(v, "서울특별시", "강남구", "sigungu"), true);
  assert.equal(vendorCoversRegion(v, "서울특별시", "송파구", "sigungu"), false);
  // 시도 단위 RFQ — 등록만 돼 있으면 통과
  assert.equal(vendorCoversRegion(v, "서울특별시", null, "sido"), true);
  // 다른 시도
  assert.equal(vendorCoversRegion(v, "경북", "구미시", "sigungu"), false);
});

test("vendorCoversRegion — bySido 빈 배열 = 시도 전체 커버", () => {
  const v: VendorMatchProfile = {
    serviceArea: '{"bySido":{"경북":[]}}',
  };
  assert.equal(vendorCoversRegion(v, "경북", "구미시", "sigungu"), true);
  assert.equal(vendorCoversRegion(v, "경북", "포항시", "sigungu"), true);
});

test("vendorCoversRegion — fallback 옛 단일 sido/sigungu 컬럼", () => {
  const v: VendorMatchProfile = { sido: "서울특별시", sigungu: "강남구" };
  assert.equal(vendorCoversRegion(v, "서울특별시", "강남구", "sigungu"), true);
  assert.equal(vendorCoversRegion(v, "서울특별시", "송파구", "sigungu"), false);
  assert.equal(vendorCoversRegion(v, "서울특별시", null, "sido"), true);
  assert.equal(vendorCoversRegion(v, "경북", "구미시", "sigungu"), false);
});

test("vendorCoversRegion — serviceArea/sido 모두 비면 매칭에서 제외", () => {
  const v: VendorMatchProfile = {};
  assert.equal(vendorCoversRegion(v, "경북", "구미시", "sigungu"), false);
});

test("vendorCoversRegion — 깨진 JSON 은 fallback 으로 처리", () => {
  const v: VendorMatchProfile = { serviceArea: "{not valid json", sido: "경북", sigungu: "구미시" };
  assert.equal(vendorCoversRegion(v, "경북", "구미시", "sigungu"), true);
});

// ────────────────────────────────────────────────────────────────────────
// vendorMatchesRfq — 사장님 보고 케이스 회귀 방지
// ────────────────────────────────────────────────────────────────────────
test("vendorMatchesRfq — type !== 'platform' 인 vendor 는 항상 false", () => {
  const v: VendorMatchProfile = {
    type: "contracted",
    category: "water_tank",
    sido: "경북",
    sigungu: "구미시",
  };
  assert.equal(vendorMatchesRfq(v, BASE_RFQ_GUMI), false);
});

test("vendorMatchesRfq — '전국 + 모든 분야' 파트너는 어떤 RFQ 와도 매칭", () => {
  // 사장님이 위저드에서 켠 상태 — vendor #1 한국승강기서비스의 실제 데이터.
  const v: VendorMatchProfile = {
    type: "platform",
    category: "waterproofing",
    subCategories:
      "electrical,elevator,gas,septic,fire_safety,water_tank,security,cleaning,maintenance_repair,mechanical,other,defect_diagnosis,building_maintenance",
    serviceArea: '{"nationwide":true,"bySido":{}}',
    sido: null,
    sigungu: null,
  };
  // 사장님 보고의 6 RFQ 모두 매칭돼야 함.
  const rfqs: RfqMatchProfile[] = [
    { category: "water_tank", sido: "경북", sigungu: "구미시", geoScope: "sigungu" },
    { category: "fire_safety", sido: "경북", sigungu: "구미시", geoScope: "sigungu" },
    { category: "defect_diagnosis", sido: "경북", sigungu: "구미시", geoScope: "sigungu" },
    { category: "electrical", sido: "서울특별시", sigungu: "강남구", geoScope: "sigungu" },
    { category: "waterproofing", sido: "서울특별시", sigungu: "강남구", geoScope: "sigungu" },
  ];
  for (const r of rfqs) {
    assert.equal(vendorMatchesRfq(v, r), true, `RFQ ${r.category}@${r.sido} ${r.sigungu} 매칭 실패`);
  }
});

test("vendorMatchesRfq — 옛날 단일값 vendor 도 카테고리/지역 일치 시 매칭", () => {
  const v: VendorMatchProfile = {
    type: "platform",
    category: "water_tank",
    sido: "경북",
    sigungu: "구미시",
  };
  assert.equal(vendorMatchesRfq(v, BASE_RFQ_GUMI), true);
  assert.equal(
    vendorMatchesRfq(v, { ...BASE_RFQ_GUMI, sigungu: "포항시" }),
    false,
    "다른 시군구는 매칭 안 됨",
  );
});

test("vendorMatchesRfq — vendor.category 한글, RFQ 영문 — 정규화로 매칭", () => {
  const v: VendorMatchProfile = {
    type: "platform",
    category: "방수/도장", // 옛 한글값
    sido: "서울특별시",
    sigungu: "강남구",
  };
  assert.equal(vendorMatchesRfq(v, BASE_RFQ_GANGNAM), true);
});

test("vendorMatchesRfq — 카테고리 미커버면 false", () => {
  const v: VendorMatchProfile = {
    type: "platform",
    category: "elevator",
    serviceArea: '{"nationwide":true}',
  };
  assert.equal(vendorMatchesRfq(v, BASE_RFQ_GUMI), false);
});

test("vendorMatchesRfq — 지역 미커버면 false", () => {
  const v: VendorMatchProfile = {
    type: "platform",
    category: "water_tank",
    serviceArea: '{"bySido":{"서울특별시":["강남구"]}}',
  };
  assert.equal(vendorMatchesRfq(v, BASE_RFQ_GUMI), false);
});
