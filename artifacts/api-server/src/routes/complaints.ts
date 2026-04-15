import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, complaintsTable, usersTable, unitsTable } from "@workspace/db";
import {
  CreateComplaintBody,
  UpdateComplaintBody,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireRole("manager", "platform_admin", "accountant"));

async function getUserBuildingId(req: Request): Promise<number | null> {
  const userId = req.user?.userId;
  if (!userId) return null;
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  return user?.buildingId ?? null;
}

router.get("/complaints", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.json([]); return; }
  const { category, status } = req.query as { category?: string; status?: string };

  let rows = await db
    .select()
    .from(complaintsTable)
    .where(eq(complaintsTable.buildingId, buildingId))
    .orderBy(desc(complaintsTable.createdAt));

  if (category) {
    rows = rows.filter((r) => r.category === category);
  }
  if (status) {
    rows = rows.filter((r) => r.status === status);
  }

  res.json(rows);
});

router.post("/complaints", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateComplaintBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }

  const unit = await db
    .select()
    .from(unitsTable)
    .where(and(eq(unitsTable.buildingId, buildingId), eq(unitsTable.unitNumber, parsed.data.unitNumber)))
    .then((r) => r[0]);

  const [row] = await db
    .insert(complaintsTable)
    .values({ ...parsed.data, buildingId, unitId: unit?.id ?? null })
    .returning();

  res.status(201).json(row);
});

router.patch("/complaints/:id", async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id);
  const parsed = UpdateComplaintBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }

  const updates: Partial<typeof complaintsTable.$inferInsert> = {};
  if (parsed.data.status) updates.status = parsed.data.status;
  if (parsed.data.assigneeName) updates.assigneeName = parsed.data.assigneeName;
  if (parsed.data.resolution) updates.resolution = parsed.data.resolution;
  if (parsed.data.status === "completed") updates.completedAt = new Date();

  const [row] = await db
    .update(complaintsTable)
    .set(updates)
    .where(and(eq(complaintsTable.id, id), eq(complaintsTable.buildingId, buildingId)))
    .returning();

  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.json(row);
});

export default router;
