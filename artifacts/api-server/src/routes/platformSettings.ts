import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db, platformSettingsTable } from "@workspace/db";
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

router.put("/platform-settings", requireRole("platform_admin", "hq_executive"), async (req, res): Promise<void> => {
  const parsed = UpdateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, parsed.data.key));
  if (existing.length > 0) {
    const [updated] = await db
      .update(platformSettingsTable)
      .set({ value: parsed.data.value, description: parsed.data.description ?? existing[0].description })
      .where(eq(platformSettingsTable.key, parsed.data.key))
      .returning();
    res.json(updated);
    return;
  }
  const [created] = await db
    .insert(platformSettingsTable)
    .values({ key: parsed.data.key, value: parsed.data.value, description: parsed.data.description ?? null })
    .returning();
  res.status(201).json(created);
});

export default router;
