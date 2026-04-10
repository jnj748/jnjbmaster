import { Router, type IRouter } from "express";
import { eq, and, or, ilike } from "drizzle-orm";
import { db, ownersTable, notificationsTable } from "@workspace/db";
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

const router: IRouter = Router();

router.get("/owners", async (req, res): Promise<void> => {
  const params = ListOwnersQueryParams.safeParse(req.query);
  const conditions = [];

  if (params.success) {
    if (params.data.status) {
      conditions.push(eq(ownersTable.status, params.data.status));
    }
    if (params.data.unit) {
      conditions.push(eq(ownersTable.unit, params.data.unit));
    }
    if (params.data.search) {
      conditions.push(
        or(
          ilike(ownersTable.ownerName, `%${params.data.search}%`),
          ilike(ownersTable.unit, `%${params.data.search}%`),
          ilike(ownersTable.phone, `%${params.data.search}%`)
        )
      );
    }
  }

  const owners = await db
    .select()
    .from(ownersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(ownersTable.unit);

  res.json(ListOwnersResponse.parse(owners));
});

router.post("/owners", async (req, res): Promise<void> => {
  const parsed = CreateOwnerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let dataDestructionDate: string | undefined;
  if (parsed.data.moveOutDate) {
    const d = new Date(parsed.data.moveOutDate);
    d.setFullYear(d.getFullYear() + 3);
    dataDestructionDate = d.toISOString().split("T")[0];
  }

  const [owner] = await db.insert(ownersTable).values({
    ...parsed.data,
    ...(dataDestructionDate ? { dataDestructionDate } : {}),
  }).returning();

  await db.insert(notificationsTable).values({
    recipientType: "admin",
    notificationType: "owner_registered",
    title: "소유자 등록",
    message: `${owner.unit}호 ${owner.ownerName} 소유자가 등록되었습니다.`,
    relatedEntityType: "owner",
    relatedEntityId: owner.id,
  });

  res.status(201).json(GetOwnerResponse.parse(owner));
});

router.get("/owners/:id", async (req, res): Promise<void> => {
  const params = GetOwnerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [owner] = await db
    .select()
    .from(ownersTable)
    .where(eq(ownersTable.id, params.data.id));

  if (!owner) {
    res.status(404).json({ error: "Owner not found" });
    return;
  }

  res.json(GetOwnerResponse.parse(owner));
});

router.patch("/owners/:id", async (req, res): Promise<void> => {
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

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.moveOutDate) {
    const destructionDate = new Date(parsed.data.moveOutDate);
    destructionDate.setFullYear(destructionDate.getFullYear() + 3);
    updateData.dataDestructionDate = destructionDate.toISOString().split("T")[0];
  }

  const [owner] = await db
    .update(ownersTable)
    .set(updateData)
    .where(eq(ownersTable.id, params.data.id))
    .returning();

  if (!owner) {
    res.status(404).json({ error: "Owner not found" });
    return;
  }

  await db.insert(notificationsTable).values({
    recipientType: "admin",
    notificationType: "owner_updated",
    title: "소유자 정보 변경",
    message: `${owner.unit}호 ${owner.ownerName} 소유자 정보가 변경되었습니다.`,
    relatedEntityType: "owner",
    relatedEntityId: owner.id,
  });

  res.json(UpdateOwnerResponse.parse(owner));
});

router.delete("/owners/:id", async (req, res): Promise<void> => {
  const params = DeleteOwnerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [owner] = await db
    .delete(ownersTable)
    .where(eq(ownersTable.id, params.data.id))
    .returning();

  if (!owner) {
    res.status(404).json({ error: "Owner not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
