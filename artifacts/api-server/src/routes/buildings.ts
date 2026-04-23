import { Router, type IRouter, type Request, type Response } from "express";
import { db, buildingsTable, usersTable, inspectionsTable, safetyChecklistsTable, maintenanceLogsTable, unitsTable, vehiclesTable, legalAppointeesTable, accountingInitialFilesTable } from "@workspace/db";
import { eq, and, lte, gte, sql, desc, inArray } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";
import {
  LEGAL_PRESETS,
  ELECTRICAL_RESIDENT_KW,
  ELECTRICAL_REQUIRED_KW,
  FIRE_SPECIAL_GRADE_FLOORS,
  FIRE_SPECIAL_GRADE_AREA,
  FIRE_GRADE_1_FLOORS,
  FIRE_GRADE_1_AREA,
  FIRE_GRADE_1_BASEMENT_MIN,
  FIRE_GRADE_1_BASEMENT_AREA,
  FIRE_GRADE_2_FLOORS,
  FIRE_GRADE_2_AREA,
  GAS_PROTECTION_CLASS1_UNITS,
  GAS_THRESHOLD_PROTECTED_M3,
  GAS_THRESHOLD_DEFAULT_M3,
  GAS_SELF_CHECK_AREA,
  GAS_SELF_CHECK_FLOORS,
  MECH_REQUIRED_AREA,
  MECH_SPECIAL_GRADE_AREA,
  MECH_ADVANCED_GRADE_AREA,
  MECH_INTERMEDIATE_GRADE_AREA,
  TELECOM_REQUIRED_AREA,
  TELECOM_LARGE_AREA,
  TELECOM_MEDIUM_AREA,
  TELECOM_ENFORCEMENT_DATE_LARGE,
  TELECOM_ENFORCEMENT_DATE_MEDIUM,
  TELECOM_ENFORCEMENT_DATE_SMALL,
  ELEVATOR_REQUIRED_COUNT,
  DISINF_RESIDENTIAL_UNITS,
  DISINF_OFFICE_AREA,
  SAFETY_MGR_REQUIRED_AREA,
  SAFETY_MGR_REQUIRED_FLOORS,
  SAFETY_MGR_REQUIRED_BASEMENT,
  SAFETY_MGR_SPECIALIST_AREA,
  SAFETY_MGR_SPECIALIST_FLOORS,
  SAFETY_MGR_PRO_AREA,
  SAFETY_MGR_PRO_FLOORS,
} from "../domain/statutory";

const router: IRouter = Router();
router.use("/buildings", requireRole("manager", "platform_admin", "hq_executive", "accountant", "facility_staff"));
router.get("/buildings/list", async (req: Request, res: Response) => {
  const user = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).then(r => r[0]);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (user.role === "hq_executive" || user.role === "platform_admin") {
    const buildings = await db.select().from(buildingsTable);
    res.json(buildings.map(b => ({
      id: b.id,
      name: b.name,
      addressFull: b.addressFull,
      totalUnits: b.totalUnits,
    })));
  } else if (user.buildingId) {
    const building = await db.select().from(buildingsTable).where(eq(buildingsTable.id, user.buildingId)).then(r => r[0]);
    res.json(building ? [{ id: building.id, name: building.name, addressFull: building.addressFull, totalUnits: building.totalUnits }] : []);
  } else {
    res.json([]);
  }
});

router.get("/buildings/my", async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  if (!user?.buildingId) {
    res.json({ building: null });
    return;
  }

  const building = await db.select().from(buildingsTable).where(eq(buildingsTable.id, user.buildingId)).then(r => r[0]);
  res.json({ building: building || null });
});

router.get("/buildings/overview", async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  if (!user?.buildingId) {
    res.json({ building: null });
    return;
  }

  const building = await db.select().from(buildingsTable).where(eq(buildingsTable.id, user.buildingId)).then(r => r[0]);
  if (!building) {
    res.json({ building: null });
    return;
  }

  try {
    const today = new Date().toISOString().split("T")[0];
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const futureStr = thirtyDays.toISOString().split("T")[0];

    const bId = building.id;

    const allInspections = await db.select().from(inspectionsTable).where(eq(inspectionsTable.buildingId, bId));
    const upcomingInspections = allInspections.filter(i => i.nextDueDate >= today && i.nextDueDate <= futureStr);
    const overdueInspections = allInspections.filter(i => i.status === "overdue" || (i.nextDueDate < today && i.status !== "completed"));

    const recentChecklists = await db.select().from(safetyChecklistsTable).where(eq(safetyChecklistsTable.buildingId, bId)).orderBy(desc(safetyChecklistsTable.inspectionDate)).limit(5);
    const checklistTotal = await db.select({ count: sql<number>`count(*)::int` }).from(safetyChecklistsTable).where(eq(safetyChecklistsTable.buildingId, bId)).then(r => r[0]?.count ?? 0);

    const pendingMaintenance = await db.select({ count: sql<number>`count(*)::int` }).from(maintenanceLogsTable).where(and(eq(maintenanceLogsTable.buildingId, bId), eq(maintenanceLogsTable.status, "pending"))).then(r => r[0]?.count ?? 0);
    const completedMaintenance = await db.select({ count: sql<number>`count(*)::int` }).from(maintenanceLogsTable).where(and(eq(maintenanceLogsTable.buildingId, bId), eq(maintenanceLogsTable.status, "completed"))).then(r => r[0]?.count ?? 0);

    const allUnits = await db.select().from(unitsTable).where(eq(unitsTable.buildingId, user.buildingId));
    const occupiedUnits = allUnits.filter(u => u.status === "occupied" || u.status === "입주");
    const vacantUnits = allUnits.filter(u => u.status === "vacant" || u.status === "공실");

    const vehicleCount = await db.select({ count: sql<number>`count(*)::int` }).from(vehiclesTable).where(eq(vehiclesTable.buildingId, user.buildingId)).then(r => r[0]?.count ?? 0);

    res.json({
      building,
      inspections: {
        total: allInspections.length,
        upcoming: upcomingInspections.length,
        overdue: overdueInspections.length,
        upcomingList: upcomingInspections.slice(0, 5).map(i => ({
          id: i.id, name: i.name, category: i.category, nextDueDate: i.nextDueDate, status: i.status,
        })),
      },
      safetyChecklists: {
        total: checklistTotal,
        recent: recentChecklists.map(c => ({
          id: c.id, title: c.title, category: c.category, inspectionDate: c.inspectionDate, status: c.status,
        })),
      },
      maintenance: {
        pending: pendingMaintenance,
        completed: completedMaintenance,
      },
      occupancy: {
        totalUnits: allUnits.length,
        occupied: occupiedUnits.length,
        vacant: vacantUnits.length,
        rate: allUnits.length > 0 ? Math.round((occupiedUnits.length / allUnits.length) * 100) : 0,
      },
      vehicles: {
        total: vehicleCount,
      },
    });
  } catch (error) {
    req.log.error({ err: error }, "Error fetching building overview");
    res.status(500).json({ error: "건물 현황 조회 실패" });
  }
});

