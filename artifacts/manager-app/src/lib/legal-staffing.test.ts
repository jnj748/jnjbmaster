import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyLegalStaffing,
  daysUntil,
  ELECTRICAL_REQUIRED_KW,
  ELECTRICAL_HIGH_VOLTAGE_KW,
  FIRE_GRADE_1_AREA,
  FIRE_GRADE_2_AREA,
  FIRE_GRADE_3_AREA,
  MECH_REQUIRED_AREA,
  TELECOM_REQUIRED_AREA,
} from "./legal-staffing";

function pick(items: ReturnType<typeof classifyLegalStaffing>, field: string) {
  const it = items.find((x) => x.field === field);
  if (!it) throw new Error(`field not found: ${field}`);
  return it;
}

test("electrical: < 75kW → 선임 불요", () => {
  const items = classifyLegalStaffing({ electricCapacityKw: ELECTRICAL_REQUIRED_KW - 1 });
  const e = pick(items, "electrical");
  assert.equal(e.required, false);
  assert.equal(e.grade, null);
});

test("electrical: 75kW boundary → 3종(저압) required", () => {
  const items = classifyLegalStaffing({ electricCapacityKw: ELECTRICAL_REQUIRED_KW });
  const e = pick(items, "electrical");
  assert.equal(e.required, true);
  assert.match(e.grade ?? "", /3종/);
});

test("electrical: 1999kW → 3종(저압)", () => {
  const items = classifyLegalStaffing({ electricCapacityKw: ELECTRICAL_HIGH_VOLTAGE_KW - 1 });
  const e = pick(items, "electrical");
  assert.equal(e.required, true);
  assert.match(e.grade ?? "", /3종/);
});

test("electrical: 2000kW boundary → 1·2종(특고압)", () => {
  const items = classifyLegalStaffing({ electricCapacityKw: ELECTRICAL_HIGH_VOLTAGE_KW });
  const e = pick(items, "electrical");
  assert.equal(e.required, true);
  assert.match(e.grade ?? "", /특고압/);
});

test("fire: < 1500㎡ → 선임 불요", () => {
  const items = classifyLegalStaffing({ totalArea: FIRE_GRADE_3_AREA - 1 });
  const f = pick(items, "fire_safety");
  assert.equal(f.required, false);
});

test("fire: 1500㎡ boundary → 3급", () => {
  const items = classifyLegalStaffing({ totalArea: FIRE_GRADE_3_AREA });
  const f = pick(items, "fire_safety");
  assert.equal(f.required, true);
  assert.match(f.grade ?? "", /3급/);
});

test("fire: 5000㎡ boundary → 2급", () => {
  const items = classifyLegalStaffing({ totalArea: FIRE_GRADE_2_AREA });
  const f = pick(items, "fire_safety");
  assert.match(f.grade ?? "", /2급/);
});

test("fire: 14999㎡ → 2급, 15000㎡ → 1급", () => {
  const a = classifyLegalStaffing({ totalArea: FIRE_GRADE_1_AREA - 1 });
  assert.match(pick(a, "fire_safety").grade ?? "", /2급/);
  const b = classifyLegalStaffing({ totalArea: FIRE_GRADE_1_AREA });
  assert.match(pick(b, "fire_safety").grade ?? "", /1급/);
});

test("mechanical: 9999㎡ → 선임 불요, 10000㎡ → required", () => {
  assert.equal(pick(classifyLegalStaffing({ totalArea: MECH_REQUIRED_AREA - 1 }), "mechanical").required, false);
  assert.equal(pick(classifyLegalStaffing({ totalArea: MECH_REQUIRED_AREA }), "mechanical").required, true);
});

test("telecom: 4999㎡ → 선임 불요, 5000㎡ → required", () => {
  assert.equal(pick(classifyLegalStaffing({ totalArea: TELECOM_REQUIRED_AREA - 1 }), "telecom").required, false);
  assert.equal(pick(classifyLegalStaffing({ totalArea: TELECOM_REQUIRED_AREA }), "telecom").required, true);
});

test("appointee: required + no appointee → appointee=null", () => {
  const items = classifyLegalStaffing({ totalArea: FIRE_GRADE_1_AREA, electricCapacityKw: 100 });
  assert.equal(pick(items, "fire_safety").appointee, null);
  assert.equal(pick(items, "electrical").appointee, null);
});

test("appointee: passed appointee is propagated", () => {
  const items = classifyLegalStaffing(
    { totalArea: FIRE_GRADE_1_AREA, electricCapacityKw: 100 },
    { electrical: { name: "홍길동", certificateExpiry: "2030-01-01" } },
  );
  const e = pick(items, "electrical");
  assert.equal(e.appointee?.name, "홍길동");
});

test("string inputs are coerced to numbers", () => {
  const items = classifyLegalStaffing({ totalArea: "15000", electricCapacityKw: "75" });
  assert.equal(pick(items, "fire_safety").required, true);
  assert.equal(pick(items, "electrical").required, true);
});

test("empty/null spec → all not required", () => {
  const items = classifyLegalStaffing({ totalArea: null, electricCapacityKw: null });
  for (const it of items) assert.equal(it.required, false);
});

test("daysUntil: null/invalid → null", () => {
  assert.equal(daysUntil(null), null);
  assert.equal(daysUntil(""), null);
  assert.equal(daysUntil("not-a-date"), null);
});

test("daysUntil: today → 0, tomorrow → 1, yesterday → -1", () => {
  const now = new Date(2026, 3, 18);
  assert.equal(daysUntil("2026-04-18", now), 0);
  assert.equal(daysUntil("2026-04-19", now), 1);
  assert.equal(daysUntil("2026-04-17", now), -1);
});

test("daysUntil: 30 days ahead → 30", () => {
  const now = new Date(2026, 3, 18);
  assert.equal(daysUntil("2026-05-18", now), 30);
});
