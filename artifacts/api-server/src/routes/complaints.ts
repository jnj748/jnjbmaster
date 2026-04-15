import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, complaintsTable } from "@workspace/db";
import {
  CreateComplaintBody,
  UpdateComplaintBody,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireRole("manager", "platform_admin", "accountant"));

function getUserBuildingId(req: any): number {
  return req.user?.buildingId ?? 1;
}

router.get("/complaints", async (req, res): Promise<void> => {
  const buildingId = getUserBuildingId(req);
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

router.post("/complaints", async (req, res): Promise<void> => {
  const parsed = CreateComplaintBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const buildingId = getUserBuildingId(req);

  const [row] = await db
    .insert(complaintsTable)
    .values({ ...parsed.data, buildingId })
    .returning();

  res.status(201).json(row);
});

router.patch("/complaints/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const parsed = UpdateComplaintBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const buildingId = getUserBuildingId(req);

  const updates: Record<string, any> = {};
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
