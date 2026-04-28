// [Task #568] resolveRegisterFields: 화이트리스트 그룹 + 자동 "기타" 그룹 동작 검증.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoFormatRegisterValue,
  resolveRegisterFields,
  type RegisterRaw,
} from "./building-register-labels";

function findGroup(
  groups: ReturnType<typeof resolveRegisterFields>,
  title: string,
) {
  const g = groups.find((x) => x.title === title);
  return g ?? null;
}

function findRow(
  groups: ReturnType<typeof resolveRegisterFields>,
  groupTitle: string,
  label: string,
) {
  const g = findGroup(groups, groupTitle);
  if (!g) return null;
  return g.rows.find((r) => r.label === label) ?? null;
}

test("resolveRegisterFields: empty/null/undefined returns empty array", () => {
  assert.deepEqual(resolveRegisterFields(null), []);
  assert.deepEqual(resolveRegisterFields(undefined), []);
  assert.deepEqual(resolveRegisterFields({}), []);
  assert.deepEqual(resolveRegisterFields({ title: null, recap: null }), []);
});

test("resolveRegisterFields: whitelisted title fields render with korean labels and units", () => {
  const raw: RegisterRaw = {
    title: {
      heit: 25.4,
      vlRatEstmTotArea: 12345.67,
      hoCnt: 48,
      pmsDay: "20230315",
      rserthqkDsgnApplyYn: "Y",
      engrGrade: "1++",
    },
    recap: null,
  };
  const groups = resolveRegisterFields(raw);
  // 규모
  assert.equal(findRow(groups, "규모", "건물 높이")?.display, "25.4m");
  assert.equal(
    findRow(groups, "규모", "용적률 산정 연면적")?.display,
    "12,345.67㎡",
  );
  assert.equal(findRow(groups, "규모", "호수")?.display, "48호");
  // 허가·승인 일정
  assert.equal(
    findRow(groups, "허가·승인 일정", "허가일")?.display,
    "2023-03-15",
  );
  // 내진
  assert.equal(
    findRow(groups, "내진", "내진설계 적용")?.display,
    "적용",
  );
  // 에너지·친환경
  assert.equal(
    findRow(groups, "에너지·친환경", "에너지효율 등급")?.display,
    "1++",
  );
});

test("resolveRegisterFields: zero numeric whitelisted values are kept (not hidden)", () => {
  const raw: RegisterRaw = {
    title: {
      indrAutoUtcnt: 0,
      indrAutoArea: 0,
    },
  };
  const groups = resolveRegisterFields(raw);
  assert.equal(
    findRow(groups, "주차 상세", "옥내 자주식 (대)")?.display,
    "0대",
  );
  assert.equal(
    findRow(groups, "주차 상세", "옥내 자주식 면적")?.display,
    "0㎡",
  );
});

test("resolveRegisterFields: empty strings and nullish whitelisted values are skipped", () => {
  const raw: RegisterRaw = {
    title: {
      heit: "",
      engrGrade: null,
      etcRoof: "   ",
    },
  };
  const groups = resolveRegisterFields(raw);
  // 모두 빈 값이라 그룹 자체가 누락된다.
  assert.equal(findGroup(groups, "규모"), null);
  assert.equal(findGroup(groups, "에너지·친환경"), null);
  assert.equal(findGroup(groups, "구조·지붕"), null);
});

test("resolveRegisterFields: any-source picks title first then recap fallback", () => {
  const raw: RegisterRaw = {
    title: { useAprDay: null },
    recap: { useAprDay: "20200101" },
  };
  const groups = resolveRegisterFields(raw);
  assert.equal(
    findRow(groups, "허가·승인 일정", "사용승인일")?.display,
    "2020-01-01",
  );
});

test("resolveRegisterFields: non-whitelisted title keys go into '기타 (표제부)' group", () => {
  const raw: RegisterRaw = {
    title: {
      // whitelist
      heit: 10,
      // non-whitelist
      mysteryNumber: 42,
      mysteryDate: "19990201",
      mysteryFlag: "N",
      mysteryText: "hello",
    },
  };
  const groups = resolveRegisterFields(raw);
  const etc = findGroup(groups, "기타 (표제부)");
  assert.ok(etc, "기타 (표제부) 그룹이 존재해야 한다");
  assert.equal(findRow(groups, "기타 (표제부)", "mysteryNumber")?.display, "42");
  assert.equal(
    findRow(groups, "기타 (표제부)", "mysteryDate")?.display,
    "1999-02-01",
  );
  assert.equal(
    findRow(groups, "기타 (표제부)", "mysteryFlag")?.display,
    "미적용",
  );
  assert.equal(
    findRow(groups, "기타 (표제부)", "mysteryText")?.display,
    "hello",
  );
  // whitelist key 는 기타 그룹에 다시 등장하지 않는다.
  assert.equal(findRow(groups, "기타 (표제부)", "heit"), null);
});

