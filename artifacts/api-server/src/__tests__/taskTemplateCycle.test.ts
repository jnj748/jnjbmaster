import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { TaskTemplate } from "@workspace/db";
import {
  computeNextDueDate,
  computeNextDueDateFromBaseline,
} from "../lib/taskTemplateCycle.js";

function tpl(overrides: Partial<TaskTemplate>): TaskTemplate {
  return {
    id: 1,
    title: "t",
    description: null,
    category: "mandatory",
    classification: "internal",
    taskType: "facility",
    iconName: null,
    color: null,
    frequencyType: "monthly",
    intervalValue: 1,
    fixedMonth: null,
    fixedDay: null,
    startDate: null,
    weekdays: null,
    dayOfMonth: null,
    yearInterval: null,
    nthWeek: null,
    nthWeekday: null,
    scopeType: "all",
    scopeValues: [],
    buildingUsageScopes: [],
    targetRoles: null,
    priority: 50,
    advanceAlertDays: 7,
    isActive: true,
    metadata: {},
    createdBy: null,
    createdByName: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as TaskTemplate;
}

describe("computeNextDueDate", () => {
  it("monthly with dayOfMonth (#297) anchors within current month", () => {
    const t = tpl({ frequencyType: "monthly", dayOfMonth: 15 });
    const d = computeNextDueDate(t, new Date(2026, 3, 22));
    assert.equal(d?.getFullYear(), 2026);
    assert.equal(d?.getMonth(), 4);
    assert.equal(d?.getDate(), 15);
  });

  it("monthly with legacy fixedDay still anchors within current month", () => {
    const t = tpl({ frequencyType: "monthly", fixedDay: 15 });
    const d = computeNextDueDate(t, new Date(2026, 3, 22));
    assert.equal(d?.getMonth(), 4);
    assert.equal(d?.getDate(), 15);
  });

  it("weekly with weekdays returns the closest matching day", () => {
    // 2026-04-22 is a Wednesday. Selecting [1=Mon, 5=Fri] → expect Friday Apr 24.
    const t = tpl({ frequencyType: "weekly", weekdays: [1, 5] });
    const d = computeNextDueDate(t, new Date(2026, 3, 22));
    assert.equal(d?.getDay(), 5);
    assert.equal(d?.getDate(), 24);
  });

  // [Task #302]
  it("biweekly with weekday=1 (Mon) and startDate jumps in 14-day steps", () => {
    // 2026-04-06 (월) anchor; today=2026-04-23 (목) → next due = 2026-05-04 (월).
    const t = tpl({
      frequencyType: "biweekly",
      weekdays: [1],
      startDate: "2026-04-06",
    });
    const d = computeNextDueDate(t, new Date(2026, 3, 23));
    assert.equal(d?.getFullYear(), 2026);
    assert.equal(d?.getMonth(), 4);
    assert.equal(d?.getDate(), 4);
    assert.equal(d?.getDay(), 1);
  });

  // [Task #302]
  it("monthly_nth_weekday: 1st Monday of month rolls to next month after passing", () => {
    // 2026-04 의 첫째 월요일은 4/6. today=4/23 이므로 다음달(2026-05) 첫째 월요일=5/4.
    const t = tpl({
      frequencyType: "monthly_nth_weekday",
      nthWeek: 1,
      nthWeekday: 1,
    });
    const d = computeNextDueDate(t, new Date(2026, 3, 23));
    assert.equal(d?.getFullYear(), 2026);
    assert.equal(d?.getMonth(), 4);
    assert.equal(d?.getDate(), 4);
  });

  // [Task #302]
  it("monthly_nth_weekday: skips months without 5th occurrence of weekday", () => {
    // 2026-02 (28일) 의 5번째 일요일은 없음. 2026-03 의 5번째 일요일=3/29.
    const t = tpl({
      frequencyType: "monthly_nth_weekday",
      nthWeek: 5,
      nthWeekday: 0,
    });
    const d = computeNextDueDate(t, new Date(2026, 1, 1));
    assert.equal(d?.getFullYear(), 2026);
    assert.equal(d?.getMonth(), 2);
    assert.equal(d?.getDate(), 29);
    assert.equal(d?.getDay(), 0);
  });

  // [Task #302] biweekly 는 startDate 가 캐노니컬 anchor: weekdays 와 어긋나도
  //   계산은 startDate 에서 14일 단위로만 진행한다.
  it("biweekly anchors to startDate exactly (weekdays metadata is ignored for math)", () => {
    // startDate=2026-04-08 (수). today=2026-04-23 → 2026-04-22 anchor+14 → 2026-04-22? 실제: 4/8+14=4/22, 4/22<4/23 → +14 = 5/6.
    const t = tpl({
      frequencyType: "biweekly",
      weekdays: [1], // 월(불일치) — 무시되어야 함
      startDate: "2026-04-08",
    });
    const d = computeNextDueDate(t, new Date(2026, 3, 23));
    assert.equal(d?.getFullYear(), 2026);
    assert.equal(d?.getMonth(), 4);
    assert.equal(d?.getDate(), 6);
    assert.equal(d?.getDay(), 3);
  });

  // [Task #302]
  it("monthly_nth_weekday: last Friday of current month works correctly", () => {
    // 2026-04 의 마지막 금요일은 4/24. today=4/20 → 4/24.
    const t = tpl({
      frequencyType: "monthly_nth_weekday",
      nthWeek: -1,
      nthWeekday: 5,
    });
    const d = computeNextDueDate(t, new Date(2026, 3, 20));
    assert.equal(d?.getFullYear(), 2026);
    assert.equal(d?.getMonth(), 3);
    assert.equal(d?.getDate(), 24);
    assert.equal(d?.getDay(), 5);
  });

  it("annual with yearInterval=2 walks forward by 24 months", () => {
    const t = tpl({
      frequencyType: "annual",
      yearInterval: 2,
      startDate: new Date(2024, 5, 1).toISOString().slice(0, 10),
    });
    const d = computeNextDueDate(t, new Date(2026, 3, 22));
    assert.equal(d?.getFullYear(), 2026);
    assert.equal(d?.getMonth(), 5);
    assert.equal(d?.getDate(), 1);
  });

  it("quarterly with fixedMonth+fixedDay anchors deterministically", () => {
    const t = tpl({ frequencyType: "quarterly", fixedMonth: 1, fixedDay: 25 });
    const d = computeNextDueDate(t, new Date(2026, 3, 22));
    assert.equal(d?.getMonth(), 3);
    assert.equal(d?.getDate(), 25);
  });

  it("quarterly without anchors does NOT regress between calls", () => {
    const t = tpl({ frequencyType: "quarterly", fixedDay: 10 });
    const apr22 = computeNextDueDate(t, new Date(2026, 3, 22));
    const may1 = computeNextDueDate(t, new Date(2026, 4, 1));
    assert.ok(apr22 && may1);
    assert.ok(may1.getTime() >= apr22.getTime(), `regression: ${apr22} -> ${may1}`);
  });

  it("annual with fixedMonth+fixedDay anchors to that day this year if future, else next year", () => {
    const t = tpl({ frequencyType: "annual", fixedMonth: 12, fixedDay: 31 });
    const d = computeNextDueDate(t, new Date(2026, 3, 22));
    assert.equal(d?.getFullYear(), 2026);
    assert.equal(d?.getMonth(), 11);
    assert.equal(d?.getDate(), 31);

    const d2 = computeNextDueDate(t, new Date(2027, 0, 5));
    assert.equal(d2?.getFullYear(), 2027);
    assert.equal(d2?.getMonth(), 11);
    assert.equal(d2?.getDate(), 31);
  });

  it("semiannual with fixedMonth=1 fixedDay=15 picks Jul 15 after Jan 15 passes", () => {
    const t = tpl({ frequencyType: "semiannual", fixedMonth: 1, fixedDay: 15 });
    const d = computeNextDueDate(t, new Date(2026, 3, 22));
    assert.equal(d?.getMonth(), 6);
    assert.equal(d?.getDate(), 15);
  });

  it("weekly with startDate steps in 7-day intervals", () => {
    const t = tpl({
      frequencyType: "weekly",
      intervalValue: 1,
      startDate: new Date(2026, 0, 5).toISOString().slice(0, 10),
    });
    const d = computeNextDueDate(t, new Date(2026, 3, 22));
    assert.ok(d);
    const diff = (d.getTime() - new Date(2026, 0, 5).getTime()) / 86400000;
    assert.equal(diff % 7, 0);
    assert.ok(d >= new Date(2026, 3, 22));
  });

  it("one_time returns startDate (or null when missing)", () => {
    assert.equal(computeNextDueDate(tpl({ frequencyType: "one_time" }), new Date()), null);
    const d = computeNextDueDate(
      tpl({ frequencyType: "one_time", startDate: new Date(2026, 5, 1).toISOString().slice(0, 10) }),
      new Date(2026, 3, 22)
    );
    assert.equal(d?.getMonth(), 5);
    assert.equal(d?.getDate(), 1);
  });
});

describe("computeNextDueDateFromBaseline (사용승인일 기반)", () => {
  it("monthly with dayOfMonth=15 from baseline 2020-01-15 lands on next month's 15", () => {
    const t = tpl({ frequencyType: "monthly", dayOfMonth: 15 });
    const d = computeNextDueDateFromBaseline(t, new Date(2020, 0, 15), new Date(2026, 3, 22));
    assert.equal(d?.getFullYear(), 2026);
    assert.equal(d?.getMonth(), 4);
    assert.equal(d?.getDate(), 15);
  });

  it("annual with yearInterval=1 from baseline 2018-06-30 walks to next anniversary", () => {
    const t = tpl({ frequencyType: "annual", yearInterval: 1 });
    const d = computeNextDueDateFromBaseline(t, new Date(2018, 5, 30), new Date(2026, 3, 22));
    assert.equal(d?.getFullYear(), 2026);
    assert.equal(d?.getMonth(), 5);
    assert.equal(d?.getDate(), 30);
  });

  it("quarterly without dayOfMonth uses baseline day-of-month", () => {
    const t = tpl({ frequencyType: "quarterly" });
    const d = computeNextDueDateFromBaseline(t, new Date(2020, 1, 10), new Date(2026, 3, 22));
    assert.ok(d);
    assert.equal(d.getDate(), 10);
    assert.ok(d >= new Date(2026, 3, 22));
  });

  it("daily returns today regardless of baseline", () => {
    const t = tpl({ frequencyType: "daily" });
    const d = computeNextDueDateFromBaseline(t, new Date(2018, 0, 1), new Date(2026, 3, 22));
    assert.equal(d?.getDate(), 22);
  });

  it("weekly with weekdays returns the closest matching weekday on/after today", () => {
    const t = tpl({ frequencyType: "weekly", weekdays: [3] }); // Wednesday only
    const d = computeNextDueDateFromBaseline(t, new Date(2018, 0, 1), new Date(2026, 3, 22));
    assert.equal(d?.getDay(), 3);
  });

  it("one_time returns null", () => {
    assert.equal(
      computeNextDueDateFromBaseline(
        tpl({ frequencyType: "one_time" }),
        new Date(2020, 0, 1),
        new Date(2026, 3, 22),
      ),
      null,
    );
  });
});
