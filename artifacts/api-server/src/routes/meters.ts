import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, gte, lte, inArray, sql } from "drizzle-orm";
import { db, meterReadingsTable, meterReadingAuditsTable, unitsTable } from "@workspace/db";
import {
  CreateMeterReadingBody,
  UpdateMeterReadingBody,
  UploadMeterCsvBody,
  MeterPhotoOcrBody,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import {
  getUserBuildingId,
  getAccessibleBuildingIds,
  buildingScopeFilter,
} from "../middlewares/buildingScope";
import { ObjectStorageService } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";
import { runMeterPhotoOcr, MeterOcrInputError } from "../lib/meterPhotoOcr";

const router: IRouter = Router();

// [Task #630] 검침 도메인 가시성 정책 (사장 답변 #1~#6 반영):
//   - manager / accountant / facility_staff : 자기 건물 풀권한 (입력·조회·수정).
//   - hq_executive  : 관할 건물(hq_building_assignments) 묶음 읽기만.
//   - platform_admin: 전 건물 단건 조회·집계.
//   - partner       : 비가시 (라우터 진입 자체 거부).
router.use(
  "/meters",
  requireRole(
    "manager",
    "accountant",
    "facility_staff",
    "hq_executive",
    "platform_admin",
  ),
);

// 쓰기 가능한 역할 — 본부장은 읽기만, 본사 어드민은 집계 위주이지만 필요 시 직접
// 입력할 수 있도록 허용한다. 파트너는 위 requireRole 에서 이미 차단됨.
const WRITER_ROLES = new Set(["manager", "accountant", "facility_staff", "platform_admin"]);

function assertWriter(req: Request, res: Response): boolean {
  const role = req.user?.role;
  if (!role || !WRITER_ROLES.has(role)) {
    res.status(403).json({ error: "검침 입력·수정 권한이 없습니다 (조회 전용)" });
    return false;
  }
  return true;
}

router.get("/meters", async (req: Request, res: Response): Promise<void> => {
  const scope = await getAccessibleBuildingIds(req);
  const sf = buildingScopeFilter(scope, meterReadingsTable.buildingId);
  if (sf === "empty") { res.json([]); return; }

  const { meterType, month, unitId, unitNumber, readingType, from, to, limit, buildingId } =
    req.query as Record<string, string | undefined>;

  const conds = [];
  if (sf) conds.push(sf);
  // platform_admin 은 unrestricted 이므로 buildingId 쿼리로 단건 조회를 좁힐 수 있다.
  if (buildingId) {
    const b = Number(buildingId);
    if (Number.isFinite(b)) conds.push(eq(meterReadingsTable.buildingId, b));
  }
  if (meterType) conds.push(eq(meterReadingsTable.meterType, meterType as "water" | "electricity" | "gas" | "heating" | "hot_water"));
  if (readingType === "regular" || readingType === "interim") {
    conds.push(eq(meterReadingsTable.readingType, readingType));
  }
  if (unitId) {
    const n = Number(unitId);
    if (Number.isFinite(n)) conds.push(eq(meterReadingsTable.unitId, n));
  }
  if (unitNumber) conds.push(eq(meterReadingsTable.unitNumber, unitNumber));
  if (from) conds.push(gte(meterReadingsTable.readingDate, from));
  if (to) conds.push(lte(meterReadingsTable.readingDate, to));

  let q = db
    .select()
    .from(meterReadingsTable)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(meterReadingsTable.readingDate), desc(meterReadingsTable.id))
    .$dynamic();

  if (limit) {
    const n = Number(limit);
    if (Number.isFinite(n) && n > 0) q = q.limit(Math.min(n, 1000));
  }

  let rows = await q;
  if (month) rows = rows.filter((r) => r.readingDate.startsWith(month));

  res.json(rows);
});

