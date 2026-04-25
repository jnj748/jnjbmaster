import { Router, type IRouter, type Request } from "express";
import { eq, and, or, ilike, sql, inArray } from "drizzle-orm";
import { db, tenantsTable, notificationsTable, unitsTable, usersTable, tenantCardTokensTable } from "@workspace/db";
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
  VerifyTenantBody,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { getUserBuildingId } from "../middlewares/buildingScope";

const router: IRouter = Router();
router.use("/tenants", requireRole("manager", "platform_admin", "accountant"));
// Sub-select of unit IDs scoped to the caller's building.
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

async function syncUnitStatus(unitNumber: string, buildingId: number): Promise<void> {
  const [unit] = await db
    .select({ id: unitsTable.id })
    .from(unitsTable)
    .where(and(eq(unitsTable.buildingId, buildingId), eq(unitsTable.unitNumber, unitNumber)));
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

// Verify the tenant id belongs to the caller's building. Returns the row or null.
async function fetchTenantInBuilding(tenantId: number, buildingId: number) {
  const [t] = await db
    .select()
    .from(tenantsTable)
    .where(and(eq(tenantsTable.id, tenantId), inArray(tenantsTable.unitId, unitIdsInBuilding(buildingId))));
  return t ?? null;
}

router.get("/tenants", async (req: Request, res): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.json([]);
    return;
  }

  const params = ListTenantsQueryParams.safeParse(req.query);
  const conditions = [inArray(tenantsTable.unitId, unitIdsInBuilding(buildingId))];

  if (params.success) {
    if (params.data.status) {
      conditions.push(eq(tenantsTable.status, params.data.status));
    }
    if (params.data.unit) {
      conditions.push(eq(tenantsTable.unit, params.data.unit));
    }
    if (params.data.search) {
      const search = or(
        ilike(tenantsTable.tenantName, `%${params.data.search}%`),
        ilike(tenantsTable.unit, `%${params.data.search}%`),
        ilike(tenantsTable.phone, `%${params.data.search}%`)
      );
      if (search) conditions.push(search);
    }
  }

  const tenants = await db
    .select()
    .from(tenantsTable)
    .where(and(...conditions))
    .orderBy(tenantsTable.unit);

  res.json(ListTenantsResponse.parse(tenants));
});

router.post("/tenants", async (req: Request, res): Promise<void> => {
  const parsed = CreateTenantBody.safeParse(req.body);
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
  const [tenant] = await db.insert(tenantsTable).values({
    ...parsed.data,
    unitId,
    ...(dataDestructionDate ? { dataDestructionDate } : {}),
  } as never).returning();

  await db.insert(notificationsTable).values({
    recipientType: "admin",
    notificationType: "tenant_registered",
    title: "입주자 등록",
    message: `${tenant.unit}호 ${tenant.tenantName} 입주자가 등록되었습니다.`,
    relatedEntityType: "tenant",
    relatedEntityId: tenant.id,
  });

  // CreateTenantBody 에 status 필드는 없으므로 기본 "active" 로 가정하고 동기화한다.
  await syncUnitStatus(tenant.unit, buildingId);

  res.status(201).json(GetTenantResponse.parse(tenant));
});

router.get("/tenants/:id", async (req: Request, res): Promise<void> => {
  const params = GetTenantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const tenant = await fetchTenantInBuilding(params.data.id, buildingId);
  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json(GetTenantResponse.parse(tenant));
});

router.patch("/tenants/:id", async (req: Request, res): Promise<void> => {
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

  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const oldTenant = await fetchTenantInBuilding(params.data.id, buildingId);
  if (!oldTenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }
  const oldUnitNumber = oldTenant.unit;

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

  const [tenant] = await db
    .update(tenantsTable)
    .set(updateData)
    .where(and(eq(tenantsTable.id, params.data.id), inArray(tenantsTable.unitId, unitIdsInBuilding(buildingId))))
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

  await syncUnitStatus(tenant.unit, buildingId);
  if (oldUnitNumber && oldUnitNumber !== tenant.unit) {
    await syncUnitStatus(oldUnitNumber, buildingId);
  }

  res.json(UpdateTenantResponse.parse(tenant));
});

router.delete("/tenants/:id", async (req: Request, res): Promise<void> => {
  const params = DeleteTenantParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const [tenant] = await db
    .delete(tenantsTable)
    .where(and(eq(tenantsTable.id, params.data.id), inArray(tenantsTable.unitId, unitIdsInBuilding(buildingId))))
    .returning();

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  await syncUnitStatus(tenant.unit, buildingId);

  res.sendStatus(204);
});

router.post("/tenants/:id/verify", async (req: Request, res): Promise<void> => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const parsed = VerifyTenantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.status(404).json({ error: "입주자를 찾을 수 없습니다." });
    return;
  }

  const existing = await fetchTenantInBuilding(id, buildingId);
  if (!existing) {
    res.status(404).json({ error: "입주자를 찾을 수 없습니다." });
    return;
  }

  const userId = req.user?.userId;
  const requestUser = userId
    ? await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0])
    : null;

  const userName = requestUser?.name || "관리소장";

  if (parsed.data.action === "approve") {
    const [tenant] = await db
      .update(tenantsTable)
      .set({
        verificationStatus: "verified",
        verifiedAt: new Date(),
        verifiedBy: userName,
      })
      .where(eq(tenantsTable.id, id))
      .returning();

    if (existing.unitId) {
      const submittedTokens = await db
        .select()
        .from(tenantCardTokensTable)
        .where(
          and(
            eq(tenantCardTokensTable.unitId, existing.unitId),
            eq(tenantCardTokensTable.status, "submitted")
          )
        )
        .orderBy(sql`${tenantCardTokensTable.createdAt} DESC`)
        .limit(1);

      if (submittedTokens.length > 0) {
        await db
          .update(tenantCardTokensTable)
          .set({ status: "approved", approvedAt: new Date(), approvedBy: userName })
          .where(eq(tenantCardTokensTable.id, submittedTokens[0].id));
      }
    }

    await db.insert(notificationsTable).values({
      recipientType: "admin",
      notificationType: "tenant_verified",
      title: "입주자카드 승인 완료",
      message: `${tenant.unit}호 ${tenant.tenantName} 입주자카드가 승인되었습니다.`,
      relatedEntityType: "tenant",
      relatedEntityId: tenant.id,
    });

    res.json(GetTenantResponse.parse(tenant));
  } else {
    const [tenant] = await db
      .update(tenantsTable)
      .set({
        verificationStatus: "rejected",
      })
      .where(eq(tenantsTable.id, id))
      .returning();

    if (existing.unitId) {
      const submittedTokens = await db
        .select()
        .from(tenantCardTokensTable)
        .where(
          and(
            eq(tenantCardTokensTable.unitId, existing.unitId),
            eq(tenantCardTokensTable.status, "submitted")
          )
        )
        .orderBy(sql`${tenantCardTokensTable.createdAt} DESC`)
        .limit(1);

      if (submittedTokens.length > 0) {
        await db
          .update(tenantCardTokensTable)
          .set({
            status: "rejected",
            rejectionReason: parsed.data.rejectionReason || null,
          })
          .where(eq(tenantCardTokensTable.id, submittedTokens[0].id));
      }
    }

    res.json(GetTenantResponse.parse(tenant));
  }
});

export default router;
