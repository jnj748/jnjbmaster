import { Router, type IRouter } from "express";
import { and, gte, lte, sql } from "drizzle-orm";
import {
  db,
  tasksTable,
  inspectionsTable,
  taxSchedulesTable,
  safetyChecklistsTable,
  maintenanceLogsTable,
  safetyTrainingsTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use("/calendar", requireRole("manager", "platform_admin", "accountant"));
interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  source: "accounting" | "facility";
  originalType: string;
  status: "scheduled" | "completed" | "overdue";
  originalId: number;
}

router.get("/calendar/events", async (req, res): Promise<void> => {
  const year = parseInt(req.query.year as string);
  const month = parseInt(req.query.month as string);

  if (!year || !month || month < 1 || month > 12) {
    res.status(400).json({ error: "year and month are required (1-12)" });
    return;
  }

  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const today = new Date().toISOString().split("T")[0];

  const events: CalendarEvent[] = [];

  const taxSchedules = await db
    .select()
    .from(taxSchedulesTable)
    .where(
      and(
        gte(taxSchedulesTable.dueDate, startDate),
        lte(taxSchedulesTable.dueDate, endDate)
      )
    );

  for (const tax of taxSchedules) {
    let status: CalendarEvent["status"] = "scheduled";
    if (tax.status === "completed") status = "completed";
    else if (tax.dueDate < today) status = "overdue";

    events.push({
      id: `tax-${tax.id}`,
      title: tax.title,
      date: tax.dueDate,
      source: "accounting",
      originalType: "tax_schedule",
      status,
      originalId: tax.id,
    });
  }

  const tasks = await db
    .select()
    .from(tasksTable)
    .where(
      and(
        sql`${tasksTable.dueDate} IS NOT NULL`,
        gte(tasksTable.dueDate, startDate),
        lte(tasksTable.dueDate, endDate)
      )
    );

  for (const task of tasks) {
    if (!task.dueDate) continue;
    let status: CalendarEvent["status"] = "scheduled";
    if (task.status === "completed") status = "completed";
    else if (task.dueDate < today) status = "overdue";

    const isAccounting = task.category === "accounting" || task.category === "tax" || task.category === "finance";
    events.push({
      id: `task-${task.id}`,
      title: task.title,
      date: task.dueDate,
      source: isAccounting ? "accounting" : "facility",
      originalType: "task",
      status,
      originalId: task.id,
    });
  }

  const completedTasks = await db
    .select()
    .from(tasksTable)
    .where(
      and(
        sql`${tasksTable.completedAt} IS NOT NULL`,
        sql`${tasksTable.completedAt} >= ${startDate}::timestamp`,
        sql`${tasksTable.completedAt} < (${endDate}::date + interval '1 day')::timestamp`
      )
    );

  for (const task of completedTasks) {
    if (!task.completedAt) continue;
    const completedDate = task.completedAt.toISOString().split("T")[0];
    if (completedDate === task.dueDate) continue;

    const isAccounting = task.category === "accounting" || task.category === "tax" || task.category === "finance";
    events.push({
      id: `task-done-${task.id}`,
      title: `${task.title} (완료)`,
      date: completedDate,
      source: isAccounting ? "accounting" : "facility",
      originalType: "task_completed",
      status: "completed",
      originalId: task.id,
    });
  }

  const inspectionsDue = await db
    .select()
    .from(inspectionsTable)
    .where(
      and(
        gte(inspectionsTable.nextDueDate, startDate),
        lte(inspectionsTable.nextDueDate, endDate)
      )
    );

  for (const insp of inspectionsDue) {
    let status: CalendarEvent["status"] = "scheduled";
    if (insp.status === "completed") status = "completed";
    else if (insp.nextDueDate < today) status = "overdue";

    events.push({
      id: `insp-due-${insp.id}`,
      title: `${insp.name} 점검 예정`,
      date: insp.nextDueDate,
      source: "facility",
      originalType: "inspection_due",
      status,
      originalId: insp.id,
    });
  }

  const inspectionsCompleted = await db
    .select()
    .from(inspectionsTable)
    .where(
      and(
        sql`${inspectionsTable.lastInspectionDate} IS NOT NULL`,
        gte(inspectionsTable.lastInspectionDate, startDate),
        lte(inspectionsTable.lastInspectionDate, endDate)
      )
    );

  for (const insp of inspectionsCompleted) {
    events.push({
      id: `insp-done-${insp.id}`,
      title: `${insp.name} 점검 완료`,
      date: insp.lastInspectionDate!,
      source: "facility",
      originalType: "inspection_completed",
      status: "completed",
      originalId: insp.id,
    });
  }

  const checklists = await db
    .select()
    .from(safetyChecklistsTable)
    .where(
      and(
        gte(safetyChecklistsTable.inspectionDate, startDate),
        lte(safetyChecklistsTable.inspectionDate, endDate)
      )
    );

  for (const cl of checklists) {
    events.push({
      id: `checklist-${cl.id}`,
      title: cl.title,
      date: cl.inspectionDate,
      source: "facility",
      originalType: "safety_checklist",
      status: cl.status === "completed" ? "completed" : cl.inspectionDate < today ? "overdue" : "scheduled",
      originalId: cl.id,
    });
  }

  const logs = await db
    .select()
    .from(maintenanceLogsTable)
    .where(
      and(
        gte(maintenanceLogsTable.workDate, startDate),
        lte(maintenanceLogsTable.workDate, endDate)
      )
    );

  for (const log of logs) {
    events.push({
      id: `maint-${log.id}`,
      title: log.title,
      date: log.workDate,
      source: "facility",
      originalType: "maintenance",
      status: log.status === "completed" ? "completed" : "scheduled",
      originalId: log.id,
    });
  }

  const trainings = await db
    .select()
    .from(safetyTrainingsTable)
    .where(
      and(
        gte(safetyTrainingsTable.trainingDate, startDate),
        lte(safetyTrainingsTable.trainingDate, endDate)
      )
    );

  for (const tr of trainings) {
    events.push({
      id: `training-${tr.id}`,
      title: tr.title,
      date: tr.trainingDate,
      source: "facility",
      originalType: "safety_training",
      status: tr.status === "completed" ? "completed" : tr.trainingDate < today ? "overdue" : "scheduled",
      originalId: tr.id,
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date));

  res.json(events);
});

export default router;
