import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test:test@localhost:5432/test";

const { __test } = await import("../routes/aiAssistant/index.js");
const { buildBuildingFacts, summarizeRegisterData } = __test;

type RawBuilding = Parameters<typeof buildBuildingFacts>[0];

function makeBuilding(overrides: Partial<NonNullable<RawBuilding>> = {}): NonNullable<RawBuilding> {
  return {
    id: 1,
    name: "테스트빌딩",
    addressFull: "서울시 종로구 1-1",
    totalUnits: 100,
    totalFloors: 15,
    basementFloors: 2,
    totalArea: "12345.67",
    buildingUsage: "공동주택",
    structureType: "철근콘크리트",
    completionDate: null,
    approvalDate: null,
    elevatorCount: 2,
    parkingSpaces: 50,
    landArea: "2000.5",
    buildingArea: "1000.25",
    buildingCoverageRatio: "60.50",
    floorAreaRatio: "200.00",
    managementOfficePhone: "02-555-1234",
    electricCapacityKw: "500",
    gasUsageMonthly: "1200",
    specialFundEnabled: false,
    safetyManagerRequired: true,
    safetyManagerType: "1급",
    fireGrade: 1,
    registerData: null,
    ...overrides,
  };
}

// ─── (a) 준공일만 저장된 건물 ──────────────────────────────────────────
test("(a) building with only completionDate exposes 준공일/사용승인일 as the same value", () => {
  const facts = buildBuildingFacts(makeBuilding({
    completionDate: "2010-06-15",
    approvalDate: null,
  }));
  assert.ok(facts);
  assert.equal(facts!["준공일"], "2010-06-15");
  assert.equal(facts!["사용승인일"], "2010-06-15");
});

// ─── (b) 사용승인일만 저장된 건물 ─────────────────────────────────────
test("(b) building with only approvalDate exposes 준공일/사용승인일 as the same value", () => {
  const facts = buildBuildingFacts(makeBuilding({
    completionDate: null,
    approvalDate: "2008-09-01",
  }));
  assert.ok(facts);
  assert.equal(facts!["준공일"], "2008-09-01");
  assert.equal(facts!["사용승인일"], "2008-09-01");
});

// ─── (c) 둘 다 비어 있는 건물 ─────────────────────────────────────────
test("(c) building with neither date still exposes 준공일/사용승인일 keys (null)", () => {
  const facts = buildBuildingFacts(makeBuilding({
    completionDate: null,
    approvalDate: null,
  }));
  assert.ok(facts);
  assert.ok("준공일" in facts!, "준공일 key must always be present");
  assert.ok("사용승인일" in facts!, "사용승인일 key must always be present");
  assert.equal(facts!["준공일"], null);
  assert.equal(facts!["사용승인일"], null);
});

// ─── (d) 둘 다 다른 값으로 저장된 건물 ─────────────────────────────────
test("(d) building with both completionDate and approvalDate exposes both distinctly", () => {
  const facts = buildBuildingFacts(makeBuilding({
    completionDate: "2010-06-15",
    approvalDate: "2010-07-01",
  }));
  assert.ok(facts);
  assert.equal(facts!["준공일"], "2010-06-15");
  assert.equal(facts!["사용승인일"], "2010-07-01");
});

// ─── 한국어 라벨 키가 모두 들어 있는지 확인 ──────────────────────────
test("buildBuildingFacts exposes all required Korean label keys", () => {
  const facts = buildBuildingFacts(makeBuilding({
    completionDate: "2010-06-15",
  }));
  assert.ok(facts);
  const expectedKoreanKeys = [
    "준공일",
    "사용승인일",
    "지하층수",
    "구조",
    "주용도",
    "연면적제곱미터",
    "대지면적제곱미터",
    "건축면적제곱미터",
    "건폐율퍼센트",
    "용적률퍼센트",
    "소방안전관리자필요여부",
    "소방안전관리자등급",
    "소방등급",
    "관리사무소전화",
    "전기계약용량kW",
    "월가스사용량",
    "특수금고사용여부",
  ];
  for (const k of expectedKoreanKeys) {
    assert.ok(k in facts!, `missing Korean key: ${k}`);
  }
  // numeric coercion from drizzle string columns
  assert.equal(facts!["연면적제곱미터"], 12345.67);
  assert.equal(facts!["건폐율퍼센트"], 60.5);
  assert.equal(facts!["용적률퍼센트"], 200);
  assert.equal(facts!["전기계약용량kW"], 500);
  // boolean values are preserved verbatim (true/false/null)
  assert.equal(facts!["소방안전관리자필요여부"], true);
  assert.equal(facts!["특수금고사용여부"], false);
});

