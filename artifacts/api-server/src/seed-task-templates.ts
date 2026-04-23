import { eq, inArray } from "drizzle-orm";
import {
  db,
  taskTemplatesTable,
  taskTemplateAuditLogsTable,
} from "@workspace/db";

// [Task #303] 운영 표준 업무 템플릿 48건 재시드.
//   - 법정업무 18 (facility, FACILITY)
//   - 제안 주/월간 5 (etc/facility, MANAGER 위주)
//   - 계절 19 (suggested annual yr=1 + fixedMonth, FACILITY)
//   - 세무·회계 6 (ACCOUNTING / fee)
//   하자담보 4건 (Task #304) 은 별도 anchored 로직과 함께 추후 추가.
//
//   기존 검증용 시드 8건은 본 시드 진입 시점에 한 번 정리(감사 로그 기록 + 삭제).
//   재실행 안전: 같은 title 의 행이 있으면 INSERT 를 건너뛰고, 핵심 필드는 멱등하게
//   재적용한다.
export async function seedTaskTemplates(): Promise<void> {
  type SeedRow = typeof taskTemplatesTable.$inferInsert;

  const FACILITY: string[] = ["manager", "facility_staff"];
  // [Task #303] 세무·회계 항목은 회계 담당자에게만 노출 (spec: target=accountant).
  const ACCOUNTING: string[] = ["accountant"];
  const MANAGER_ONLY: string[] = ["manager"];

  // ── 법정업무 18 ─────────────────────────────────────────────────────────
  const legal: SeedRow[] = [
    {
      title: "전기안전관리자 선임 적격 확인",
      description: "75kW 이상 등 선임 기준 충족 건물의 전기안전관리자 선임 적격 여부를 매년 점검합니다.",
      category: "mandatory", classification: "legal", taskType: "facility",
      frequencyType: "annual", yearInterval: 1,
      targetRoles: FACILITY, priority: 90, advanceAlertDays: 60,
    },
    {
      title: "전기설비 월차 점검",
      description: "월간 전기설비 점검을 수행하고 결과를 기록합니다.",
      category: "mandatory", classification: "legal", taskType: "facility",
      frequencyType: "monthly", dayOfMonth: 15, fixedDay: 15,
      targetRoles: FACILITY, priority: 80, advanceAlertDays: 7,
    },
    {
      title: "전기설비 분기 점검",
      description: "분기별 전기설비 정기 점검.",
      category: "mandatory", classification: "legal", taskType: "facility",
      frequencyType: "quarterly",
      targetRoles: FACILITY, priority: 80, advanceAlertDays: 14,
    },
    {
      title: "전기설비 반기 점검",
      description: "반기별 전기설비 정기 점검.",
      category: "mandatory", classification: "legal", taskType: "facility",
      frequencyType: "semiannual",
      targetRoles: FACILITY, priority: 80, advanceAlertDays: 21,
    },
    {
      title: "전기설비 연차 점검",
      description: "연차 전기설비 정기 점검 및 결과 보고.",
      category: "mandatory", classification: "legal", taskType: "facility",
      frequencyType: "annual", yearInterval: 1,
      targetRoles: FACILITY, priority: 80, advanceAlertDays: 30,
    },
    {
      title: "전기설비 정기검사(KESCO)",
      description: "한국전기안전공사 정기검사. 통상 3년 주기.",
      category: "mandatory", classification: "legal", taskType: "facility",
      frequencyType: "annual", yearInterval: 3,
      targetRoles: FACILITY, priority: 95, advanceAlertDays: 60,
    },
    {
      title: "소방안전관리자 선임 적격 확인",
      description: "특정소방대상물 선임 기준에 따른 소방안전관리자 자격 적격 여부를 매년 점검합니다.",
      category: "mandatory", classification: "legal", taskType: "facility",
      frequencyType: "annual", yearInterval: 1,
      targetRoles: FACILITY, priority: 90, advanceAlertDays: 60,
    },
    {
      title: "소방시설 작동점검",
      description: "연 1회 소방시설 작동점검 실시 및 결과 보고.",
      category: "mandatory", classification: "legal", taskType: "facility",
      frequencyType: "annual", yearInterval: 1,
      targetRoles: FACILITY, priority: 90, advanceAlertDays: 30,
    },
    {
      title: "소방시설 종합점검",
      description: "연 1회 소방시설 종합점검(법적 자격자 수행) 및 보고.",
      category: "mandatory", classification: "legal", taskType: "facility",
      frequencyType: "annual", yearInterval: 1,
      targetRoles: FACILITY, priority: 95, advanceAlertDays: 30,
    },
    {
      title: "기계설비유지관리자 선임 적격 확인",
      description: "연면적 1만㎡ 이상 등 선임 기준 충족 건물의 기계설비유지관리자 선임 적격 점검.",
      category: "mandatory", classification: "legal", taskType: "facility",
      frequencyType: "annual", yearInterval: 1,
      targetRoles: FACILITY, priority: 85, advanceAlertDays: 60,
    },
    {
      title: "기계설비 성능점검",
      description: "연 1회 기계설비 성능점검 실시 및 보고.",
      category: "mandatory", classification: "legal", taskType: "facility",
      frequencyType: "annual", yearInterval: 1,
      targetRoles: FACILITY, priority: 85, advanceAlertDays: 30,
    },
    {
      title: "기계설비 유지관리점검",
      description: "반기 1회 기계설비 유지관리점검.",
      category: "mandatory", classification: "legal", taskType: "facility",
      frequencyType: "semiannual",
      targetRoles: FACILITY, priority: 80, advanceAlertDays: 21,
    },
    {
      title: "승강기 자체점검",
      description: "월 1회 승강기 자체점검 및 결과 기록.",
      category: "mandatory", classification: "legal", taskType: "facility",
      frequencyType: "monthly", dayOfMonth: 10, fixedDay: 10,
      targetRoles: FACILITY, priority: 90, advanceAlertDays: 7,
    },
    {
      title: "승강기 정기검사",
      description: "연 1회 승강기 정기검사(공단) 수검.",
      category: "mandatory", classification: "legal", taskType: "facility",
      frequencyType: "annual", yearInterval: 1,
      targetRoles: FACILITY, priority: 95, advanceAlertDays: 30,
    },
    {
      title: "저수조 청소",
      description: "반기 1회 저수조 내부 청소.",
      category: "mandatory", classification: "legal", taskType: "facility",
      frequencyType: "semiannual",
      targetRoles: FACILITY, priority: 80, advanceAlertDays: 21,
    },
    {
      title: "저수조 수질검사",
      description: "연 1회 저수조 수질검사 의뢰 및 결과 비치.",
      category: "mandatory", classification: "legal", taskType: "facility",
      frequencyType: "annual", yearInterval: 1,
      targetRoles: FACILITY, priority: 80, advanceAlertDays: 30,
    },
    {
      title: "정화조 내부 청소",
      description: "연 1회 정화조 내부 청소.",
      category: "mandatory", classification: "legal", taskType: "facility",
      frequencyType: "annual", yearInterval: 1,
      targetRoles: FACILITY, priority: 75, advanceAlertDays: 30,
    },
    {
      title: "건축물 정기 안전점검",
      description: "건축물관리법에 따른 정기 안전점검(통상 3년 주기).",
      category: "mandatory", classification: "legal", taskType: "facility",
      frequencyType: "annual", yearInterval: 3,
      targetRoles: FACILITY, priority: 90, advanceAlertDays: 60,
    },
  ];

  // ── 제안업무 주/월간 5 ───────────────────────────────────────────────────
  const suggestedWeeklyMonthly: SeedRow[] = [
    {
      title: "주간업무일지 작성·전송",
      description: "매주 월요일 한 주 업무 계획·전주 업무 결과를 정리해 본사로 전송합니다.",
      category: "suggested", classification: "internal", taskType: "etc",
      frequencyType: "weekly", weekdays: [1],
      targetRoles: MANAGER_ONLY, priority: 70, advanceAlertDays: 1,
    },
    {
      title: "보안등 타임스위치 점검",
      description: "주 2회(월/목) 외등·보안등 점등 시간 및 동작을 점검합니다.",
      category: "suggested", classification: "internal", taskType: "facility",
      frequencyType: "weekly", weekdays: [1, 4],
      targetRoles: MANAGER_ONLY, priority: 60, advanceAlertDays: 1,
    },
    {
      title: "비상발전기 무부하 가동",
      description: "격주 1회 비상발전기 무부하 시운전을 실시합니다.",
      category: "suggested", classification: "internal", taskType: "facility",
      // [Task #302/303] biweekly: startDate 가 캐노니컬 anchor.
      //   첫 적용일은 2026-04-27(월) 로 지정.
      frequencyType: "biweekly", weekdays: [1], startDate: "2026-04-27",
      targetRoles: MANAGER_ONLY, priority: 75, advanceAlertDays: 3,
    },
    {
      title: "월간보고서 작성·보고",
      description: "매월 첫째 월요일에 전월 운영 종합 보고서를 작성·제출합니다.",
      category: "suggested", classification: "internal", taskType: "etc",
      // [Task #302/303] monthly_nth_weekday: 첫째(1) 월요일(1).
      frequencyType: "monthly_nth_weekday", nthWeek: 1, nthWeekday: 1,
      targetRoles: MANAGER_ONLY, priority: 80, advanceAlertDays: 3,
    },
    {
      title: "입주자/차량 카드 최신화",
      description: "반기 1회 입주자·차량 등록 정보 최신화.",
      category: "suggested", classification: "internal", taskType: "etc",
      frequencyType: "semiannual",
      targetRoles: MANAGER_ONLY, priority: 50, advanceAlertDays: 14,
    },
  ];

  // ── 계절 19 (suggested annual yr=1 · fixedMonth) ────────────────────────
  //   분포: 1·2·1월, 3·3·4·3월, 5·5·6월, 7·7·7월, 9·10·10월, 11·11·12월
  const seasonal: SeedRow[] = [
    { fixedMonth: 1, fixedDay: 5,  title: "동파 방지 점검",                description: "한파 대비 옥내·옥외 노출배관 동파 방지 점검." },
    { fixedMonth: 2, fixedDay: 1,  title: "난방기 정기 점검",              description: "겨울철 난방설비·보일러 가동 상태 정기 점검." },
    { fixedMonth: 1, fixedDay: 15, title: "제설 자재 점검 및 비치",         description: "제설제·삽 등 제설 자재 재고 확인 및 비치." },
    { fixedMonth: 3, fixedDay: 5,  title: "황사·미세먼지 대비 외기필터 점검", description: "공조기 외기측 필터 상태 확인·교체." },
    { fixedMonth: 3, fixedDay: 15, title: "봄철 해충 방제",                description: "봄철 위생해충 방제 작업 의뢰·실시." },
    { fixedMonth: 4, fixedDay: 5,  title: "봄철 외벽·창호 균열 점검",       description: "겨울 동결 융해로 인한 외벽·창호 균열 여부 점검." },
    { fixedMonth: 3, fixedDay: 25, title: "옥상 방수 상태 점검",           description: "우기 전 옥상 방수층 균열·박리 점검." },
    { fixedMonth: 5, fixedDay: 5,  title: "냉방기 가동 전 시운전",         description: "여름철 대비 냉방기·냉동기 가동 전 시운전 및 점검." },
    { fixedMonth: 5, fixedDay: 15, title: "공조기 필터 청소",               description: "공조기 필터 청소·교체." },
    { fixedMonth: 6, fixedDay: 5,  title: "우기 대비 배수로·집수정 청소",   description: "장마 전 옥상·지하 배수로 및 집수정 청소." },
    { fixedMonth: 7, fixedDay: 1,  title: "호우·태풍 대비 시설 점검",       description: "옥상 시설물·간판·창호 결속 상태 점검." },
    { fixedMonth: 7, fixedDay: 10, title: "에어컨 응축수 배관 점검",       description: "에어컨 응축수 배관 막힘·누수 점검." },
    { fixedMonth: 7, fixedDay: 20, title: "피뢰침·접지저항 점검",          description: "낙뢰 대비 피뢰침 및 접지 저항 측정." },
    { fixedMonth: 9, fixedDay: 5,  title: "가을철 해충 방제",              description: "가을철 위생해충 방제 작업 의뢰·실시." },
    { fixedMonth: 10, fixedDay: 5, title: "옥상·우수관 낙엽 청소",         description: "낙엽으로 인한 우수관 막힘 예방 청소." },
    { fixedMonth: 10, fixedDay: 20, title: "외벽·창호 누수 점검",          description: "겨울 전 외벽·창호 누수 여부 점검." },
    { fixedMonth: 11, fixedDay: 5, title: "동파 방지 보온재 시공",          description: "노출배관·계량기실 보온재 시공." },
    { fixedMonth: 11, fixedDay: 20, title: "보일러 가동 전 정기 점검",     description: "겨울철 보일러 본격 가동 전 정기 점검." },
    { fixedMonth: 12, fixedDay: 5, title: "연말 분리수거·재활용 안내",     description: "연말 입주자 대상 분리수거·재활용 안내문 게시." },
  ].map((s) => ({
    title: s.title,
    description: s.description,
    category: "suggested",
    classification: "internal",
    taskType: "facility",
    frequencyType: "annual",
    yearInterval: 1,
    fixedMonth: s.fixedMonth,
    fixedDay: s.fixedDay,
    targetRoles: FACILITY,
    priority: 60,
    advanceAlertDays: 14,
  }));

  // ── 세무·회계 6 ──────────────────────────────────────────────────────────
  const taxAccounting: SeedRow[] = [
    {
      title: "원천징수 신고·납부",
      description: "전월분 원천징수 신고 및 납부(매월 10일).",
      category: "mandatory", classification: "legal", taskType: "accounting",
      frequencyType: "monthly", dayOfMonth: 10, fixedDay: 10,
      targetRoles: ACCOUNTING, priority: 90, advanceAlertDays: 3,
    },
    {
      title: "전자세금계산서 발급 마감",
      description: "전월분 전자세금계산서 발급 마감(매월 10일).",
      category: "mandatory", classification: "legal", taskType: "accounting",
      frequencyType: "monthly", dayOfMonth: 10, fixedDay: 10,
      targetRoles: ACCOUNTING, priority: 90, advanceAlertDays: 3,
    },
    {
      title: "4대보험료 납부",
      description: "건강·국민·고용·산재 4대보험료 납부(매월 10일).",
      category: "mandatory", classification: "legal", taskType: "accounting",
      frequencyType: "monthly", dayOfMonth: 10, fixedDay: 10,
      targetRoles: ACCOUNTING, priority: 90, advanceAlertDays: 3,
    },
    {
      title: "부가가치세 신고·납부",
      description: "분기별 부가세 신고 및 납부 마감 안내.",
      category: "mandatory", classification: "legal", taskType: "accounting",
      frequencyType: "monthly", dayOfMonth: 25, fixedDay: 25,
      targetRoles: ACCOUNTING, priority: 95, advanceAlertDays: 5,
    },
    {
      title: "전월분 재무제표 작성·보고",
      description: "전월분 재무제표 작성 및 본사 보고.",
      category: "mandatory", classification: "legal", taskType: "accounting",
      frequencyType: "monthly", dayOfMonth: 28, fixedDay: 28,
      targetRoles: ACCOUNTING, priority: 80, advanceAlertDays: 5,
    },
    {
      title: "관리비 부과 내역서 승인",
      description: "익월 관리비 부과 내역서 검토·승인.",
      category: "mandatory", classification: "legal", taskType: "fee",
      frequencyType: "monthly", dayOfMonth: 28, fixedDay: 28,
      targetRoles: ACCOUNTING, priority: 85, advanceAlertDays: 5,
    },
  ];

  // 모든 시드를 합치고 공통 필드 채움.
  const seed: SeedRow[] = [...legal, ...suggestedWeeklyMonthly, ...seasonal, ...taxAccounting].map(
    (s) => ({
      scopeType: "all",
      scopeValues: [],
      buildingUsageScopes: [],
      isActive: true,
      createdByName: "system",
      ...s,
    }),
  );

  const seedTitles = new Set(seed.map((s) => s.title));

  // ── 1) 명시적 allowlist 의 레거시 검증용 행만 1회 정리 ────────────────────
  //   [Task #303] 사용자가 UI 에서 직접 만든 임의 템플릿이 실수로 함께 삭제되는
  //   사고를 막기 위해, 정리 대상은 "기존 시드 8건의 제목" 으로 한정한다.
  //   동일 제목이 신규 시드에 다시 들어 있으면 정리 후 INSERT 단계에서 새 정의로
  //   다시 생성된다.
  const LEGACY_SEED_TITLES = [
    "분기 운영 보고서 제출",
    "소방 자체 점검 결과 본사 보고",
    "월간 안전점검 라운딩",
    "에너지 사용량 점검 및 절감 캠페인",
    "법정 점검 일정 본사 보고",
    "분기 부가가치세 신고 마감 안내",
    "하자담보 만료 예정 건 본사 점검",
    "개인정보 보유기간 경과 데이터 파기 점검",
  ];
  const existing = await db.select().from(taskTemplatesTable);
  const obsolete = existing.filter((r) => LEGACY_SEED_TITLES.includes(r.title));
  if (obsolete.length > 0) {
    // [Task #303] audit log + delete 를 단일 트랜잭션으로 묶어 부분 적용 방지.
    await db.transaction(async (tx) => {
      await tx.insert(taskTemplateAuditLogsTable).values(
        obsolete.map((o) => ({
          templateId: o.id,
          templateTitle: o.title,
          action: "delete" as const,
          changes: { reason: "[Task #303] 운영 표준 시드 재구성으로 검증용 행 정리" },
          changedByName: "system",
        })),
      );
      await tx
        .delete(taskTemplatesTable)
        .where(inArray(taskTemplatesTable.id, obsolete.map((o) => o.id)));
    });
  }

  // ── 2) 신규 행 INSERT (title 기준 멱등) ──────────────────────────────────
  const remaining = await db.select().from(taskTemplatesTable);
  const remainingByTitle = new Map(remaining.map((t) => [t.title, t]));
  const toInsert = seed.filter((s) => !remainingByTitle.has(s.title));
  if (toInsert.length > 0) {
    await db.insert(taskTemplatesTable).values(toInsert);
  }

  // ── 3) 기존 행은 핵심 필드를 시드 값으로 동기화 (멱등 재적용) ─────────────
  //   사용자가 UI 에서 수동 수정한 경우는 보수적으로 보존:
  //     - title 일치 시 frequencyType/보조값/우선순위/사전알림 등 시드 표 정의대로 덮어쓰기
  //     - description, isActive 등은 보존
  for (const s of seed) {
    const row = remainingByTitle.get(s.title);
    if (!row) continue;
    await db
      .update(taskTemplatesTable)
      .set({
        category: s.category,
        classification: s.classification,
        taskType: s.taskType,
        frequencyType: s.frequencyType,
        intervalValue: s.intervalValue ?? null,
        fixedMonth: s.fixedMonth ?? null,
        fixedDay: s.fixedDay ?? null,
        startDate: s.startDate ?? null,
        weekdays: s.weekdays ?? null,
        dayOfMonth: s.dayOfMonth ?? null,
        yearInterval: s.yearInterval ?? null,
        nthWeek: s.nthWeek ?? null,
        nthWeekday: s.nthWeekday ?? null,
        targetRoles: s.targetRoles,
        priority: s.priority,
        advanceAlertDays: s.advanceAlertDays,
      })
      .where(eq(taskTemplatesTable.id, row.id));
  }

  // ── 4) 시드 보장 카운트 검증(회귀 가드) ─────────────────────────────────
  const all = await db.select().from(taskTemplatesTable);
  const seedRows = all.filter((r) => seedTitles.has(r.title));
  const cntMandatory = seedRows.filter((r) => r.category === "mandatory").length;
  const cntSuggested = seedRows.filter((r) => r.category === "suggested").length;
  const cntBiweekly = seedRows.filter((r) => r.frequencyType === "biweekly").length;
  const cntNthWd = seedRows.filter((r) => r.frequencyType === "monthly_nth_weekday").length;
  console.log(
    `[seed-task-templates] 표준 시드 ${seedRows.length}/48건 (mandatory ${cntMandatory}/24, suggested ${cntSuggested}/24, biweekly ${cntBiweekly}/1, monthly_nth_weekday ${cntNthWd}/1) · 전체 보유 ${all.length}건`,
  );
  if (
    seedRows.length !== 48 ||
    cntMandatory !== 24 ||
    cntSuggested !== 24 ||
    cntBiweekly !== 1 ||
    cntNthWd !== 1
  ) {
    console.warn("[seed-task-templates] 표준 시드 카운트가 기대와 다릅니다 (회귀 가능)");
  }
}
