import { insertNotification } from "../lib/notificationRecipient";
import { Router, type IRouter, type Request } from "express";
import { eq, and, or, ilike, inArray } from "drizzle-orm";
import { db, ownersTable, notificationsTable, unitsTable } from "@workspace/db";
import {
  ListOwnersQueryParams,
  ListOwnersResponse,
  CreateOwnerBody,
  GetOwnerParams,
  GetOwnerResponse,
  UpdateOwnerParams,
  UpdateOwnerBody,
  UpdateOwnerResponse,
  DeleteOwnerParams,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { getUserBuildingId } from "../middlewares/buildingScope";

const router: IRouter = Router();
router.use("/owners", requireRole("manager", "platform_admin"));
function unitIdsInBuilding(buildingId: number) {
  return db.select({ id: unitsTable.id }).from(unitsTable).where(eq(unitsTable.buildingId, buildingId));
}

async function resolveUnitId(unitNumber: string, buildingId: number): Promise<number | null> {
  const [unit] = await db
    .select({ id: unitsTable.id })
    .from(unitsTable)
    .where(and(eq(unitsTable.buildingId, buildingId), eq(unitsTable.unitNumber, unitNumber)));
  return unit?.id ?? null;
}

router.get("/owners", async (req: Request, res): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.json([]);
    return;
  }

  const params = ListOwnersQueryParams.safeParse(req.query);
  const conditions = [inArray(ownersTable.unitId, unitIdsInBuilding(buildingId))];

  if (params.success) {
    if (params.data.status) {
      conditions.push(eq(ownersTable.status, params.data.status));
    }
    if (params.data.unit) {
      conditions.push(eq(ownersTable.unit, params.data.unit));
    }
    if (params.data.search) {
      const search = or(
        ilike(ownersTable.ownerName, `%${params.data.search}%`),
        ilike(ownersTable.unit, `%${params.data.search}%`),
        ilike(ownersTable.phone, `%${params.data.search}%`)
      );
      if (search) conditions.push(search);
    }
  }

  const owners = await db
    .select()
    .from(ownersTable)
    .where(and(...conditions))
    .orderBy(ownersTable.unit);

  res.json(ListOwnersResponse.parse(owners));
});

router.post("/owners", async (req: Request, res): Promise<void> => {
  const parsed = CreateOwnerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.status(403).json({ error: "건물이 등록되지 않았습니다" });
    return;
  }

  let dataDestructionDate: string | undefined;
  if (parsed.data.moveOutDate) {
    const d = new Date(parsed.data.moveOutDate);
    d.setFullYear(d.getFullYear() + 3);
    dataDestructionDate = d.toISOString().split("T")[0];
  }

  const unitId = await resolveUnitId(parsed.data.unit, buildingId);
  if (!unitId) {
    res.status(400).json({ error: "해당 호실을 찾을 수 없습니다" });
    return;
  }

  // OpenAPI 의 date 컬럼은 문자열 — drizzle 타입과 형식만 다르고 런타임 호환.
  const [owner] = await db.insert(ownersTable).values({
    ...parsed.data,
    unitId,
    ...(dataDestructionDate ? { dataDestructionDate } : {}),
  } as never).returning();

  await insertNotification({
    recipientType: "admin",
    notificationType: "owner_registered",
    title: "소유자 등록",
    message: `${owner.unit}호 ${owner.ownerName} 소유자가 등록되었습니다.`,
    relatedEntityType: "owner",
    relatedEntityId: owner.id,
  });

  res.status(201).json(GetOwnerResponse.parse(owner));
});

router.get("/owners/:id", async (req: Request, res): Promise<void> => {
  const params = GetOwnerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.status(404).json({ error: "Owner not found" });
    return;
  }

  const [owner] = await db
    .select()
    .from(ownersTable)
    .where(and(eq(ownersTable.id, params.data.id), inArray(ownersTable.unitId, unitIdsInBuilding(buildingId))));

  if (!owner) {
    res.status(404).json({ error: "Owner not found" });
    return;
  }

  res.json(GetOwnerResponse.parse(owner));
});

router.patch("/owners/:id", async (req: Request, res): Promise<void> => {
  const params = UpdateOwnerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateOwnerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.status(404).json({ error: "Owner not found" });
    return;
  }

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.moveOutDate) {
    const destructionDate = new Date(parsed.data.moveOutDate);
    destructionDate.setFullYear(destructionDate.getFullYear() + 3);
    updateData.dataDestructionDate = destructionDate.toISOString().split("T")[0];
  }

  if (parsed.data.unit !== undefined) {
    const unitId = await resolveUnitId(parsed.data.unit, buildingId);
    if (!unitId) {
      res.status(400).json({ error: "해당 호실을 찾을 수 없습니다" });
      return;
    }
    updateData.unitId = unitId;
  }

  const [owner] = await db
    .update(ownersTable)
    .set(updateData)
    .where(and(eq(ownersTable.id, params.data.id), inArray(ownersTable.unitId, unitIdsInBuilding(buildingId))))
    .returning();

  if (!owner) {
    res.status(404).json({ error: "Owner not found" });
    return;
  }

  await insertNotification({
    recipientType: "admin",
    notificationType: "owner_updated",
    title: "소유자 정보 변경",
    message: `${owner.unit}호 ${owner.ownerName} 소유자 정보가 변경되었습니다.`,
    relatedEntityType: "owner",
    relatedEntityId: owner.id,
  });

  res.json(UpdateOwnerResponse.parse(owner));
});

router.delete("/owners/:id", async (req: Request, res): Promise<void> => {
  const params = DeleteOwnerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.status(404).json({ error: "Owner not found" });
    return;
  }

  const [owner] = await db
    .delete(ownersTable)
    .where(and(eq(ownersTable.id, params.data.id), inArray(ownersTable.unitId, unitIdsInBuilding(buildingId))))
    .returning();

  if (!owner) {
    res.status(404).json({ error: "Owner not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
