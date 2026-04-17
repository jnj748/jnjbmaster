import { Router, type IRouter } from "express";
import { eq, and, or, ilike, ne, gte, sql, inArray } from "drizzle-orm";
import { db, vehiclesTable, tenantsTable, notificationsTable, vehicleHistoryTable, unitsTable, usersTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import {
  ListVehiclesQueryParams,
  ListVehiclesResponse,
  CreateVehicleBody,
  GetVehicleParams,
  GetVehicleResponse,
  UpdateVehicleParams,
  UpdateVehicleBody,
  UpdateVehicleResponse,
  DeleteVehicleParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

const adminOnly = requireRole("manager", "platform_admin", "facility_staff");
const MAX_ADDITIONAL_VEHICLES = 4;

router.get("/vehicles", async (req, res): Promise<void> => {
  const params = ListVehiclesQueryParams.safeParse(req.query);
  const conditions = [];

  if (params.success) {
    if (params.data.unit) {
      conditions.push(eq(vehiclesTable.unit, params.data.unit));
    }
    if (params.data.tenantId) {
      conditions.push(eq(vehiclesTable.tenantId, params.data.tenantId));
    }
    if (params.data.status) {
      conditions.push(eq(vehiclesTable.status, params.data.status));
    }
    if (params.data.search) {
      conditions.push(
        or(
          ilike(vehiclesTable.vehicleNumber, `%${params.data.search}%`),
          ilike(vehiclesTable.unit, `%${params.data.search}%`),
          ilike(vehiclesTable.ownerName, `%${params.data.search}%`)
        )
      );
    }
  }

  const vehicles = await db
    .select()
    .from(vehiclesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(vehiclesTable.unit);

  res.json(ListVehiclesResponse.parse(vehicles));
});

router.post("/vehicles", async (req, res): Promise<void> => {
  const parsed = CreateVehicleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const unitTenants = await db
    .select()
    .from(tenantsTable)
    .where(and(eq(tenantsTable.unit, parsed.data.unit), eq(tenantsTable.status, "active")));

  if (unitTenants.length > 0) {
    const hasVerified = unitTenants.some((t) => t.verificationStatus === "verified");
    if (!hasVerified) {
      res.status(400).json({
        error: "해당 호실의 입주자카드가 승인되지 않았습니다. 입주자카드 승인 후 차량을 등록해 주세요.",
        verificationRequired: true,
      });
      return;
    }
  }

  if (parsed.data.tenantId) {
    const [tenant] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, parsed.data.tenantId));
    if (!tenant) {
      res.status(400).json({ error: "해당 입주자를 찾을 수 없습니다." });
      return;
    }
    if (tenant.unit !== parsed.data.unit) {
      res.status(400).json({ error: `입주자의 호실(${tenant.unit})과 입력한 호실(${parsed.data.unit})이 일치하지 않습니다.` });
      return;
    }
  }

  const existingVehicles = await db
    .select()
    .from(vehiclesTable)
    .where(eq(vehiclesTable.unit, parsed.data.unit));

  if (!parsed.data.isPrimary) {
    const additionalCount = existingVehicles.filter((v) => !v.isPrimary).length;
    if (additionalCount >= MAX_ADDITIONAL_VEHICLES) {
      res.status(400).json({ error: `추가 차량은 호실당 최대 ${MAX_ADDITIONAL_VEHICLES}대까지 등록 가능합니다.` });
      return;
    }
  }

  const userId = req.user?.userId;
  let vehicleBuildingId: number | null = null;
  if (userId) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    vehicleBuildingId = user?.buildingId ?? null;
  }

  const [vehicle] = await db.insert(vehiclesTable).values({
    ...parsed.data,
    buildingId: vehicleBuildingId,
  }).returning();

  await db.insert(notificationsTable).values({
    recipientType: "admin",
    notificationType: "vehicle_registered",
    title: "차량 등록",
    message: `${vehicle.unit}호 ${vehicle.vehicleNumber} 차량이 등록되었습니다.`,
    relatedEntityType: "vehicle",
    relatedEntityId: vehicle.id,
  });

  await db.insert(vehicleHistoryTable).values({
    vehicleId: vehicle.id,
    action: "registered",
    vehicleNumber: vehicle.vehicleNumber,
    unit: vehicle.unit,
    performedBy: "admin",
    notes: "차량 등록",
  });

  res.status(201).json(GetVehicleResponse.parse(vehicle));
});

