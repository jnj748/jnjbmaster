import { Router, type IRouter } from "express";
import { eq, and, gte, lte, desc, sql, count, ne } from "drizzle-orm";
import { db, safetyChecklistsTable, safetyChecklistItemsTable, maintenanceLogsTable, safetyTrainingsTable, inspectionsTable } from "@workspace/db";
import {
  GetFacilityDashboardResponse,
  GetFacilityScheduledAlertsResponse,
  GetFacilityDefectTrendsResponse,
  GetFacilityStatusSummaryResponse,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { getUserBuildingId } from "../middlewares/buildingScope";
import { computeTodayProgress, emptyTodayProgress } from "@workspace/shared/facility-today-progress";

const router: IRouter = Router();
router.use("/facility", requireRole("manager", "platform_admin", "facility_staff", "hq_executive"));
router.get("/facility/dashboard", async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const currentYear = new Date().getFullYear();

  const [todayChecklists] = await db
    .select({ count: count() })
    .from(safetyChecklistsTable)
    .where(eq(safetyChecklistsTable.inspectionDate, today));

  const [pendingChecklists] = await db
    .select({ count: count() })
    .from(safetyChecklistsTable)
    .where(eq(safetyChecklistsTable.status, "pending"));

  const [completedChecklists] = await db
    .select({ count: count() })
    .from(safetyChecklistsTable)
    .where(eq(safetyChecklistsTable.status, "completed"));

  const [issueFound] = await db
    .select({ count: count() })
    .from(safetyChecklistsTable)
    .where(eq(safetyChecklistsTable.status, "issue_found"));

  const recentLogs = await db
    .select()
    .from(maintenanceLogsTable)
    .orderBy(desc(maintenanceLogsTable.workDate))
    .limit(5);

  const [totalTrainings] = await db
    .select({ count: count() })
    .from(safetyTrainingsTable)
    .where(eq(safetyTrainingsTable.trainingYear, currentYear));

  const [completedTrainings] = await db
    .select({ count: count() })
    .from(safetyTrainingsTable)
    .where(
      and(
        eq(safetyTrainingsTable.trainingYear, currentYear),
        eq(safetyTrainingsTable.status, "completed")
      )
    );

  const [upcomingTrainings] = await db
    .select({ count: count() })
    .from(safetyTrainingsTable)
    .where(
      and(
        eq(safetyTrainingsTable.trainingYear, currentYear),
        eq(safetyTrainingsTable.status, "scheduled")
      )
    );

  const trainingTotal = totalTrainings?.count ?? 0;
  const trainingCompleted = completedTrainings?.count ?? 0;
  const trainingCompletionRate = trainingTotal > 0 ? Math.round((trainingCompleted / trainingTotal) * 100) : 0;

  const [todayDefects] = await db
    .select({ count: count() })
    .from(safetyChecklistItemsTable)
    .innerJoin(safetyChecklistsTable, eq(safetyChecklistItemsTable.checklistId, safetyChecklistsTable.id))
    .where(
      and(
        eq(safetyChecklistItemsTable.result, "불량"),
        eq(safetyChecklistsTable.inspectionDate, today)
      )
    );

  const [unresolvedDefects] = await db
    .select({ count: count() })
    .from(maintenanceLogsTable)
    .where(
      and(
        eq(maintenanceLogsTable.sourceType, "safety_checklist"),
        eq(maintenanceLogsTable.status, "pending")
      )
    );

  const alerts = generateScheduledAlerts();

  res.json(
    GetFacilityDashboardResponse.parse({
      todayChecklistCount: todayChecklists?.count ?? 0,
      pendingChecklistCount: pendingChecklists?.count ?? 0,
      completedChecklistCount: completedChecklists?.count ?? 0,
      issueFoundCount: issueFound?.count ?? 0,
      todayDefectCount: todayDefects?.count ?? 0,
      unresolvedDefectCount: unresolvedDefects?.count ?? 0,
      recentLogs,
      trainingCompletionRate,
      upcomingTrainingCount: upcomingTrainings?.count ?? 0,
      scheduledAlerts: alerts,
    })
  );
});

