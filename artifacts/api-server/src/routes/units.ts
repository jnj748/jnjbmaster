import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, ilike, or, sql } from "drizzle-orm";
import { db, unitsTable, usersTable, tenantsTable, ownersTable, vehiclesTable } from "@workspace/db";
import {
  ListUnitsQueryParams,
  CreateUnitBody,
  GetUnitParams,
  UpdateUnitParams,
  UpdateUnitBody,
  BulkCreateUnitsBody,
  GenerateUnitsBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

async function getUserBuildingId(req: Request): Promise<number | null> {
  const userId = req.user?.userId;
  if (!userId) return null;
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  return user?.buildingId ?? null;
}

router.get("/units", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.json([]);
    return;
  }

  const params = ListUnitsQueryParams.safeParse(req.query);
  const conditions = [eq(unitsTable.buildingId, buildingId)];

  if (params.success) {
    if (params.data.status) {
      conditions.push(eq(unitsTable.status, params.data.status));
    }
    if (params.data.floor !== undefined) {
      conditions.push(eq(unitsTable.floor, params.data.floor));
    }
    if (params.data.search) {
      conditions.push(
        or(
          ilike(unitsTable.unitNumber, `%${params.data.search}%`),
          ilike(unitsTable.usage, `%${params.data.search}%`)
        )!
      );
    }
  }

  const units = await db
    .select({
      id: unitsTable.id,
      buildingId: unitsTable.buildingId,
      unitNumber: unitsTable.unitNumber,
      floor: unitsTable.floor,
      exclusiveArea: unitsTable.exclusiveArea,
      commonArea: unitsTable.commonArea,
      usage: unitsTable.usage,
      notes: unitsTable.notes,
      status: unitsTable.status,
      createdAt: unitsTable.createdAt,
      updatedAt: unitsTable.updatedAt,
      tenantCount: sql<number>`(SELECT count(*)::int FROM tenants WHERE (tenants.unit_id = units.id OR (tenants.unit_id IS NULL AND tenants.unit = units.unit_number)) AND tenants.status = 'active')`,
      ownerCount: sql<number>`(SELECT count(*)::int FROM owners WHERE (owners.unit_id = units.id OR (owners.unit_id IS NULL AND owners.unit = units.unit_number)) AND owners.status = 'active')`,
      vehicleCount: sql<number>`(SELECT count(*)::int FROM vehicles v JOIN tenants t ON v.tenant_id = t.id WHERE (t.unit_id = units.id OR (t.unit_id IS NULL AND t.unit = units.unit_number)) AND v.status = 'registered')`,
    })
    .from(unitsTable)
    .where(and(...conditions))
    .orderBy(unitsTable.floor, unitsTable.unitNumber);

  res.json(units);
});

router.get("/units/summary", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.json({ total: 0, occupied: 0, vacant: 0, maintenance: 0 });
    return;
  }

  const result = await db
    .select({
      status: unitsTable.status,
      count: sql<number>`count(*)::int`,
    })
    .from(unitsTable)
    .where(eq(unitsTable.buildingId, buildingId))
    .groupBy(unitsTable.status);

  const summary = { total: 0, occupied: 0, vacant: 0, maintenance: 0 };
  for (const row of result) {
    const count = Number(row.count);
    summary.total += count;
    if (row.status === "occupied") summary.occupied = count;
    else if (row.status === "vacant") summary.vacant = count;
    else if (row.status === "maintenance") summary.maintenance = count;
  }

  res.json(summary);
});

router.get("/units/:id", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.status(403).json({ error: "건물이 등록되지 않았습니다" });
    return;
  }

  const params = GetUnitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [unit] = await db
    .select()
    .from(unitsTable)
    .where(and(eq(unitsTable.id, params.data.id), eq(unitsTable.buildingId, buildingId)));

  if (!unit) {
    res.status(404).json({ error: "Unit not found" });
    return;
  }

  const tenants = await db
    .select()
    .from(tenantsTable)
    .where(
      and(
        eq(tenantsTable.status, "active"),
        or(
          eq(tenantsTable.unitId, unit.id),
          and(sql`${tenantsTable.unitId} IS NULL`, eq(tenantsTable.unit, unit.unitNumber))
        )
      )
    );

  const owners = await db
    .select()
    .from(ownersTable)
    .where(
      and(
        eq(ownersTable.status, "active"),
        or(
          eq(ownersTable.unitId, unit.id),
          and(sql`${ownersTable.unitId} IS NULL`, eq(ownersTable.unit, unit.unitNumber))
        )
      )
    );

  const vehicles = await db
    .select({ v: vehiclesTable })
    .from(vehiclesTable)
    .innerJoin(tenantsTable, eq(vehiclesTable.tenantId, tenantsTable.id))
    .where(
      and(
        or(
          eq(tenantsTable.unitId, unit.id),
          and(sql`${tenantsTable.unitId} IS NULL`, eq(tenantsTable.unit, unit.unitNumber))
        ),
        eq(vehiclesTable.status, "registered")
      )
    )
    .then(rows => rows.map(r => r.v));

  res.json({ ...unit, tenants, owners, vehicles });
});

