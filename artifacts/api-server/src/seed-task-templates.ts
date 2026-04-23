import { eq, isNull } from "drizzle-orm";
import { db, taskTemplatesTable } from "@workspace/db";

// [Task #221] 본사가 일괄 관리하는 업무 템플릿의 초기 시드. 기존 점검/세무/보증/
// 데이터파기 알림과 별도로, 분기 보고·소방 자체점검 보고 등 본사가 한곳에서
// 관리해야 하는 대표적인 항목들을 등록한다. 기존 항목은 그대로 유지된다.
// 제목(title)을 키로 멱등 처리해 새 시드가 추가되어도 누락 없이 반영된다.
//
// [Task #283] 사용자 유형(targetRoles)별 노출 분리:
//   - 시설(점검/안전/소방/에너지): manager + facility_staff
//   - 회계(부가세/관리비/세무): manager + accountant
//   - 일반 관리(보고서/개인정보 파기/하자): manager 만
//
// [Task #297] 신규 입력 필드(taskType / dayOfMonth / yearInterval) 로 마이그레이션.
//   기존 fixedDay 등은 보존하되, 새 필드와 동일 의미가 되도록 함께 채워 둔다.
export async function seedTaskTemplates(): Promise<void> {
  const FACILITY: string[] = ["manager", "facility_staff"];
  const ACCOUNTING: string[] = ["manager", "accountant"];
  const MANAGER_ONLY: string[] = ["manager"];

  const seed: Array<typeof taskTemplatesTable.$inferInsert> = [
    {
      title: "분기 운영 보고서 제출",
      description: "본사 분기 보고용 시설/회계/민원 종합 보고서를 작성·제출합니다.",
      category: "mandatory",
      classification: "internal",
      taskType: "etc",
      frequencyType: "quarterly",
      fixedDay: 5,
      dayOfMonth: 5,
      scopeType: "all",
      scopeValues: [],
      buildingUsageScopes: [],
      targetRoles: MANAGER_ONLY,
      priority: 80,
      advanceAlertDays: 30,
      isActive: true,
      createdByName: "system",
    },
    {
      title: "소방 자체 점검 결과 본사 보고",
      description: "소방 자체점검 후 본사에 결과를 보고합니다.",
      category: "mandatory",
      classification: "legal",
      taskType: "facility",
      frequencyType: "annual",
      fixedMonth: 11,
      fixedDay: 30,
      yearInterval: 1,
      scopeType: "all",
      scopeValues: [],
      buildingUsageScopes: [],
      targetRoles: FACILITY,
      priority: 90,
      advanceAlertDays: 30,
      isActive: true,
      createdByName: "system",
    },
    {
      title: "월간 안전점검 라운딩",
      description: "건물 전 시설을 직접 순회하며 위험요소를 기록합니다.",
      category: "suggested",
      classification: "internal",
      taskType: "facility",
      frequencyType: "monthly",
      fixedDay: 25,
      dayOfMonth: 25,
      scopeType: "all",
      scopeValues: [],
      buildingUsageScopes: [],
      targetRoles: FACILITY,
      priority: 40,
      advanceAlertDays: 7,
      isActive: true,
      createdByName: "system",
    },
    {
      title: "에너지 사용량 점검 및 절감 캠페인",
      description: "전월 대비 사용량 변동을 확인하고 입주민 안내문을 게시합니다.",
      category: "suggested",
      classification: "internal",
      taskType: "facility",
      frequencyType: "monthly",
      fixedDay: 10,
      dayOfMonth: 10,
      scopeType: "all",
      scopeValues: [],
      buildingUsageScopes: [],
      targetRoles: FACILITY,
      priority: 30,
      advanceAlertDays: 7,
      isActive: true,
      createdByName: "system",
    },
    // [Task #221] 기존 하드코딩 알림(점검/세무/하자담보/개인정보 파기) 영역에서
    // 본사가 일괄 관리해야 하는 항목을 템플릿 시드로 이관해 단일 소스에서
    // 함께 노출되도록 한다. 기존 데이터 기반 알림은 회귀 방지를 위해 유지된다.
    {
      title: "법정 점검 일정 본사 보고",
      description: "건물별 법정 점검 일정/결과를 본사로 일괄 보고합니다.",
      category: "mandatory",
      classification: "legal",
      taskType: "facility",
      frequencyType: "quarterly",
      fixedDay: 10,
      dayOfMonth: 10,
      scopeType: "all",
      scopeValues: [],
      buildingUsageScopes: [],
      targetRoles: FACILITY,
      priority: 85,
      advanceAlertDays: 30,
      isActive: true,
      createdByName: "system",
    },
    {
      title: "분기 부가가치세 신고 마감 안내",
      description: "분기 마지막 달의 부가세 신고 마감일을 사전에 안내합니다.",
      category: "mandatory",
      classification: "legal",
      taskType: "accounting",
      frequencyType: "quarterly",
      fixedDay: 25,
      dayOfMonth: 25,
      scopeType: "all",
      scopeValues: [],
      buildingUsageScopes: [],
      targetRoles: ACCOUNTING,
      priority: 80,
      advanceAlertDays: 30,
      isActive: true,
      createdByName: "system",
    },
    {
      title: "하자담보 만료 예정 건 본사 점검",
      description: "당월 만료 예정 하자담보 항목을 본사가 일괄 검토합니다.",
      category: "mandatory",
      classification: "internal",
      taskType: "etc",
      frequencyType: "monthly",
      fixedDay: 5,
      dayOfMonth: 5,
      scopeType: "all",
      scopeValues: [],
      buildingUsageScopes: [],
      targetRoles: MANAGER_ONLY,
      priority: 70,
      advanceAlertDays: 30,
      isActive: true,
      createdByName: "system",
    },
    {
      title: "개인정보 보유기간 경과 데이터 파기 점검",
      description: "보유기간이 경과한 임차인/차량 데이터의 파기 처리 여부를 점검합니다.",
      category: "mandatory",
      classification: "legal",
      taskType: "etc",
      frequencyType: "monthly",
      fixedDay: 1,
      dayOfMonth: 1,
      scopeType: "all",
      scopeValues: [],
      buildingUsageScopes: [],
      targetRoles: MANAGER_ONLY,
      priority: 75,
      advanceAlertDays: 30,
      isActive: true,
      createdByName: "system",
    },
  ];

  const existing = await db.select().from(taskTemplatesTable);
  const existingByTitle = new Map(existing.map((t) => [t.title, t]));

  const toInsert = seed.filter((s) => !existingByTitle.has(s.title));
  if (toInsert.length > 0) {
    await db.insert(taskTemplatesTable).values(toInsert);
  }

  // 기존 시드 행에 targetRoles 가 비어 있으면 새 분류 값으로 채워 넣는다.
  // [#297] 기존 행이 신규 필드(taskType/dayOfMonth/yearInterval)가 비어 있으면
  //   시드 값으로 backfill 한다.
  for (const s of seed) {
    const row = existingByTitle.get(s.title);
    if (!row) continue;
    const current = (row as { targetRoles?: string[] | null }).targetRoles;
    const patch: Record<string, unknown> = {};
    if (!current || current.length === 0) {
      patch.targetRoles = s.targetRoles ?? null;
    }
    const r = row as {
      taskType?: string | null;
      dayOfMonth?: number | null;
      yearInterval?: number | null;
    };
    if (!r.taskType && s.taskType) patch.taskType = s.taskType;
    if (r.dayOfMonth == null && s.dayOfMonth != null) patch.dayOfMonth = s.dayOfMonth;
    if (r.yearInterval == null && s.yearInterval != null) patch.yearInterval = s.yearInterval;
    if (Object.keys(patch).length > 0) {
      await db.update(taskTemplatesTable).set(patch).where(eq(taskTemplatesTable.id, row.id));
    }
  }

  // 시드에 없는 임의 템플릿 중 targetRoles 가 NULL 인 항목은 안전하게 manager 로 기본 설정.
  await db
    .update(taskTemplatesTable)
    .set({ targetRoles: MANAGER_ONLY })
    .where(isNull(taskTemplatesTable.targetRoles));
}
