import { Router, type IRouter, type Request, type Response } from "express";
import { db, buildingsTable, usersTable, inspectionsTable, safetyChecklistsTable, maintenanceLogsTable, unitsTable, vehiclesTable } from "@workspace/db";
import { eq, and, lte, gte, sql, desc } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";
import { LEGAL_PRESETS } from "./inspections";

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
      electricCapacityKw: data.electricCapacityKw || null,
      gasUsageMonthly: data.gasUsageMonthly || null,
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
      "approvalDate",
    ];
    const numericFields = ["landArea", "buildingArea", "buildingCoverageRatio", "floorAreaRatio", "electricCapacityKw", "gasUsageMonthly"];
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
  if (electricKw >= 1000) {
    elecField.required = true;
    elecField.grade = "상주 전기안전관리자";
    elecField.type = "상주";
    elecField.notes.push("수전설비 용량 1,000kW 이상: 상주 전기안전관리자 선임 필수");
  } else if (electricKw >= 75) {
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
  if (floors >= 30 || area >= 100000) {
    fireField.grade = "특급 소방안전관리자";
    fireField.notes.push("30층 이상 또는 연면적 10만㎡ 이상: 특급");
  } else if (floors >= 11 || area >= 15000 || (basement >= 1 && area >= 5000)) {
    fireField.grade = "1급 소방안전관리자";
    fireField.notes.push("11층 이상 또는 연면적 1.5만㎡ 이상: 1급");
  } else if (floors >= 5 || area >= 2000) {
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
  const isFirstClassProtection = isResidential && units >= 300;
  const gasThreshold = isFirstClassProtection ? 1000 : 2000;
  if (gasEnabled && gasMonthly >= gasThreshold) {
    gasField.required = true;
    gasField.grade = "가스안전관리자";
    gasField.type = "선임 또는 대행";
    gasField.notes.push(`월 사용량 ${gasMonthly.toLocaleString()}㎥ ≥ ${gasThreshold.toLocaleString()}㎥${isFirstClassProtection ? " (1종 보호시설)" : ""}: 가스안전관리자 선임 필수`);
    requiredInspections.push("gas");
  } else if (gasEnabled) {
    gasField.notes.push(`월 가스사용량 ${gasThreshold.toLocaleString()}㎥ 미만: 가스안전관리자 선임 불요 (가스사용량을 입력하면 정확한 판정이 가능합니다)`);
    if (area >= 2000 || floors >= 6) {
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
  if (area >= 10000) {
    mechField.required = true;
    if (area >= 30000) {
      mechField.grade = "특급 기계설비유지관리자";
    } else if (area >= 20000) {
      mechField.grade = "고급 기계설비유지관리자";
    } else if (area >= 15000) {
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
  if (area >= 5000) {
    teleField.type = "선임";
    teleField.grade = "정보통신 유지관리자";
    const today = new Date();
    let enforcementDate: Date;
    if (area >= 30000) {
      enforcementDate = new Date("2025-07-18");
      teleField.notes.push("연면적 3만㎡ 이상: 2025.7.18부터 선임 의무");
    } else if (area >= 10000) {
      enforcementDate = new Date("2026-07-18");
      teleField.notes.push("연면적 1~3만㎡: 2026.7.18부터 선임 의무");
    } else {
      enforcementDate = new Date("2027-07-18");
      teleField.notes.push("연면적 5천~1만㎡: 2027.7.18부터 선임 의무");
    }
    if (today >= enforcementDate) {
      teleField.required = true;
      requiredInspections.push("telecom");
    } else {
      teleField.notes.push(`⚠ 시행 예정 (${enforcementDate.toISOString().split("T")[0]}) — 현재는 선임 의무 없음`);
    }
  } else {
    teleField.notes.push("연면적 5,000㎡ 미만: 정보통신 유지관리자 선임 불요");
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
  if (elevators > 0) {
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
  const disinfRequired = (isResidential && units >= 300) || ((isOffice || isComplex) && area >= 2000);
  if (disinfRequired) {
    disinfField.required = true;
    disinfField.type = "전문업체 위탁";
    if (isResidential && units >= 300) {
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
  if (area >= 5000 || floors >= 11 || basement >= 2) {
    safetyManagerRequired = true;
    if (area >= 30000 || floors >= 30) {
      safetyManagerType = "건축물관리자(안전관리 전문기관 위탁 가능)";
    } else if (area >= 15000 || floors >= 16) {
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

export default router;
