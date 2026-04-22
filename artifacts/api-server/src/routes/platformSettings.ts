import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, platformSettingsTable, usersTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/platform-settings", requireRole("manager", "platform_admin", "hq_executive", "accountant", "partner"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(platformSettingsTable).orderBy(platformSettingsTable.key);
  res.json(rows);
});

const UpdateBody = z.object({
  key: z.string().min(1),
  value: z.string(),
  description: z.string().optional().nullable(),
});

// UI matrix restricts PUT to platform_admin only (manager-app/src/lib/permissions.ts).
router.put("/platform-settings", requireRole("platform_admin"), async (req, res): Promise<void> => {
  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // [Task #226] 정책 변경 이력 표시(누가 마지막으로 저장했는지) 기록.
  const actorId = req.user?.userId ?? null;
  let actorName: string | null = null;
  if (actorId) {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, actorId));
    actorName = u?.name ?? req.user?.email ?? null;
  }
  const existing = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, parsed.data.key));
  if (existing.length > 0) {
    const [updated] = await db
      .update(platformSettingsTable)
      .set({ value: parsed.data.value, description: parsed.data.description ?? existing[0].description, updatedBy: actorName })
      .where(eq(platformSettingsTable.key, parsed.data.key))
      .returning();
    res.json(updated);
    return;
  }
  const [created] = await db
    .insert(platformSettingsTable)
    .values({ key: parsed.data.key, value: parsed.data.value, description: parsed.data.description ?? null, updatedBy: actorName })
    .returning();
  res.status(201).json(created);
});

export default router;