test("resolveRegisterFields: non-whitelisted recap keys go into '기타 (총괄표제부)' group", () => {
  const raw: RegisterRaw = {
    recap: {
      atchBldCnt: 0, // whitelist (recap 분류 가능)
      summaryNote: "보충 메모",
      summaryEmpty: "",
      summaryObject: {}, // 빈 객체 → 숨김
      summaryList: [], // 빈 배열 → 숨김
      summaryItems: [{ a: 1 }],
      summaryDetail: { code: "X" },
    },
  };
  const groups = resolveRegisterFields(raw);
  const etc = findGroup(groups, "기타 (총괄표제부)");
  assert.ok(etc, "기타 (총괄표제부) 그룹이 존재해야 한다");
  assert.equal(
    findRow(groups, "기타 (총괄표제부)", "summaryNote")?.display,
    "보충 메모",
  );
  assert.equal(findRow(groups, "기타 (총괄표제부)", "summaryEmpty"), null);
  assert.equal(findRow(groups, "기타 (총괄표제부)", "summaryObject"), null);
  assert.equal(findRow(groups, "기타 (총괄표제부)", "summaryList"), null);
  assert.equal(
    findRow(groups, "기타 (총괄표제부)", "summaryItems")?.display,
    JSON.stringify([{ a: 1 }]),
  );
  assert.equal(
    findRow(groups, "기타 (총괄표제부)", "summaryDetail")?.display,
    JSON.stringify({ code: "X" }),
  );
  // whitelist 키는 기타 그룹에 등장하지 않는다.
  assert.equal(findRow(groups, "기타 (총괄표제부)", "atchBldCnt"), null);
});

test("resolveRegisterFields: same key on both title/recap is consumed from both 기타 groups", () => {
  const raw: RegisterRaw = {
    title: { useAprDay: "20200101", commonExtra: "T-side" },
    recap: { useAprDay: "20200101", commonExtra: "R-side" },
  };
  const groups = resolveRegisterFields(raw);
  // useAprDay 는 화이트리스트에 있으므로 양쪽 모두 기타에서 제거.
  assert.equal(findRow(groups, "기타 (표제부)", "useAprDay"), null);
  assert.equal(findRow(groups, "기타 (총괄표제부)", "useAprDay"), null);
  // commonExtra 는 화이트리스트가 아니므로 양쪽 모두 노출.
  assert.equal(
    findRow(groups, "기타 (표제부)", "commonExtra")?.display,
    "T-side",
  );
  assert.equal(
    findRow(groups, "기타 (총괄표제부)", "commonExtra")?.display,
    "R-side",
  );
});

test("autoFormatRegisterValue: edge cases", () => {
  // null/undefined/empty
  assert.equal(autoFormatRegisterValue(null), "");
  assert.equal(autoFormatRegisterValue(undefined), "");
  assert.equal(autoFormatRegisterValue(""), "");
  assert.equal(autoFormatRegisterValue("   "), "");
  // YYYYMMDD
  assert.equal(autoFormatRegisterValue("20240115"), "2024-01-15");
  // 8 digits but not date-like still treated as date — that's the trade-off.
  assert.equal(autoFormatRegisterValue("12345678"), "1234-56-78");
  // Y / N
  assert.equal(autoFormatRegisterValue("Y"), "적용");
  assert.equal(autoFormatRegisterValue("N"), "미적용");
  // numbers
  assert.equal(autoFormatRegisterValue(1234567), "1,234,567");
  assert.equal(autoFormatRegisterValue("9876543"), "9,876,543");
  assert.equal(autoFormatRegisterValue(0), "0");
  assert.equal(autoFormatRegisterValue(NaN), "");
  // booleans
  assert.equal(autoFormatRegisterValue(true), "예");
  assert.equal(autoFormatRegisterValue(false), "아니오");
  // arrays / objects
  assert.equal(autoFormatRegisterValue([]), "");
  assert.equal(autoFormatRegisterValue({}), "");
  assert.equal(autoFormatRegisterValue([1, 2]), "[1,2]");
  assert.equal(autoFormatRegisterValue({ a: 1 }), '{"a":1}');
  // plain text
  assert.equal(autoFormatRegisterValue("hello world"), "hello world");
});

test("resolveRegisterFields: completely empty title/recap objects produce no '기타' group", () => {
  const raw: RegisterRaw = {
    title: {},
    recap: {},
  };
  assert.deepEqual(resolveRegisterFields(raw), []);
});

test("resolveRegisterFields: ordering is stable — alphabetical inside 기타 group", () => {
  const raw: RegisterRaw = {
    title: {
      zKey: "z",
      aKey: "a",
      mKey: "m",
    },
  };
  const groups = resolveRegisterFields(raw);
  const etc = findGroup(groups, "기타 (표제부)");
  assert.ok(etc);
  assert.deepEqual(
    etc!.rows.map((r) => r.label),
    ["aKey", "mKey", "zKey"],
  );
});