// [Task #160] POST/PUT 핸들러가 동일한 화이트리스트를 사용해 필드 누락을 방지한다.
const BUILDING_TEXT_FIELDS = [
  "addressFull", "addressJibun", "sido", "sigungu", "dong", "zipCode",
  "buildingUsage", "structureType", "completionDate", "buildingRegisterPk",
  "safetyManagerType", "managementOfficePhone", "managementOfficeFax",
  "logoUrl", "approvalDate", "areaBasis",
] as const;
const BUILDING_NUMERIC_FIELDS = [
  "totalArea", "landArea", "buildingArea", "buildingCoverageRatio",
  "floorAreaRatio", "electricCapacityKw", "gasUsageMonthly",
] as const;
const BUILDING_INT_FIELDS = [
  "totalUnits", "totalFloors", "basementFloors", "elevatorCount", "parkingSpaces",
] as const;
const BUILDING_BOOL_FIELDS = [
  "hasPlayground", "hasGas", "hasSepticTank", "safetyManagerRequired",
] as const;
const BUILDING_BOOL_DEFAULTS: Record<string, boolean> = {
  hasPlayground: false, hasGas: true, hasSepticTank: true, safetyManagerRequired: false,
};

function buildBuildingInsertValues(data: Record<string, unknown>): Record<string, unknown> {
  const v: Record<string, unknown> = { name: data.name };
  for (const f of BUILDING_TEXT_FIELDS) v[f] = data[f] || null;
  for (const f of BUILDING_INT_FIELDS) v[f] = data[f] ? parseInt(String(data[f])) : null;
  for (const f of BUILDING_NUMERIC_FIELDS) v[f] = data[f] || null;
  for (const f of BUILDING_BOOL_FIELDS) v[f] = data[f] ?? BUILDING_BOOL_DEFAULTS[f];
  return v;
}

function buildBuildingUpdateValues(data: Record<string, unknown>): Record<string, unknown> {
  const v: Record<string, unknown> = {};
  if (data.name !== undefined) v.name = data.name;
  for (const f of BUILDING_TEXT_FIELDS) {
    if (data[f] !== undefined) v[f] = data[f];
  }
  for (const f of BUILDING_INT_FIELDS) {
    if (data[f] !== undefined) v[f] = data[f] ? parseInt(String(data[f])) : null;
  }
  for (const f of BUILDING_NUMERIC_FIELDS) {
    if (data[f] !== undefined) v[f] = data[f] || null;
  }
  for (const f of BUILDING_BOOL_FIELDS) {
    if (data[f] !== undefined) v[f] = data[f];
  }
  return v;
}

// [Task #227] 한 건물에 관리소장은 1명만 가입할 수 있다. 위저드/우회 모두를 막기 위해
// 동일한 지번 주소(또는 동일 building.id)에 이미 다른 관리소장이 묶여 있는지 검사한다.
const MANAGER_DUPLICATE_MESSAGE =
  "이미 해당 건물의 가입자가 존재합니다. 자세한 문의는 관리의달인으로 문의주시기 바랍니다. 1800-0416";

function normalizeJibun(s: string | null | undefined): string {
  return String(s ?? "").trim().replace(/\s+/g, " ");
}

async function findExistingManagerForAddress(opts: {
  addressJibun?: string | null;
  buildingId?: number | null;
  excludeUserId: number;
}): Promise<boolean> {
  const jibun = normalizeJibun(opts.addressJibun);
  // 1) 동일 building.id에 이미 다른 관리소장 사용자가 있는지
  if (opts.buildingId) {
    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(
        eq(usersTable.buildingId, opts.buildingId),
        eq(usersTable.role, "manager"),
        eq(usersTable.approvalStatus, "active"),
      ));
    if (rows.some(r => r.id !== opts.excludeUserId)) return true;
  }
  // 2) 동일 지번 주소를 가진 다른 building 행이 있는 경우, 그쪽에 묶인 매니저가 있는지
  if (jibun) {
    const buildings = await db
      .select({ id: buildingsTable.id })
      .from(buildingsTable)
      .where(eq(buildingsTable.addressJibun, jibun));
    const otherBuildingIds = buildings
      .map(b => b.id)
      .filter(bid => !opts.buildingId || bid !== opts.buildingId);
    if (otherBuildingIds.length > 0) {
      const rows = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(and(
          eq(usersTable.role, "manager"),
          eq(usersTable.approvalStatus, "active"),
        ));
      const buildingIdSet = new Set(otherBuildingIds);
      if (rows.some(r => r.id !== opts.excludeUserId && r.buildingId != null && buildingIdSet.has(r.buildingId))) {
        return true;
      }
    }
  }
  return false;
}