// 호실별 최근 검침 1건씩 (입력 화면에서 "이미 입력됨/전월값" 표시).
router.get("/meters/latest", async (req: Request, res: Response): Promise<void> => {
  const scope = await getAccessibleBuildingIds(req);
  const sf = buildingScopeFilter(scope, meterReadingsTable.buildingId);
  if (sf === "empty") { res.json([]); return; }

  const meterType = (req.query.meterType as string | undefined) ?? undefined;
  const unitIdsRaw = (req.query.unitIds as string | undefined) ?? "";
  if (!meterType || !["water", "electricity", "gas", "heating", "hot_water"].includes(meterType)) {
    res.status(400).json({ error: "meterType 이 필요합니다" });
    return;
  }
  const unitIds = unitIdsRaw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  const conds = [eq(meterReadingsTable.meterType, meterType as "water" | "electricity" | "gas" | "heating" | "hot_water")];
  if (sf) conds.push(sf);
  if (unitIds.length > 0) conds.push(inArray(meterReadingsTable.unitId, unitIds));

  const rows = await db
    .select()
    .from(meterReadingsTable)
    .where(and(...conds))
    .orderBy(desc(meterReadingsTable.readingDate), desc(meterReadingsTable.id));

  const seen = new Set<string>();
  const latest: typeof rows = [];
  for (const r of rows) {
    const key = r.unitId != null ? `id:${r.unitId}` : `num:${r.unitNumber}-${r.buildingId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    latest.push(r);
  }
  res.json(latest);
});

router.get("/meters/anomalies", async (req: Request, res: Response): Promise<void> => {
  const scope = await getAccessibleBuildingIds(req);
  const sf = buildingScopeFilter(scope, meterReadingsTable.buildingId);
  if (sf === "empty") { res.json([]); return; }
  const conds = [eq(meterReadingsTable.isAnomaly, true)];
  if (sf) conds.push(sf);
  const rows = await db
    .select()
    .from(meterReadingsTable)
    .where(and(...conds))
    .orderBy(desc(meterReadingsTable.readingDate));
  res.json(rows);
});

// CSV 내보내기 — 사용자 지정 필터.
router.get("/meters/export", async (req: Request, res: Response): Promise<void> => {
  const scope = await getAccessibleBuildingIds(req);
  const sf = buildingScopeFilter(scope, meterReadingsTable.buildingId);
  if (sf === "empty") { res.status(403).json({ error: "조회 가능한 건물이 없습니다" }); return; }

  const { meterType, from, to, unitNumber, buildingId } = req.query as Record<string, string | undefined>;
  const conds = [];
  if (sf) conds.push(sf);
  if (buildingId) {
    const b = Number(buildingId);
    if (Number.isFinite(b)) conds.push(eq(meterReadingsTable.buildingId, b));
  }
  if (meterType) conds.push(eq(meterReadingsTable.meterType, meterType as "water" | "electricity" | "gas" | "heating" | "hot_water"));
  if (unitNumber) conds.push(eq(meterReadingsTable.unitNumber, unitNumber));
  if (from) conds.push(gte(meterReadingsTable.readingDate, from));
  if (to) conds.push(lte(meterReadingsTable.readingDate, to));

  const rows = await db
    .select()
    .from(meterReadingsTable)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(meterReadingsTable.readingDate), desc(meterReadingsTable.id));

  const meterLabel: Record<string, string> = { water: "수도", electricity: "전기", gas: "가스", heating: "난방", hot_water: "온수" };
  const typeLabel: Record<string, string> = { regular: "정기", interim: "중간" };
  const inputLabel: Record<string, string> = { manual: "수기", photo: "사진OCR", csv: "CSV" };

  const escape = (v: unknown): string => {
    if (v == null) return "";
    const s = String(v);
    if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = [
    "검침일", "호실", "미터", "검침유형", "전월값", "금월값", "사용량",
    "책임구간시작", "책임구간종료", "입력방법", "이상치", "메모", "입력자역할",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([
      r.readingDate,
      r.unitNumber,
      meterLabel[r.meterType] ?? r.meterType,
      typeLabel[r.readingType] ?? r.readingType,
      r.previousReading ?? "",
      r.currentReading,
      r.usage ?? "",
      r.periodStart ?? "",
      r.periodEnd ?? "",
      inputLabel[r.inputMethod] ?? r.inputMethod,
      r.isAnomaly ? "Y" : "",
      r.anomalyNote ?? "",
      r.authorRole ?? "",
    ].map(escape).join(","));
  }

  const csv = "\uFEFF" + lines.join("\n");
  const filename = `meter-readings-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
  );
  res.send(csv);
});

