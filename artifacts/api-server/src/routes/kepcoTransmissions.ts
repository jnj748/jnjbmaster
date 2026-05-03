// [Task #798] 한전 검침 송신 — 외부 EMS 송신은 mock. 검침값에서 자동 집계 후
//   draft → transmitted 상태 전이만 수행한다.
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, gte, lte, sum } from "drizzle-orm";
import { db, kepcoTransmissionLogTable, meterReadingsTable } from "@workspace/db";
import { CreateKepcoTransmissionBody } from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { getAccessibleBuildingIds, buildingScopeFilter } from "../middlewares/buildingScope";

const router: IRouter = Router();

router.use(
  "/kepco-transmissions",
  requireRole("manager", "accountant", "facility_staff", "hq_executive", "platform_admin"),
);

const WRITER_ROLES = new Set(["manager", "accountant", "facility_staff", "platform_admin"]);

router.get("/kepco-transmissions", async (req: Request, res: Response): Promise<void> => {
  const scope = await getAccessibleBuildingIds(req);
  const sf = buildingScopeFilter(scope, kepcoTransmissionLogTable.buildingId);
  if (sf === "empty") { res.json([]); return; }

  const { buildingId, billingMonth } = req.query as Record<string, string | undefined>;
  const conds = [];
  if (sf) conds.push(sf);
  if (buildingId) {
    const b = Number(buildingId);
    if (Number.isFinite(b)) conds.push(eq(kepcoTransmissionLogTable.buildingId, b));
  }
  if (billingMonth) conds.push(eq(kepcoTransmissionLogTable.billingMonth, billingMonth));

  const rows = await db
    .select()
    .from(kepcoTransmissionLogTable)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(kepcoTransmissionLogTable.readingDate), desc(kepcoTransmissionLogTable.id));
  res.json(rows);
});

router.post("/kepco-transmissions", async (req: Request, res: Response): Promise<void> => {
  const role = req.user?.role;
  if (!role || !WRITER_ROLES.has(role)) {
    res.status(403).json({ error: "한전 송신 입력 권한이 없습니다" });
    return;
  }
  const parsed = CreateKepcoTransmissionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "입력값이 올바르지 않습니다", details: parsed.error.issues });
    return;
  }
  const { buildingId, billingMonth, readingDate, workerName, meters, notes } = parsed.data;

  const scope = await getAccessibleBuildingIds(req);
  if (!scope.unrestricted && !scope.ids.includes(buildingId)) {
    res.status(403).json({ error: "해당 건물 접근 권한이 없습니다" });
    return;
  }

  // AI 자동집계: meters 가 비어있으면 meter_readings 에서 해당 월·건물의 전기 사용량을
  // 집계해 단일 미터(meterNo=1) 페이로드로 시드한다. 사용자는 화면에서 분할만 조정.
  let metersPayload = meters ?? [];
  if (!metersPayload.length) {
    const monthStart = `${billingMonth}-01`;
    const monthEnd = `${billingMonth}-31`;
    const [agg] = await db
      .select({ total: sum(meterReadingsTable.usage) })
      .from(meterReadingsTable)
      .where(and(
        eq(meterReadingsTable.buildingId, buildingId),
        eq(meterReadingsTable.meterType, "electricity"),
        gte(meterReadingsTable.readingDate, monthStart),
        lte(meterReadingsTable.readingDate, monthEnd),
      ));
    const total = agg?.total != null ? Number(agg.total) : 0;
    metersPayload = [{ meterNo: 1, units: null, usage: total, commonUsage: null }];
  }

  const totalUsage = metersPayload.reduce((s, m) => s + (Number(m.usage) || 0), 0);
  const commonUsageTotal = metersPayload.reduce((s, m) => s + (Number(m.commonUsage) || 0), 0);
  const unitsTotal = metersPayload.reduce((s, m) => s + (Number(m.units) || 0), 0);

  const [row] = await db.insert(kepcoTransmissionLogTable).values({
    buildingId,
    billingMonth,
    readingDate,
    workerName: workerName ?? null,
    meters: metersPayload,
    meterCount: metersPayload.length,
    totalUsage: String(totalUsage),
    commonUsageTotal: String(commonUsageTotal),
    unitsTotal: unitsTotal || null,
    notes: notes ?? null,
    status: "draft",
    authorId: req.user?.userId ?? null,
    authorRole: role ?? null,
  }).returning();

  res.status(201).json(row);
});

router.post("/kepco-transmissions/:id/send", async (req: Request, res: Response): Promise<void> => {
  const role = req.user?.role;
  if (!role || !WRITER_ROLES.has(role)) {
    res.status(403).json({ error: "한전 송신 권한이 없습니다" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "id 가 올바르지 않습니다" });
    return;
  }
  const [before] = await db.select().from(kepcoTransmissionLogTable).where(eq(kepcoTransmissionLogTable.id, id));
  if (!before) {
    res.status(404).json({ error: "송신 건을 찾을 수 없습니다" });
    return;
  }
  const scope = await getAccessibleBuildingIds(req);
  if (!scope.unrestricted && !scope.ids.includes(before.buildingId)) {
    res.status(403).json({ error: "해당 건물 접근 권한이 없습니다" });
    return;
  }

  // [mock] 외부 EMS 호출 자리 — 실제 연동 전까지는 즉시 성공 처리.
  const [updated] = await db.update(kepcoTransmissionLogTable)
    .set({ status: "transmitted", transmittedAt: new Date() })
    .where(eq(kepcoTransmissionLogTable.id, id))
    .returning();
  req.log?.info({ transmissionId: id, buildingId: before.buildingId }, "kepco transmission sent (mock)");
  res.json(updated);
});

export default router;