router.get("/facility/defect-trends", async (_req, res): Promise<void> => {
  const byCategory = await db
    .select({
      category: safetyChecklistsTable.category,
      count: count(),
    })
    .from(safetyChecklistItemsTable)
    .innerJoin(safetyChecklistsTable, eq(safetyChecklistItemsTable.checklistId, safetyChecklistsTable.id))
    .where(eq(safetyChecklistItemsTable.result, "불량"))
    .groupBy(safetyChecklistsTable.category);

  const monthlyTrend = await db
    .select({
      month: sql<string>`to_char(${safetyChecklistsTable.inspectionDate}::date, 'YYYY-MM')`,
      count: count(),
    })
    .from(safetyChecklistItemsTable)
    .innerJoin(safetyChecklistsTable, eq(safetyChecklistItemsTable.checklistId, safetyChecklistsTable.id))
    .where(eq(safetyChecklistItemsTable.result, "불량"))
    .groupBy(sql`to_char(${safetyChecklistsTable.inspectionDate}::date, 'YYYY-MM')`)
    .orderBy(sql`to_char(${safetyChecklistsTable.inspectionDate}::date, 'YYYY-MM')`);

  const repeatedDefects = await db
    .select({
      itemName: safetyChecklistItemsTable.itemName,
      count: count(),
      category: safetyChecklistsTable.category,
    })
    .from(safetyChecklistItemsTable)
    .innerJoin(safetyChecklistsTable, eq(safetyChecklistItemsTable.checklistId, safetyChecklistsTable.id))
    .where(eq(safetyChecklistItemsTable.result, "불량"))
    .groupBy(safetyChecklistItemsTable.itemName, safetyChecklistsTable.category)
    .having(sql`count(*) >= 2`)
    .orderBy(desc(count()));

  res.json(
    GetFacilityDefectTrendsResponse.parse({
      byCategory,
      monthlyTrend,
      repeatedDefects,
    })
  );
});

router.get("/facility/scheduled-alerts", async (_req, res): Promise<void> => {
  const alerts = generateScheduledAlerts();
  res.json(GetFacilityScheduledAlertsResponse.parse(alerts));
});

function generateScheduledAlerts() {
  const today = new Date();
  const alerts = [];
  let id = 1;

  const lastGeneratorRun = new Date(today);
  lastGeneratorRun.setDate(today.getDate() - (today.getDate() % 14));
  const nextGeneratorRun = new Date(lastGeneratorRun);
  nextGeneratorRun.setDate(lastGeneratorRun.getDate() + 14);
  const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  alerts.push({
    id: id++,
    type: "generator_run" as const,
    title: "비상발전기 가동",
    message: `다음 발전기 가동 예정일: ${fmtDate(nextGeneratorRun)}`,
    dueDate: fmtDate(nextGeneratorRun),
    isOverdue: nextGeneratorRun < today,
  });

  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  alerts.push({
    id: id++,
    type: "water_tank_cleaning" as const,
    title: "저수조 청소 점검",
    message: "월간 저수조 점검 예정",
    dueDate: fmtDate(nextMonth),
    isOverdue: false,
  });

  const nextQuarter = new Date(today.getFullYear(), Math.ceil((today.getMonth() + 1) / 3) * 3, 1);
  alerts.push({
    id: id++,
    type: "fire_inspection" as const,
    title: "소방시설 정기 점검",
    message: "분기별 소방시설 점검 예정",
    dueDate: fmtDate(nextQuarter),
    isOverdue: false,
  });

  const nextElectrical = new Date(today.getFullYear(), today.getMonth() + 1, 15);
  alerts.push({
    id: id++,
    type: "electrical_check" as const,
    title: "전기설비 점검",
    message: "월간 전기설비 누전/절연저항 점검 예정",
    dueDate: fmtDate(nextElectrical),
    isOverdue: false,
  });

  return alerts;
}

type BadgeLevel = "none" | "yellow" | "red";
type StatusBadge = { level: BadgeLevel; count: number; ariaLabel: string };

function inspectionsBadge(redCount: number, yellowCount: number, nearestDays: number | null): StatusBadge {
  if (redCount > 0) {
    return {
      level: "red",
      count: redCount + yellowCount,
      ariaLabel: `법정점검 기한 경과 ${redCount}건${yellowCount > 0 ? `, 임박 ${yellowCount}건` : ""}`,
    };
  }
  if (yellowCount > 0) {
    return {
      level: "yellow",
      count: yellowCount,
      ariaLabel: nearestDays !== null
        ? `법정점검 D-${nearestDays}, ${yellowCount}건 임박`
        : `법정점검 ${yellowCount}건 임박`,
    };
  }
  return { level: "none", count: 0, ariaLabel: "법정점검 임박 없음" };
}