// 사진 OCR — 입력자만 사용. 본부장은 차단.
router.post("/meters/ocr", async (req: Request, res: Response): Promise<void> => {
  if (!assertWriter(req, res)) return;
  const parsed = MeterPhotoOcrBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const { objectPath, fileName, meterType } = parsed.data;
  try {
    const storage = new ObjectStorageService();
    const objectFile = await storage.getObjectEntityFile(objectPath);
    const allowed = await storage.canAccessObjectEntity({
      userId: req.user?.userId ? String(req.user.userId) : undefined,
      objectFile,
      requestedPermission: ObjectPermission.READ,
    });
    if (!allowed) { res.status(403).json({ error: "해당 파일에 접근할 권한이 없습니다" }); return; }
  } catch {
    res.status(404).json({ error: "파일을 찾지 못했습니다" });
    return;
  }
  try {
    const result = await runMeterPhotoOcr({
      objectPath,
      fileName: fileName ?? null,
      meterType: meterType ?? null,
    });
    res.json(result);
  } catch (err) {
    // [Task #630] 사용자 입력 오류(MIME/용량)는 4xx, 모델/IO 오류는 5xx 로 분기.
    if (err instanceof MeterOcrInputError) {
      req.log.warn({ err: err.message }, "meter ocr input rejected");
      res.status(400).json({ error: err.message });
      return;
    }
    req.log.error({ err }, "meter ocr failed");
    res.status(502).json({ error: err instanceof Error ? err.message : "OCR 처리 실패" });
  }
});

// [Task #630] 사용량 이상치 판정 헬퍼 — 직전 3건 평균 대비 30% 초과 시 표시.
//   POST 와 PUT 양쪽에서 동일 기준을 사용하기 위해 추출.
async function computeAnomaly(input: {
  buildingId: number;
  unitNumber: string;
  meterType: string;
  usage: number | null;
  excludeId: number | null;
}): Promise<{ isAnomaly: boolean; anomalyNote: string | null }> {
  if (input.usage == null) return { isAnomaly: false, anomalyNote: null };
  const conds = [
    eq(meterReadingsTable.buildingId, input.buildingId),
    eq(meterReadingsTable.unitNumber, input.unitNumber),
    sql`${meterReadingsTable.meterType} = ${input.meterType}`,
  ];
  if (input.excludeId != null) {
    conds.push(sql`${meterReadingsTable.id} <> ${input.excludeId}`);
  }
  const recent = await db
    .select()
    .from(meterReadingsTable)
    .where(and(...conds))
    .orderBy(desc(meterReadingsTable.readingDate))
    .limit(3);
  if (recent.length === 0) return { isAnomaly: false, anomalyNote: null };
  const avgUsage = recent.reduce((sum, r) => sum + Number(r.usage || 0), 0) / recent.length;
  if (avgUsage > 0 && input.usage > avgUsage * 1.3) {
    return {
      isAnomaly: true,
      anomalyNote: `사용량 ${input.usage}이(가) 최근 평균 ${avgUsage.toFixed(1)} 대비 30% 초과`,
    };
  }
  return { isAnomaly: false, anomalyNote: null };
}

