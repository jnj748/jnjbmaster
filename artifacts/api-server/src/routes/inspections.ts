import { Router, type IRouter } from "express";
import { eq, and, lte, gte, desc, sql } from "drizzle-orm";
import { db, inspectionsTable, inspectionLogsTable, legalInspectionPresetsTable, draftsTable, notificationsTable, vendorsTable, rfqsTable, usersTable } from "@workspace/db";
import {
  ListInspectionsResponse,
  CreateInspectionBody,
  UpdateInspectionParams,
  UpdateInspectionBody,
  UpdateInspectionResponse,
  DeleteInspectionParams,
  GetUpcomingInspectionsResponse,
  ListInspectionPresetsResponse,
  CompleteInspectionParams,
  CompleteInspectionBody,
  CompleteInspectionResponse,
  ListInspectionLogsParams,
  ListInspectionLogsResponse,
  GenerateInspectionAlertsResponse,
  TriggerAiMatchingResponse,
  ApproveInspectionMatchingParams,
  ApproveInspectionMatchingBody,
  ApproveInspectionMatchingResponse,
  BulkRegisterInspectionsBody,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireRole("manager", "platform_admin", "hq_executive", "facility_staff"));

async function getUserBuildingId(userId: number): Promise<number | null> {
  const user = await db.select({ buildingId: usersTable.buildingId }).from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  return user?.buildingId ?? null;
}

