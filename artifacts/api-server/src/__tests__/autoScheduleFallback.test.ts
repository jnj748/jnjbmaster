import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { TaskTemplate } from "@workspace/db";
import { computeNextDueDateFromBaseline } from "../lib/taskTemplateCycle.js";

// [Task #297] Auto-schedule onboarding fallback branches.
//   The route /buildings/auto-schedule-inspections constructs a synthetic
//   monthly TaskTemplate with intervalValue=cycleMonths and computes the
//   next due date from the building's approvalDate baseline.
//   These tests exercise that synthetic-template + baseline pipeline so a
//   regression in the onboarding fallback (blank dates + fallback ON) gets
//   caught before reaching production.

function synthMonthly(cycleMonths: number): TaskTemplate {
  return {
    frequencyType: "monthly",
    intervalValue: cycleMonths,
    fixedMonth: null,
    fixedDay: null,
    startDate: null,
    weekdays: null,
    dayOfMonth: null,
    yearInterval: null,
  } as unknown as TaskTemplate;
}

describe("auto-schedule fallback (#297)", () => {
  it("(a) all blank dates + fallback on → next due is computed from approvalDate", () => {
    // 사용승인일 2018-03-15, fire safety cycle = 12개월, today = 2026-04-23.
    // 매년 3월 15일이 anchor. today 가 4월이므로 다음 회차는 2027-03-15.
    const baseline = new Date(2018, 2, 15);
    const today = new Date(2026, 3, 23);
    const due = computeNextDueDateFromBaseline(synthMonthly(12), baseline, today);
    assert.ok(due, "fallback must produce a due date when baseline exists");
    assert.equal(due.getMonth(), 2, "month should be March");
    assert.equal(due.getDate(), 15, "day should match baseline day-of-month");
    assert.ok(due >= today, "next due must be on or after today");
  });

  it("(b) mixed: fallback baseline still produces a deterministic forward date", () => {
    // electrical cycle = 36개월. 2020-06-10 baseline, today 2026-04-23 →
    // 회차: 2020-06-10, 2023-06-10, 2026-06-10. 2026-06-10 이 today 이후이므로 정답.
    const baseline = new Date(2020, 5, 10);
    const today = new Date(2026, 3, 23);
    const due = computeNextDueDateFromBaseline(synthMonthly(36), baseline, today);
    assert.ok(due);
    assert.equal(due.getFullYear(), 2026);
    assert.equal(due.getMonth(), 5);
    assert.equal(due.getDate(), 10);
  });

  it("(c) fallback uses approvalDate baseline (not today) so result is reproducible", () => {
    // water_tank cycle = 6개월, baseline 2024-01-20. today = 2026-04-23.
    // 회차들: 1/20, 7/20 each year. today 가 4월이므로 다음 회차는 2026-07-20.
    const baseline = new Date(2024, 0, 20);
    const today = new Date(2026, 3, 23);
    const due = computeNextDueDateFromBaseline(synthMonthly(6), baseline, today);
    assert.ok(due);
    assert.equal(due.getFullYear(), 2026);
    assert.equal(due.getMonth(), 6);
    assert.equal(due.getDate(), 20);

    // Re-run a few days later within same cycle window must NOT regress.
    const due2 = computeNextDueDateFromBaseline(
      synthMonthly(6),
      baseline,
      new Date(2026, 3, 30),
    );
    assert.ok(due2);
    assert.ok(due2.getTime() === due.getTime(), "window stability");
  });
});