router.post("/meters", async (req: Request, res: Response): Promise<void> => {
  if (!assertWriter(req, res)) return;
  const parsed = CreateMeterReadingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  // 본사 어드민은 buildingId 를 명시해야 한다. 그 외 역할은 users.buildingId 사용.
  const role = req.user?.role;
  let buildingId: number | null = null;
  if (role === "platform_admin") {
    const explicit = (req.body as { buildingId?: number }).buildingId;
    if (typeof explicit === "number" && Number.isFinite(explicit)) buildingId = explicit;
  } else {
    buildingId = await getUserBuildingId(req);
  }
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const data = parsed.data;

  let unit = null;
  if (data.unitId != null) {
    unit = await db
      .select()
      .from(unitsTable)
      .where(and(eq(unitsTable.buildingId, buildingId), eq(unitsTable.id, data.unitId)))
      .then((r) => r[0]);
  }
  if (!unit) {
    unit = await db
      .select()
      .from(unitsTable)
      .where(and(eq(unitsTable.buildingId, buildingId), eq(unitsTable.unitNumber, data.unitNumber)))
      .then((r) => r[0]);
  }

  let previousReading = data.previousReading;
  if (previousReading == null) {
    const prev = await db
      .select()
      .from(meterReadingsTable)
      .where(
        and(
          eq(meterReadingsTable.buildingId, buildingId),
          eq(meterReadingsTable.unitNumber, data.unitNumber),
          eq(meterReadingsTable.meterType, data.meterType),
        ),
      )
      .orderBy(desc(meterReadingsTable.readingDate), desc(meterReadingsTable.id))
      .limit(1)
      .then((r) => r[0]);
    if (prev) {
      const n = Number(prev.currentReading);
      if (Number.isFinite(n)) previousReading = n;
    }
  }

  const usage = previousReading != null ? data.currentReading - previousReading : null;

  const anomaly = await computeAnomaly({
    buildingId,
    unitNumber: data.unitNumber,
    meterType: data.meterType,
    usage,
    excludeId: null,
  });
  const isAnomaly = anomaly.isAnomaly;
  const anomalyNote = anomaly.anomalyNote;

  const [row] = await db
    .insert(meterReadingsTable)
    .values({
      buildingId,
      unitId: unit?.id ?? null,
      unitNumber: data.unitNumber,
      meterType: data.meterType,
      readingType: data.readingType ?? "regular",
      readingDate: data.readingDate,
      periodStart: data.periodStart ?? null,
      periodEnd: data.periodEnd ?? null,
      tenantId: data.tenantId ?? null,
      previousReading: previousReading?.toString(),
      currentReading: data.currentReading.toString(),
      usage: usage?.toString(),
      inputMethod: data.inputMethod ?? "manual",
      photoObjectPath: data.photoObjectPath ?? null,
      isAnomaly,
      anomalyNote,
      authorId: req.user?.userId ?? null,
      authorRole: role ?? null,
    })
    .returning();

  // 감사로그 — create.
  await db.insert(meterReadingAuditsTable).values({
    meterReadingId: row.id,
    buildingId,
    action: "create",
    actorId: req.user?.userId ?? null,
    actorRole: role ?? null,
    afterJson: row,
    diffSummary: `${row.meterType} ${row.unitNumber} ${row.readingDate} 입력 (${row.currentReading})`,
  });

  // [Task #630] 정기 검침 확정 시 회계 측 재계산 트리거 (정책 답변 #5-a/b).
  // MVP: 구조적 로그로 알림 — 회계 페이지가 동일 데이터를 바로 읽는다.
  if (row.readingType === "regular") {
    req.log.info(
      { buildingId, unitNumber: row.unitNumber, meterType: row.meterType, readingDate: row.readingDate, meterReadingId: row.id },
      "[meter] regular reading saved — fee recalculation source updated",
    );
  }

  res.status(201).json(row);
});