export const LEGAL_PRESETS = [
  // ── 소방 분야 ──
  {
    name: "소방 법정점검 (작동+정밀)",
    category: "fire_safety",
    inspectionType: "legal",
    legalCycleMonths: 12,
    defaultAlertDays: 30,
    description: "소방시설법에 따른 작동기능점검 + 종합정밀점검 (연 1회)",
    legalBasis: "소방시설 설치 및 관리에 관한 법률 제25조",
    recommendedMonths: null,
    subItems: JSON.stringify(["작동기능점검", "종합정밀점검"]),
    seasonalNotes: null,
  },
  {
    name: "소방 자체점검",
    category: "fire_safety",
    inspectionType: "self_regular",
    legalCycleMonths: 1,
    defaultAlertDays: 7,
    description: "매월 자체 소방시설 점검 (4월·7월·10월 집중 점검/정비)",
    legalBasis: "소방시설 설치 및 관리에 관한 법률 제25조",
    recommendedMonths: JSON.stringify([4, 7, 10]),
    subItems: JSON.stringify(["소화기 점검", "감지기 작동 확인", "스프링클러 점검", "피난구 확인"]),
    seasonalNotes: null,
  },
  {
    name: "불조심 강조의 달 점검",
    category: "fire_safety",
    inspectionType: "seasonal",
    legalCycleMonths: 12,
    defaultAlertDays: 14,
    description: "11월 불조심 강조 기간 특별 소방 안전 점검",
    legalBasis: "소방시설 설치 및 관리에 관한 법률",
    recommendedMonths: JSON.stringify([11]),
    subItems: JSON.stringify(["소방 안전 캠페인", "소화기 위치 확인", "대피 훈련"]),
    seasonalNotes: "11월 불조심 강조 기간: 소방 안전 교육 및 대피 훈련 실시",
  },

  // ── 전기 분야 ──
  {
    name: "전기안전 법정점검",
    category: "electrical",
    inspectionType: "legal",
    legalCycleMonths: 36,
    defaultAlertDays: 60,
    description: "전기사업법에 따른 정기검사 (2~3년 1회, 한전 또는 전기안전공사)",
    legalBasis: "전기사업법 제63조, 전기안전관리법 제22조",
    recommendedMonths: null,
    subItems: JSON.stringify(["절연저항 측정", "접지저항 측정", "전기설비 외관 점검"]),
    seasonalNotes: null,
  },
  {
    name: "변전실·분전반 월간 점검",
    category: "electrical",
    inspectionType: "self_regular",
    legalCycleMonths: 1,
    defaultAlertDays: 7,
    description: "변전실 점검, 절연저항 측정, 분전반·배선 상태 점검 (매월)",
    legalBasis: "전기사업법 제63조",
    recommendedMonths: null,
    subItems: JSON.stringify(["변전실 점검", "절연저항 측정", "분전반 점검", "배선 상태 확인"]),
    seasonalNotes: null,
  },
  {
    name: "비상발전기 무부하 기동 점검",
    category: "electrical",
    inspectionType: "biweekly",
    legalCycleMonths: 1,
    defaultAlertDays: 3,
    description: "비상발전기 무부하 기동 점검 (2주 1회)",
    legalBasis: "전기사업법 제63조",
    recommendedMonths: null,
    subItems: JSON.stringify(["무부하 기동 테스트", "연료 잔량 확인", "배터리 상태 점검"]),
    seasonalNotes: null,
  },
  {
    name: "혹한기 동파 대비 전기설비 점검",
    category: "electrical",
    inspectionType: "seasonal",
    legalCycleMonths: 12,
    defaultAlertDays: 14,
    description: "1월 혹한기 동파 대비 전기설비 특별 점검",
    legalBasis: "전기사업법 제63조",
    recommendedMonths: JSON.stringify([1]),
    subItems: JSON.stringify(["동파 대비 열선 점검", "보온재 상태 확인", "외부 배관 점검"]),
    seasonalNotes: "1월 혹한기: 동파 방지 열선, 보온재, 외부 배관 집중 점검",
  },
  {
    name: "우기 수배전반 누설전류 측정",
    category: "electrical",
    inspectionType: "seasonal",
    legalCycleMonths: 12,
    defaultAlertDays: 14,
    description: "6~7월 우기 대비 수배전반 누설전류 집중 측정",
    legalBasis: "전기사업법 제63조",
    recommendedMonths: JSON.stringify([6, 7]),
    subItems: JSON.stringify(["누설전류 측정", "접지 상태 점검", "방수 처리 확인"]),
    seasonalNotes: "6~7월 우기: 수배전반 누설전류, 접지 상태, 방수 처리 집중 점검",
  },

  // ── 승강기 ──
  {
    name: "승강기 법정 안전검사",
    category: "elevator",
    inspectionType: "legal",
    legalCycleMonths: 12,
    defaultAlertDays: 30,
    description: "승강기안전관리법에 따른 정기검사 (연 1회)",
    legalBasis: "승강기 안전관리법 제32조",
    recommendedMonths: null,
    subItems: JSON.stringify(["안전장치 검사", "와이어로프 검사", "제어반 검사", "도어장치 검사"]),
    seasonalNotes: null,
  },
  {
    name: "승강기 자체 월간 점검",
    category: "elevator",
    inspectionType: "self_regular",
    legalCycleMonths: 1,
    defaultAlertDays: 7,
    description: "매월 자체 승강기 점검 (세부 항목별 주기 상이)",
    legalBasis: "승강기 안전관리법 제32조",
    recommendedMonths: null,
    subItems: JSON.stringify([
      "비상운전장치 점검 (매월)",
      "로프·브레이크 점검 (매월)",
      "주개폐기 점검 (3개월 주기)",
      "도어장치 점검 (매월)",
      "안전회로 점검 (매월)",
    ]),
    seasonalNotes: null,
  },

  // ── 위생/환경 ──
  {
    name: "저수조 청소",
    category: "water_tank",
    inspectionType: "legal",
    legalCycleMonths: 6,
    defaultAlertDays: 30,
    description: "수도법에 따른 저수조 청소 (반기 1회)",
    legalBasis: "수도법 제33조, 건축물 위생관리법",
    recommendedMonths: JSON.stringify([3, 4, 8, 9]),
    subItems: JSON.stringify(["저수조 내부 세척", "소독", "수질 검사"]),
    seasonalNotes: "3~4월, 8~9월 실시 추천 (동절기·하절기 전 시행)",
  },
  {
    name: "정화조 청소",
    category: "septic",
    inspectionType: "legal",
    legalCycleMonths: 12,
    defaultAlertDays: 30,
    description: "하수도법에 따른 정화조 청소 (연 1회)",
    legalBasis: "하수도법 제39조",
    recommendedMonths: null,
    subItems: JSON.stringify(["정화조 내부 청소", "슬러지 제거", "기능 점검"]),
    seasonalNotes: null,
  },
  {
    name: "오수정화시설 분기별 점검",
    category: "septic",
    inspectionType: "self_regular",
    legalCycleMonths: 3,
    defaultAlertDays: 14,
    description: "오수정화시설 분기별 점검 (3, 6, 9, 12월)",
    legalBasis: "하수도법 제39조",
    recommendedMonths: JSON.stringify([3, 6, 9, 12]),
    subItems: JSON.stringify(["방류수 수질 확인", "송풍기 점검", "침전조 상태 확인"]),
    seasonalNotes: null,
  },
  {
    name: "수질 검사",
    category: "hygiene",
    inspectionType: "legal",
    legalCycleMonths: 12,
    defaultAlertDays: 30,
    description: "수도법에 따른 수질 검사 (연 1회)",
    legalBasis: "수도법 제33조, 먹는물관리법",
    recommendedMonths: null,
    subItems: JSON.stringify(["일반세균", "대장균", "잔류염소", "탁도 측정"]),
    seasonalNotes: null,
  },
  {
    name: "실내공기질 검사",
    category: "hygiene",
    inspectionType: "legal",
    legalCycleMonths: 12,
    defaultAlertDays: 30,
    description: "다중이용시설 실내공기질 관리법에 따른 검사 (연 1회)",
    legalBasis: "실내공기질 관리법 제12조",
    recommendedMonths: null,
    subItems: JSON.stringify(["미세먼지(PM10)", "이산화탄소", "포름알데히드", "총부유세균"]),
    seasonalNotes: null,
  },

  // ── 건축물/안전 ──
  {
    name: "건축물 반기 자체점검",
    category: "building_safety",
    inspectionType: "self_regular",
    legalCycleMonths: 6,
    defaultAlertDays: 30,
    description: "시설물안전관리법에 따른 건축물 자체 반기점검 (반기 1회)",
    legalBasis: "시설물의 안전 및 유지관리에 관한 특별법 제11조",
    recommendedMonths: JSON.stringify([3, 9]),
    subItems: JSON.stringify(["외벽 균열 확인", "옥상 방수 상태", "구조물 안전", "배관 누수"]),
    seasonalNotes: "3월, 9월 반기 자체점검 (법정 정기안전점검과 별도)",
  },
  {
    name: "안전점검의 날",
    category: "safety_check",
    inspectionType: "administrative",
    legalCycleMonths: 1,
    defaultAlertDays: 3,
    description: "매월 4일 안전점검의 날 시설 안전 점검",
    legalBasis: "재난 및 안전관리 기본법 제66조의7",
    recommendedMonths: null,
    subItems: JSON.stringify(["시설물 안전 순찰", "소방시설 확인", "전기시설 확인", "가스시설 확인"]),
    seasonalNotes: "매월 4일 실시 (안전점검의 날)",
  },
  {
    name: "어린이 놀이터 자체 점검",
    category: "playground",
    inspectionType: "self_regular",
    legalCycleMonths: 1,
    defaultAlertDays: 7,
    description: "어린이놀이시설법에 따른 자체 월간 점검",
    legalBasis: "어린이놀이시설 안전관리법 제15조",
    recommendedMonths: null,
    subItems: JSON.stringify(["놀이기구 안전 상태", "바닥 충격흡수 상태", "볼트·너트 조임 확인"]),
    seasonalNotes: null,
  },
  {
    name: "어린이 놀이터 법정 안전검사",
    category: "playground",
    inspectionType: "legal",
    legalCycleMonths: 24,
    defaultAlertDays: 60,
    description: "어린이놀이시설법에 따른 정기시설검사 (2년 1회)",
    legalBasis: "어린이놀이시설 안전관리법 제12조",
    recommendedMonths: null,
    subItems: JSON.stringify(["안전인증 확인", "설치검사 기준 적합성", "안전 표면 검사"]),
    seasonalNotes: null,
  },
  {
    name: "안전교육 (기술직 대상)",
    category: "safety_check",
    inspectionType: "self_regular",
    legalCycleMonths: 1,
    defaultAlertDays: 7,
    description: "기술직 대상 월 1회 안전교육 실시",
    legalBasis: "산업안전보건법 제29조",
    recommendedMonths: null,
    subItems: JSON.stringify(["안전작업 절차", "응급처치", "소방 안전", "전기 안전"]),
    seasonalNotes: null,
  },

  // ── 가스 ──
  {
    name: "가스 안전점검",
    category: "gas",
    inspectionType: "legal",
    legalCycleMonths: 12,
    defaultAlertDays: 30,
    description: "도시가스사업법에 따른 정기검사 (연 1회)",
    legalBasis: "도시가스사업법 제17조",
    recommendedMonths: null,
    subItems: JSON.stringify(["가스 배관 점검", "가스 감지기 작동 확인", "가스 누출 검사"]),
    seasonalNotes: null,
  },

  // ── 기계설비 ──
  {
    name: "기계설비 성능점검",
    category: "mechanical",
    inspectionType: "legal",
    legalCycleMonths: 12,
    defaultAlertDays: 30,
    description: "기계설비법에 따른 성능점검 (연 1회, 연면적 1만㎡ 이상)",
    legalBasis: "기계설비법 제18조",
    recommendedMonths: null,
    subItems: JSON.stringify(["냉난방 설비 점검", "환기 설비 점검", "급·배수 설비 점검", "자동제어 설비 점검"]),
    seasonalNotes: null,
  },
  {
    name: "기계설비 자체점검",
    category: "mechanical",
    inspectionType: "self_regular",
    legalCycleMonths: 3,
    defaultAlertDays: 14,
    description: "기계설비 분기별 자체점검 (3, 6, 9, 12월)",
    legalBasis: "기계설비법 제18조",
    recommendedMonths: JSON.stringify([3, 6, 9, 12]),
    subItems: JSON.stringify(["펌프 작동 확인", "배관 누수 점검", "보일러 상태 점검", "냉동기 점검"]),
    seasonalNotes: null,
  },

  // ── 정보통신 ──
  {
    name: "정보통신설비 성능점검",
    category: "telecom",
    inspectionType: "legal",
    legalCycleMonths: 12,
    defaultAlertDays: 30,
    description: "정보통신공사업법에 따른 성능점검 (연 1회, 연면적 5천㎡ 이상)",
    legalBasis: "정보통신공사업법 제36조의3",
    recommendedMonths: null,
    subItems: JSON.stringify(["통신배관 점검", "인터넷 설비 점검", "방송수신 설비 점검", "CCTV 설비 점검"]),
    seasonalNotes: "3만㎡↑ 2025.7.18 시행, 1~3만㎡ 2026.7.18, 5천~1만㎡ 2027.7.18 단계적 시행",
  },

  // ── 소독/방역 ──
  {
    name: "의무소독 (하절기)",
    category: "disinfection",
    inspectionType: "legal",
    legalCycleMonths: 2,
    defaultAlertDays: 14,
    description: "감염병예방법에 따른 하절기(4~9월) 의무소독 (2개월 1회)",
    legalBasis: "감염병의 예방 및 관리에 관한 법률 제51조",
    recommendedMonths: JSON.stringify([4, 6, 8]),
    subItems: JSON.stringify(["외부 환경소독", "지하주차장 소독", "쓰레기집하장 소독", "놀이터·녹지 소독"]),
    seasonalNotes: "4~9월 하절기: 모기·파리 등 해충 집중 방제 시기. 2개월 1회 실시",
  },
  {
    name: "의무소독 (동절기)",
    category: "disinfection",
    inspectionType: "legal",
    legalCycleMonths: 3,
    defaultAlertDays: 14,
    description: "감염병예방법에 따른 동절기(10~3월) 의무소독 (3개월 1회)",
    legalBasis: "감염병의 예방 및 관리에 관한 법률 제51조",
    recommendedMonths: JSON.stringify([10, 1]),
    subItems: JSON.stringify(["실내 공용부 소독", "지하공간 소독", "쓰레기집하장 소독"]),
    seasonalNotes: "10~3월 동절기: 실내 위주 소독. 12월 겨울모기 실내소독 중점. 3개월 1회 실시",
  },

  // ── 건축 정기안전점검 ──
  {
    name: "건축물 정기안전점검 (3년)",
    category: "building_safety",
    inspectionType: "legal",
    legalCycleMonths: 36,
    defaultAlertDays: 60,
    description: "건축법에 따른 정기안전점검 (3년 1회, 다중이용 건축물)",
    legalBasis: "건축법 제35조, 건축물관리법 제13조",
    recommendedMonths: null,
    subItems: JSON.stringify(["구조 안전성 점검", "피난·방화시설 점검", "건축마감 상태", "외벽 및 지붕 점검"]),
    seasonalNotes: null,
  },

  // ── 행정 ──
  {
    name: "차량 등록 정리",
    category: "administrative",
    inspectionType: "administrative",
    legalCycleMonths: 6,
    defaultAlertDays: 14,
    description: "입주민 차량 등록 현황 정리 (3월, 9월)",
    legalBasis: "관리규약",
    recommendedMonths: JSON.stringify([3, 9]),
    subItems: JSON.stringify(["차량 등록 현황 갱신", "미등록 차량 조치", "주차 위반 차량 정리"]),
    seasonalNotes: null,
  },
  {
    name: "입주자 카드 관리",
    category: "administrative",
    inspectionType: "administrative",
    legalCycleMonths: 12,
    defaultAlertDays: 30,
    description: "퇴거 후 관리비 정산 완료 시점부터 3년 보관",
    legalBasis: "개인정보보호법, 관리규약",
    recommendedMonths: null,
    subItems: JSON.stringify(["퇴거자 카드 정리", "보관 기한 확인", "개인정보 파기"]),
    seasonalNotes: null,
  },
];

