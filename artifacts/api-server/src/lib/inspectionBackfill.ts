import { db, inspectionsTable, buildingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { walkForwardNextDue } from "./taskTemplateCycle";
import { logger } from "./logger";

// [Task #411] 사용승인일 baseline 으로 셋업된 inspections 의 nextDueDate 1회성 백필.
//   대시보드 "필수업무현황" 카드가 "수천 일 지남" 으로 표시되는 문제를 해결하기 위해,
//   조건부로 walk-forward 한 미래/근접 일자로 갱신한다.
//
//   대상 조건:
//    1) legalCycleMonths(>0) 가 정의되어 있다 — 월 단위 cycle 모델만.
//    2) lastInspectionDate 가 비어 있거나 빌딩 사용승인일 이전/같음.
//    3) 현재 nextDueDate 가 오늘로부터 최소 1주기(cycleMonths) 이상 과거.
//
//   사용자가 명시적으로 입력한 lastInspectionDate(=approvalDate 보다 이후)는
//   안전을 위해 건드리지 않는다. /inspections/:id/complete 가 호출되면 그
//   시점부터 정상 주기로 진행되므로, 여기서 다시 보정할 필요가 없다.

export interface BackfillSummary {
  scanned: number;
  updated: number;
  skippedNoCycle: number;
  skippedHasUserDate: number;
  skippedNoBaseline: number;
  skippedFresh: number;
}

export interface BackfillOptions {
  dryRun?: boolean;
  today?: Date;
}

function dateOnlyStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toDateOnlyString(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.length >= 10 ? value.slice(0, 10) : null;
  return dateOnlyStr(value);
}

export async function backfillInspectionNextDueDates(
  opts: BackfillOptions = {},
): Promise<BackfillSummary> {
  const { dryRun = false, today = new Date() } = opts;
  const todayStr = dateOnlyStr(today);

  const rows = await db
    .select({
      id: inspectionsTable.id,
      buildingId: inspectionsTable.buildingId,
      name: inspectionsTable.name,
      legalCycleMonths: inspectionsTable.legalCycleMonths,
      lastInspectionDate: inspectionsTable.lastInspectionDate,
      nextDueDate: inspectionsTable.nextDueDate,
      approvalDate: buildingsTable.approvalDate,
    })
    .from(inspectionsTable)
    .leftJoin(buildingsTable, eq(inspectionsTable.buildingId, buildingsTable.id));

  const summary: BackfillSummary = {
    scanned: rows.length,
    updated: 0,
    skippedNoCycle: 0,
    skippedHasUserDate: 0,
    skippedNoBaseline: 0,
    skippedFresh: 0,
  };

  for (const row of rows) {
    const cycleMonths = row.legalCycleMonths ?? 0;
    if (!cycleMonths || cycleMonths <= 0) {
      summary.skippedNoCycle++;
      continue;
    }

    const lastDateStr = toDateOnlyString(row.lastInspectionDate as string | null);
    const approvalDateStr = toDateOnlyString(row.approvalDate as string | Date | null);

    // 사용자가 입력한 마지막 점검일이 사용승인일보다 이후라면 건드리지 않는다.
    if (lastDateStr) {
      if (!approvalDateStr || lastDateStr > approvalDateStr) {
        summary.skippedHasUserDate++;
        continue;
      }
    }

    const baseline = lastDateStr ?? approvalDateStr;
    if (!baseline) {
      summary.skippedNoBaseline++;
      continue;
    }

    // 현재 nextDueDate 가 오늘 - cycleMonths 이후이면 보정하지 않는다.
    const oneCycleAgo = new Date(today);
    oneCycleAgo.setMonth(oneCycleAgo.getMonth() - cycleMonths);
    const oneCycleAgoStr = dateOnlyStr(oneCycleAgo);
    const currentNextDueStr = toDateOnlyString(row.nextDueDate as string | null);
    if (currentNextDueStr && currentNextDueStr >= oneCycleAgoStr) {
      summary.skippedFresh++;
      continue;
    }

    const newNextDue = walkForwardNextDue(baseline, cycleMonths, today);
    if (newNextDue === currentNextDueStr) {
      summary.skippedFresh++;
      continue;
    }

    summary.updated++;

    if (!dryRun) {
      const newStatus = newNextDue < todayStr ? "overdue" : "upcoming";
      await db
        .update(inspectionsTable)
        .set({ nextDueDate: newNextDue, status: newStatus })
        .where(eq(inspectionsTable.id, row.id));
    }
  }

  logger.info(
    {
      dryRun,
      ...summary,
    },
    "[Task #411] inspection nextDueDate backfill complete",
  );

  return summary;
}