// [Task #227] 위저드가 주소 선택 직후 빠르게 차단 안내를 띄울 수 있도록 사전 점검 엔드포인트.
router.get("/buildings/check-manager", async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const addressJibun = typeof req.query.addressJibun === "string" ? req.query.addressJibun : "";
  const buildingIdRaw = typeof req.query.buildingId === "string" ? req.query.buildingId : "";
  const buildingId = buildingIdRaw ? parseInt(buildingIdRaw) : null;
  if (!addressJibun && !buildingId) {
    res.status(400).json({ error: "addressJibun 또는 buildingId가 필요합니다." });
    return;
  }
  try {
    const exists = await findExistingManagerForAddress({
      addressJibun,
      buildingId: buildingId && Number.isFinite(buildingId) ? buildingId : null,
      excludeUserId: userId,
    });
    res.json({ exists, message: exists ? MANAGER_DUPLICATE_MESSAGE : null });
  } catch (e) {
    req.log.error({ err: e }, "Failed to check manager duplicate");
    res.status(500).json({ error: "중복 검사에 실패했습니다." });
  }
});

router.post("/buildings", async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const data = req.body;
    if (!data.name) {
      res.status(400).json({ error: "건물명은 필수입니다." });
      return;
    }

    // [Task #227] 관리소장 중복 가입 차단: 동일 지번 주소에 이미 다른 관리소장이 있다면 거절.
    const requester = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
    if (requester?.role === "manager") {
      const dup = await findExistingManagerForAddress({
        addressJibun: typeof data.addressJibun === "string" ? data.addressJibun : null,
        buildingId: null,
        excludeUserId: userId,
      });
      if (dup) {
        res.status(409).json({ error: MANAGER_DUPLICATE_MESSAGE });
        return;
      }
    }

    // [Task #218] 첫 건물 등록 여부 판별: 매니저가 처음 건물을 등록하는 경우 시드 대상.
    const requestingUser = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
    const isFirstBuildingForManager = !!requestingUser && requestingUser.role === "manager" && !requestingUser.buildingId;

    const [building] = await db
      .insert(buildingsTable)
      .values(buildBuildingInsertValues(data) as typeof buildingsTable.$inferInsert)
      .returning();

    await db.update(usersTable)
      .set({
        buildingId: building.id,
        buildingSido: data.sido || null,
        buildingSigungu: data.sigungu || null,
      })
      .where(eq(usersTable.id, userId));

    // [Task #265] 신규 매니저 첫 건물 등록 시 대시보드 체험용 실제 업무 4건을 시드한다.
    //  - 필수업무현황(legal) 2건: 소방점검(연체) + 정화조 청소(D-20)
    //  - 제안업무현황 2건: 미화·경비원 교육(D-5) + 에어컨 정비 공지(D-10)
    //  - (buildingId, name) 4종 집합 기준으로 중복 검사하여 일부만 남아있어도 안전하게 멱등 유지.
    if (isFirstBuildingForManager) {
      try {
        const SEED_NAMES: { fire: string; septic: string; edu: string; ac: string } = {
          fire: "(테스트업무) 소방점검",
          septic: "(테스트업무) 정화조 청소",
          edu: "(테스트업무) 미화·경비원 교육의 달",
          ac: "(테스트업무) 에어컨 가동 전 정비 진행 공지",
        };
        const seedNameList: string[] = Object.values(SEED_NAMES);
        const existingTest = await db
          .select({ name: inspectionsTable.name })
          .from(inspectionsTable)
          .where(and(
            eq(inspectionsTable.buildingId, building.id),
            inArray(inspectionsTable.name, seedNameList),
          ));
        const existingNames = new Set(existingTest.map((r) => r.name));
        const today = new Date();
        const plusDays = (n: number) => {
          const d = new Date(today);
          d.setDate(d.getDate() + n);
          return d.toISOString().split("T")[0];
        };
        const candidates: Array<typeof inspectionsTable.$inferInsert> = [
          {
            buildingId: building.id,
            name: SEED_NAMES.fire,
            category: "fire_safety",
            inspectionType: "legal",
            frequencyPerYear: 2,
            legalCycleMonths: 6,
            nextDueDate: plusDays(-3),
            status: "overdue",
            advanceAlertDays: 30,
          },
          {
            buildingId: building.id,
            name: SEED_NAMES.septic,
            category: "septic",
            inspectionType: "legal",
            frequencyPerYear: 1,
            legalCycleMonths: 12,
            nextDueDate: plusDays(20),
            status: "upcoming",
            advanceAlertDays: 30,
          },
          {
            buildingId: building.id,
            name: SEED_NAMES.edu,
            category: "self_regular",
            inspectionType: "self_regular",
            frequencyPerYear: 12,
            intervalDays: 30,
            nextDueDate: plusDays(5),
            status: "upcoming",
            advanceAlertDays: 7,
          },
          {
            buildingId: building.id,
            name: SEED_NAMES.ac,
            category: "seasonal",
            inspectionType: "seasonal",
            frequencyPerYear: 4,
            intervalDays: 90,
            nextDueDate: plusDays(10),
            status: "upcoming",
            advanceAlertDays: 14,
          },
        ];
        const toInsert = candidates.filter((c) => !existingNames.has(c.name));
        if (toInsert.length > 0) {
          await db.insert(inspectionsTable).values(toInsert);
        }
      } catch (seedErr) {
        req.log.warn({ err: seedErr, buildingId: building.id }, "Failed to seed test inspections for first building");
      }
    }

    res.json({ building });
  } catch (error) {
    req.log.error({ err: error }, "Error creating building");
    res.status(500).json({ error: "Failed to create building" });
  }
});