function calculateNextDueDate(lastDate: string, cycleMonths: number, intervalDays?: number): string {
  const d = new Date(lastDate);
  if (intervalDays) {
    d.setDate(d.getDate() + intervalDays);
  } else {
    d.setMonth(d.getMonth() + cycleMonths);
  }
  return d.toISOString().split("T")[0];
}

router.get("/inspections", async (_req, res): Promise<void> => {
  const inspections = await db
    .select()
    .from(inspectionsTable)
    .orderBy(inspectionsTable.nextDueDate);

  res.json(ListInspectionsResponse.parse(inspections));
});

router.get("/inspections/presets", async (_req, res): Promise<void> => {
  let presets = await db.select().from(legalInspectionPresetsTable);

  const needsReseed = presets.length === 0 || !presets[0].inspectionType || presets[0].inspectionType === "legal" && presets.length < LEGAL_PRESETS.length;

  if (needsReseed) {
    if (presets.length > 0) {
      await db.delete(legalInspectionPresetsTable);
    }
    await db.insert(legalInspectionPresetsTable).values(LEGAL_PRESETS);
    presets = await db.select().from(legalInspectionPresetsTable);
  }

  res.json(ListInspectionPresetsResponse.parse(presets));
});

router.post("/inspections", async (req, res): Promise<void> => {
  const parsed = CreateInspectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const buildingId = await getUserBuildingId(req.user!.userId);

  const data = {
    ...parsed.data,
    buildingId,
    advanceAlertDays: parsed.data.advanceAlertDays ?? 30,
    inspectionType: parsed.data.inspectionType ?? "legal",
    nextDueDate: parsed.data.nextDueDate as string | undefined,
  };

  if (parsed.data.lastInspectionDate) {
    if (parsed.data.intervalDays) {
      data.nextDueDate = calculateNextDueDate(parsed.data.lastInspectionDate, 0, parsed.data.intervalDays);
    } else if (parsed.data.fixedDay) {
      const d = new Date(parsed.data.lastInspectionDate);
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + (d.getDate() >= parsed.data.fixedDay ? 1 : 0), parsed.data.fixedDay);
      data.nextDueDate = nextMonth.toISOString().split("T")[0];
    } else if (parsed.data.legalCycleMonths) {
      data.nextDueDate = calculateNextDueDate(parsed.data.lastInspectionDate, parsed.data.legalCycleMonths);
    }
  }

  const [inspection] = await db.insert(inspectionsTable).values(data as typeof inspectionsTable.$inferInsert).returning();
  res.status(201).json(UpdateInspectionResponse.parse(inspection));
});

