// [Task #708] 호실 참조 파서 회귀 테스트.
//
// 한국식 호실 표기를 다양한 케이스로 다루며, 결과가 결정적이고 false-positive
// 가 없는지 검증한다. lib/shared 의 unit-parser 는 클라이언트 칩 미리보기와
// 서버 자동 매칭 양쪽에서 동일하게 쓰이므로 매칭 동작이 일관돼야 한다.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractUnitTokens,
  findAmbiguousUnitTokens,
  matchUnitsInMemo,
  type UnitRef,
} from "@workspace/shared/unit-parser";

const singleDongUnits: UnitRef[] = [
  { id: 101, dong: "", unitNumber: "101" },
  { id: 102, dong: "", unitNumber: "102" },
  { id: 201, dong: "", unitNumber: "201" },
];

const multiDongUnits: UnitRef[] = [
  { id: 1, dong: "1", unitNumber: "101" },
  { id: 2, dong: "1", unitNumber: "102" },
  { id: 3, dong: "2", unitNumber: "101" },
  { id: 4, dong: "A", unitNumber: "502" },
];

test("extractUnitTokens: 단일 호실 표기", () => {
  assert.deepEqual(extractUnitTokens("101호 누수 점검 완료"), [
    { dongRaw: null, unitNumberRaw: "101" },
  ]);
});

test("extractUnitTokens: 동+호실 표기", () => {
  assert.deepEqual(extractUnitTokens("1동 101호 점검"), [
    { dongRaw: "1", unitNumberRaw: "101" },
  ]);
  assert.deepEqual(extractUnitTokens("A동 502호 누수"), [
    { dongRaw: "A", unitNumberRaw: "502" },
  ]);
  assert.deepEqual(extractUnitTokens("B동102호 점검"), [
    { dongRaw: "B", unitNumberRaw: "102" },
  ]);
});

test("extractUnitTokens: 여러 호실 콤마 표기", () => {
  assert.deepEqual(extractUnitTokens("101호, 102호 누수 점검"), [
    { dongRaw: null, unitNumberRaw: "101" },
    { dongRaw: null, unitNumberRaw: "102" },
  ]);
});

test("matchUnitsInMemo: 단일 동 빌딩에서 호번만 인식", () => {
  assert.deepEqual(matchUnitsInMemo("101호 누수 확인", singleDongUnits), [101]);
});

test("matchUnitsInMemo: 단일 동 빌딩에서 여러 호실 인식", () => {
  assert.deepEqual(matchUnitsInMemo("101호, 102호 점검", singleDongUnits), [101, 102]);
});

test("matchUnitsInMemo: 다동 빌딩 — 동 명시된 메모만 매칭", () => {
  // "1동 101호" → unit id 1 만 매칭 (동 2 의 101호 와 모호하지 않음).
  assert.deepEqual(matchUnitsInMemo("1동 101호 누수", multiDongUnits), [1]);
  // "A동 502호" → unit id 4
  assert.deepEqual(matchUnitsInMemo("A동 502호 점검", multiDongUnits), [4]);
});

test("matchUnitsInMemo: 다동 빌딩 — 동 정보 없는 메모는 모호하면 매칭 안됨", () => {
  // 1동 101호 와 2동 101호 둘 다 존재 → 자동 매칭 X (사용자 칩 선택 필요).
  assert.deepEqual(matchUnitsInMemo("101호 누수", multiDongUnits), []);
  // 102호는 1동에만 존재 → 자동 매칭 OK.
  assert.deepEqual(matchUnitsInMemo("102호 점검", multiDongUnits), [2]);
});

test("matchUnitsInMemo: 같은 호실 중복 토큰은 한 번만", () => {
  assert.deepEqual(matchUnitsInMemo("101호 1차 점검, 101호 재방문", singleDongUnits), [101]);
});

test("matchUnitsInMemo: 호실 표기가 없는 메모는 빈 배열", () => {
  assert.deepEqual(matchUnitsInMemo("엘리베이터 점검 완료", singleDongUnits), []);
});