router.put("/buildings/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const data = req.body;

  try {
    const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
    if (!user || (user.buildingId !== id && user.role !== "platform_admin")) {
      res.status(403).json({ error: "이 건물을 수정할 권한이 없습니다" });
      return;
    }
    // [Task #132] 주소 잠금: platform_admin이 아니면 주소 관련 필드 변경 차단.
    const existing = await db.select().from(buildingsTable).where(eq(buildingsTable.id, id)).then(r => r[0]);
    if (existing?.addressLocked && user.role !== "platform_admin") {
      const addressFields = ["addressFull", "addressJibun", "sido", "sigungu", "dong", "zipCode", "buildingRegisterPk"];
      const attemptedAddressEdit = addressFields.some(f => data[f] !== undefined && data[f] !== existing[f as keyof typeof existing]);
      if (attemptedAddressEdit) {
        res.status(423).json({ error: "건물 주소는 잠겨 있어 변경할 수 없습니다. 변경이 필요한 경우 1800-0416으로 연락해 주세요." });
        return;
      }
    }
    // [Task #227] 주소가 바뀌는 PUT 우회 시도 차단: 새 주소에 다른 매니저가 있으면 거절.
    if (user.role === "manager") {
      const nextJibun = typeof data.addressJibun === "string" ? data.addressJibun : (existing?.addressJibun ?? null);
      const dup = await findExistingManagerForAddress({
        addressJibun: nextJibun,
        buildingId: id,
        excludeUserId: userId,
      });
      if (dup) {
        res.status(409).json({ error: MANAGER_DUPLICATE_MESSAGE });
        return;
      }
    }

    const updateData = buildBuildingUpdateValues(data);

    const [building] = await db.update(buildingsTable).set(updateData).where(eq(buildingsTable.id, id)).returning();

    if (data.sido || data.sigungu) {
      const userId = req.user?.userId;
      if (userId) {
        await db.update(usersTable)
          .set({ buildingSido: building.sido, buildingSigungu: building.sigungu })
          .where(eq(usersTable.id, userId));
      }
    }

    res.json({ building });
  } catch (error) {
    req.log.error({ err: error }, "Error updating building");
    res.status(500).json({ error: "Failed to update building" });
  }
});

router.get("/buildings/lookup-register", async (req: Request, res: Response) => {
  const { sigunguCd, bjdongCd, bun, ji } = req.query;

  const apiKey = process.env.BUILDING_REGISTER_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "건축물대장 API 키가 설정되지 않았습니다" });
    return;
  }

  try {
    const queryParams = new URLSearchParams({
      sigunguCd: String(sigunguCd || ""),
      bjdongCd: String(bjdongCd || ""),
      bun: String(bun || "").padStart(4, "0"),
      ji: String(ji || "0").padStart(4, "0"),
      numOfRows: "1",
      pageNo: "1",
      _type: "json",
    });
    const qs = `serviceKey=${apiKey}&${queryParams.toString()}`;

    const [titleResult, recapResult] = await Promise.allSettled([
      fetch(`https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?${qs}`).then(r => r.ok ? r.json() : null),
      fetch(`https://apis.data.go.kr/1613000/BldRgstHubService/getBrRecapTitleInfo?${qs}`).then(r => r.ok ? r.json() : null),
    ]);

    const titleData = titleResult.status === "fulfilled" ? titleResult.value : null;
    const recapData = recapResult.status === "fulfilled" ? recapResult.value : null;

    const titleItems = titleData?.response?.body?.items?.item;
    const recapItems = recapData?.response?.body?.items?.item;

    const extractFirst = (items: unknown) => {
      if (!items) return null;
      if (Array.isArray(items)) return items.length > 0 ? items[0] : null;
      return items;
    };
    const titleItem = extractFirst(titleItems);
    const recapItem = extractFirst(recapItems);

    if (!titleItem && !recapItem) {
      req.log.info({ sigunguCd: String(sigunguCd), bjdongCd: String(bjdongCd), bun: String(bun), ji: String(ji), titleResultCode: titleData?.response?.header?.resultCode, recapResultCode: recapData?.response?.header?.resultCode }, "Building register lookup returned no results");
      res.json({ found: false, data: null });
      return;
    }

    const t = titleItem || {};
    const r = recapItem || {};

    const buildingInfo = {
      found: true,
      data: {
        buildingName: t.bldNm || r.bldNm || "",
        mainPurpose: t.mainPurpsCdNm || t.etcPurps || r.mainPurpsCdNm || "",
        totalArea: t.totArea ? String(t.totArea) : (r.totArea ? String(r.totArea) : ""),
        buildingArea: t.archArea ? String(t.archArea) : (r.archArea ? String(r.archArea) : ""),
        totalFloors: t.grndFlrCnt ? parseInt(t.grndFlrCnt) : (r.grndFlrCnt ? parseInt(r.grndFlrCnt) : 0),
        basementFloors: t.ugrndFlrCnt ? parseInt(t.ugrndFlrCnt) : (r.ugrndFlrCnt ? parseInt(r.ugrndFlrCnt) : 0),
        structureType: t.strctCdNm || r.strctCdNm || "",
        totalUnits: t.hhldCnt ? parseInt(t.hhldCnt) : (t.hoCnt ? parseInt(t.hoCnt) : (r.hhldCnt ? parseInt(r.hhldCnt) : 0)),
        completionDate: t.useAprDay || r.useAprDay || "",
        elevatorCount: (t.rideUseElvtCnt ? parseInt(t.rideUseElvtCnt) : 0)
          + (t.emgenUseElvtCnt ? parseInt(t.emgenUseElvtCnt) : 0),
        platPlc: t.platPlc || r.platPlc || "",
        newPlatPlc: t.newPlatPlc || r.newPlatPlc || "",
        sigunguCd: t.sigunguCd || r.sigunguCd || "",
        bjdongCd: t.bjdongCd || r.bjdongCd || "",
        bun: t.bun || r.bun || "",
        ji: t.ji || r.ji || "",
        mgmBldrgstPk: t.mgmBldrgstPk || r.mgmBldrgstPk || "",
        landArea: r.platArea ? String(r.platArea) : "",
        buildingCoverageRatio: r.bcRat ? String(r.bcRat) : "",
        floorAreaRatio: r.vlRat ? String(r.vlRat) : "",
        parkingCount: r.totPkngCnt ? parseInt(r.totPkngCnt) : 0,
      },
    };

    res.json(buildingInfo);
  } catch (error) {
    req.log.error({ err: error }, "Error looking up building register");
    res.status(500).json({ error: "건축물대장 조회 실패" });
  }
});