router.post("/inspections/bulk-register", async (req, res): Promise<void> => {
  const parsed = BulkRegisterInspectionsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { presetIds, baseDate } = parsed.data;
  const baseDateStr = typeof baseDate === "string" ? baseDate : new Date(baseDate).toISOString().split("T")[0];
  const buildingId = await getUserBuildingId(req.user!.userId);

  const allPresets = await db.select().from(legalInspectionPresetsTable);
  const selectedPresets = presetIds.length > 0
    ? allPresets.filter((p) => presetIds.includes(p.id))
    : allPresets.filter((p) => p.category === parsed.data.category);

  const createdInspections: Array<typeof inspectionsTable.$inferSelect> = [];

  for (const preset of selectedPresets) {
    const inspType = preset.inspectionType || "legal";
    const intervalDays = inspType === "biweekly" ? 14 : null;
    const fixedDay = preset.seasonalNotes?.includes("매월 4일") ? 4 : null;
    const freq = inspType === "biweekly" ? 26 : (preset.legalCycleMonths > 0 ? Math.max(1, Math.round(12 / preset.legalCycleMonths)) : 1);

    let nextDueDate: string;
    if (intervalDays) {
      nextDueDate = calculateNextDueDate(baseDateStr, 0, intervalDays);
    } else if (fixedDay) {
      const today = new Date(baseDateStr);
      const nextMonth = new Date(today.getFullYear(), today.getMonth() + (today.getDate() >= fixedDay ? 1 : 0), fixedDay);
      nextDueDate = nextMonth.toISOString().split("T")[0];
    } else {
      nextDueDate = calculateNextDueDate(baseDateStr, preset.legalCycleMonths);
    }

    const [inspection] = await db.insert(inspectionsTable).values({
      buildingId,
      name: preset.name,
      category: preset.category,
      inspectionType: inspType,
      frequencyPerYear: freq,
      legalCycleMonths: preset.legalCycleMonths,
      intervalDays,
      fixedDay,
      recommendedMonths: preset.recommendedMonths,
      lastInspectionDate: baseDateStr,
      nextDueDate,
      legalBasis: preset.legalBasis,
      advanceAlertDays: preset.defaultAlertDays,
      notes: preset.description,
    }).returning();
    createdInspections.push(inspection);
  }

  res.status(201).json({
    registeredCount: createdInspections.length,
    inspections: ListInspectionsResponse.parse(createdInspections),
  });
});

