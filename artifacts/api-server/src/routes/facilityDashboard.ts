import { Router, type IRouter } from "express";
import { eq, and, gte, lte, desc, sql, count } from "drizzle-orm";
import { db, safetyChecklistsTable, safetyChecklistItemsTable, maintenanceLogsTable, safetyTrainingsTable } from "@workspace/db";
import {
  GetFacilityDashboardResponse,
  GetFacilityScheduledAlertsResponse,
  GetFacilityDefectTrendsResponse,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireRole("manager", "platform_admin", "facility_staff"));

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

export default router;