router.get("/vehicles/unregistered", async (req, res): Promise<void> => {
  const allVehicles = await db.select().from(vehiclesTable).where(eq(vehiclesTable.status, "registered"));
  const registeredUnits = new Set(allVehicles.map((v) => v.unit));

  const allTenants = await db
    .select({ unit: tenantsTable.unit, tenantName: tenantsTable.tenantName })
    .from(tenantsTable)
    .where(eq(tenantsTable.status, "active"));

  const unregisteredUnits = allTenants.filter((t) => !registeredUnits.has(t.unit));

  res.json({
    unregisteredUnits,
    totalActiveUnits: allTenants.length,
    registeredUnits: registeredUnits.size,
    unregisteredCount: unregisteredUnits.length,
  });
});

router.get("/vehicles/:id", async (req, res): Promise<void> => {
  const params = GetVehicleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [vehicle] = await db
    .select()
    .from(vehiclesTable)
    .where(eq(vehiclesTable.id, params.data.id));

  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  res.json(GetVehicleResponse.parse(vehicle));
});

router.patch("/vehicles/:id", async (req, res): Promise<void> => {
  const params = UpdateVehicleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateVehicleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(vehiclesTable)
    .where(eq(vehiclesTable.id, params.data.id));

  if (!existing) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  const targetUnit = parsed.data.unit ?? existing.unit;
  const targetIsPrimary = parsed.data.isPrimary ?? existing.isPrimary;

  if (parsed.data.tenantId) {
    const [tenant] = await db
      .select()
      .from(tenantsTable)
      .where(eq(tenantsTable.id, parsed.data.tenantId));
    if (!tenant) {
      res.status(400).json({ error: "해당 입주자를 찾을 수 없습니다." });
      return;
    }
    if (tenant.unit !== targetUnit) {
      res.status(400).json({ error: `입주자의 호실(${tenant.unit})과 입력한 호실(${targetUnit})이 일치하지 않습니다.` });
      return;
    }
  }

  if (!targetIsPrimary) {
    const existingAdditional = await db
      .select()
      .from(vehiclesTable)
      .where(
        and(
          eq(vehiclesTable.unit, targetUnit),
          eq(vehiclesTable.isPrimary, false),
          ne(vehiclesTable.id, params.data.id)
        )
      );
    if (existingAdditional.length >= MAX_ADDITIONAL_VEHICLES) {
      res.status(400).json({ error: `추가 차량은 호실당 최대 ${MAX_ADDITIONAL_VEHICLES}대까지 등록 가능합니다.` });
      return;
    }
  }

  const [vehicle] = await db
    .update(vehiclesTable)
    .set(parsed.data)
    .where(eq(vehiclesTable.id, params.data.id))
    .returning();

  res.json(UpdateVehicleResponse.parse(vehicle));
});