router.patch("/inspections/:id", async (req, res): Promise<void> => {
  const params = UpdateInspectionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateInspectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Partial<typeof inspectionsTable.$inferInsert> & { nextDueDate?: string } = { ...parsed.data };

  if (parsed.data.lastInspectionDate) {
    if (parsed.data.intervalDays) {
      updateData.nextDueDate = calculateNextDueDate(parsed.data.lastInspectionDate, 0, parsed.data.intervalDays);
    } else if (parsed.data.fixedDay) {
      const d = new Date(parsed.data.lastInspectionDate);
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + (d.getDate() >= parsed.data.fixedDay ? 1 : 0), parsed.data.fixedDay);
      updateData.nextDueDate = nextMonth.toISOString().split("T")[0];
    } else if (parsed.data.legalCycleMonths) {
      updateData.nextDueDate = calculateNextDueDate(parsed.data.lastInspectionDate, parsed.data.legalCycleMonths);
    }
  }

  const [inspection] = await db
    .update(inspectionsTable)
    .set(updateData)
    .where(eq(inspectionsTable.id, params.data.id))
    .returning();

  if (!inspection) {
    res.status(404).json({ error: "Inspection not found" });
    return;
  }

  res.json(UpdateInspectionResponse.parse(inspection));
});

router.delete("/inspections/:id", async (req, res): Promise<void> => {
  const params = DeleteInspectionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [inspection] = await db
    .delete(inspectionsTable)
    .where(eq(inspectionsTable.id, params.data.id))
    .returning();

  if (!inspection) {
    res.status(404).json({ error: "Inspection not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/inspections/:id/complete", async (req, res): Promise<void> => {
  const params = CompleteInspectionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = CompleteInspectionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const existing = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, params.data.id));
  if (existing.length === 0) {
    res.status(404).json({ error: "Inspection not found" });
    return;
  }
  const inspection = existing[0];

  const inspDateStr = parsed.data.inspectionDate instanceof Date
    ? parsed.data.inspectionDate.toISOString().split("T")[0]
    : String(parsed.data.inspectionDate);

  await db.insert(inspectionLogsTable).values({
    inspectionId: params.data.id,
    inspectionDate: inspDateStr,
    result: parsed.data.result,
    memo: parsed.data.memo ?? null,
    inspector: parsed.data.inspector ?? null,
  });

  let newNextDueDate: string;
  if (inspection.intervalDays) {
    newNextDueDate = calculateNextDueDate(inspDateStr, 0, inspection.intervalDays);
  } else if (inspection.fixedDay) {
    const inspDate = new Date(inspDateStr);
    const nextMonth = new Date(inspDate.getFullYear(), inspDate.getMonth() + 1, inspection.fixedDay);
    newNextDueDate = nextMonth.toISOString().split("T")[0];
  } else {
    const cycleMonths = inspection.legalCycleMonths || Math.round(12 / inspection.frequencyPerYear);
    newNextDueDate = calculateNextDueDate(inspDateStr, cycleMonths);
  }

  const [updated] = await db
    .update(inspectionsTable)
    .set({
      status: "upcoming",
      lastInspectionDate: inspDateStr,
      nextDueDate: newNextDueDate,
    })
    .where(eq(inspectionsTable.id, params.data.id))
    .returning();

  if (parsed.data.result === "poor") {
    const categoryLabel = getCategoryLabel(inspection.category);
    await db.insert(draftsTable).values({
      title: `${inspection.name} 수선유지비 지출 기안`,
      draftType: "repair_maintenance",
      inspectionId: params.data.id,
      body: generateRepairDraftBody(inspection.name, categoryLabel, inspDateStr, parsed.data.memo),
      status: "draft",
    });
  }

  res.json(CompleteInspectionResponse.parse(updated));
});

router.get("/inspections/:id/logs", async (req, res): Promise<void> => {
  const params = ListInspectionLogsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const logs = await db
    .select()
    .from(inspectionLogsTable)
    .where(eq(inspectionLogsTable.inspectionId, params.data.id))
    .orderBy(desc(inspectionLogsTable.inspectionDate));

  res.json(ListInspectionLogsResponse.parse(logs));
});

router.post("/inspections/generate-alerts", async (_req, res): Promise<void> => {
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();
  const inspections = await db.select().from(inspectionsTable);

  const alertInspections: Array<{ inspectionId: number; name: string; nextDueDate: string; draftId: number | null }> = [];
  let draftsGenerated = 0;

  for (const inspection of inspections) {
    let shouldAlert = false;

    const dueDate = new Date(inspection.nextDueDate);
    const alertDate = new Date(dueDate);
    alertDate.setDate(alertDate.getDate() - inspection.advanceAlertDays);
    if (today >= alertDate && today <= dueDate) {
      shouldAlert = true;
    }

    if (inspection.fixedDay && currentDay === inspection.fixedDay) {
      shouldAlert = true;
    }

    const inspType = inspection.inspectionType || "legal";
    if (inspection.recommendedMonths && (inspType === "seasonal" || inspType === "administrative" || inspType === "self_regular")) {
      try {
        const months: number[] = JSON.parse(inspection.recommendedMonths);
        if (Array.isArray(months) && months.includes(currentMonth)) {
          shouldAlert = true;
        }
      } catch (e) {
        console.warn(`Invalid recommendedMonths JSON for inspection ${inspection.id}: ${inspection.recommendedMonths}`);
      }
    }

    if (!shouldAlert) continue;

    const existingDrafts = await db
      .select()
      .from(draftsTable)
      .where(
        and(
          eq(draftsTable.inspectionId, inspection.id),
          eq(draftsTable.draftType, "expense_approval")
        )
      );

    let draftId: number | null = null;

    if (existingDrafts.length === 0 && inspType === "legal") {
      const categoryLabel = getCategoryLabel(inspection.category);
      const [draft] = await db.insert(draftsTable).values({
        title: `${inspection.name} 지출품의서`,
        draftType: "expense_approval",
        inspectionId: inspection.id,
        body: generateExpenseApprovalDraftBody(inspection.name, categoryLabel, inspection.nextDueDate),
        status: "draft",
      }).returning();
      draftId = draft.id;
      draftsGenerated++;
    } else if (existingDrafts.length > 0) {
      draftId = existingDrafts[0].id;
    }

    const yearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const existingNotifs = await db
      .select()
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.relatedEntityType, "inspection"),
          eq(notificationsTable.relatedEntityId, inspection.id),
          eq(notificationsTable.notificationType, "inspection_alert"),
          sql`to_char(${notificationsTable.createdAt}, 'YYYY-MM') = ${yearMonth}`
        )
      );

    if (existingNotifs.length === 0) {
      const notifTitle = inspection.fixedDay && currentDay === inspection.fixedDay
        ? `[안전점검의 날] ${inspection.name}`
        : inspType === "seasonal"
          ? `[계절별 점검] ${inspection.name}`
          : `[점검 알림] ${inspection.name}`;

      await db.insert(notificationsTable).values({
        recipientType: "admin",
        notificationType: "inspection_alert",
        title: notifTitle,
        message: `${inspection.name} 점검이 예정되어 있습니다. 예정일: ${inspection.nextDueDate}`,
        relatedEntityType: "inspection",
        relatedEntityId: inspection.id,
      });
    }

    alertInspections.push({
      inspectionId: inspection.id,
      name: inspection.name,
      nextDueDate: inspection.nextDueDate,
      draftId,
    });
  }

  const result = {
    alertsGenerated: alertInspections.length,
    draftsGenerated,
    inspections: alertInspections,
  };

  res.json(GenerateInspectionAlertsResponse.parse(result));
});

