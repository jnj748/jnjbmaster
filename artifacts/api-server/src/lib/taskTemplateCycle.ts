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

/**
 * Compute the next occurrence date for a template, on/after `today`.
 * Returns null if the template is one_time and has already passed without a startDate
 * (i.e. nothing left to schedule).
 */
export function computeNextDueDate(t: TaskTemplate, today: Date): Date | null {
  const today0 = startOfDay(today);

  switch (t.frequencyType) {
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
      const interval = (t.intervalValue ?? 1) * 7;
      const anchor = t.startDate ? startOfDay(new Date(t.startDate)) : today0;
      if (anchor >= today0) return anchor;
      const diffDays = Math.ceil((today0.getTime() - anchor.getTime()) / (1000 * 60 * 60 * 24));
      const cycles = Math.ceil(diffDays / interval);
      return addDays(anchor, cycles * interval);
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
          : 12;

      // If fixedMonth/fixedDay specified, anchor on that month/day this year (or future).
      if (t.fixedMonth && t.fixedDay) {
        let candidate = dateOnly(new Date(today0.getFullYear(), t.fixedMonth - 1, t.fixedDay));
        // For non-annual cycles with fixedMonth/Day, walk back to the closest <= today, then forward.
        while (candidate < today0) candidate = addMonths(candidate, monthsBetween);
        return candidate;
      }

      // Deterministic anchor:
      // - explicit startDate → use it
      // - else for monthly (1-month cycle): anchor to fixedDay of current month
      //   (anchor month does not drift across the cycle)
      // - else for quarterly/semiannual/annual: anchor to (fixedDay) of January
      //   of the current year. This is canonical and prevents the next due date
      //   from regressing if `today` advances within a cycle window.
      const day = t.fixedDay ?? 1;
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
