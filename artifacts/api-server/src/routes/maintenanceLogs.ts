import { Router, type IRouter } from "express";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { db, maintenanceLogsTable } from "@workspace/db";
import {
  ListMaintenanceLogsQueryParams,
  ListMaintenanceLogsResponse,
  CreateMaintenanceLogBody,
  GetMaintenanceLogParams,
  GetMaintenanceLogResponse,
  UpdateMaintenanceLogParams,
  UpdateMaintenanceLogBody,
  UpdateMaintenanceLogResponse,
  DeleteMaintenanceLogParams,
  SendMaintenanceReportParams,
  SendMaintenanceReportResponse,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireRole("manager", "platform_admin", "facility_staff"));

router.get("/maintenance-logs", async (req, res): Promise<void> => {
  const params = ListMaintenanceLogsQueryParams.safeParse(req.query);
  const conditions = [];

  if (params.success) {
    if (params.data.category) {
      conditions.push(eq(maintenanceLogsTable.category, params.data.category));
    }
    if (params.data.startDate) {
      conditions.push(gte(maintenanceLogsTable.workDate, params.data.startDate));
    }
    if (params.data.endDate) {
      conditions.push(lte(maintenanceLogsTable.workDate, params.data.endDate));
    }
  }

  const logs = await db
    .select()
    .from(maintenanceLogsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(maintenanceLogsTable.workDate));

  res.json(ListMaintenanceLogsResponse.parse(logs));
});

router.post("/maintenance-logs", async (req, res): Promise<void> => {
  const parsed = CreateMaintenanceLogBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [log] = await db.insert(maintenanceLogsTable).values(parsed.data).returning();
  res.status(201).json(GetMaintenanceLogResponse.parse(log));
});

router.get("/maintenance-logs/:id", async (req, res): Promise<void> => {
  const params = GetMaintenanceLogParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [log] = await db
    .select()
    .from(maintenanceLogsTable)
    .where(eq(maintenanceLogsTable.id, params.data.id));

  if (!log) {
    res.status(404).json({ error: "Maintenance log not found" });
    return;
  }

  res.json(GetMaintenanceLogResponse.parse(log));
});

router.patch("/maintenance-logs/:id", async (req, res): Promise<void> => {
  const params = UpdateMaintenanceLogParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateMaintenanceLogBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [log] = await db
    .update(maintenanceLogsTable)
    .set(parsed.data)
    .where(eq(maintenanceLogsTable.id, params.data.id))
    .returning();

  if (!log) {
    res.status(404).json({ error: "Maintenance log not found" });
    return;
  }

  res.json(UpdateMaintenanceLogResponse.parse(log));
});

router.delete("/maintenance-logs/:id", async (req, res): Promise<void> => {
  const params = DeleteMaintenanceLogParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [log] = await db
    .delete(maintenanceLogsTable)
    .where(eq(maintenanceLogsTable.id, params.data.id))
    .returning();

  if (!log) {
    res.status(404).json({ error: "Maintenance log not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/maintenance-logs/:id/send-report", async (req, res): Promise<void> => {
  const params = SendMaintenanceReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [log] = await db
    .update(maintenanceLogsTable)
    .set({ reportSent: true, reportSentAt: new Date() })
    .where(eq(maintenanceLogsTable.id, params.data.id))
    .returning();

  if (!log) {
    res.status(404).json({ error: "Maintenance log not found" });
    return;
  }

  res.json(SendMaintenanceReportResponse.parse(log));
});

export default router;