router.get("/inspections/upcoming", async (_req, res): Promise<void> => {
  const today = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(today.getDate() + 30);

  const todayStr = today.toISOString().split("T")[0];
  const futureStr = thirtyDaysFromNow.toISOString().split("T")[0];

  const inspections = await db
    .select()
    .from(inspectionsTable)
    .where(
      and(
        lte(inspectionsTable.nextDueDate, futureStr),
        gte(inspectionsTable.nextDueDate, todayStr)
      )
    )
    .orderBy(inspectionsTable.nextDueDate);

  res.json(GetUpcomingInspectionsResponse.parse(inspections));
});

function getCategoryLabel(category: string): string {
  const labels: Record<string, string> = {
    elevator: "승강기",
    water_tank: "저수조",
    fire_safety: "소방",
    electrical: "전기",
    gas: "가스",
    septic: "정화조",
    playground: "놀이터",
    safety_check: "안전점검",
    hygiene: "위생/환경",
    building_safety: "건축물안전",
    administrative: "행정",
    mechanical: "기계설비",
    telecom: "정보통신",
    disinfection: "소독/방역",
    other: "기타",
  };
  return labels[category] || category;
}

function generateRepairDraftBody(name: string, categoryLabel: string, inspectionDate: string, memo: string | null | undefined): string {
  return `수선유지비 지출 기안서

1. 건 명: ${name} 불량 판정에 따른 수선유지비 지출

2. 점검일: ${inspectionDate}

3. 분류: ${categoryLabel}

4. 점검 결과: 불량
${memo ? `   - 상세 내용: ${memo}` : ""}

5. 조치 내용:
   - 해당 시설의 점검 결과 불량 판정을 받아 수선유지비 지출이 필요합니다.
   - 관련 업체 견적을 받아 비교 검토 후 시행할 예정입니다.

6. 예상 비용: (견적 후 기재)

7. 비고:
   - 법정 점검 기준에 따른 시정 조치가 필요한 사항입니다.`;
}