router.get("/buildings/lookup-area-info", async (req: Request, res: Response) => {
  const { mgmBldrgstPk } = req.query;
  if (!mgmBldrgstPk) {
    res.status(400).json({ error: "mgmBldrgstPk가 필요합니다" });
    return;
  }

  const apiKey = process.env.BUILDING_REGISTER_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "건축물대장 API 키가 설정되지 않았습니다" });
    return;
  }

  try {
    const queryParams = new URLSearchParams({
      mgmBldrgstPk: String(mgmBldrgstPk),
      numOfRows: "100",
      pageNo: "1",
      _type: "json",
    });
    const qs = `serviceKey=${apiKey}&${queryParams.toString()}`;

    const result = await fetch(
      `https://apis.data.go.kr/1613000/BldRgstHubService/getBrExposPubuseAreaInfo?${qs}`
    ).then((r) => (r.ok ? r.json() : null));

    const items = result?.response?.body?.items?.item;
    if (!items) {
      res.json({ found: false, areas: [] });
      return;
    }

    const areaList = Array.isArray(items) ? items : [items];
    const areas = areaList.map((item: Record<string, unknown>) => ({
      floorNo: item.flrNoNm || item.flrNo || "",
      purposeName: item.mainPurpsCdNm || item.etcPurps || "",
      exposArea: item.area ? parseFloat(String(item.area)) : 0,
      pubUseArea: item.cmmnPuprpsArea ? parseFloat(String(item.cmmnPuprpsArea)) : 0,
    }));

    res.json({ found: true, areas });
  } catch (error) {
    req.log.error({ err: error }, "Error looking up area info");
    res.status(500).json({ error: "전용/공용면적 조회 실패" });
  }
});

interface AppointmentField {
  field: string;
  required: boolean;
  grade: string | null;
  type: string | null;
  legalBasis: string;
  notes: string[];
}