router.post("/units/bulk", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.status(403).json({ error: "건물이 등록되지 않았습니다" });
    return;
  }

  const parsed = BulkCreateUnitsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existingUnits = await db
    .select({ unitNumber: unitsTable.unitNumber })
    .from(unitsTable)
    .where(eq(unitsTable.buildingId, buildingId));
  const existingSet = new Set(existingUnits.map(u => u.unitNumber));

  let created = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < parsed.data.units.length; i++) {
    const unit = parsed.data.units[i];

    if (existingSet.has(unit.unitNumber)) {
      errors.push({ row: i + 1, message: `호실번호 '${unit.unitNumber}'가 이미 존재합니다` });
      continue;
    }

    if (unit.exclusiveArea && isNaN(Number(unit.exclusiveArea))) {
      errors.push({ row: i + 1, message: `전용면적 '${unit.exclusiveArea}'가 유효한 숫자가 아닙니다` });
      continue;
    }
    if (unit.commonArea && isNaN(Number(unit.commonArea))) {
      errors.push({ row: i + 1, message: `공용면적 '${unit.commonArea}'가 유효한 숫자가 아닙니다` });
      continue;
    }

    try {
      await db.insert(unitsTable).values({
        buildingId,
        unitNumber: unit.unitNumber,
        floor: unit.floor,
        exclusiveArea: unit.exclusiveArea ?? undefined,
        commonArea: unit.commonArea ?? undefined,
        usage: unit.usage ?? "주거",
        notes: unit.notes ?? undefined,
      });
      existingSet.add(unit.unitNumber);
      created++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      errors.push({ row: i + 1, message });
    }
  }

  res.status(201).json({ created, errors });
});

router.post("/units/generate", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.status(403).json({ error: "건물이 등록되지 않았습니다" });
    return;
  }

  const parsed = GenerateUnitsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { startFloor, endFloor, unitsPerFloor, startUnit, prefix, usage } = parsed.data;
  const start = startUnit ?? 1;

  const existingUnits = await db
    .select({ unitNumber: unitsTable.unitNumber })
    .from(unitsTable)
    .where(eq(unitsTable.buildingId, buildingId));
  const existingSet = new Set(existingUnits.map(u => u.unitNumber));

  const rows = [];
  for (let floor = startFloor; floor <= endFloor; floor++) {
    for (let u = start; u < start + unitsPerFloor; u++) {
      const unitNum = prefix
        ? `${prefix}${String(floor).padStart(2, "0")}${String(u).padStart(2, "0")}`
        : `${floor}${String(u).padStart(2, "0")}`;

      if (!existingSet.has(unitNum)) {
        rows.push({
          buildingId,
          unitNumber: unitNum,
          floor: String(floor),
          usage: usage ?? "주거",
        });
      }
    }
  }

  if (rows.length > 0) {
    await db.insert(unitsTable).values(rows);
  }

  res.status(201).json({ created: rows.length });
});

router.post("/units", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.status(403).json({ error: "건물이 등록되지 않았습니다" });
    return;
  }

  const parsed = CreateUnitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db
    .select({ id: unitsTable.id })
    .from(unitsTable)
    .where(and(eq(unitsTable.buildingId, buildingId), eq(unitsTable.unitNumber, parsed.data.unitNumber)));

  if (existing.length > 0) {
    res.status(409).json({ error: `호실번호 '${parsed.data.unitNumber}'가 이미 존재합니다` });
    return;
  }

  const [unit] = await db.insert(unitsTable).values({
    buildingId,
    unitNumber: parsed.data.unitNumber,
    floor: parsed.data.floor,
    exclusiveArea: parsed.data.exclusiveArea ?? undefined,
    commonArea: parsed.data.commonArea ?? undefined,
    usage: parsed.data.usage ?? "주거",
    notes: parsed.data.notes ?? undefined,
    status: parsed.data.status ?? "vacant",
  }).returning();

  res.status(201).json(unit);
});

router.patch("/units/:id", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.status(403).json({ error: "건물이 등록되지 않았습니다" });
    return;
  }

  const params = UpdateUnitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateUnitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.unitNumber) {
    const existing = await db
      .select({ id: unitsTable.id })
      .from(unitsTable)
      .where(
        and(
          eq(unitsTable.buildingId, buildingId),
          eq(unitsTable.unitNumber, parsed.data.unitNumber),
          sql`${unitsTable.id} != ${params.data.id}`
        )
      );
    if (existing.length > 0) {
      res.status(409).json({ error: `호실번호 '${parsed.data.unitNumber}'가 이미 존재합니다` });
      return;
    }
  }

  const [unit] = await db
    .update(unitsTable)
    .set(parsed.data)
    .where(and(eq(unitsTable.id, params.data.id), eq(unitsTable.buildingId, buildingId)))
    .returning();

  if (!unit) {
    res.status(404).json({ error: "Unit not found" });
    return;
  }

  res.json(unit);
});

router.delete("/units/:id", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) {
    res.status(403).json({ error: "건물이 등록되지 않았습니다" });
    return;
  }

  const params = GetUnitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [unit] = await db
    .delete(unitsTable)
    .where(and(eq(unitsTable.id, params.data.id), eq(unitsTable.buildingId, buildingId)))
    .returning();

  if (!unit) {
    res.status(404).json({ error: "Unit not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
