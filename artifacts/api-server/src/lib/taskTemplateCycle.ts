import type { TaskTemplate } from "@workspace/db";

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

function dateOnly(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function tplWeekdays(t: TaskTemplate): number[] | null {
  const w = (t as { weekdays?: number[] | null }).weekdays;
  if (Array.isArray(w) && w.length > 0) return w;
  return null;
}

function tplDayOfMonth(t: TaskTemplate): number | null {
  const v = (t as { dayOfMonth?: number | null }).dayOfMonth;
  if (typeof v === "number" && v >= 1 && v <= 31) return v;
  return t.fixedDay ?? null;
}

function tplYearInterval(t: TaskTemplate): number {
  const v = (t as { yearInterval?: number | null }).yearInterval;
  if (typeof v === "number" && v >= 1) return v;
  return 1;
}

// [Task #302] monthly_nth_weekday 계산: year/month(0-based) 의 nth 째 weekday 일자.
//   nth = 1~5 (그 달에 5번째가 없으면 null), nth = -1 은 마지막 weekday.
function nthWeekdayOfMonth(year: number, month: number, nth: number, weekday: number): Date | null {
  if (nth === -1) {
    const lastDay = new Date(year, month + 1, 0);
    const offset = (lastDay.getDay() - weekday + 7) % 7;
    return new Date(year, month, lastDay.getDate() - offset);
  }
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  const last = new Date(year, month + 1, 0).getDate();
  if (day > last) return null;
  return new Date(year, month, day);
}

function tplNthWeek(t: TaskTemplate): number | null {
  const v = (t as { nthWeek?: number | null }).nthWeek;
  if (typeof v === "number" && (v === -1 || (v >= 1 && v <= 5))) return v;
  return null;
}

function tplNthWeekday(t: TaskTemplate): number | null {
  const v = (t as { nthWeekday?: number | null }).nthWeekday;
  if (typeof v === "number" && v >= 0 && v <= 6) return v;
  return null;
}

/**
 * Compute the next occurrence date for a template, on/after `today`.
 * Returns null if the template is one_time and has already passed without a startDate
 * (i.e. nothing left to schedule).
 *
 * [Task #297] 신규 입력 필드(weekdays/dayOfMonth/yearInterval) 가 있으면 우선 사용하고,
 * 없으면 기존 fixedMonth/fixedDay/startDate 폴백으로 동작한다.
 */
export interface ComputeDueContext {
  // [Task #304] anchored frequency 계산에 필요한 빌딩 사용승인일.
  //   anchored 템플릿이지만 anchorDate 가 없으면 null 을 반환한다(빌딩 미입력으로 스킵).
  anchorDate?: Date | null;
}

export function computeNextDueDate(
  t: TaskTemplate,
  today: Date,
  ctx: ComputeDueContext = {},
): Date | null {
  const today0 = startOfDay(today);

  switch (t.frequencyType) {
    case "anchored": {
      // [Task #304] 사용승인일 + N년. 빌딩 컨텍스트가 없거나 N년이 비어있으면 스킵.
      const offset = (t as { anchorOffsetYears?: number | null }).anchorOffsetYears;
      if (!ctx.anchorDate || typeof offset !== "number" || offset < 0) return null;
      const anchor = startOfDay(ctx.anchorDate);
      return new Date(anchor.getFullYear() + offset, anchor.getMonth(), anchor.getDate());
    }
    case "one_time": {
      if (!t.startDate) return null;
      const due = startOfDay(new Date(t.startDate));
      // Allow showing recently overdue one-time tasks too (let alert window decide).
      return due;
    }
    case "daily": {
      // If startDate exists & is future, use it. Otherwise today.
      if (t.startDate) {
        const start = startOfDay(new Date(t.startDate));
        return start > today0 ? start : today0;
      }
      return today0;
    }
    case "weekly": {
      // [#297] weekdays 가 있으면 가장 가까운 요일을 다음 due 로 사용.
      const wds = tplWeekdays(t);
      if (wds) {
        for (let i = 0; i < 14; i++) {
          const cand = addDays(today0, i);
          if (wds.includes(cand.getDay())) return cand;
        }
        return today0;
      }
      const interval = (t.intervalValue ?? 1) * 7;
      const anchor = t.startDate ? startOfDay(new Date(t.startDate)) : today0;
      if (anchor >= today0) return anchor;
      const diffDays = Math.ceil((today0.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
      const cycles = Math.ceil(diffDays / interval);
      return addDays(anchor, cycles * interval);
    }
    case "biweekly": {
      // [Task #302] 격주: startDate 가 캐노니컬 anchor. 거기서 정확히 14일 간격으로
      //   다음 발생일을 계산한다. weekdays 는 UI 표시/검색용 메타데이터일 뿐
      //   계산 자체에는 영향이 없도록 하여 weekday<>startDate 불일치로 인한
      //   날짜 드리프트를 방지한다. UI 측에서 startDate 와 weekdays[0] 를 항상
      //   동기화한다.
      if (!t.startDate) return null;
      const anchor = startOfDay(new Date(t.startDate));
      if (anchor >= today0) return anchor;
      const diffDays = Math.floor((today0.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
      const cycles = Math.ceil(diffDays / 14);
      return addDays(anchor, cycles * 14);
    }
    case "monthly_nth_weekday": {
      // [Task #302] 매월 N째 X요일.
      const nth = tplNthWeek(t);
      const wd = tplNthWeekday(t);
      if (nth == null || wd == null) return null;
      for (let i = 0; i < 13; i++) {
        const probe = new Date(today0.getFullYear(), today0.getMonth() + i, 1);
        const cand = nthWeekdayOfMonth(probe.getFullYear(), probe.getMonth(), nth, wd);
        if (cand && cand >= today0) return cand;
      }
      return null;
    }
    case "monthly":
    case "quarterly":
    case "semiannual":
    case "annual": {
      const monthsBetween =
        t.frequencyType === "monthly"
          ? t.intervalValue ?? 1
          : t.frequencyType === "quarterly"
          ? 3
          : t.frequencyType === "semiannual"
          ? 6
          : 12 * tplYearInterval(t);

      // If fixedMonth/fixedDay specified, anchor on that month/day this year (or future).
      if (t.fixedMonth && t.fixedDay) {
        let candidate = dateOnly(new Date(today0.getFullYear(), t.fixedMonth - 1, t.fixedDay));
        // For non-annual cycles with fixedMonth/Day, walk back to the closest <= today, then forward.
        while (candidate < today0) candidate = addMonths(candidate, monthsBetween);
        return candidate;
      }

      // Deterministic anchor:
      // - explicit startDate → use it
      // - else for monthly (1-month cycle): anchor to dayOfMonth(or 1) of current month
      // - else for quarterly/semiannual/annual: anchor to (dayOfMonth/1) of January
      //   of the current year. This is canonical and prevents the next due date
      //   from regressing if `today` advances within a cycle window.
      const day = tplDayOfMonth(t) ?? 1;
      let anchor: Date;
      if (t.startDate) {
        anchor = startOfDay(new Date(t.startDate));
      } else if (t.frequencyType === "monthly") {
        anchor = new Date(today0.getFullYear(), today0.getMonth(), day);
      } else {
        anchor = new Date(today0.getFullYear(), 0, day);
      }
      if (anchor >= today0) return anchor;
      let cursor = new Date(anchor);
      while (cursor < today0) cursor = addMonths(cursor, monthsBetween);
      return cursor;
    }
    default:
      return null;
  }
}

/**
 * [Task #297] 표제부 사용승인일을 기준으로 "지금까지 정상 수행해 왔다"고 가정해
 *  다음 실행 예정일을 산출한다. 온보딩 마법사에서 "다음 주기 시작일을 잘 모르겠음"
 *  분기에 사용된다.
 *
 *  알고리즘:
 *   - baseline(=approvalDate) 부터 cycle(=주기 길이) 단위로 반복해 today 직후의
 *     첫 occurrence 를 반환한다.
 *   - 주기를 해석할 수 없으면(one_time, 입력 부족) null.
 */
export function computeNextDueDateFromBaseline(
  t: TaskTemplate,
  baseline: Date,
  today: Date,
): Date | null {
  const today0 = startOfDay(today);
  const base0 = startOfDay(baseline);

  switch (t.frequencyType) {
    case "one_time":
      return null;
    case "daily":
      return today0;
    case "weekly": {
      const wds = tplWeekdays(t);
      if (wds) {
        for (let i = 0; i < 14; i++) {
          const cand = addDays(today0, i);
          if (wds.includes(cand.getDay())) return cand;
        }
        return today0;
      }
      const interval = (t.intervalValue ?? 1) * 7;
      let cursor = new Date(base0);
      if (cursor >= today0) return cursor;
      const diffDays = Math.ceil((today0.getTime() - cursor.getTime()) / (1000 * 60 * 60 * 24));
      const cycles = Math.ceil(diffDays / interval);
      return addDays(cursor, cycles * interval);
    }
    case "monthly":
    case "quarterly":
    case "semiannual":
    case "annual": {
      const monthsBetween =
        t.frequencyType === "monthly"
          ? t.intervalValue ?? 1
          : t.frequencyType === "quarterly"
          ? 3
          : t.frequencyType === "semiannual"
          ? 6
          : 12 * tplYearInterval(t);

      // baseline 의 일자를 우선 사용하되, dayOfMonth 가 명시되어 있으면 그 일자로 보정.
      const day = tplDayOfMonth(t) ?? base0.getDate();
      let cursor = new Date(base0.getFullYear(), base0.getMonth(), day);
      if (cursor < base0) cursor = addMonths(cursor, monthsBetween);
      while (cursor < today0) cursor = addMonths(cursor, monthsBetween);
      return cursor;
    }
    default:
      return null;
  }
}