// [Task #630] 부분 수정 — 입력자 본인 또는 관리소장만 (정책 답변 #6).
router.put("/meters/:id", async (req: Request, res: Response): Promise<void> => {
  if (!assertWriter(req, res)) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "잘못된 id" }); return; }
  const parsed = UpdateMeterReadingBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }

  const before = await db.select().from(meterReadingsTable).where(eq(meterReadingsTable.id, id)).then((r) => r[0]);
  if (!before) { res.status(404).json({ error: "검침 행을 찾지 못했습니다" }); return; }

  // 건물 가시성 확인.
  const scope = await getAccessibleBuildingIds(req);
  if (!scope.unrestricted && !scope.ids.includes(before.buildingId)) {
    res.status(403).json({ error: "해당 건물 권한이 없습니다" }); return;
  }

  // 수정 권한: 관리소장 / 본사 어드민 / 본인.
  const role = req.user?.role;
  const isOwner = before.authorId != null && before.authorId === req.user?.userId;
  const isManager = role === "manager" || role === "platform_admin";
  if (!isOwner && !isManager) {
    res.status(403).json({ error: "본인 입력분 또는 관리소장만 수정할 수 있습니다" }); return;
  }

  const data = parsed.data;
  const patch: Record<string, unknown> = {};
  if (data.readingDate !== undefined) patch.readingDate = data.readingDate;
  if (data.readingType !== undefined) patch.readingType = data.readingType;
  if (data.previousReading !== undefined) patch.previousReading = data.previousReading?.toString() ?? null;
  if (data.currentReading !== undefined) patch.currentReading = data.currentReading.toString();
  if (data.periodStart !== undefined) patch.periodStart = data.periodStart;
  if (data.periodEnd !== undefined) patch.periodEnd = data.periodEnd;
  if (data.tenantId !== undefined) patch.tenantId = data.tenantId;
  if (data.anomalyNote !== undefined) patch.anomalyNote = data.anomalyNote;

  // 사용량 자동 재계산.
  const newPrev = data.previousReading !== undefined
    ? data.previousReading
    : (before.previousReading != null ? Number(before.previousReading) : null);
  const newCur = data.currentReading !== undefined ? data.currentReading : Number(before.currentReading);
  let newUsage: number | null = null;
  if (Number.isFinite(newCur) && newPrev != null && Number.isFinite(newPrev)) {
    newUsage = newCur - newPrev;
    patch.usage = newUsage.toString();
  } else if (data.previousReading === null) {
    patch.usage = null;
  }

  // [Task #630] 이상치도 함께 재평가 — 수정 후 stale 상태로 남지 않도록.
  //   anomalyNote 가 명시적으로 들어오면 사용자 입력을 우선 존중.
  if (data.anomalyNote === undefined) {
    const recomputed = await computeAnomaly({
      buildingId: before.buildingId,
      unitNumber: before.unitNumber,
      meterType: before.meterType,
      usage: newUsage,
      excludeId: id,
    });
    patch.isAnomaly = recomputed.isAnomaly;
    patch.anomalyNote = recomputed.anomalyNote;
  }

  const [updated] = await db
    .update(meterReadingsTable)
    .set(patch)
    .where(eq(meterReadingsTable.id, id))
    .returning();

  await db.insert(meterReadingAuditsTable).values({
    meterReadingId: id,
    buildingId: before.buildingId,
    action: "update",
    actorId: req.user?.userId ?? null,
    actorRole: role ?? null,
    beforeJson: before,
    afterJson: updated,
    diffSummary: data.editReason ?? "검침 수정",
  });

  // 회계 재계산 흐름 통지 (정책 답변 #5-b).
  req.log.info(
    { meterReadingId: id, buildingId: before.buildingId, unitNumber: before.unitNumber, actorRole: role },
    "[meter] reading updated — accounting must recalculate affected month",
  );

  res.json(updated);
});

// [Task #630] 삭제 — 관리소장(또는 본사 어드민)만 (정책 답변 #6).
router.delete("/meters/:id", async (req: Request, res: Response): Promise<void> => {
  const role = req.user?.role;
  if (role !== "manager" && role !== "platform_admin") {
    res.status(403).json({ error: "관리소장만 삭제할 수 있습니다" }); return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "잘못된 id" }); return; }

  const before = await db.select().from(meterReadingsTable).where(eq(meterReadingsTable.id, id)).then((r) => r[0]);
  if (!before) { res.status(404).end(); return; }

  const scope = await getAccessibleBuildingIds(req);
  if (!scope.unrestricted && !scope.ids.includes(before.buildingId)) {
    res.status(403).json({ error: "해당 건물 권한이 없습니다" }); return;
  }

  await db.delete(meterReadingsTable).where(eq(meterReadingsTable.id, id));

  await db.insert(meterReadingAuditsTable).values({
    meterReadingId: id,
    buildingId: before.buildingId,
    action: "delete",
    actorId: req.user?.userId ?? null,
    actorRole: role ?? null,
    beforeJson: before,
    diffSummary: `${before.meterType} ${before.unitNumber} ${before.readingDate} 삭제`,
  });

  req.log.warn(
    { meterReadingId: id, buildingId: before.buildingId, unitNumber: before.unitNumber, actorRole: role },
    "[meter] reading deleted — accounting must recalculate affected month",
  );

  res.status(204).end();
});

