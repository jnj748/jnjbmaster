import { test } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test:test@localhost:5432/test";

const { __test } = await import("../routes/aiAssistant/index.js");
const { stripEnglishKeyParens, ParenSanitizer } = __test;

test("stripEnglishKeyParens removes camelCase / dot-notation keys", () => {
  assert.equal(
    stripEnglishKeyParens("총 100세대 (building.totalUnits)입니다."),
    "총 100세대입니다."
  );
  assert.equal(
    stripEnglishKeyParens("최근 일지(recentMaintenance)를 보면"),
    "최근 일지를 보면"
  );
  assert.equal(
    stripEnglishKeyParens("관리비(monthlyBills.latest)는 100원"),
    "관리비는 100원"
  );
  assert.equal(
    stripEnglishKeyParens("참고(buildings.total_units)에 따르면"),
    "참고에 따르면"
  );
});

test("stripEnglishKeyParens preserves Korean parentheticals", () => {
  assert.equal(
    stripEnglishKeyParens("보증 항목(승강기) 만료."),
    "보증 항목(승강기) 만료."
  );
  assert.equal(
    stripEnglishKeyParens("예시(예: 승강기)입니다"),
    "예시(예: 승강기)입니다"
  );
});

test("stripEnglishKeyParens preserves number/date parentheticals", () => {
  assert.equal(
    stripEnglishKeyParens("최근 자료(2026-01) 기준입니다."),
    "최근 자료(2026-01) 기준입니다."
  );
  assert.equal(
    stripEnglishKeyParens("총 (123)건"),
    "총 (123)건"
  );
});

test("stripEnglishKeyParens preserves all-uppercase acronyms", () => {
  assert.equal(stripEnglishKeyParens("조명(LED) 교체"), "조명(LED) 교체");
  assert.equal(stripEnglishKeyParens("(A/S) 접수"), "(A/S) 접수");
  assert.equal(stripEnglishKeyParens("(CCTV) 점검"), "(CCTV) 점검");
});

test("stripEnglishKeyParens handles fullwidth parentheses", () => {
  assert.equal(
    stripEnglishKeyParens("총 100세대 （building.totalUnits）입니다."),
    "총 100세대입니다."
  );
});

test("ParenSanitizer handles split chunks across an unclosed paren", () => {
  const s = new ParenSanitizer();
  let out = "";
  out += s.push("총 100세대 (building.");
  out += s.push("totalUnits)입니다.");
  out += s.flush();
  assert.equal(out, "총 100세대입니다.");
});

test("ParenSanitizer streams safely when no parens are involved", () => {
  const s = new ParenSanitizer();
  let out = "";
  out += s.push("최근 ");
  out += s.push("등록된 ");
  out += s.push("관리비는 100원입니다.");
  out += s.flush();
  assert.equal(out, "최근 등록된 관리비는 100원입니다.");
});

test("ParenSanitizer preserves Korean parens across chunk boundaries", () => {
  const s = new ParenSanitizer();
  let out = "";
  out += s.push("보증 항목(승");
  out += s.push("강기) 만료.");
  out += s.flush();
  assert.equal(out, "보증 항목(승강기) 만료.");
});

test("ParenSanitizer leaves dangling unclosed parens untouched on flush", () => {
  // An unclosed paren cannot be evaluated; flush should preserve it as-is
  // rather than guessing at what the model intended.
  const s = new ParenSanitizer();
  let out = "";
  out += s.push("문장 끝 (camelCase");
  out += s.flush();
  assert.equal(out, "문장 끝 (camelCase");
});