function generateExpenseApprovalDraftBody(name: string, categoryLabel: string, nextDueDate: string): string {
  return `지출품의서

1. 건 명: ${name} 법정 점검 시행

2. 예정일: ${nextDueDate}

3. 분류: ${categoryLabel}

4. 목적:
   - 법정 의무사항인 ${name}의 기한이 도래하여 점검 시행을 위한 지출품의를 올립니다.

5. 예상 비용: (견적 후 기재)

6. 업체 선정:
   - 기존 계약 업체 또는 신규 업체 견적 비교 후 선정 예정

7. 비고:
   - 법정 기한 내 반드시 시행하여야 합니다.`;
}

function generateBidRequestDraftBody(name: string, categoryLabel: string, nextDueDate: string, vendors: Array<{ name: string; rating: number | null }>): string {
  const vendorList = vendors.map((v, i) => `   ${i + 1}. ${v.name} (평점: ${v.rating ?? "미평가"})`).join("\n");
  return `입찰 요청서

1. 건 명: ${name} 법정 점검 업체 선정

2. 점검 예정일: ${nextDueDate}

3. 분류: ${categoryLabel}

4. 목적:
   - 법정 의무사항인 ${name}의 기한이 도래하여 적격 업체를 선정하고자 합니다.

5. AI 추천 업체:
${vendorList}

6. 입찰 조건:
   - 법정 자격 요건을 갖춘 업체
   - 해당 분야 경험 및 실적 보유
   - 합리적인 견적 제출

7. 견적 제출 기한: ${nextDueDate} 기준 2주 전까지

8. 비고:
   - AI 자동 매칭 시스템에 의해 추천된 업체입니다.
   - 최종 선정은 관리소장 승인 후 확정됩니다.`;
}

