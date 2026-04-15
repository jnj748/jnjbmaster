import { Router, type IRouter } from "express";
import type { Request } from "express";
import { eq, and } from "drizzle-orm";
import { db, tenantCardTokensTable, usersTable, unitsTable } from "@workspace/db";
import {
  CreateTenantCardTokenBody,
  ListTenantCardTokensResponseItem,
  ListTenantCardTokensQueryParams,
} from "@workspace/api-zod";

import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireRole("manager", "platform_admin"));

async function getUserBuildingId(req: Request): Promise<number | null> {
  const userId = req.user?.userId;
  if (!userId) return null;
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  return user?.buildingId ?? null;
}

router.get("/tenant-card-tokens", async (req, res): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.json([]);
    return;
  }

  const params = ListTenantCardTokensQueryParams.safeParse(req.query);
  const conditions = [eq(tenantCardTokensTable.buildingId, buildingId)];

  if (params.success) {
    if (params.data.status) {
      conditions.push(eq(tenantCardTokensTable.status, params.data.status));
    }
    if (params.data.unitId) {
      conditions.push(eq(tenantCardTokensTable.unitId, params.data.unitId));
    }
  }

  const tokens = await db
    .select()
    .from(tenantCardTokensTable)
    .where(and(...conditions))
    .orderBy(tenantCardTokensTable.createdAt);

  res.json(tokens.map((t) => ListTenantCardTokensResponseItem.parse(t)));
});

router.post("/tenant-card-tokens", async (req, res): Promise<void> => {
  const parsed = CreateTenantCardTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.status(400).json({ error: "건물이 설정되지 않았습니다." });
    return;
  }

  const [unit] = await db
    .select()
    .from(unitsTable)
    .where(and(eq(unitsTable.id, parsed.data.unitId), eq(unitsTable.buildingId, buildingId)));

  if (!unit) {
    res.status(400).json({ error: "해당 호실을 찾을 수 없습니다." });
    return;
  }

  const expiryDays = parsed.data.expiryDays ?? 7;
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiryDays);

  const [token] = await db
    .insert(tenantCardTokensTable)
    .values({
      buildingId,
      unitId: unit.id,
      unitLabel: unit.unitNumber,
      expiresAt,
    })
    .returning();

  res.status(201).json(ListTenantCardTokensResponseItem.parse(token));
});

router.delete("/tenant-card-tokens/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.status(403).json({ error: "권한이 없습니다." });
    return;
  }

  const [deleted] = await db
    .delete(tenantCardTokensTable)
    .where(and(eq(tenantCardTokensTable.id, id), eq(tenantCardTokensTable.buildingId, buildingId)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "토큰을 찾을 수 없습니다." });
    return;
  }

  res.sendStatus(204);
});

export default router;
