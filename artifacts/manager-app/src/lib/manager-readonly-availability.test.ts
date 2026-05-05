// [Task #861] 관리소장 "회계 결과 열람" 그룹의 데이터-가용성 기반 자동 숨김 테스트.
//
// getSidebarSections 의 4번째 인자 readonlyAvailability 가 어떻게 7개 readonly 항목의
// 사이드바 노출 여부를 제어하는지 검증한다:
//  - 인자 미전달(undefined) / 빈 객체 → 기존 동작(7개 모두 노출).
//  - 일부 path → false → 그 path 만 사이드바에서 제거.
//  - 데이터 추가 후 path → true → 다시 노출(자연 회복).
//  - manager 가 아닌 역할(accountant 등)에는 영향 없음.

import { test } from "node:test";
import assert from "node:assert/strict";

import { getSidebarSections } from "./permissions.js";

const READONLY_TITLE = "회계 결과 열람";
const READONLY_PATHS = [
  "/billing/summary",
  "/billing/notices",
  "/erp/fees-summary",
  "/receivables/overdue",
  "/erp/metering",
  "/closing",
  "/tax",
];

function readonlyPathsInManagerSidebar(
  availability?: Record<string, boolean>,
): string[] {
  const sections = getSidebarSections("manager", [], [], availability);
  const sec = sections.find((s) => s.title === READONLY_TITLE);
  if (!sec) return [];
  return sec.items.map((it) => it.path);
}

test("availability 미전달이면 7개 readonly 항목이 모두 노출된다(폴백 안전)", () => {
  const paths = readonlyPathsInManagerSidebar(undefined);
  for (const p of READONLY_PATHS) {
    assert.ok(paths.includes(p), `expected ${p} to be visible by default`);
  }
});

test("빈 availability({}) 도 미로드로 간주되어 모두 노출된다", () => {
  const paths = readonlyPathsInManagerSidebar({});
  for (const p of READONLY_PATHS) {
    assert.ok(paths.includes(p), `expected ${p} to be visible when availability is empty`);
  }
});

test("availability=false 인 path 는 사이드바에서 제거된다", () => {
  const availability: Record<string, boolean> = {
    "/billing/summary": false,
    "/billing/notices": false,
    "/erp/fees-summary": false,
    "/receivables/overdue": false,
    "/erp/metering": false,
    "/closing": false,
    "/tax": false,
  };
  const paths = readonlyPathsInManagerSidebar(availability);
  assert.equal(paths.length, 0, `expected all readonly items hidden, got ${paths.join(",")}`);
});

test("availability 일부 false 인 경우 그 항목만 숨김", () => {
  const availability: Record<string, boolean> = {
    "/billing/summary": true,
    "/billing/notices": false,
    "/erp/fees-summary": true,
    "/receivables/overdue": false,
    "/erp/metering": true,
    "/closing": false,
    "/tax": true,
  };
  const paths = readonlyPathsInManagerSidebar(availability);
  assert.deepEqual(paths.sort(), [
    "/billing/summary",
    "/erp/fees-summary",
    "/erp/metering",
    "/tax",
  ].sort());
});

test("데이터 생성 후 true 로 바뀌면 다시 노출된다(자연 회복)", () => {
  const before: Record<string, boolean> = {
    "/billing/summary": false,
    "/erp/metering": false,
    "/closing": false,
  };
  const beforePaths = readonlyPathsInManagerSidebar(before);
  assert.ok(!beforePaths.includes("/billing/summary"));
  assert.ok(!beforePaths.includes("/erp/metering"));
  assert.ok(!beforePaths.includes("/closing"));

  const after: Record<string, boolean> = {
    "/billing/summary": true,
    "/erp/metering": true,
    "/closing": true,
  };
  const afterPaths = readonlyPathsInManagerSidebar(after);
  assert.ok(afterPaths.includes("/billing/summary"));
  assert.ok(afterPaths.includes("/erp/metering"));
  assert.ok(afterPaths.includes("/closing"));
});

test("availability 키가 없는 path 는 기본(노출)으로 폴백한다", () => {
  // availability 에 일부 키만 들어 있는 부분 응답에서도 누락 키는 숨기지 않는다.
  const availability: Record<string, boolean> = {
    "/billing/summary": false,
  };
  const paths = readonlyPathsInManagerSidebar(availability);
  assert.ok(!paths.includes("/billing/summary"));
  // 나머지 6개는 노출되어야 한다.
  for (const p of READONLY_PATHS.filter((p) => p !== "/billing/summary")) {
    assert.ok(paths.includes(p), `expected ${p} to remain visible (key missing in availability)`);
  }
});

test("manager 가 아닌 역할(accountant)은 readonlyAvailability 무시 — 기존 사이드바 변동 없음", () => {
  // accountant 사이드바는 별도 빌더(accountantSidebar)에서 구성되며,
  // accounting_readonly 그룹 자체가 access:["manager"] 이므로 등장하지 않는다.
  // availability 를 모두 false 로 줘도 accountant 사이드바는 영향이 없어야 한다.
  const baseline = getSidebarSections("accountant", [], []);
  const allFalse: Record<string, boolean> = Object.fromEntries(
    READONLY_PATHS.map((p) => [p, false]),
  );
  const filtered = getSidebarSections("accountant", [], [], allFalse);
  assert.deepEqual(
    filtered.map((s) => ({ title: s.title, paths: s.items.map((it) => it.path) })),
    baseline.map((s) => ({ title: s.title, paths: s.items.map((it) => it.path) })),
  );
});

test("일부만 노출 시 '회계 결과 열람' 그룹 헤더는 유지된다", () => {
  const availability: Record<string, boolean> = {
    "/billing/summary": false,
    "/billing/notices": false,
    "/erp/fees-summary": false,
    "/receivables/overdue": false,
    "/erp/metering": false,
    "/closing": false,
    "/tax": true,
  };
  const sections = getSidebarSections("manager", [], [], availability);
  const sec = sections.find((s) => s.title === READONLY_TITLE);
  assert.ok(sec, "expected '회계 결과 열람' header to remain when at least one item is visible");
  assert.deepEqual(sec!.items.map((it) => it.path), ["/tax"]);
});

test("전부 false 면 '회계 결과 열람' 그룹 헤더 자체도 사라진다", () => {
  const availability: Record<string, boolean> = Object.fromEntries(
    READONLY_PATHS.map((p) => [p, false]),
  );
  const sections = getSidebarSections("manager", [], [], availability);
  const sec = sections.find((s) => s.title === READONLY_TITLE);
  assert.equal(sec, undefined, "expected '회계 결과 열람' section to disappear when all 7 items are hidden");
});
