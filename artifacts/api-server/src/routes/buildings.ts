import { Router, type IRouter, type Request, type Response } from "express";
import { db, buildingsTable, usersTable, inspectionsTable, safetyChecklistsTable, maintenanceLogsTable, unitsTable, vehiclesTable } from "@workspace/db";
import { eq, and, lte, gte, sql, desc } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireRole("manager", "platform_admin", "hq_executive"));

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

    const buildingId = building.id;

    const allInspections = await db.select().from(inspectionsTable).where(eq(inspectionsTable.buildingId, buildingId));
    const upcomingInspections = allInspections.filter(i => i.nextDueDate >= today && i.nextDueDate <= futureStr);
    const overdueInspections = allInspections.filter(i => i.status === "overdue" || (i.nextDueDate < today && i.status !== "completed"));

    const recentChecklists = await db.select().from(safetyChecklistsTable).where(eq(safetyChecklistsTable.buildingId, buildingId)).orderBy(desc(safetyChecklistsTable.inspectionDate)).limit(5);
    const checklistTotal = await db.select({ count: sql<number>`count(*)::int` }).from(safetyChecklistsTable).where(eq(safetyChecklistsTable.buildingId, buildingId)).then(r => r[0]?.count ?? 0);

    const pendingMaintenance = await db.select({ count: sql<number>`count(*)::int` }).from(maintenanceLogsTable).where(and(eq(maintenanceLogsTable.buildingId, buildingId), eq(maintenanceLogsTable.status, "pending"))).then(r => r[0]?.count ?? 0);
    const completedMaintenance = await db.select({ count: sql<number>`count(*)::int` }).from(maintenanceLogsTable).where(and(eq(maintenanceLogsTable.buildingId, buildingId), eq(maintenanceLogsTable.status, "completed"))).then(r => r[0]?.count ?? 0);

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

router.post("/buildings", async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const data = req.body;
    const [building] = await db.insert(buildingsTable).values({
      name: data.name,
      addressFull: data.addressFull || null,
      addressJibun: data.addressJibun || null,
      sido: data.sido || null,
      sigungu: data.sigungu || null,
      dong: data.dong || null,
      zipCode: data.zipCode || null,
      totalUnits: data.totalUnits ? parseInt(data.totalUnits) : null,
      totalFloors: data.totalFloors ? parseInt(data.totalFloors) : null,
      basementFloors: data.basementFloors ? parseInt(data.basementFloors) : null,
      totalArea: data.totalArea || null,
      buildingUsage: data.buildingUsage || null,
      structureType: data.structureType || null,
      completionDate: data.completionDate || null,
      elevatorCount: data.elevatorCount ? parseInt(data.elevatorCount) : null,
      parkingSpaces: data.parkingSpaces ? parseInt(data.parkingSpaces) : null,
      hasPlayground: data.hasPlayground ?? false,
      hasGas: data.hasGas ?? true,
      hasSepticTank: data.hasSepticTank ?? true,
      safetyManagerRequired: data.safetyManagerRequired ?? false,
      safetyManagerType: data.safetyManagerType || null,
      buildingRegisterPk: data.buildingRegisterPk || null,
      landArea: data.landArea || null,
      buildingArea: data.buildingArea || null,
      buildingCoverageRatio: data.buildingCoverageRatio || null,
      floorAreaRatio: data.floorAreaRatio || null,
      managementOfficePhone: data.managementOfficePhone || null,
      managementOfficeFax: data.managementOfficeFax || null,
    }).returning();

    await db.update(usersTable)
      .set({
        buildingId: building.id,
        buildingSido: data.sido || null,
        buildingSigungu: data.sigungu || null,
      })
      .where(eq(usersTable.id, userId));

    res.json({ building });
  } catch (error) {
    req.log.error({ err: error }, "Error creating building");
    res.status(500).json({ error: "Failed to create building" });
  }
});

