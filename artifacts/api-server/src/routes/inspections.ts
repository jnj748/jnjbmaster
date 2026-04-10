import { Router, type IRouter } from "express";
import { eq, and, lte, gte, desc } from "drizzle-orm";
import { db, inspectionsTable, inspectionLogsTable, legalInspectionPresetsTable, draftsTable, notificationsTable, vendorsTable, rfqsTable } from "@workspace/db";
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
} from "@workspace/api-zod";

const router: IRouter = Router();

const LEGAL_PRESETS = [
  { name: "저수조 청소", category: "water_tank", legalCycleMonths: 6, defaultAlertDays: 30, description: "건축물 위생관리법에 따른 저수조 청소 (반기 1회)" },
  { name: "승강기 정기검사", category: "elevator", legalCycleMonths: 12, defaultAlertDays: 30, description: "승강기안전관리법에 따른 정기검사 (연 1회)" },
  { name: "소방 점검", category: "fire_safety", legalCycleMonths: 12, defaultAlertDays: 30, description: "소방시설법에 따른 종합정밀점검 (연 1회)" },
  { name: "정화조 청소", category: "septic", legalCycleMonths: 12, defaultAlertDays: 30, description: "하수도법에 따른 정화조 청소 (연 1회)" },
  { name: "안전점검", category: "safety_check", legalCycleMonths: 6, defaultAlertDays: 30, description: "시설물안전관리법에 따른 정기안전점검 (반기 1회)" },
  { name: "전기 안전점검", category: "electrical", legalCycleMonths: 12, defaultAlertDays: 30, description: "전기사업법에 따른 정기점검 (연 1회)" },
  { name: "가스 안전점검", category: "gas", legalCycleMonths: 12, defaultAlertDays: 30, description: "도시가스사업법에 따른 정기검사 (연 1회)" },
];

function calculateNextDueDate(lastDate: string, cycleMonths: number): string {
  const d = new Date(lastDate);
  d.setMonth(d.getMonth() + cycleMonths);
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

  if (presets.length === 0) {
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

  const data: any = {
    ...parsed.data,
    advanceAlertDays: parsed.data.advanceAlertDays ?? 30,
  };

  if (parsed.data.legalCycleMonths && parsed.data.lastInspectionDate) {
    data.nextDueDate = calculateNextDueDate(parsed.data.lastInspectionDate, parsed.data.legalCycleMonths);
  }

  const [inspection] = await db.insert(inspectionsTable).values(data).returning();
  res.status(201).json(UpdateInspectionResponse.parse(inspection));
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

  const updateData: any = { ...parsed.data };

  if (parsed.data.lastInspectionDate && parsed.data.legalCycleMonths) {
    updateData.nextDueDate = calculateNextDueDate(parsed.data.lastInspectionDate, parsed.data.legalCycleMonths);
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

  const cycleMonths = inspection.legalCycleMonths || Math.round(12 / inspection.frequencyPerYear);
  const newNextDueDate = calculateNextDueDate(inspDateStr, cycleMonths);

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
  const inspections = await db.select().from(inspectionsTable);

  const alertInspections: Array<{ inspectionId: number; name: string; nextDueDate: string; draftId: number | null }> = [];
  let draftsGenerated = 0;

  for (const inspection of inspections) {
    const dueDate = new Date(inspection.nextDueDate);
    const alertDate = new Date(dueDate);
    alertDate.setDate(alertDate.getDate() - inspection.advanceAlertDays);

    if (today >= alertDate && today <= dueDate) {
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

      if (existingDrafts.length === 0) {
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
      } else {
        draftId = existingDrafts[0].id;
      }

      alertInspections.push({
        inspectionId: inspection.id,
        name: inspection.name,
        nextDueDate: inspection.nextDueDate,
        draftId,
      });
    }
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