// 감사로그 조회 — 본부장 포함 가시 역할 모두 가능.
router.get("/meters/:id/audits", async (req: Request, res: Response): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "잘못된 id" }); return; }

  const reading = await db
    .select({ buildingId: meterReadingsTable.buildingId })
    .from(meterReadingsTable)
    .where(eq(meterReadingsTable.id, id))
    .then((r) => r[0]);
  // 검침 행이 이미 삭제되었어도 감사 행은 남아 있어야 한다. 삭제된 경우엔
  // 감사로그의 buildingId 로 가시성 검사.
  const fallback = !reading
    ? await db
        .select({ buildingId: meterReadingAuditsTable.buildingId })
        .from(meterReadingAuditsTable)
        .where(eq(meterReadingAuditsTable.meterReadingId, id))
        .limit(1)
        .then((r) => r[0])
    : null;
  const buildingId = reading?.buildingId ?? fallback?.buildingId ?? null;
  if (buildingId == null) { res.json([]); return; }

  const scope = await getAccessibleBuildingIds(req);
  if (!scope.unrestricted && !scope.ids.includes(buildingId)) {
    res.status(403).json({ error: "해당 건물 권한이 없습니다" }); return;
  }

  const rows = await db
    .select()
    .from(meterReadingAuditsTable)
    .where(eq(meterReadingAuditsTable.meterReadingId, id))
    .orderBy(desc(meterReadingAuditsTable.createdAt));

  res.json(rows);
});

router.post("/meters/csv-upload", async (req: Request, res: Response): Promise<void> => {
  if (!assertWriter(req, res)) return;
  const parsed = UploadMeterCsvBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const role = req.user?.role;
  let buildingId: number | null = null;
  if (role === "platform_admin") {
    const explicit = (req.body as { buildingId?: number }).buildingId;
    if (typeof explicit === "number" && Number.isFinite(explicit)) buildingId = explicit;
  } else {
    buildingId = await getUserBuildingId(req);
  }
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const { meterType, readingDate, rows: csvRows } = parsed.data;

  let imported = 0;
  let anomalies = 0;
  const errors: string[] = [];

  for (const row of csvRows) {
    try {
      let prev = row.previousReading;
      if (prev == null) {
        const lastRow = await db
          .select()
          .from(meterReadingsTable)
          .where(
            and(
              eq(meterReadingsTable.buildingId, buildingId),
              eq(meterReadingsTable.unitNumber, row.unitNumber),
              eq(meterReadingsTable.meterType, meterType),
            ),
          )
          .orderBy(desc(meterReadingsTable.readingDate), desc(meterReadingsTable.id))
          .limit(1)
          .then((r) => r[0]);
        if (lastRow) {
          const n = Number(lastRow.currentReading);
          if (Number.isFinite(n)) prev = n;
        }
      }
      const usage = prev != null ? row.currentReading - prev : null;

      // [Task #630] CSV/POST/PUT 모두 동일 이상치 기준(최근 3건 평균 30% 초과) 사용.
      const anomaly = await computeAnomaly({
        buildingId,
        unitNumber: row.unitNumber,
        meterType,
        usage,
        excludeId: null,
      });
      const isAnomaly = anomaly.isAnomaly;
      const anomalyNote = anomaly.anomalyNote
        ? `CSV 업로드: ${anomaly.anomalyNote}`
        : null;

      const unit = await db
        .select()
        .from(unitsTable)
        .where(and(eq(unitsTable.buildingId, buildingId), eq(unitsTable.unitNumber, row.unitNumber)))
        .then((r) => r[0]);

      const [inserted] = await db.insert(meterReadingsTable).values({
        buildingId,
        unitId: unit?.id ?? null,
        unitNumber: row.unitNumber,
        meterType,
        readingType: "regular",
        readingDate,
        previousReading: prev?.toString(),
        currentReading: row.currentReading.toString(),
        usage: usage?.toString(),
        inputMethod: "csv",
        isAnomaly,
        anomalyNote,
        authorId: req.user?.userId ?? null,
        authorRole: role ?? null,
      }).returning();

      await db.insert(meterReadingAuditsTable).values({
        meterReadingId: inserted.id,
        buildingId,
        action: "create",
        actorId: req.user?.userId ?? null,
        actorRole: role ?? null,
        afterJson: inserted,
        diffSummary: `CSV 업로드: ${meterType} ${row.unitNumber} ${readingDate}`,
      });

      imported++;
      if (isAnomaly) anomalies++;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${row.unitNumber}: ${msg}`);
    }
  }

  res.json({ imported, anomalies, errors });
});

export default router;