// KST date helpers — business semantics are KST regardless of server TZ.
function kstDateParts(): { todayStr: string; in7Str: string; in14Str: string; currentYear: number; kstNowMs: number } {
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const kstNow = new Date(Date.now() + KST_OFFSET_MS);
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const today = new Date(kstNow);
  const in7 = new Date(kstNow); in7.setUTCDate(in7.getUTCDate() + 7);
  const in14 = new Date(kstNow); in14.setUTCDate(in14.getUTCDate() + 14);
  return {
    todayStr: fmt(today),
    in7Str: fmt(in7),
    in14Str: fmt(in14),
    currentYear: kstNow.getUTCFullYear(),
    kstNowMs: kstNow.getTime(),
  };
}

router.get("/facility/status-summary", async (req, res): Promise<void> => {
  const { todayStr: today, in7Str, in14Str, currentYear, kstNowMs } = kstDateParts();

  // Tenant scope: limit to requester's building. Users without a buildingId
  // (e.g. some HQ executives spanning multiple buildings) get an empty summary
  // — the safest, zero-cross-tenant-leak default.
  const buildingId = await getUserBuildingId(req);
  if (buildingId === null) {
    res.json(
      GetFacilityStatusSummaryResponse.parse({
        inspections: { level: "none", count: 0, ariaLabel: "법정점검 임박 없음" },
        safetyChecklists: { level: "none", count: 0, ariaLabel: "오늘 안전점검표 모두 완료" },
        maintenanceLogs: { level: "none", count: 0, ariaLabel: "오늘 업무일지 모두 작성됨" },
        safetyTrainings: { level: "none", count: 0, ariaLabel: "안전교육 임박 없음" },
        todayProgress: emptyTodayProgress(),
      }),
    );
    return;
  }

  // Run all aggregations in parallel.
  const [
    overdueInsp,
    upcomingInspRows,
    pendingTodayChk,
    pendingTodayLog,
    overdueTrainingRows,
    upcomingTrainingRows,
    // ── 오늘 진행률(N/4) 전용 집계 ─────────────────────
    completedTodayChk,
    anyTodayLog,
    pendingTodayTraining,
  ] = await Promise.all([
      db
        .select({ count: count() })
        .from(inspectionsTable)
        .where(and(eq(inspectionsTable.buildingId, buildingId), sql`${inspectionsTable.nextDueDate} < ${today}`))
        .then((r) => r[0]),
      db
        .select({ nextDueDate: inspectionsTable.nextDueDate })
        .from(inspectionsTable)
        .where(
          and(
            eq(inspectionsTable.buildingId, buildingId),
            gte(inspectionsTable.nextDueDate, today),
            lte(inspectionsTable.nextDueDate, in7Str),
          ),
        ),
      db
        .select({ count: count() })
        .from(safetyChecklistsTable)
        .where(
          and(
            eq(safetyChecklistsTable.buildingId, buildingId),
            eq(safetyChecklistsTable.inspectionDate, today),
            eq(safetyChecklistsTable.status, "pending"),
          ),
        )
        .then((r) => r[0]),
      db
        .select({ count: count() })
        .from(maintenanceLogsTable)
        .where(
          and(
            eq(maintenanceLogsTable.buildingId, buildingId),
            eq(maintenanceLogsTable.workDate, today),
            eq(maintenanceLogsTable.status, "pending"),
          ),
        )
        .then((r) => r[0]),
      // safety_trainings has no buildingId column; trainings are managed
      // per-tenant DB and so global aggregation matches existing semantics.
      db
        .select({ count: count() })
        .from(safetyTrainingsTable)
        .where(
          and(
            eq(safetyTrainingsTable.trainingYear, currentYear),
            ne(safetyTrainingsTable.status, "completed"),
            sql`${safetyTrainingsTable.trainingDate} < ${today}`,
          ),
        )
        .then((r) => r[0]),
      db
        .select({ count: count() })
        .from(safetyTrainingsTable)
        .where(
          and(
            eq(safetyTrainingsTable.trainingYear, currentYear),
            ne(safetyTrainingsTable.status, "completed"),
            gte(safetyTrainingsTable.trainingDate, today),
            lte(safetyTrainingsTable.trainingDate, in14Str),
          ),
        )
        .then((r) => r[0]),
      // 오늘 작성된 비-pending 안전점검표 (completed | issue_found 등).
      db
        .select({ count: count() })
        .from(safetyChecklistsTable)
        .where(
          and(
            eq(safetyChecklistsTable.buildingId, buildingId),
            eq(safetyChecklistsTable.inspectionDate, today),
            ne(safetyChecklistsTable.status, "pending"),
          ),
        )
        .then((r) => r[0]),
      // 오늘 작성된 시설 업무일지 (status 무관, 1건 이상이면 완료).
      db
        .select({ count: count() })
        .from(maintenanceLogsTable)
        .where(
          and(
            eq(maintenanceLogsTable.buildingId, buildingId),
            eq(maintenanceLogsTable.workDate, today),
          ),
        )
        .then((r) => r[0]),
      // 오늘 일정인 안전교육 중 미완료. trainings 테이블은 buildingId가 없어
      // 기존 status-summary와 동일하게 글로벌 집계 (per-tenant DB 가정).
      db
        .select({ count: count() })
        .from(safetyTrainingsTable)
        .where(
          and(
            eq(safetyTrainingsTable.trainingYear, currentYear),
            eq(safetyTrainingsTable.trainingDate, today),
            ne(safetyTrainingsTable.status, "completed"),
          ),
        )
        .then((r) => r[0]),
    ]);

  // ── 법정점검 ─────────────────────────────────
  // Compute D-day from KST date math to match business semantics.
  const todayUtcMidnight = Date.UTC(
    new Date(kstNowMs).getUTCFullYear(),
    new Date(kstNowMs).getUTCMonth(),
    new Date(kstNowMs).getUTCDate(),
  );
  let nearestDays: number | null = null;
  for (const r of upcomingInspRows) {
    const due = new Date(`${r.nextDueDate}T00:00:00Z`).getTime();
    const d = Math.round((due - todayUtcMidnight) / (1000 * 60 * 60 * 24));
    if (nearestDays === null || d < nearestDays) nearestDays = d;
  }
  const inspections = inspectionsBadge(
    overdueInsp?.count ?? 0,
    upcomingInspRows.length,
    nearestDays !== null ? Math.max(0, nearestDays) : null,
  );

  // ── 안전점검표 ─────────────────────────────────
  const chkCount = pendingTodayChk?.count ?? 0;
  const safetyChecklists: StatusBadge =
    chkCount > 0
      ? { level: "red", count: chkCount, ariaLabel: `오늘 미작성 안전점검표 ${chkCount}건` }
      : { level: "none", count: 0, ariaLabel: "오늘 안전점검표 모두 완료" };

  // ── 시설 업무일지 ─────────────────────────────
  const logCount = pendingTodayLog?.count ?? 0;
  const maintenanceLogs: StatusBadge =
    logCount > 0
      ? { level: "red", count: logCount, ariaLabel: `오늘 미작성 업무일지 ${logCount}건` }
      : { level: "none", count: 0, ariaLabel: "오늘 업무일지 모두 작성됨" };

  // ── 안전교육 ─────────────────────────────────
  const overdueTrainingCount = overdueTrainingRows?.count ?? 0;
  const upcomingTrainingCount = upcomingTrainingRows?.count ?? 0;
  let safetyTrainings: StatusBadge;
  if (overdueTrainingCount > 0) {
    safetyTrainings = {
      level: "red",
      count: overdueTrainingCount + upcomingTrainingCount,
      ariaLabel: `안전교육 마감 경과 ${overdueTrainingCount}건${upcomingTrainingCount > 0 ? `, 임박 ${upcomingTrainingCount}건` : ""}`,
    };
  } else if (upcomingTrainingCount > 0) {
    safetyTrainings = {
      level: "yellow",
      count: upcomingTrainingCount,
      ariaLabel: `안전교육 마감 임박 ${upcomingTrainingCount}건`,
    };
  } else {
    safetyTrainings = { level: "none", count: 0, ariaLabel: "안전교육 임박 없음" };
  }

  // ── 오늘 4대 핵심 과업 진행률 ─────────────────────
  // 법정점검 "오늘 남은 예정" = 오늘 마감(due today)만. 지연(overdue)은 별도
  // 신호등 배지로 이미 노출되며, "오늘 예정 0건이면 자동 완료" 요구사항에 맞춤.
  const dueTodayInspCount = upcomingInspRows.filter((r) => r.nextDueDate === today).length;
  const todayProgress = computeTodayProgress({
    inspectionsDueRemaining: dueTodayInspCount,
    safetyChecklistsCompletedToday: completedTodayChk?.count ?? 0,
    maintenanceLogsToday: anyTodayLog?.count ?? 0,
    safetyTrainingsPendingToday: pendingTodayTraining?.count ?? 0,
  });

  res.json(
    GetFacilityStatusSummaryResponse.parse({
      inspections,
      safetyChecklists,
      maintenanceLogs,
      safetyTrainings,
      todayProgress,
    }),
  );
});

export default router;
