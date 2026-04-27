import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveSidoSigungu } from "@workspace/shared/derive-region";

test("deriveSidoSigungu — 서울특별시 강남구 도로명", () => {
  const r = deriveSidoSigungu("서울특별시 강남구 테헤란로 123");
  assert.equal(r.sido, "서울특별시");
  assert.equal(r.sigungu, "강남구");
});

test("deriveSidoSigungu — 경기도 수원시 영통구 (복합 sigungu)", () => {
  const r = deriveSidoSigungu("경기도 수원시 영통구 광교로 145");
  assert.equal(r.sido, "경기도");
  assert.equal(r.sigungu, "수원시 영통구");
});

test("deriveSidoSigungu — 경기도 가평군 (단일 군)", () => {
  const r = deriveSidoSigungu("경기도 가평군 가평읍 ...");
  assert.equal(r.sido, "경기도");
  assert.equal(r.sigungu, "가평군");
});

test("deriveSidoSigungu — 세종특별자치시 (sigungu 없음)", () => {
  const r = deriveSidoSigungu("세종특별자치시 한누리대로 2130");
  assert.equal(r.sido, "세종특별자치시");
  assert.equal(r.sigungu, null);
});

test("deriveSidoSigungu — 짧은 별칭 정규화", () => {
  const r = deriveSidoSigungu("서울 강남구 테헤란로 123");
  assert.equal(r.sido, "서울특별시");
  assert.equal(r.sigungu, "강남구");
});

test("deriveSidoSigungu — 강원특별자치도 단일 시", () => {
  const r = deriveSidoSigungu("강원특별자치도 춘천시 중앙로 1");
  assert.equal(r.sido, "강원특별자치도");
  assert.equal(r.sigungu, "춘천시");
});

test("deriveSidoSigungu — addressFull 비고 jibun 으로 폴백", () => {
  const r = deriveSidoSigungu(null, "부산광역시 해운대구 우동 123-4");
  assert.equal(r.sido, "부산광역시");
  assert.equal(r.sigungu, "해운대구");
});

test("deriveSidoSigungu — 인식 불가 시 null/null", () => {
  const r = deriveSidoSigungu("Unknown street 123");
  assert.equal(r.sido, null);
  assert.equal(r.sigungu, null);
});

test("deriveSidoSigungu — 빈 문자열·null 입력", () => {
  assert.deepEqual(deriveSidoSigungu(null, null), { sido: null, sigungu: null });
  assert.deepEqual(deriveSidoSigungu("", ""), { sido: null, sigungu: null });
  assert.deepEqual(deriveSidoSigungu("   "), { sido: null, sigungu: null });
});

test("deriveSidoSigungu — 경기도 성남시 분당구 (복합)", () => {
  const r = deriveSidoSigungu("경기도 성남시 분당구 판교역로 235");
  assert.equal(r.sido, "경기도");
  assert.equal(r.sigungu, "성남시 분당구");
});

test("deriveSidoSigungu — 경기도 성남시만 (행정구 미포함)", () => {
  // 성남시는 일반적으로 분당/수정/중원 행정구를 갖지만, 데이터에 따라 시 단위만 있을 수 있다.
  // 이 경우는 첫 시 단위 토큰이 sigungu 가 되어야 한다.
  const r = deriveSidoSigungu("경기도 성남시 어딘가로 1");
  assert.equal(r.sido, "경기도");
  // 성남시 다음 토큰이 구/군이 아니므로 단일 토큰 sigungu = "성남시" 로 채택.
  assert.equal(r.sigungu, "성남시");
});