test("matchUnitsInMemo: 빌딩에 없는 호실은 무시", () => {
  assert.deepEqual(matchUnitsInMemo("999호 점검", singleDongUnits), []);
});

test("matchUnitsInMemo: 다동+동명시 + 콤마 혼합", () => {
  assert.deepEqual(
    matchUnitsInMemo("1동 101호, 2동 101호 누수 점검", multiDongUnits),
    [1, 3],
  );
});

// [Task #708 회귀] 동 식별자가 여러 자릿수일 때(101동, 201동, 301동 같은
// 단지형 빌딩) 동 정규화가 마지막 한 글자만 남기던 버그를 막는다.
const numericDongUnits: UnitRef[] = [
  { id: 11, dong: "101", unitNumber: "101" },
  { id: 12, dong: "101", unitNumber: "201" },
  { id: 21, dong: "201", unitNumber: "101" },
  { id: 22, dong: "201", unitNumber: "201" },
  { id: 31, dong: "301", unitNumber: "101" },
];

test("matchUnitsInMemo: 다자리 숫자 동(101동/201동) 충돌 없이 매칭", () => {
  // "101동 201호" → unit id 12 (101동의 201호) 만 매칭. 이전 버그라면
  // 101동/201동/301동이 모두 "1" 로 정규화되어 첫 번째에 잘못 매칭됐다.
  assert.deepEqual(
    matchUnitsInMemo("101동 201호 누수", numericDongUnits),
    [12],
  );
  assert.deepEqual(
    matchUnitsInMemo("201동 101호 점검", numericDongUnits),
    [21],
  );
  assert.deepEqual(
    matchUnitsInMemo("301동 101호, 101동 101호 점검", numericDongUnits),
    [31, 11],
  );
});

test("matchUnitsInMemo: 다자리 숫자 동에서 동 미명시 호번은 모호 시 매칭 안됨", () => {
  // "201호" 는 101동/201동 양쪽에 존재 → 모호 → 매칭 X.
  assert.deepEqual(matchUnitsInMemo("201호 누수", numericDongUnits), []);
});

// [Task #713] 모호 토큰 식별기 — 추천 엔드포인트의 입력으로 사용된다.
test("findAmbiguousUnitTokens: 다동 빌딩에서 동 미명시 모호 토큰만 추출", () => {
  // 101 호는 1동/2동 양쪽에 있어 모호.
  // 102 호는 1동에만 있어 모호 아님 (자동 매칭됨).
  // 1동 101호는 명시적이라 모호 아님.
  assert.deepEqual(
    findAmbiguousUnitTokens("101호 점검, 102호 청소, 1동 101호 누수", multiDongUnits),
    [{ unitNumberRaw: "101", candidateUnitIds: [1, 3] }],
  );
});

test("findAmbiguousUnitTokens: 단일 동 빌딩은 빈 배열", () => {
  // 단일 동 빌딩에서는 호번만으로 늘 일의적 — 모호 토큰 없음.
  assert.deepEqual(findAmbiguousUnitTokens("101호 누수", singleDongUnits), []);
});

test("findAmbiguousUnitTokens: 호실 표기 없는 메모는 빈 배열", () => {
  assert.deepEqual(findAmbiguousUnitTokens("엘리베이터 점검", multiDongUnits), []);
});

test("findAmbiguousUnitTokens: 빌딩에 없는 호번은 모호로 잡지 않음", () => {
  // 999 호는 어떤 동에도 없음 → 추천 후보 자체가 없으니 모호로 분류 X.
  assert.deepEqual(findAmbiguousUnitTokens("999호 점검", multiDongUnits), []);
});

test("findAmbiguousUnitTokens: 동일 모호 호번 중복은 한 번만", () => {
  assert.deepEqual(
    findAmbiguousUnitTokens("101호 1차, 101호 2차", multiDongUnits),
    [{ unitNumberRaw: "101", candidateUnitIds: [1, 3] }],
  );
});