router.post("/buildings/calculate-safety", async (req: Request, res: Response) => {
  const { totalArea, totalFloors, basementFloors, totalUnits, buildingUsage, elevatorCount, electricCapacityKw, gasUsageMonthly, hasGas } = req.body;

  const area = parseFloat(totalArea) || 0;
  const floors = parseInt(totalFloors) || 0;
  const basement = parseInt(basementFloors) || 0;
  const units = parseInt(totalUnits) || 0;
  const elevators = parseInt(elevatorCount) || 0;
  const electricKw = parseFloat(electricCapacityKw) || 0;
  const gasMonthly = parseFloat(gasUsageMonthly) || 0;
  const gasEnabled = hasGas !== false && hasGas !== "false";
  const usage = (buildingUsage || "").toLowerCase();
  const isResidential = usage.includes("아파트") || usage.includes("주거") || usage.includes("공동주택") || usage.includes("연립") || usage.includes("다세대");
  const isOffice = usage.includes("사무") || usage.includes("업무") || usage.includes("오피스");
  const isComplex = usage.includes("복합") || usage.includes("근린생활") || usage.includes("판매");

  const fields: AppointmentField[] = [];
  const requiredInspections: string[] = [];

  // 1. 전기안전관리자
  const elecField: AppointmentField = {
    field: "electrical",
    required: false,
    grade: null,
    type: null,
    legalBasis: "전기안전관리법 제22조",
    notes: [],
  };
  if (electricKw >= ELECTRICAL_RESIDENT_KW) {
    elecField.required = true;
    elecField.grade = "상주 전기안전관리자";
    elecField.type = "상주";
    elecField.notes.push("수전설비 용량 1,000kW 이상: 상주 전기안전관리자 선임 필수");
  } else if (electricKw >= ELECTRICAL_REQUIRED_KW) {
    elecField.required = true;
    elecField.grade = "전기안전관리자";
    elecField.type = "선임 또는 대행";
    elecField.notes.push("수전설비 용량 75kW 이상: 전기안전관리자 선임 또는 대행 필수");
  } else {
    elecField.notes.push("수전설비 용량 75kW 미만: 전기안전관리자 선임 불요 (전기용량을 입력하면 정확한 판정이 가능합니다)");
  }
  fields.push(elecField);
  requiredInspections.push("electrical");

  // 2. 소방안전관리자
  const fireField: AppointmentField = {
    field: "fire_safety",
    required: true,
    grade: null,
    type: "선임",
    legalBasis: "소방시설 설치 및 관리에 관한 법률 제24조",
    notes: [],
  };
  if (floors >= FIRE_SPECIAL_GRADE_FLOORS || area >= FIRE_SPECIAL_GRADE_AREA) {
    fireField.grade = "특급 소방안전관리자";
    fireField.notes.push("30층 이상 또는 연면적 10만㎡ 이상: 특급");
  } else if (floors >= FIRE_GRADE_1_FLOORS || area >= FIRE_GRADE_1_AREA || (basement >= FIRE_GRADE_1_BASEMENT_MIN && area >= FIRE_GRADE_1_BASEMENT_AREA)) {
    fireField.grade = "1급 소방안전관리자";
    fireField.notes.push("11층 이상 또는 연면적 1.5만㎡ 이상: 1급");
  } else if (floors >= FIRE_GRADE_2_FLOORS || area >= FIRE_GRADE_2_AREA) {
    fireField.grade = "2급 소방안전관리자";
    fireField.notes.push("5층 이상 또는 연면적 2천㎡ 이상: 2급");
  } else {
    fireField.grade = "3급 소방안전관리자";
    fireField.notes.push("그 외: 3급 (소규모 건축물)");
  }
  fields.push(fireField);
  requiredInspections.push("fire_safety");

  // 3. 가스안전관리자
  const gasField: AppointmentField = {
    field: "gas",
    required: false,
    grade: null,
    type: null,
    legalBasis: "도시가스사업법 제29조",
    notes: [],
  };
  const isFirstClassProtection = isResidential && units >= GAS_PROTECTION_CLASS1_UNITS;
  const gasThreshold = isFirstClassProtection ? GAS_THRESHOLD_PROTECTED_M3 : GAS_THRESHOLD_DEFAULT_M3;
  if (gasEnabled && gasMonthly >= gasThreshold) {
    gasField.required = true;
    gasField.grade = "가스안전관리자";
    gasField.type = "선임 또는 대행";
    gasField.notes.push(`월 사용량 ${gasMonthly.toLocaleString()}㎥ ≥ ${gasThreshold.toLocaleString()}㎥${isFirstClassProtection ? " (1종 보호시설)" : ""}: 가스안전관리자 선임 필수`);
    requiredInspections.push("gas");
  } else if (gasEnabled) {
    gasField.notes.push(`월 가스사용량 ${gasThreshold.toLocaleString()}㎥ 미만: 가스안전관리자 선임 불요 (가스사용량을 입력하면 정확한 판정이 가능합니다)`);
    if (area >= GAS_SELF_CHECK_AREA || floors >= GAS_SELF_CHECK_FLOORS) {
      requiredInspections.push("gas");
      gasField.notes.push("다만 가스 안전점검(연 1회)은 대상");
    }
  }
  fields.push(gasField);

  // 4. 기계설비유지관리자
  const mechField: AppointmentField = {
    field: "mechanical",
    required: false,
    grade: null,
    type: null,
    legalBasis: "기계설비법 제18조",
    notes: [],
  };
  if (area >= MECH_REQUIRED_AREA) {
    mechField.required = true;
    if (area >= MECH_SPECIAL_GRADE_AREA) {
      mechField.grade = "특급 기계설비유지관리자";
    } else if (area >= MECH_ADVANCED_GRADE_AREA) {
      mechField.grade = "고급 기계설비유지관리자";
    } else if (area >= MECH_INTERMEDIATE_GRADE_AREA) {
      mechField.grade = "중급 기계설비유지관리자";
    } else {
      mechField.grade = "초급 기계설비유지관리자";
    }
    mechField.type = "선임";
    mechField.notes.push(`연면적 ${area.toLocaleString()}㎡: ${mechField.grade} 선임 필수`);
    requiredInspections.push("mechanical");
  } else {
    mechField.notes.push("연면적 1만㎡ 미만: 기계설비유지관리자 선임 불요");
  }
  fields.push(mechField);

  // 5. 정보통신공사 유지관리자
  const teleField: AppointmentField = {
    field: "telecom",
    required: false,
    grade: null,
    type: null,
    legalBasis: "정보통신공사업법 제36조의3",
    notes: [],
  };
  if (area >= TELECOM_REQUIRED_AREA) {
    teleField.type = "선임";
    teleField.grade = "정보통신 유지관리자";
    const today = new Date();
    let enforcementDate: Date;
    if (area >= TELECOM_LARGE_AREA) {
      enforcementDate = new Date(TELECOM_ENFORCEMENT_DATE_LARGE);
      teleField.notes.push("연면적 3만㎡ 이상: 2025.7.18부터 선임 의무");
    } else if (area >= TELECOM_MEDIUM_AREA) {
      enforcementDate = new Date(TELECOM_ENFORCEMENT_DATE_MEDIUM);
      teleField.notes.push("연면적 1~3만㎡: 2026.7.18부터 선임 의무");
    } else {
      enforcementDate = new Date(TELECOM_ENFORCEMENT_DATE_SMALL);
      teleField.notes.push("연면적 5천~1만㎡: 2027.7.18부터 선임 의무");
    }
    if (today >= enforcementDate) {
      teleField.required = true;
      requiredInspections.push("telecom");
    } else {
      teleField.notes.push(`⚠ 시행 예정 (${enforcementDate.toISOString().split("T")[0]}) — 현재는 선임 의무 없음`);
    }
  } else {
    teleField.notes.push(`연면적 ${TELECOM_REQUIRED_AREA.toLocaleString()}㎡ 미만: 정보통신 유지관리자 선임 불요`);
  }
  fields.push(teleField);

  // 6. 승강기안전관리자
  const elevField: AppointmentField = {
    field: "elevator",
    required: false,
    grade: null,
    type: null,
    legalBasis: "승강기 안전관리법 제29조",
    notes: [],
  };
  if (elevators >= ELEVATOR_REQUIRED_COUNT) {
    elevField.required = true;
    elevField.grade = "승강기 안전관리자";
    elevField.type = "선임 (관리소장 겸직 가능)";
    elevField.notes.push(`승강기 ${elevators}대 설치: 승강기 안전관리자 선임 필수 (관리소장 겸직 가능)`);
    requiredInspections.push("elevator");
  } else {
    elevField.notes.push("승강기 미설치: 선임 불요");
  }
  fields.push(elevField);

  // 7. 소독(방역)
  const disinfField: AppointmentField = {
    field: "disinfection",
    required: false,
    grade: null,
    type: null,
    legalBasis: "감염병의 예방 및 관리에 관한 법률 제51조",
    notes: [],
  };
  const disinfRequired = (isResidential && units >= DISINF_RESIDENTIAL_UNITS) || ((isOffice || isComplex) && area >= DISINF_OFFICE_AREA);
  if (disinfRequired) {
    disinfField.required = true;
    disinfField.type = "전문업체 위탁";
    if (isResidential && units >= DISINF_RESIDENTIAL_UNITS) {
      disinfField.notes.push("300세대 이상 공동주택: 의무소독 대상");
    } else {
      disinfField.notes.push("연면적 2,000㎡ 이상 사무실/복합용도: 의무소독 대상");
    }
    disinfField.notes.push("하절기(4~9월): 2개월 1회 / 동절기(10~3월): 3개월 1회");
    requiredInspections.push("disinfection");
  } else {
    disinfField.notes.push("의무소독 대상 아님 (300세대 미만 공동주택 또는 연면적 2,000㎡ 미만)");
  }
  fields.push(disinfField);

  // General building safety
  requiredInspections.push("building_safety");
  requiredInspections.push("water_tank");
  requiredInspections.push("hygiene");

  let safetyManagerRequired = false;
  let safetyManagerType: string | null = null;
  if (area >= SAFETY_MGR_REQUIRED_AREA || floors >= SAFETY_MGR_REQUIRED_FLOORS || basement >= SAFETY_MGR_REQUIRED_BASEMENT) {
    safetyManagerRequired = true;
    if (area >= SAFETY_MGR_SPECIALIST_AREA || floors >= SAFETY_MGR_SPECIALIST_FLOORS) {
      safetyManagerType = "건축물관리자(안전관리 전문기관 위탁 가능)";
    } else if (area >= SAFETY_MGR_PRO_AREA || floors >= SAFETY_MGR_PRO_FLOORS) {
      safetyManagerType = "안전관리자 선임 또는 전문기관 위탁";
    } else {
      safetyManagerType = "안전관리자 선임 (겸직 가능)";
    }
  }

  res.json({
    safetyManagerRequired,
    safetyManagerType,
    requiredInspections,
    fields,
    safetyNotes: fields.flatMap(f => f.notes),
    facilityManagerCriteria: fields.filter(f => f.required).map(f => `${f.grade || f.field} ${f.type || "선임"} 필수`),
  });
});

