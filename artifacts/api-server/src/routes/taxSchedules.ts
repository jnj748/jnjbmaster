import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, taxSchedulesTable } from "@workspace/db";
import {
  ListTaxSchedulesQueryParams,
  ListTaxSchedulesResponse,
  CreateTaxScheduleBody,
  UpdateTaxScheduleParams,
  UpdateTaxScheduleBody,
  UpdateTaxScheduleResponse,
  DeleteTaxScheduleParams,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireRole("manager", "platform_admin", "accountant"));

router.get("/tax-schedules", async (req, res): Promise<void> => {
  const params = ListTaxSchedulesQueryParams.safeParse(req.query);
  const schedules = await db
    .select()
    .from(taxSchedulesTable)
    .orderBy(taxSchedulesTable.dueDate);

  res.json(ListTaxSchedulesResponse.parse(schedules));
});

router.post("/tax-schedules", async (req, res): Promise<void> => {
  const parsed = CreateTaxScheduleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [schedule] = await db.insert(taxSchedulesTable).values(parsed.data).returning();
  res.status(201).json(UpdateTaxScheduleResponse.parse(schedule));
});

router.patch("/tax-schedules/:id", async (req, res): Promise<void> => {
  const params = UpdateTaxScheduleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTaxScheduleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [schedule] = await db
    .update(taxSchedulesTable)
    .set(parsed.data)
    .where(eq(taxSchedulesTable.id, params.data.id))
    .returning();

  if (!schedule) {
    res.status(404).json({ error: "Tax schedule not found" });
    return;
  }

  res.json(UpdateTaxScheduleResponse.parse(schedule));
});

router.delete("/tax-schedules/:id", async (req, res): Promise<void> => {
  const params = DeleteTaxScheduleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [schedule] = await db
    .delete(taxSchedulesTable)
    .where(eq(taxSchedulesTable.id, params.data.id))
    .returning();

  if (!schedule) {
    res.status(404).json({ error: "Tax schedule not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
