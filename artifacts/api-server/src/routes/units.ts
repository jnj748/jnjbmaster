import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, ilike, or, sql, desc } from "drizzle-orm";
import {
  db,
  unitsTable,
  usersTable,
  tenantsTable,
  ownersTable,
  vehiclesTable,
  workLogEntriesTable,
  workLogEntryUnitsTable,
} from "@workspace/db";
import {
  ListUnitsQueryParams,
  CreateUnitBody,
  GetUnitParams,
  UpdateUnitParams,
  UpdateUnitBody,
  BulkCreateUnitsBody,
  GenerateUnitsBody,
  GetUnitWorkLogEntriesParams,
  GetUnitWorkLogEntriesQueryParams,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
// 시설담당자 대시보드의 "호실정보조회" 카드(검색→호실 진입)도 같은 라우터를
// 사용하므로 GET 진입은 facility_staff 까지 허용한다. 등록/수정/삭제(POST/
// PATCH/DELETE) 는 각 라우트에서 별도 가드로 기존 화이트리스트(매니저/본사/
// 경리) 만 유지해 시설담당자가 호실 데이터를 변경할 수 없도록 한다.
router.use(
  "/units",
  requireRole("manager", "platform_admin", "accountant", "facility_staff"),
);
const requireWriteAccess = requireRole("manager", "platform_admin", "accountant");
async function getUserBuildingId(req: Request): Promise<number | null> {
  const userId = req.user?.userId;
  if (!userId) return null;
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  return user?.buildingId ?? null;
}

// [Task #708 보안] 호실 상세의 "관련 업무기록" 엔드포인트가 work_logs 의 작성자
// 가시성 정책을 그대로 따라야 한다. /work-logs 와 동일한 규칙으로:
//   - manager / platform_admin: 같은 빌딩 내 모든 작성자
//   - accountant / facility_staff: 본인이 작성한 entry 만
// 만약 관리소장 대리(role="manager") 외엔 본인 글만 보여 준다.
async function getUserScope(
  req: Request,
): Promise<{ buildingId: number; userId: number; isManager: boolean } | null> {
  const userId = req.user?.userId;
  if (!userId) return null;
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  if (!user || !user.buildingId) return null;
  const role = (user.role ?? "").toLowerCase();
  // platform_admin/manager 는 빌딩 내 전체 가시성. 나머지는 본인 작성물만.
  const isManager = role === "manager" || role === "platform_admin";
  return { buildingId: user.buildingId, userId, isManager };
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
      // [Task #348] 호실 출처/마지막 동기화 시각/대장PK — 목록에서도 출처 뱃지를
      // 보여주고, 대시보드 "제안업무" 카드가 동기화 이력 유무를 판단할 수 있게 한다.
      source: unitsTable.source,
      lastRegisterSyncedAt: unitsTable.lastRegisterSyncedAt,
      mgmBldrgstPk: unitsTable.mgmBldrgstPk,
      createdAt: unitsTable.createdAt,
      updatedAt: unitsTable.updatedAt,
      tenantCount: sql<number>`(SELECT count(*)::int FROM tenants WHERE tenants.unit_id = units.id AND tenants.status = 'active')`,
      ownerCount: sql<number>`(SELECT count(*)::int FROM owners WHERE owners.unit_id = units.id AND owners.status = 'active')`,
      vehicleCount: sql<number>`(SELECT count(*)::int FROM vehicles v JOIN tenants t ON v.tenant_id = t.id WHERE t.unit_id = units.id AND v.status = 'registered')`,
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
        eq(tenantsTable.unitId, unit.id)
      )
    );

  const owners = await db
    .select()
    .from(ownersTable)
    .where(
      and(
        eq(ownersTable.status, "active"),
        eq(ownersTable.unitId, unit.id)
      )
    );

  const vehicles = await db
    .select({ v: vehiclesTable })
    .from(vehiclesTable)
    .innerJoin(tenantsTable, eq(vehiclesTable.tenantId, tenantsTable.id))
    .where(
      and(
        eq(tenantsTable.unitId, unit.id),
        eq(vehiclesTable.status, "registered")
      )
    )
    .then(rows => rows.map(r => r.v));

  res.json({ ...unit, tenants, owners, vehicles });
});

