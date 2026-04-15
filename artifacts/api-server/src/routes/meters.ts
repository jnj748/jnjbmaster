import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, meterReadingsTable, unitsTable } from "@workspace/db";
import {
  CreateMeterReadingBody,
  UploadMeterCsvBody,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireRole("manager", "platform_admin", "accountant"));

function getUserBuildingId(req: any): number {
  return req.user?.buildingId ?? 1;
}

router.get("/meters", async (req, res): Promise<void> => {
  const buildingId = getUserBuildingId(req);
  const { meterType, month } = req.query as { meterType?: string; month?: string };

  let rows = await db
    .select()
    .from(meterReadingsTable)
    .where(eq(meterReadingsTable.buildingId, buildingId))
    .orderBy(desc(meterReadingsTable.readingDate));

  if (meterType) {
    rows = rows.filter((r) => r.meterType === meterType);
  }
  if (month) {
    rows = rows.filter((r) => r.readingDate.startsWith(month));
  }

  res.json(rows);
});

router.post("/meters", async (req, res): Promise<void> => {
  const parsed = CreateMeterReadingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const buildingId = getUserBuildingId(req);
  const data = parsed.data;

  const unit = await db
    .select()
    .from(unitsTable)
    .where(and(eq(unitsTable.buildingId, buildingId), eq(unitsTable.unitNumber, data.unitNumber)))
    .then((r) => r[0]);

  const usage = data.previousReading != null
    ? data.currentReading - data.previousReading
    : null;

  let isAnomaly = false;
  let anomalyNote: string | undefined;

  if (usage != null) {
    const recent = await db
      .select()
      .from(meterReadingsTable)
      .where(
        and(
          eq(meterReadingsTable.buildingId, buildingId),
          eq(meterReadingsTable.unitNumber, data.unitNumber),
          eq(meterReadingsTable.meterType, data.meterType)
        )
      )
      .orderBy(desc(meterReadingsTable.readingDate))
      .limit(3);

    if (recent.length > 0) {
      const avgUsage =
        recent.reduce((sum, r) => sum + Number(r.usage || 0), 0) / recent.length;
      if (avgUsage > 0 && usage > avgUsage * 1.3) {
        isAnomaly = true;
        anomalyNote = `사용량 ${usage}이(가) 최근 평균 ${avgUsage.toFixed(1)} 대비 30% 초과`;
      }
    }
  }

  const [row] = await db
    .insert(meterReadingsTable)
    .values({
      buildingId,
      unitId: unit?.id ?? null,
      unitNumber: data.unitNumber,
      meterType: data.meterType,
      readingDate: data.readingDate,
      previousReading: data.previousReading?.toString(),
      currentReading: data.currentReading.toString(),
      usage: usage?.toString(),
      isAnomaly,
      anomalyNote,
    })
    .returning();

  res.status(201).json(row);
});

router.get("/meters/anomalies", async (req, res): Promise<void> => {
  const buildingId = getUserBuildingId(req);
  const rows = await db
    .select()
    .from(meterReadingsTable)
    .where(
      and(
        eq(meterReadingsTable.buildingId, buildingId),
        eq(meterReadingsTable.isAnomaly, true)
      )
    )
    .orderBy(desc(meterReadingsTable.readingDate));

  res.json(rows);
});

router.post("/meters/csv-upload", async (req, res): Promise<void> => {
  const parsed = UploadMeterCsvBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const buildingId = getUserBuildingId(req);
  const { meterType, readingDate, rows: csvRows } = parsed.data;

  let imported = 0;
  let anomalies = 0;
  const errors: string[] = [];

  for (const row of csvRows) {
    try {
      const usage = row.previousReading != null
        ? row.currentReading - row.previousReading
        : null;

      let isAnomaly = false;
      let anomalyNote: string | undefined;

      if (usage != null) {
        const recent = await db
          .select()
          .from(meterReadingsTable)
          .where(
            and(
              eq(meterReadingsTable.buildingId, buildingId),
              eq(meterReadingsTable.unitNumber, row.unitNumber),
              eq(meterReadingsTable.meterType, meterType)
            )
          )
          .orderBy(desc(meterReadingsTable.readingDate))
          .limit(3);

        if (recent.length > 0) {
          const avgUsage =
            recent.reduce((sum, r) => sum + Number(r.usage || 0), 0) / recent.length;
          if (avgUsage > 0 && usage > avgUsage * 1.3) {
            isAnomaly = true;
            anomalyNote = `CSV 업로드: 사용량 ${usage}이(가) 평균 ${avgUsage.toFixed(1)} 대비 30% 초과`;
          }
        }
      }

      const unit = await db
        .select()
        .from(unitsTable)
        .where(and(eq(unitsTable.buildingId, buildingId), eq(unitsTable.unitNumber, row.unitNumber)))
        .then((r) => r[0]);

      await db.insert(meterReadingsTable).values({
        buildingId,
        unitId: unit?.id ?? null,
        unitNumber: row.unitNumber,
        meterType,
        readingDate,
        previousReading: row.previousReading?.toString(),
        currentReading: row.currentReading.toString(),
        usage: usage?.toString(),
        isAnomaly,
        anomalyNote,
      });

      imported++;
      if (isAnomaly) anomalies++;
    } catch (e: any) {
      errors.push(`${row.unitNumber}: ${e.message}`);
    }
  }

  res.json({ imported, anomalies, errors });
});

export default router;