router.delete("/vehicles/:id", async (req, res): Promise<void> => {
  const params = DeleteVehicleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [vehicle] = await db
    .delete(vehiclesTable)
    .where(eq(vehiclesTable.id, params.data.id))
    .returning();

  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/vehicles/:id/cancel", adminOnly, async (req, res): Promise<void> => {
  const idParam = parseInt(req.params.id);
  if (isNaN(idParam)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const notes = req.body?.notes || "차량 말소 처리";

  const [vehicle] = await db
    .update(vehiclesTable)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(and(eq(vehiclesTable.id, idParam), eq(vehiclesTable.status, "registered")))
    .returning();

  if (!vehicle) {
    res.status(404).json({ error: "차량을 찾을 수 없거나 이미 말소 처리되었습니다." });
    return;
  }

  await db.insert(vehicleHistoryTable).values({
    vehicleId: vehicle.id,
    action: "cancelled",
    vehicleNumber: vehicle.vehicleNumber,
    unit: vehicle.unit,
    performedBy: "admin",
    notes,
  });

  await db.insert(notificationsTable).values({
    recipientType: "admin",
    notificationType: "vehicle_cancelled",
    title: "차량 말소",
    message: `${vehicle.unit}호 ${vehicle.vehicleNumber} 차량이 말소 처리되었습니다.`,
    relatedEntityType: "vehicle",
    relatedEntityId: vehicle.id,
  });

  res.json(GetVehicleResponse.parse(vehicle));
});

router.post("/vehicles/batch-cancel", adminOnly, async (req, res): Promise<void> => {
  const { ids, notes } = req.body || {};
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids array is required" });
    return;
  }

  const vehicles = await db
    .update(vehiclesTable)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(and(inArray(vehiclesTable.id, ids), eq(vehiclesTable.status, "registered")))
    .returning();

  for (const vehicle of vehicles) {
    await db.insert(vehicleHistoryTable).values({
      vehicleId: vehicle.id,
      action: "cancelled",
      vehicleNumber: vehicle.vehicleNumber,
      unit: vehicle.unit,
      performedBy: "admin",
      notes: notes || "일괄 말소 처리",
    });
  }

  if (vehicles.length > 0) {
    await db.insert(notificationsTable).values({
      recipientType: "admin",
      notificationType: "vehicle_batch_cancelled",
      title: "차량 일괄 말소",
      message: `${vehicles.length}대의 차량이 일괄 말소 처리되었습니다.`,
      relatedEntityType: "vehicle",
    });
  }

  res.json({ cancelledCount: vehicles.length });
});

router.get("/vehicles/:id/history", async (req, res): Promise<void> => {
  const idParam = parseInt(req.params.id);
  if (isNaN(idParam)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const history = await db
    .select()
    .from(vehicleHistoryTable)
    .where(eq(vehicleHistoryTable.vehicleId, idParam))
    .orderBy(sql`${vehicleHistoryTable.createdAt} DESC`);

  res.json(history);
});

router.post("/vehicles/inspection", adminOnly, async (_req, res): Promise<void> => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const existingInspection = await db
    .select()
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.notificationType, "vehicle_monthly_inspection"),
        gte(notificationsTable.createdAt, monthStart)
      )
    );

  if (existingInspection.length > 0) {
    res.json({ unregisteredCount: 0, notificationCreated: false, skipped: true, message: "이번 달 점검이 이미 실행되었습니다." });
    return;
  }

  const allVehicles = await db
    .select()
    .from(vehiclesTable)
    .where(eq(vehiclesTable.status, "registered"));

  const registeredUnits = new Set(allVehicles.map((v) => v.unit));

  const allTenants = await db
    .select({ unit: tenantsTable.unit, tenantName: tenantsTable.tenantName })
    .from(tenantsTable)
    .where(eq(tenantsTable.status, "active"));

  const unregisteredUnits = allTenants.filter((t) => !registeredUnits.has(t.unit));

  let notificationCreated = false;

  if (unregisteredUnits.length > 0) {
    const unitList = unregisteredUnits
      .slice(0, 10)
      .map((u) => `${u.unit}호`)
      .join(", ");
    const suffix = unregisteredUnits.length > 10 ? ` 외 ${unregisteredUnits.length - 10}건` : "";

    await db.insert(notificationsTable).values({
      recipientType: "admin",
      notificationType: "vehicle_monthly_inspection",
      title: "월별 차량 점검 알림",
      message: `미등록 차량 ${unregisteredUnits.length}건 확인 필요: ${unitList}${suffix}`,
      relatedEntityType: "vehicle",
    });
    notificationCreated = true;
  }

  res.json({ unregisteredCount: unregisteredUnits.length, notificationCreated, skipped: false });
});

export default router;