router.post("/inspections/ai-matching", async (_req, res): Promise<void> => {
  try {
  const today = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(today.getDate() + 30);

  const todayStr = today.toISOString().split("T")[0];
  const futureStr = thirtyDaysFromNow.toISOString().split("T")[0];

  const upcomingInspections = await db
    .select()
    .from(inspectionsTable)
    .where(
      and(
        lte(inspectionsTable.nextDueDate, futureStr),
        gte(inspectionsTable.nextDueDate, todayStr)
      )
    )
    .orderBy(inspectionsTable.nextDueDate);

  const results: Array<{
    inspectionId: number;
    inspectionName: string;
    category: string;
    nextDueDate: string;
    daysUntilDue: number;
    draftId: number | null;
    notificationId: number | null;
    recommendedVendors: Array<{
      vendorId: number;
      vendorName: string;
      category: string;
      rating: number | null;
      phone: string | null;
      address: string | null;
    }>;
  }> = [];

  let draftsGenerated = 0;
  let notificationsCreated = 0;

  for (const inspection of upcomingInspections) {
    const dueDate = new Date(inspection.nextDueDate);
    const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const categoryLabel = getCategoryLabel(inspection.category);

    const matchingVendors = await db
      .select()
      .from(vendorsTable)
      .where(eq(vendorsTable.category, inspection.category))
      .orderBy(desc(vendorsTable.rating));

    const top3Vendors = matchingVendors.slice(0, 3).map((v) => ({
      vendorId: v.id,
      vendorName: v.name,
      category: v.category,
      rating: v.rating,
      phone: v.phone,
      address: v.address,
    }));

    const existingDrafts = await db
      .select()
      .from(draftsTable)
      .where(
        and(
          eq(draftsTable.inspectionId, inspection.id),
          eq(draftsTable.draftType, "bid_request")
        )
      );

    let draftId: number | null = null;
    if (existingDrafts.length === 0 && top3Vendors.length > 0) {
      const [draft] = await db.insert(draftsTable).values({
        title: `${inspection.name} 입찰 요청서 (AI 자동 생성)`,
        draftType: "bid_request",
        inspectionId: inspection.id,
        body: generateBidRequestDraftBody(
          inspection.name,
          categoryLabel,
          inspection.nextDueDate,
          top3Vendors.map((v) => ({ name: v.vendorName, rating: v.rating }))
        ),
        status: "draft",
      }).returning();
      draftId = draft.id;
      draftsGenerated++;
    } else if (existingDrafts.length > 0) {
      draftId = existingDrafts[0].id;
    }

    let notificationId: number | null = null;
    const [notification] = await db.insert(notificationsTable).values({
      recipientType: "admin",
      notificationType: "ai_matching",
      title: `[AI 매칭] ${inspection.name} 점검 예정 알림`,
      message: `${inspection.name} 점검이 ${daysUntilDue}일 후(${inspection.nextDueDate}) 예정되어 있습니다. AI가 ${top3Vendors.length}개 업체를 추천했습니다.`,
      relatedEntityType: "inspection",
      relatedEntityId: inspection.id,
    }).returning();
    notificationId = notification.id;
    notificationsCreated++;

    if (top3Vendors.length > 0) {
      await db.insert(notificationsTable).values({
        recipientType: "facility_manager",
        notificationType: "ai_matching",
        title: `[시설관리] ${inspection.name} 점검 예정`,
        message: `${inspection.name} 점검이 ${daysUntilDue}일 후 예정되어 있습니다. 점검 준비를 진행해 주세요.`,
        relatedEntityType: "inspection",
        relatedEntityId: inspection.id,
      });
      notificationsCreated++;
    }

    results.push({
      inspectionId: inspection.id,
      inspectionName: inspection.name,
      category: inspection.category,
      nextDueDate: inspection.nextDueDate,
      daysUntilDue,
      draftId,
      notificationId,
      recommendedVendors: top3Vendors,
    });
  }

  const response = {
    matchedCount: results.length,
    draftsGenerated,
    notificationsCreated,
    results,
  };

  res.json(TriggerAiMatchingResponse.parse(response));
  } catch (error) {
    res.status(500).json({ error: "AI 매칭 처리 중 오류가 발생했습니다" });
  }
});

router.post("/inspections/:id/approve-matching", async (req, res): Promise<void> => {
  const params = ApproveInspectionMatchingParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = ApproveInspectionMatchingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const existing = await db.select().from(inspectionsTable).where(eq(inspectionsTable.id, params.data.id));
    if (existing.length === 0) {
      res.status(404).json({ error: "Inspection not found" });
      return;
    }
    const inspection = existing[0];
    const categoryLabel = getCategoryLabel(inspection.category);

    const [rfq] = await db.insert(rfqsTable).values({
      title: `${inspection.name} 법정 점검 견적 요청`,
      category: inspection.category,
      description: `AI 자동 매칭에 의한 견적 요청 - ${categoryLabel} 분야\n점검 예정일: ${inspection.nextDueDate}`,
      buildingName: parsed.data.buildingName,
      desiredDate: inspection.nextDueDate,
      deadline: inspection.nextDueDate,
      status: "open",
      vendorIds: parsed.data.vendorIds.join(","),
    }).returning();

    for (const vendorId of parsed.data.vendorIds) {
      const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
      if (vendor) {
        await db.insert(notificationsTable).values({
          recipientType: "vendor",
          notificationType: "rfq_request",
          title: `[견적요청] ${inspection.name} 점검 업체 선정`,
          message: `${parsed.data.buildingName}의 ${inspection.name} 점검에 대한 견적을 요청드립니다. 점검 예정일: ${inspection.nextDueDate}`,
          relatedEntityType: "rfq",
          relatedEntityId: rfq.id,
        });
      }
    }

    await db.update(inspectionsTable)
      .set({ status: "scheduled" })
      .where(eq(inspectionsTable.id, params.data.id));

    const response = {
      inspectionId: params.data.id,
      rfqId: rfq.id,
      vendorCount: parsed.data.vendorIds.length,
      message: `${parsed.data.vendorIds.length}개 업체에 견적 요청이 발송되었습니다.`,
    };

    res.json(ApproveInspectionMatchingResponse.parse(response));
  } catch (error) {
    res.status(500).json({ error: "매칭 승인 처리 중 오류가 발생했습니다" });
  }
});

export default router;