router.put("/buildings/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const data = req.body;

  try {
    const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
    if (!user || (user.buildingId !== id && user.role !== "platform_admin")) {
      res.status(403).json({ error: "이 건물을 수정할 권한이 없습니다" });
      return;
    }
    const updateData: Record<string, unknown> = {};
    const fields = [
      "name", "addressFull", "addressJibun", "sido", "sigungu", "dong", "zipCode",
      "buildingUsage", "structureType", "completionDate", "buildingRegisterPk",
      "safetyManagerType", "managementOfficePhone", "managementOfficeFax",
    ];
    const numericFields = ["landArea", "buildingArea", "buildingCoverageRatio", "floorAreaRatio"];
    const intFields = ["totalUnits", "totalFloors", "basementFloors", "elevatorCount", "parkingSpaces"];
    const boolFields = ["hasPlayground", "hasGas", "hasSepticTank", "safetyManagerRequired"];

    for (const f of fields) {
      if (data[f] !== undefined) updateData[f] = data[f];
    }
    for (const f of intFields) {
      if (data[f] !== undefined) updateData[f] = data[f] ? parseInt(data[f]) : null;
    }
    for (const f of numericFields) {
      if (data[f] !== undefined) updateData[f] = data[f] || null;
    }
    for (const f of boolFields) {
      if (data[f] !== undefined) updateData[f] = data[f];
    }
    if (data.totalArea !== undefined) updateData.totalArea = data.totalArea;

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
    const baseParams = {
      serviceKey: apiKey,
      sigunguCd: String(sigunguCd || ""),
      bjdongCd: String(bjdongCd || ""),
      bun: String(bun || "").padStart(4, "0"),
      ji: String(ji || "0").padStart(4, "0"),
      numOfRows: "1",
      pageNo: "1",
      _type: "json",
    };

    const [titleResult, recapResult] = await Promise.allSettled([
      fetch(`https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?${new URLSearchParams(baseParams)}`).then(r => r.ok ? r.json() : null),
      fetch(`https://apis.data.go.kr/1613000/BldRgstHubService/getBrRecapTitleInfo?${new URLSearchParams(baseParams)}`).then(r => r.ok ? r.json() : null),
    ]);

    const titleData = titleResult.status === "fulfilled" ? titleResult.value : null;
    const recapData = recapResult.status === "fulfilled" ? recapResult.value : null;

    const titleItems = titleData?.response?.body?.items?.item;
    const recapItems = recapData?.response?.body?.items?.item;

    const titleItem = titleItems ? (Array.isArray(titleItems) ? titleItems[0] : titleItems) : null;
    const recapItem = recapItems ? (Array.isArray(recapItems) ? recapItems[0] : recapItems) : null;

    if (!titleItem && !recapItem) {
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

router.post("/buildings/calculate-safety", async (req: Request, res: Response) => {
  const { totalArea, totalFloors, basementFloors, totalUnits, buildingUsage, elevatorCount } = req.body;

  const area = parseFloat(totalArea) || 0;
  const floors = parseInt(totalFloors) || 0;
  const basement = parseInt(basementFloors) || 0;
  const units = parseInt(totalUnits) || 0;
  const elevators = parseInt(elevatorCount) || 0;

  let safetyManagerRequired = false;
  let safetyManagerType: string | null = null;
  const requiredInspections: string[] = [];
  const safetyNotes: string[] = [];

  if (area >= 5000 || floors >= 11 || basement >= 2) {
    safetyManagerRequired = true;
    if (area >= 30000 || floors >= 30) {
      safetyManagerType = "건축물관리자(안전관리 전문기관 위탁 가능)";
      safetyNotes.push("연면적 3만㎡ 이상 또는 30층 이상 건축물: 건축물관리자 선임 필수");
    } else if (area >= 15000 || floors >= 16) {
      safetyManagerType = "안전관리자 선임 또는 전문기관 위탁";
      safetyNotes.push("연면적 1.5만㎡ 이상 또는 16층 이상: 안전관리자 선임 또는 위탁 필수");
    } else {
      safetyManagerType = "안전관리자 선임 (겸직 가능)";
      safetyNotes.push("연면적 5천㎡ 이상 또는 11층 이상: 안전관리자 선임 필요 (겸직 가능)");
    }
  }

  if (units >= 300) {
    safetyNotes.push("300세대 이상: 주택관리사(보) 의무 배치");
  } else if (units >= 150) {
    safetyNotes.push("150세대 이상: 주택관리사(보) 선임 권장");
  }

  requiredInspections.push("fire_safety");
  requiredInspections.push("electrical");
  requiredInspections.push("building_safety");
  requiredInspections.push("water_tank");
  requiredInspections.push("hygiene");

  if (elevators > 0) requiredInspections.push("elevator");

  if (area >= 2000 || floors >= 6) {
    requiredInspections.push("gas");
    safetyNotes.push("가스 안전점검 대상 (연면적 2천㎡ 이상 또는 6층 이상)");
  }

  if (area >= 3000) {
    safetyNotes.push("실내공기질 측정 대상 (연면적 3천㎡ 이상)");
  }

  if (floors >= 6) {
    safetyNotes.push("건축물 정기점검 대상 (6층 이상)");
  }

  const facilityManagerCriteria: string[] = [];
  if (units >= 500) {
    facilityManagerCriteria.push("전기안전관리자 선임 필수");
    facilityManagerCriteria.push("소방안전관리자 2급 이상 선임 필수");
  } else if (units >= 300) {
    facilityManagerCriteria.push("소방안전관리자 3급 이상 선임 필수");
  }
  if (elevators > 0) {
    facilityManagerCriteria.push("승강기 안전관리자 선임 필수");
  }

  res.json({
    safetyManagerRequired,
    safetyManagerType,
    requiredInspections,
    safetyNotes,
    facilityManagerCriteria,
  });
});

router.post("/buildings/auto-schedule-inspections", async (req: Request, res: Response) => {
  const { buildingId, inspectionDates } = req.body;

  if (!buildingId || !inspectionDates || typeof inspectionDates !== "object") {
    res.status(400).json({ error: "buildingId와 inspectionDates가 필요합니다" });
    return;
  }

  try {
    const created: Array<Record<string, unknown>> = [];

    for (const [category, dates] of Object.entries(inspectionDates)) {
      if (!dates || typeof dates !== "object") continue;
      const dateEntries = dates as Record<string, string>;

      for (const [presetName, lastDate] of Object.entries(dateEntries)) {
        if (!lastDate) continue;

        const cycleMonths = getCyclemonthsForCategory(category, presetName);
        const nextDueDate = calculateNextDue(lastDate, cycleMonths);

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
  const cycles: Record<string, number> = {
    fire_safety: 12,
    electrical: 36,
    elevator: 12,
    water_tank: 6,
    septic: 12,
    hygiene: 12,
    building_safety: 6,
    gas: 12,
    playground: 24,
  };

  if (presetName.includes("정밀") || presetName.includes("종합")) return 12;
  if (presetName.includes("반기")) return 6;

  return cycles[category] || 12;
}

function calculateNextDue(lastDate: string, cycleMonths: number): string {
  const d = new Date(lastDate);
  d.setMonth(d.getMonth() + cycleMonths);
  return d.toISOString().split("T")[0];
}

export default router;