router.post("/buildings/auto-schedule-inspections", async (req: Request, res: Response) => {
  const { buildingId, inspectionDates, useFallbackCompletionDate } = req.body;

  if (!buildingId || !inspectionDates || typeof inspectionDates !== "object") {
    res.status(400).json({ error: "buildingId와 inspectionDates가 필요합니다" });
    return;
  }

  // [Task #174] 권한 검증: 본인 건물이거나 본사/플랫폼 관리자만 호출 가능.
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "로그인이 필요합니다" });
    return;
  }
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  if (!user || (user.buildingId !== buildingId && !["platform_admin", "hq_executive"].includes(user.role))) {
    res.status(403).json({ error: "해당 건물에 대한 권한이 없습니다" });
    return;
  }

  // [Task #132/#174] 사용자가 최종 점검일을 모르는 경우, 건물 준공일을 fallback으로 사용한다.
  // #174: 항목별 폴백 여부를 기록하여 임시 일정에 [임시] 워터마크를 표시할 수 있게 한다.
  let fallbackLastDate: string | null = null;
  let totalAreaNum = 0;
  if (useFallbackCompletionDate) {
    const [bld] = await db.select({
      completionDate: buildingsTable.completionDate,
      totalArea: buildingsTable.totalArea,
    })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, buildingId));
    if (bld?.completionDate) {
      fallbackLastDate = typeof bld.completionDate === "string"
        ? bld.completionDate
        : new Date(bld.completionDate as unknown as string | number | Date).toISOString().slice(0, 10);
    }
    totalAreaNum = Number(bld?.totalArea ?? 0);
  }

  try {
    const created: Array<Record<string, unknown>> = [];

    for (const [category, dates] of Object.entries(inspectionDates)) {
      if (!dates || typeof dates !== "object") continue;
      const dateEntries = dates as Record<string, string>;

      for (const [presetName, lastDateInput] of Object.entries(dateEntries)) {
        const isProvisional = !lastDateInput && !!fallbackLastDate;
        const lastDate = lastDateInput || fallbackLastDate;
        if (!lastDate) continue;

        const cycleMonths = getCyclemonthsForCategory(category, presetName);
        // [Task #174] 건축물 정기점검 폴백: 준공 + 5년/10년이 첫 회차이며,
        // 그 이후로는 정상 주기(36개월)로 굴려서 현재 시점 이후의 다음 회차를 산정한다.
        let nextDueDate: string;
        if (isProvisional && category === "building_safety") {
          const firstMonths = totalAreaNum >= 10000 ? 120 : 60;
          let candidate = calculateNextDue(lastDate, firstMonths);
          const now = new Date();
          // 이미 지난 1차 회차라면 cycleMonths(36개월) 단위로 미래 시점까지 진행.
          while (new Date(candidate) < now) {
            candidate = calculateNextDue(candidate, cycleMonths);
          }
          nextDueDate = candidate;
        } else {
          nextDueDate = calculateNextDue(lastDate, cycleMonths);
        }

        const [inspection] = await db.insert(inspectionsTable).values({
          buildingId,
          name: presetName,
          category,
          inspectionType: "legal",
          frequencyPerYear: Math.ceil(12 / cycleMonths),
          legalCycleMonths: cycleMonths,
          lastInspectionDate: lastDate,
          nextDueDate,
          status: new Date(nextDueDate) < new Date() ? "overdue" : "upcoming",
          advanceAlertDays: 30,
          notes: isProvisional ? "[임시] 준공일 기준 자동 산정 — 실제 점검일이 확인되면 수정해 주세요." : null,
        }).returning();

        created.push(inspection);
      }
    }

    res.json({ created, count: created.length });
  } catch (error) {
    req.log.error({ err: error }, "Error auto-scheduling inspections");
    res.status(500).json({ error: "점검 일정 자동 생성 실패" });
  }
});

function getCyclemonthsForCategory(category: string, presetName: string): number {
  const preset = LEGAL_PRESETS.find(p => p.name === presetName);
  if (preset) return preset.legalCycleMonths;

  const categoryDefaults: Record<string, number> = {
    fire_safety: 12,
    electrical: 36,
    elevator: 12,
    water_tank: 6,
    septic: 12,
    hygiene: 12,
    building_safety: 6,
    gas: 12,
    playground: 24,
    mechanical: 12,
    telecom: 12,
    disinfection: 2,
  };

  return categoryDefaults[category] || 12;
}

function calculateNextDue(lastDate: string, cycleMonths: number): string {
  const d = new Date(lastDate);
  d.setMonth(d.getMonth() + cycleMonths);
  return d.toISOString().split("T")[0];
}