// [Task #708] 한 호실에 자동/수동으로 연결된 업무기록 페이지네이션 조회.
// work_log_entry_units (entry ↔ unit 다대다) 와 work_log_entries 를 조인해
// (occurredAt desc) 순으로 반환. 빌딩 스코프는 호실의 buildingId 로 제한해
// 다른 건물의 업무기록이 절대 노출되지 않도록 한다.
router.get("/units/:id/work-log-entries", async (req: Request, res: Response): Promise<void> => {
  // [Task #708 보안] /work-logs 와 동일한 작성자 가시성 정책 적용:
  // 매니저가 아니면 본인 작성 entry 만 노출. 그렇지 않으면 회계/시설직이
  // 호실 상세 화면에서 같은 빌딩 다른 사용자의 모든 업무기록을 열람할 수
  // 있어 권한 우회가 발생한다.
  const scope = await getUserScope(req);
  if (!scope) {
    res.status(403).json({ error: "건물이 등록되지 않았습니다" });
    return;
  }
  const { buildingId, userId, isManager } = scope;
  const idParsed = GetUnitParams.safeParse(req.params);
  if (!idParsed.success) {
    res.status(400).json({ error: idParsed.error.message });
    return;
  }
  const queryParsed = GetUnitWorkLogEntriesQueryParams.safeParse(req.query);
  if (!queryParsed.success) {
    res.status(400).json({ error: queryParsed.error.message });
    return;
  }
  const limit = queryParsed.data.limit ?? 10;
  const offset = queryParsed.data.offset ?? 0;
  const category = queryParsed.data.category;

  // 호실 존재 + 빌딩 스코프 검증.
  const [unit] = await db
    .select({ id: unitsTable.id })
    .from(unitsTable)
    .where(and(eq(unitsTable.id, idParsed.data.id), eq(unitsTable.buildingId, buildingId)));
  if (!unit) {
    res.status(404).json({ error: "Unit not found" });
    return;
  }

  // 매칭 조건: 같은 빌딩 + 해당 unit. 카테고리 필터는 entries 테이블에 적용.
  const linkConds = [
    eq(workLogEntryUnitsTable.unitId, unit.id),
    eq(workLogEntryUnitsTable.buildingId, buildingId),
  ];
  const entryConds = category ? [eq(workLogEntriesTable.category, category)] : [];
  // [Task #708 보안] 비-매니저는 본인 작성 entry 만 — /work-logs 와 동일.
  if (!isManager) entryConds.push(eq(workLogEntriesTable.authorId, userId));

  // total: 카테고리 필터를 함께 반영해 정확히 카운트.
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(workLogEntryUnitsTable)
    .innerJoin(workLogEntriesTable, eq(workLogEntriesTable.id, workLogEntryUnitsTable.workLogEntryId))
    .where(and(...linkConds, ...entryConds));

  const rows = await db
    .select({
      id: workLogEntriesTable.id,
      buildingId: workLogEntriesTable.buildingId,
      authorId: workLogEntriesTable.authorId,
      authorName: workLogEntriesTable.authorName,
      category: workLogEntriesTable.category,
      memo: workLogEntriesTable.memo,
      photoUrl: workLogEntriesTable.photoUrl,
      occurredAt: workLogEntriesTable.occurredAt,
      occurredDate: workLogEntriesTable.occurredDate,
      matchSource: workLogEntryUnitsTable.matchSource,
    })
    .from(workLogEntryUnitsTable)
    .innerJoin(workLogEntriesTable, eq(workLogEntriesTable.id, workLogEntryUnitsTable.workLogEntryId))
    .where(and(...linkConds, ...entryConds))
    .orderBy(desc(workLogEntryUnitsTable.occurredAt))
    .limit(limit)
    .offset(offset);

  res.json({
    items: rows.map((r) => ({
      id: r.id,
      buildingId: r.buildingId,
      authorId: r.authorId,
      authorName: r.authorName,
      category: r.category,
      memo: r.memo,
      photoUrl: r.photoUrl,
      occurredAt: r.occurredAt instanceof Date ? r.occurredAt.toISOString() : r.occurredAt,
      occurredDate: r.occurredDate,
      matchSource: r.matchSource as "auto" | "manual",
    })),
    total: total ?? 0,
    limit,
    offset,
  });
});

router.post("/units/bulk", requireWriteAccess, async (req: Request, res: Response): Promise<void> => {
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

router.post("/units/generate", requireWriteAccess, async (req: Request, res: Response): Promise<void> => {
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

router.post("/units", requireWriteAccess, async (req: Request, res: Response): Promise<void> => {
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

router.patch("/units/:id", requireWriteAccess, async (req: Request, res: Response): Promise<void> => {
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

router.delete("/units/:id", requireWriteAccess, async (req: Request, res: Response): Promise<void> => {
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

  const linkedTenants = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tenantsTable)
    .where(and(eq(tenantsTable.unitId, params.data.id), eq(tenantsTable.status, "active")));

  const linkedOwners = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ownersTable)
    .where(and(eq(ownersTable.unitId, params.data.id), eq(ownersTable.status, "active")));

  const tCount = linkedTenants[0]?.count ?? 0;
  const oCount = linkedOwners[0]?.count ?? 0;
  if (tCount > 0 || oCount > 0) {
    const parts = [];
    if (tCount > 0) parts.push(`입주자 ${tCount}명`);
    if (oCount > 0) parts.push(`소유자 ${oCount}명`);
    res.status(409).json({ error: `${parts.join(", ")}이 등록되어 있어 삭제할 수 없습니다. 먼저 연결된 입주자/소유자를 이동하거나 삭제해주세요.` });
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
