import { Router, type IRouter } from "express";
import { eq, and, lte, gte, sql, count, sum, desc } from "drizzle-orm";
import { db, tasksTable, inspectionsTable, taxSchedulesTable, commissionsTable } from "@workspace/db";
import {
  GetDashboardSummaryResponse,
  GetDashboardAlertsResponse,
  GetRecentActivityResponse,
  GetWeeklyReportResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(new Date().getDate() + 30);
  const futureStr = thirtyDaysFromNow.toISOString().split("T")[0];

  const allTasks = await db.select().from(tasksTable);
  const todayTasks = allTasks.filter((t) => t.dueDate === today);
  const pendingTasks = allTasks.filter((t) => t.status === "pending");
  const overdueTasks = allTasks.filter(
    (t) => t.status !== "completed" && t.dueDate && t.dueDate < today
  );

  const upcomingInspections = await db
    .select()
    .from(inspectionsTable)
    .where(
      and(
        lte(inspectionsTable.nextDueDate, futureStr),
        gte(inspectionsTable.nextDueDate, today)
      )
    );

  const pendingTax = await db
    .select()
    .from(taxSchedulesTable)
    .where(eq(taxSchedulesTable.status, "pending"));

  const allCommissions = await db.select().from(commissionsTable);
  const totalCommission = allCommissions.reduce((sum, c) => sum + c.commissionAmount, 0);
  const pendingCommission = allCommissions
    .filter((c) => c.status === "pending")
    .reduce((sum, c) => sum + c.commissionAmount, 0);

  const completedCount = allTasks.filter((t) => t.status === "completed").length;
  const completionRate = allTasks.length > 0 ? (completedCount / allTasks.length) * 100 : 0;

  const summary = {
    todayTaskCount: todayTasks.length,
    pendingTaskCount: pendingTasks.length,
    overdueTaskCount: overdueTasks.length,
    upcomingInspectionCount: upcomingInspections.length,
    pendingTaxCount: pendingTax.length,
    totalCommissionAmount: totalCommission,
    pendingCommissionAmount: pendingCommission,
    completionRate: Math.round(completionRate * 10) / 10,
  };

  res.json(GetDashboardSummaryResponse.parse(summary));
});

router.get("/dashboard/alerts", async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(new Date().getDate() + 30);
  const futureStr = thirtyDaysFromNow.toISOString().split("T")[0];

  const alerts: Array<{
    id: number;
    type: string;
    title: string;
    message: string;
    severity: string;
    relatedId: number | null;
    createdAt: string;
  }> = [];

  let alertId = 1;

  const upcomingInspections = await db
    .select()
    .from(inspectionsTable)
    .where(
      and(
        lte(inspectionsTable.nextDueDate, futureStr),
        gte(inspectionsTable.nextDueDate, today)
      )
    );

  for (const inspection of upcomingInspections) {
    alerts.push({
      id: alertId++,
      type: "inspection_due",
      title: `${inspection.name} 점검 예정`,
      message: `${inspection.nextDueDate}까지 ${inspection.name} 점검을 완료해야 합니다. 업체 선정 및 준비를 시작하세요.`,
      severity: inspection.nextDueDate <= new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] ? "critical" : "warning",
      relatedId: inspection.id,
      createdAt: new Date().toISOString(),
    });
  }

  const pendingTax = await db
    .select()
    .from(taxSchedulesTable)
    .where(eq(taxSchedulesTable.status, "pending"));

  for (const tax of pendingTax) {
    if (tax.dueDate <= futureStr) {
      alerts.push({
        id: alertId++,
        type: "tax_due",
        title: `${tax.title} 마감 예정`,
        message: `${tax.dueDate}까지 ${tax.title}을(를) 처리해야 합니다.`,
        severity: tax.dueDate <= new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] ? "critical" : "warning",
        relatedId: tax.id,
        createdAt: new Date().toISOString(),
      });
    }
  }

  const overdueTasks = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.status, "pending"));

  for (const task of overdueTasks) {
    if (task.dueDate && task.dueDate < today) {
      alerts.push({
        id: alertId++,
        type: "task_overdue",
        title: `${task.title} 기한 초과`,
        message: `${task.dueDate}이 마감이었던 업무가 아직 완료되지 않았습니다.`,
        severity: "critical",
        relatedId: task.id,
        createdAt: new Date().toISOString(),
      });
    }
  }

  res.json(GetDashboardAlertsResponse.parse(alerts));
});

router.get("/dashboard/activity", async (_req, res): Promise<void> => {
  const recentTasks = await db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.status, "completed"))
    .orderBy(desc(tasksTable.updatedAt))
    .limit(10);

  const activities = recentTasks.map((task, idx) => ({
    id: idx + 1,
    type: "task_completed" as const,
    description: `"${task.title}" 업무가 완료되었습니다.`,
    timestamp: task.updatedAt.toISOString(),
  }));

  res.json(GetRecentActivityResponse.parse(activities));
});

router.get("/reports/weekly", async (req, res): Promise<void> => {
  const weekStart = req.query.weekStart as string | undefined;
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    res.status(400).json({ error: "weekStart is required (YYYY-MM-DD)" });
    return;
  }
  const weekEnd = new Date(new Date(weekStart).getTime() + 6 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const allTasks = await db.select().from(tasksTable);
  const weekTasks = allTasks.filter(
    (t) => t.dueDate && t.dueDate >= weekStart && t.dueDate <= weekEnd
  );

  const completedTasks = weekTasks.filter((t) => t.status === "completed");
  const pendingTasks = weekTasks.filter((t) => t.status !== "completed");

  const inspectionsDue = await db
    .select()
    .from(inspectionsTable)
    .where(
      and(
        gte(inspectionsTable.nextDueDate, weekStart),
        lte(inspectionsTable.nextDueDate, weekEnd)
      )
    );

  const taxDue = await db
    .select()
    .from(taxSchedulesTable)
    .where(
      and(
        gte(taxSchedulesTable.dueDate, weekStart),
        lte(taxSchedulesTable.dueDate, weekEnd)
      )
    );

  const categoryMap: Record<string, number> = {};
  for (const task of weekTasks) {
    categoryMap[task.category] = (categoryMap[task.category] || 0) + 1;
  }

  const tasksByCategory = Object.entries(categoryMap).map(([category, count]) => ({
    category,
    count,
  }));

  const highlights: string[] = [];
  if (completedTasks.length > 0) {
    highlights.push(`${completedTasks.length}건의 업무가 완료되었습니다.`);
  }
  if (inspectionsDue.length > 0) {
    highlights.push(`${inspectionsDue.length}건의 법정 점검이 예정되어 있습니다.`);
  }
  if (taxDue.length > 0) {
    highlights.push(`${taxDue.length}건의 세무 일정이 마감됩니다.`);
  }

  const report = {
    weekStart,
    weekEnd,
    totalTasks: weekTasks.length,
    completedTasks: completedTasks.length,
    pendingTasks: pendingTasks.length,
    inspectionsDue: inspectionsDue.length,
    taxSchedulesDue: taxDue.length,
    tasksByCategory,
    highlights,
  };

  res.json(GetWeeklyReportResponse.parse(report));
});

export default router;