// HQ 총괄: 건물별 법정점검 임박/초과 현황.
// 버킷: overdue (마감일 < 오늘, 미완료) / due7 (오늘~+7일) / due30 (+8~+30일)
router.get("/buildings/legal-inspections-summary", async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  if (!user || (user.role !== "hq_executive" && user.role !== "platform_admin")) {
    res.status(403).json({ error: "총괄책임자 전용입니다" });
    return;
  }

  try {
    // KST(Asia/Seoul) 기준 오늘 날짜로 버킷을 계산해야 자정 경계 오차가 없다.
    const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const todayStr = kstNow.toISOString().split("T")[0];
    const d7 = new Date(kstNow); d7.setUTCDate(d7.getUTCDate() + 7);
    const d30 = new Date(kstNow); d30.setUTCDate(d30.getUTCDate() + 30);
    const d7Str = d7.toISOString().split("T")[0];
    const d30Str = d30.toISOString().split("T")[0];

    const buildings = await db.select({ id: buildingsTable.id, name: buildingsTable.name }).from(buildingsTable);

    // 법정점검만 집계 (inspectionType='legal'). 완료된 건은 제외.
    const allLegal = await db
      .select()
      .from(inspectionsTable)
      .where(and(eq(inspectionsTable.inspectionType, "legal"), sql`${inspectionsTable.status} <> 'completed'`));

    type Bucket = { id: number; name: string; category: string; nextDueDate: string };
    const summaries = buildings.map((b) => {
      const items = allLegal.filter((i) => i.buildingId === b.id);
      const overdue: Bucket[] = [];
      const due7: Bucket[] = [];
      const due30: Bucket[] = [];
      for (const i of items) {
        if (!i.nextDueDate) continue;
        const due = i.nextDueDate;
        const bucket: Bucket = { id: i.id, name: i.name, category: i.category, nextDueDate: due };
        if (due < todayStr) overdue.push(bucket);
        else if (due <= d7Str) due7.push(bucket);
        else if (due <= d30Str) due30.push(bucket);
      }
      const sortByDue = (a: Bucket, b: Bucket) => a.nextDueDate.localeCompare(b.nextDueDate);
      overdue.sort(sortByDue);
      due7.sort(sortByDue);
      due30.sort(sortByDue);
      return {
        buildingId: b.id,
        buildingName: b.name,
        overdueCount: overdue.length,
        due7Count: due7.length,
        due30Count: due30.length,
        overdueItems: overdue,
        due7Items: due7,
        due30Items: due30,
      };
    });

    res.json({ summaries });
  } catch (error) {
    req.log.error({ err: error }, "Error fetching HQ legal inspections summary");
    res.status(500).json({ error: "Failed to fetch summary" });
  }
});

router.get("/buildings/legal-appointees", async (req: Request, res: Response) => {
  try {
    const user = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId)).then(r => r[0]);
    if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

    const queryBuildingId = req.query.buildingId ? Number(req.query.buildingId) : null;
    const buildingId = queryBuildingId ?? user.buildingId ?? null;

    if (!buildingId) {
      res.status(400).json({ error: "buildingId가 필요합니다" });
      return;
    }
    if (
      user.role !== "platform_admin" &&
      user.role !== "hq_executive" &&
      user.buildingId !== buildingId
    ) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const rows = await db
      .select()
      .from(legalAppointeesTable)
      .where(eq(legalAppointeesTable.buildingId, buildingId));

    const appointees: Record<string, { name: string; certificateNo: string | null; certificateExpiry: string | null } | null> = {
      electrical: null,
      fire_safety: null,
      mechanical: null,
      telecom: null,
    };
    for (const r of rows) {
      if (r.field in appointees) {
        appointees[r.field] = {
          name: r.name,
          certificateNo: r.certificateNo,
          certificateExpiry: r.certificateExpiry,
        };
      }
    }

    res.json({ buildingId, appointees });
  } catch (error) {
    req.log.error({ err: error }, "Error fetching legal appointees");
    res.status(500).json({ error: "Failed to fetch appointees" });
  }
});

// [Task #132] 관리소장 위저드 완료 시 호출. 주소 잠금 + areaBasis 옵션.
router.post("/buildings/:id/lock-address", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.buildingId !== id && !["platform_admin", "hq_executive"].includes(user.role)) {
    res.status(403).json({ error: "이 건물을 잠글 권한이 없습니다" }); return;
  }
  // [Task #227] 주소 잠금 시점에서도 최종 안전장치로 매니저 중복을 검사한다.
  if (user.role === "manager") {
    const existing = await db.select().from(buildingsTable).where(eq(buildingsTable.id, id)).then(r => r[0]);
    const dup = await findExistingManagerForAddress({
      addressJibun: existing?.addressJibun ?? null,
      buildingId: id,
      excludeUserId: userId,
    });
    if (dup) {
      res.status(409).json({ error: MANAGER_DUPLICATE_MESSAGE });
      return;
    }
  }
  try {
    const [b] = await db.update(buildingsTable).set({ addressLocked: true }).where(eq(buildingsTable.id, id)).returning();
    res.json({ building: b });
  } catch (e) {
    req.log.error({ err: e }, "Failed to lock building address");
    res.status(500).json({ error: "주소 잠금에 실패했습니다" });
  }
});

router.put("/buildings/:id/area-basis", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  const { areaBasis } = req.body;
  if (!["standard", "exclusive", "common"].includes(areaBasis)) {
    res.status(400).json({ error: "유효하지 않은 면적 기준입니다" }); return;
  }
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  if (!user || (user.buildingId !== id && !["platform_admin", "hq_executive"].includes(user.role))) {
    res.status(403).json({ error: "권한이 없습니다" }); return;
  }
  const [b] = await db.update(buildingsTable).set({ areaBasis }).where(eq(buildingsTable.id, id)).returning();

  // [Task #132] 면적 기준 확정 시 회계 엔진 부트스트랩 파라미터를 함께 산정·기록한다.
  // 연면적과 기준에 따른 초기 단가(원/㎡)를 안내값으로 산출하고
  // accountingInitialFiles 테이블에 area_basis_init 카테고리로 보존한다(관리자가
  // 추후 조정 가능하도록 텍스트 메모로 기록).
  try {
    const totalArea = b.totalArea ? parseFloat(String(b.totalArea)) : 0;
    const baseRatePerSqm = areaBasis === "exclusive" ? 1800 : areaBasis === "common" ? 1200 : 1500;
    const initialMonthlyTotal = Math.round(totalArea * baseRatePerSqm);
    await db.insert(accountingInitialFilesTable).values({
      buildingId: id,
      category: "area_basis_init",
      fileUrl: "",
      originalName: "면적기준 초기 산정",
      periodNote: `basis=${areaBasis}; totalArea=${totalArea}㎡; ratePerSqm=${baseRatePerSqm}원; initialMonthlyTotal=${initialMonthlyTotal}원`,
      uploadedBy: userId,
    });
  } catch (e) {
    req.log?.warn?.({ err: e }, "Failed to seed area_basis_init");
  }

  res.json({ building: b });
});

export default router;
