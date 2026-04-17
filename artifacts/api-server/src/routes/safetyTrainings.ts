import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, safetyTrainingsTable } from "@workspace/db";
import {
  ListSafetyTrainingsQueryParams,
  ListSafetyTrainingsResponse,
  CreateSafetyTrainingBody,
  GetSafetyTrainingParams,
  GetSafetyTrainingResponse,
  UpdateSafetyTrainingParams,
  UpdateSafetyTrainingBody,
  UpdateSafetyTrainingResponse,
  DeleteSafetyTrainingParams,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
// Mirrors UI matrix in manager-app/src/lib/permissions.ts (/safety-training:
// manager / platform_admin / facility_staff / hq_executive).
router.use("/safety-trainings", requireRole("manager", "platform_admin", "facility_staff", "hq_executive"));
router.get("/safety-trainings", async (req, res): Promise<void> => {
  const params = ListSafetyTrainingsQueryParams.safeParse(req.query);
  const conditions = [];

  if (params.success) {
    if (params.data.year) {
      conditions.push(eq(safetyTrainingsTable.trainingYear, params.data.year));
    }
    if (params.data.month) {
      conditions.push(eq(safetyTrainingsTable.trainingMonth, params.data.month));
    }
    if (params.data.status) {
      conditions.push(eq(safetyTrainingsTable.status, params.data.status));
    }
  }

  const trainings = await db
    .select()
    .from(safetyTrainingsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(safetyTrainingsTable.trainingDate));

  res.json(ListSafetyTrainingsResponse.parse(trainings));
});

router.post("/safety-trainings", async (req, res): Promise<void> => {
  const parsed = CreateSafetyTrainingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [training] = await db.insert(safetyTrainingsTable).values(parsed.data).returning();
  res.status(201).json(GetSafetyTrainingResponse.parse(training));
});

router.get("/safety-trainings/:id", async (req, res): Promise<void> => {
  const params = GetSafetyTrainingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [training] = await db
    .select()
    .from(safetyTrainingsTable)
    .where(eq(safetyTrainingsTable.id, params.data.id));

  if (!training) {
    res.status(404).json({ error: "Training not found" });
    return;
  }

  res.json(GetSafetyTrainingResponse.parse(training));
});

router.patch("/safety-trainings/:id", async (req, res): Promise<void> => {
  const params = UpdateSafetyTrainingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSafetyTrainingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [training] = await db
    .update(safetyTrainingsTable)
    .set(parsed.data)
    .where(eq(safetyTrainingsTable.id, params.data.id))
    .returning();

  if (!training) {
    res.status(404).json({ error: "Training not found" });
    return;
  }

  res.json(UpdateSafetyTrainingResponse.parse(training));
});

router.delete("/safety-trainings/:id", async (req, res): Promise<void> => {
  const params = DeleteSafetyTrainingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [training] = await db
    .delete(safetyTrainingsTable)
    .where(eq(safetyTrainingsTable.id, params.data.id))
    .returning();

  if (!training) {
    res.status(404).json({ error: "Training not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
