// [Task #475] RFQ "건물 정보가 비어 있다" 경고 박스 노출 분기의 회귀 테스트.
//   computeBuildingReady 의 결과에 따라 RFQ 다이얼로그가 노란 경고 + "건물 정보
//   설정으로 이동" CTA 를 보여주는지가 결정된다(buildingReady=false 일 때 표시).
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBuildingReady } from "./rfq-building-ready";

test("건물 컨텍스트 자체가 없으면 buildingReady=false (CTA 표시)", () => {
  const r = computeBuildingReady(null);
  assert.equal(r.buildingReady, false);
  assert.equal(r.buildingName, "");
  assert.equal(r.buildingSido, "");
  assert.equal(r.buildingSigungu, "");
});

test("건물명이 없으면 buildingReady=false (CTA 표시)", () => {
  const r = computeBuildingReady({
    name: "",
    sido: "서울특별시",
    sigungu: "강남구",
    addressFull: "서울특별시 강남구 테헤란로 123",
  });
  assert.equal(r.buildingReady, false);
});

test("이름과 sido/sigungu 가 정상이면 buildingReady=true (CTA 숨김)", () => {
  const r = computeBuildingReady({
    name: "테스트빌딩",
    sido: "서울특별시",
    sigungu: "강남구",
  });
  assert.equal(r.buildingReady, true);
  assert.equal(r.buildingSido, "서울특별시");
  assert.equal(r.buildingSigungu, "강남구");
});

test("[Task #475 시나리오 A] sido/sigungu 가 NULL 이라도 addressFull 로부터 도출되면 buildingReady=true (CTA 숨김)", () => {
  const r = computeBuildingReady({
    name: "우함빌딩",
    sido: null,
    sigungu: null,
    addressFull: "경기도 용인시 기흥구 동백중앙로 175 (중동)",
  });
  assert.equal(r.buildingReady, true, "addressFull 도출이 성공하면 막히지 말아야 한다");
  assert.equal(r.buildingSido, "경기도");
  assert.equal(r.buildingSigungu, "용인시 기흥구");
});

test("[Task #475 시나리오 A] sido 만 비어 있을 때 addressFull 로 채워준다", () => {
  const r = computeBuildingReady({
    name: "우함빌딩",
    sido: "",
    sigungu: "기흥구",
    addressFull: "경기도 용인시 기흥구 …",
  });
  assert.equal(r.buildingReady, true);
  assert.equal(r.buildingSido, "경기도");
  assert.equal(r.buildingSigungu, "기흥구");
});

test("[Task #475 시나리오 A] addressFull 이 없어도 addressJibun 으로 도출", () => {
  const r = computeBuildingReady({
    name: "지번빌딩",
    sido: null,
    sigungu: null,
    addressFull: null,
    addressJibun: "부산광역시 해운대구 우동 1411",
  });
  assert.equal(r.buildingReady, true);
  assert.equal(r.buildingSido, "부산광역시");
  assert.equal(r.buildingSigungu, "해운대구");
});

test("[Task #475 시나리오 B] 이름은 있고 sido/sigungu/주소텍스트가 모두 비면 buildingReady=false (CTA 표시)", () => {
  const r = computeBuildingReady({
    name: "주소없는빌딩",
    sido: null,
    sigungu: null,
    addressFull: null,
    addressJibun: null,
  });
  assert.equal(r.buildingReady, false, "도출 불가 + 컨텍스트 없음이면 막아야 한다");
  assert.equal(r.buildingSido, "");
  assert.equal(r.buildingSigungu, "");
});

test("[Task #475 시나리오 B] 주소가 빈 문자열인 경우도 buildingReady=false", () => {
  const r = computeBuildingReady({
    name: "빈문자열빌딩",
    sido: "",
    sigungu: "",
    addressFull: "",
    addressJibun: "",
  });
  assert.equal(r.buildingReady, false);
});

test("[Task #475] 짧은 별칭 sido(\"경기\") 만 있으면 그대로 buildingReady=true (정규화는 derivation 별 이슈)", () => {
  const r = computeBuildingReady({
    name: "별칭빌딩",
    sido: "경기",
    sigungu: "",
  });
  assert.equal(r.buildingReady, true, "기존 운영 데이터의 짧은 별칭도 우선 통과시켜야 한다");
});
