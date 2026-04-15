import { Router, type IRouter } from "express";
import { eq, and, ilike, or } from "drizzle-orm";
import { db, unitsTable } from "@workspace/db";
import {
  ListUnitsQueryParams,
  ListUnitsResponse,
  CreateUnitBody,
  GetUnitParams,
  GetUnitResponse,
  UpdateUnitParams,
  UpdateUnitBody,
  UpdateUnitResponse,
  DeleteUnitParams,
  BulkCreateUnitsBody,
  GenerateUnitsBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/units", async (req, res): Promise<void> => {
  const params = ListUnitsQueryParams.safeParse(req.query);
  const conditions = [];

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
        )
      );
    }
  }

  const units = await db
    .select()
    .from(unitsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(unitsTable.floor, unitsTable.unitNumber);

  res.json(ListUnitsResponse.parse(units));
});

router.post("/units/bulk", async (req, res): Promise<void> => {
  const parsed = BulkCreateUnitsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let created = 0;
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < parsed.data.units.length; i++) {
    const unit = parsed.data.units[i];
    try {
      await db.insert(unitsTable).values({
        unitNumber: unit.unitNumber,
        floor: unit.floor,
        exclusiveArea: unit.exclusiveArea ?? undefined,
        commonArea: unit.commonArea ?? undefined,
        usage: unit.usage ?? undefined,
        notes: unit.notes ?? undefined,
      });
      created++;
    } catch (err: any) {
      errors.push({ row: i + 1, message: err.message || "Unknown error" });
    }
  }

  res.status(201).json({ created, errors });
});

router.post("/units/generate", async (req, res): Promise<void> => {
  const parsed = GenerateUnitsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { startFloor, endFloor, unitsPerFloor, startUnit, prefix, usage } = parsed.data;
  const start = startUnit ?? 1;
  const rows = [];

  for (let floor = startFloor; floor <= endFloor; floor++) {
    for (let u = start; u < start + unitsPerFloor; u++) {
      const unitNum = prefix
        ? `${prefix}${String(floor).padStart(2, "0")}${String(u).padStart(2, "0")}`
        : `${floor}${String(u).padStart(2, "0")}`;
      rows.push({
        unitNumber: unitNum,
        floor,
        usage: usage ?? undefined,
      });
    }
  }

  if (rows.length > 0) {
    await db.insert(unitsTable).values(rows);
  }

  res.status(201).json({ created: rows.length });
});

router.post("/units", async (req, res): Promise<void> => {
  const parsed = CreateUnitBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [unit] = await db.insert(unitsTable).values({
    unitNumber: parsed.data.unitNumber,
    floor: parsed.data.floor,
    exclusiveArea: parsed.data.exclusiveArea ?? undefined,
    commonArea: parsed.data.commonArea ?? undefined,
    usage: parsed.data.usage ?? undefined,
    notes: parsed.data.notes ?? undefined,
  }).returning();

  res.status(201).json(GetUnitResponse.parse(unit));
});

router.get("/units/:id", async (req, res): Promise<void> => {
  const params = GetUnitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [unit] = await db
    .select()
    .from(unitsTable)
    .where(eq(unitsTable.id, params.data.id));

  if (!unit) {
    res.status(404).json({ error: "Unit not found" });
    return;
  }

  res.json(GetUnitResponse.parse(unit));
});

router.patch("/units/:id", async (req, res): Promise<void> => {
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

  const [unit] = await db
    .update(unitsTable)
    .set(parsed.data)
    .where(eq(unitsTable.id, params.data.id))
    .returning();

  if (!unit) {
    res.status(404).json({ error: "Unit not found" });
    return;
  }

  res.json(UpdateUnitResponse.parse(unit));
});

router.delete("/units/:id", async (req, res): Promise<void> => {
  const params = DeleteUnitParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [unit] = await db
    .delete(unitsTable)
    .where(eq(unitsTable.id, params.data.id))
    .returning();

  if (!unit) {
    res.status(404).json({ error: "Unit not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
