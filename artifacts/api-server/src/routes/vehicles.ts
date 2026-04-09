import { Router, type IRouter } from "express";
import { eq, and, or, ilike, ne, sql } from "drizzle-orm";
import { db, vehiclesTable, tenantsTable, notificationsTable } from "@workspace/db";
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

  const [vehicle] = await db.insert(vehiclesTable).values(parsed.data).returning();

  await db.insert(notificationsTable).values({
    recipientType: "admin",
    notificationType: "vehicle_registered",
    title: "차량 등록",
    message: `${vehicle.unit}호 ${vehicle.vehicleNumber} 차량이 등록되었습니다.`,
    relatedEntityType: "vehicle",
    relatedEntityId: vehicle.id,
  });

  res.status(201).json(GetVehicleResponse.parse(vehicle));
});

router.get("/vehicles/unregistered", async (req, res): Promise<void> => {
  const allVehicles = await db.select().from(vehiclesTable);
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

export default router;