test("buildBuildingFacts preserves null booleans (does not coerce to false)", () => {
  const facts = buildBuildingFacts(makeBuilding({
    safetyManagerRequired: null,
    specialFundEnabled: null,
  }));
  assert.ok(facts);
  assert.equal(facts!["소방안전관리자필요여부"], null);
  assert.equal(facts!["특수금고사용여부"], null);
});

test("buildBuildingFacts returns null when building is null", () => {
  assert.equal(buildBuildingFacts(null), null);
  assert.equal(buildBuildingFacts(undefined), null);
});

// ─── register_data 요약 ────────────────────────────────────────────
test("summarizeRegisterData picks safe Korean-labeled subset and skips empties", () => {
  const summary = summarizeRegisterData({
    title: {
      roofCdNm: "(철근)콘크리트",
      heit: "45.6",
      engrGrade: "1",
      rserthqkDsgnApplyYn: "Y",
      pmsDay: "20080315",
      stcnsDay: "20080601",
      etcRoof: "",
      // unknown / unsafe keys must not leak through
      mainPurpsCdNm: "공동주택",
      bldNm: "테스트빌딩",
    },
    recap: {
      mainBldCnt: "1",
      atchBldCnt: "0",
      totPkngCnt: "55",
      indrAutoUtcnt: "30",
    },
  });
  assert.ok(summary);
  assert.equal(summary!["지붕구조"], "(철근)콘크리트");
  assert.equal(summary!["건물높이m"], 45.6);
  assert.equal(summary!["에너지효율등급"], "1");
  assert.equal(summary!["내진설계적용"], "적용");
  assert.equal(summary!["허가일"], "2008-03-15");
  assert.equal(summary!["착공일"], "2008-06-01");
  assert.equal(summary!["주건축물수"], 1);
  assert.equal(summary!["부속건축물수"], 0);
  assert.equal(summary!["총주차대수"], 55);
  assert.equal(summary!["옥내자주식대수"], 30);
  // empty / unsafe keys are omitted
  assert.ok(!("기타지붕" in summary!));
  for (const k of Object.keys(summary!)) {
    assert.ok(!/^[A-Za-z]/.test(k), `summary key must not start with English letter: ${k}`);
  }
});

test("summarizeRegisterData returns null for empty / null inputs", () => {
  assert.equal(summarizeRegisterData(null), null);
  assert.equal(summarizeRegisterData(undefined), null);
  assert.equal(summarizeRegisterData({ title: {}, recap: {} }), null);
  assert.equal(summarizeRegisterData({ title: { etcRoof: "" }, recap: {} }), null);
});

test("buildBuildingFacts inlines register summary as 대장상세", () => {
  const facts = buildBuildingFacts(makeBuilding({
    registerData: {
      title: { engrGrade: "2", heit: "32.1" },
      recap: null,
    },
  }));
  assert.ok(facts);
  const detail = facts!["대장상세"] as Record<string, unknown>;
  assert.ok(detail);
  assert.equal(detail["에너지효율등급"], "2");
  assert.equal(detail["건물높이m"], 32.1);
});

test("buildBuildingFacts omits 대장상세 when register_data is empty", () => {
  const facts = buildBuildingFacts(makeBuilding({ registerData: null }));
  assert.ok(facts);
  assert.ok(!("대장상세" in facts!), "대장상세 must be omitted when no register data");
});
