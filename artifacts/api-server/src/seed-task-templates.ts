import { db, taskTemplatesTable } from "@workspace/db";

// [Task #221] 본사가 일괄 관리하는 업무 템플릿의 초기 시드. 기존 점검/세무/보증/
// 데이터파기 알림과 별도로, 분기 보고·소방 자체점검 보고 등 본사가 한곳에서
// 관리해야 하는 대표적인 항목들을 등록한다. 기존 항목은 그대로 유지된다.
// 제목(title)을 키로 멱등 처리해 새 시드가 추가되어도 누락 없이 반영된다.
export async function seedTaskTemplates(): Promise<void> {
  const existing = await db.select().from(taskTemplatesTable);
  const existingTitles = new Set(existing.map((t) => t.title));

  const seed: Array<typeof taskTemplatesTable.$inferInsert> = [
    {
      title: "분기 운영 보고서 제출",
      description: "본사 분기 보고용 시설/회계/민원 종합 보고서를 작성·제출합니다.",
      category: "mandatory",
      classification: "internal",
      frequencyType: "quarterly",
      fixedDay: 5,
      scopeType: "all",
      scopeValues: [],
      priority: 80,
      advanceAlertDays: 7,
      isActive: true,
      createdByName: "system",
    },
    {
      title: "소방 자체 점검 결과 본사 보고",
      description: "소방 자체점검 후 본사에 결과를 보고합니다.",
      category: "mandatory",
      classification: "legal",
      frequencyType: "annual",
      fixedMonth: 11,
      fixedDay: 30,
      scopeType: "all",
      scopeValues: [],
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
      frequencyType: "monthly",
      fixedDay: 25,
      scopeType: "all",
      scopeValues: [],
      priority: 40,
      advanceAlertDays: 5,
      isActive: true,
      createdByName: "system",
    },
    {
      title: "에너지 사용량 점검 및 절감 캠페인",
      description: "전월 대비 사용량 변동을 확인하고 입주민 안내문을 게시합니다.",
      category: "suggested",
      classification: "internal",
      frequencyType: "monthly",
      fixedDay: 10,
      scopeType: "all",
      scopeValues: [],
      priority: 30,
      advanceAlertDays: 3,
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
      frequencyType: "quarterly",
      fixedDay: 10,
      scopeType: "all",
      scopeValues: [],
      priority: 85,
      advanceAlertDays: 14,
      isActive: true,
      createdByName: "system",
    },
    {
      title: "분기 부가가치세 신고 마감 안내",
      description: "분기 마지막 달의 부가세 신고 마감일을 사전에 안내합니다.",
      category: "mandatory",
      classification: "legal",
      frequencyType: "quarterly",
      fixedDay: 25,
      scopeType: "all",
      scopeValues: [],
      priority: 80,
      advanceAlertDays: 14,
      isActive: true,
      createdByName: "system",
    },
    {
      title: "하자담보 만료 예정 건 본사 점검",
      description: "당월 만료 예정 하자담보 항목을 본사가 일괄 검토합니다.",
      category: "mandatory",
      classification: "internal",
      frequencyType: "monthly",
      fixedDay: 5,
      scopeType: "all",
      scopeValues: [],
      priority: 70,
      advanceAlertDays: 14,
      isActive: true,
      createdByName: "system",
    },
    {
      title: "개인정보 보유기간 경과 데이터 파기 점검",
      description: "보유기간이 경과한 임차인/차량 데이터의 파기 처리 여부를 점검합니다.",
      category: "mandatory",
      classification: "legal",
      frequencyType: "monthly",
      fixedDay: 1,
      scopeType: "all",
      scopeValues: [],
      priority: 75,
      advanceAlertDays: 7,
      isActive: true,
      createdByName: "system",
    },
  ];

  const toInsert = seed.filter((s) => !existingTitles.has(s.title));
  if (toInsert.length === 0) return;
  await db.insert(taskTemplatesTable).values(toInsert);
}
