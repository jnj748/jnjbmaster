import { Router, type IRouter } from "express";
import { eq, and, or, ilike, sql } from "drizzle-orm";
import { db, tenantsTable, notificationsTable, unitsTable, usersTable } from "@workspace/db";
import {
  ListTenantsQueryParams,
  ListTenantsResponse,
  CreateTenantBody,
  GetTenantParams,
  GetTenantResponse,
  UpdateTenantParams,
  UpdateTenantBody,
  UpdateTenantResponse,
  DeleteTenantParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function resolveUnitId(unitNumber: string, userId?: number): Promise<number | null> {
  if (!userId) return null;
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  if (!user?.buildingId) return null;
  const [unit] = await db
    .select({ id: unitsTable.id })
    .from(unitsTable)
    .where(and(eq(unitsTable.buildingId, user.buildingId), eq(unitsTable.unitNumber, unitNumber)));
  return unit?.id ?? null;
}

async function syncUnitStatus(unitNumber: string, userId?: number): Promise<void> {
  if (!userId) return;
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  if (!user?.buildingId) return;
  const [unit] = await db
    .select({ id: unitsTable.id, unitNumber: unitsTable.unitNumber })
    .from(unitsTable)
    .where(and(eq(unitsTable.buildingId, user.buildingId), eq(unitsTable.unitNumber, unitNumber)));
  if (!unit) return;

  const activeTenants = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tenantsTable)
    .where(and(eq(tenantsTable.unitId, unit.id), eq(tenantsTable.status, "active")));

  const hasActive = (activeTenants[0]?.count ?? 0) > 0;
  await db
    .update(unitsTable)
    .set({ status: hasActive ? "occupied" : "vacant" })
    .where(and(eq(unitsTable.id, unit.id), sql`${unitsTable.status} != 'maintenance'`));
}

router.get("/tenants", async (req, res): Promise<void> => {
  const params = ListTenantsQueryParams.safeParse(req.query);
  const conditions = [];

  if (params.success) {
    if (params.data.status) {
      conditions.push(eq(tenantsTable.status, params.data.status));
    }
    if (params.data.unit) {
      conditions.push(eq(tenantsTable.unit, params.data.unit));
    }
    if (params.data.search) {
      conditions.push(
        or(
          ilike(tenantsTable.tenantName, `%${params.data.search}%`),
          ilike(tenantsTable.unit, `%${params.data.search}%`),
          ilike(tenantsTable.phone, `%${params.data.search}%`)
        )
      );
    }
  }

  const tenants = await db
    .select()
    .from(tenantsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(tenantsTable.unit);

  res.json(ListTenantsResponse.parse(tenants));
});

router.post("/tenants", async (req, res): Promise<void> => {
  const parsed = CreateTenantBody.safeParse(req.body);
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

  const unitId = await resolveUnitId(parsed.data.unit, req.user?.userId);

  const [tenant] = await db.insert(tenantsTable).values({
    ...parsed.data,
    unitId,
    ...(dataDestructionDate ? { dataDestructionDate } : {}),
  }).returning();

  await db.insert(notificationsTable).values({
    recipientType: "admin",
    notificationType: "tenant_registered",
    title: "입주자 등록",
    message: `${tenant.unit}호 ${tenant.tenantName} 입주자가 등록되었습니다.`,
    relatedEntityType: "tenant",
    relatedEntityId: tenant.id,
  });

  if (parsed.data.status === "active" || !parsed.data.status) {
    await syncUnitStatus(tenant.unit, req.user?.userId);
  }

  res.status(201).json(GetTenantResponse.parse(tenant));
});

router.get("/tenants/:id", async (req, res): Promise<void> => {
  const params = GetTenantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, params.data.id));

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json(GetTenantResponse.parse(tenant));
});

router.patch("/tenants/:id", async (req, res): Promise<void> => {
  const params = UpdateTenantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateTenantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [oldTenant] = await db
    .select({ unit: tenantsTable.unit })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, params.data.id));
  const oldUnitNumber = oldTenant?.unit;

  const updateData: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.moveOutDate) {
    const destructionDate = new Date(parsed.data.moveOutDate);
    destructionDate.setFullYear(destructionDate.getFullYear() + 3);
    updateData.dataDestructionDate = destructionDate.toISOString().split("T")[0];
  }

  if (parsed.data.unit !== undefined) {
    const unitId = await resolveUnitId(parsed.data.unit, req.user?.userId);
    updateData.unitId = unitId;
  }

  const [tenant] = await db
    .update(tenantsTable)
    .set(updateData)
    .where(eq(tenantsTable.id, params.data.id))
    .returning();

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  await db.insert(notificationsTable).values({
    recipientType: "admin",
    notificationType: "tenant_updated",
    title: "입주자 정보 변경",
    message: `${tenant.unit}호 ${tenant.tenantName} 입주자 정보가 변경되었습니다.`,
    relatedEntityType: "tenant",
    relatedEntityId: tenant.id,
  });

  await syncUnitStatus(tenant.unit, req.user?.userId);
  if (oldUnitNumber && oldUnitNumber !== tenant.unit) {
    await syncUnitStatus(oldUnitNumber, req.user?.userId);
  }

  res.json(UpdateTenantResponse.parse(tenant));
});

router.delete("/tenants/:id", async (req, res): Promise<void> => {
  const params = DeleteTenantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [tenant] = await db
    .delete(tenantsTable)
    .where(eq(tenantsTable.id, params.data.id))
    .returning();

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  await syncUnitStatus(tenant.unit, req.user?.userId);

  res.sendStatus(204);
});

export default router;
