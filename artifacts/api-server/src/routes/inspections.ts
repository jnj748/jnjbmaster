import { insertNotification } from "../lib/notificationRecipient";
import { Router, type IRouter } from "express";
import { eq, and, lte, gte, desc, sql, inArray, or } from "drizzle-orm";
import { db, inspectionsTable, inspectionLogsTable, legalInspectionPresetsTable, draftsTable, notificationsTable, vendorsTable, rfqsTable, usersTable, alertActionsTable, buildingsTable, dispatchJobsTable } from "@workspace/db";
import { enqueueDispatch } from "../lib/external/adapter";
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
import {
  getAccessibleBuildingIds,
  buildingScopeFilter,
  canAccessBuilding,
} from "../middlewares/buildingScope";

const router: IRouter = Router();
router.use("/inspections", requireRole("manager", "platform_admin", "hq_executive", "facility_staff"));
async function getUserBuildingId(userId: number): Promise<number | null> {
  const user = await db.select({ buildingId: usersTable.buildingId }).from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  return user?.buildingId ?? null;
}

// [Task #558] 점검 단건 핸들러 공통 게이트.
//   건물 단위 직원 역할(manager/accountant/facility_staff)이 본인 소속 건물이
//   아닌 점검 ID 로 직접 조회·수정·삭제·완료·매칭승인 시 누설 방지를 위해
//   404 로 응답한다(존재 자체를 노출하지 않음). platform_admin / hq_executive
//   는 전 건물 가시성을 가지므로 통과.
async function assertOwnInspectionOr404(
  req: import("express").Request,
  inspectionId: number,
): Promise<{ ok: true; inspection: typeof inspectionsTable.$inferSelect } | { ok: false }> {
  const [inspection] = await db
    .select()
    .from(inspectionsTable)
    .where(eq(inspectionsTable.id, inspectionId));
  if (!inspection) return { ok: false };
  // [Task #596] platform_admin 만 전 건물 가시. hq_executive 는 매핑된 건물만,
  //   manager/accountant/facility_staff 는 본인 building_id 만. 그 외는 차단.
  if (req.user?.role === "platform_admin") return { ok: true, inspection };
  if (inspection.buildingId == null) return { ok: false };
  if (await canAccessBuilding(req, inspection.buildingId)) {
    return { ok: true, inspection };
  }
  return { ok: false };
}

import { LEGAL_PRESETS } from "../domain/statutory";
export { LEGAL_PRESETS };

function calculateNextDueDate(lastDate: string, cycleMonths: number, intervalDays?: number): string {
  const d = new Date(lastDate);
  if (intervalDays) {
    d.setDate(d.getDate() + intervalDays);
  } else {
    d.setMonth(d.getMonth() + cycleMonths);
  }
  return d.toISOString().split("T")[0];
}

/**
 * [Task #544] Drizzle ↔ zod 정규화 (좁은 surgical 헬퍼).
 *
 *   `inspections` 테이블의 `created_at` / `updated_at` 컬럼은 timestamp 타입이라
 *   Drizzle 이 row 를 Date 인스턴스로 돌려준다. 반면 generated zod 스키마
 *   (`ListInspectionsResponse`, `UpdateInspectionResponse`,
 *    `CompleteInspectionResponse`) 는 ISO 8601 string 을 기대해 .parse() 가
 *   "Expected string, received date" 로 실패한다(별도 backlog
 *   "Fix drizzle date/time type mismatches" 의 일부).
 *
 *   본 task(#544) 의 인쇄 정렬 회귀 테스트가 inspection seed → 모달 트리거
 *   경로를 거쳐야 해서, 그 backlog 가 해소되기 전 단계의 임시 좁은 보정을
 *   여기서 수행한다. Date → ISO string 으로만 바꾸고 그 외 컬럼은 그대로 둔다.
 */
function normalizeInspectionRow<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const key of ["createdAt", "updatedAt"] as const) {
    const v = out[key];
    if (v instanceof Date) {
      out[key] = v.toISOString();
    }
  }
  return out as T;
}

router.get("/inspections", async (req, res): Promise<void> => {
  // [Task #558/#596] 건물 단위 역할은 본인 건물 점검만 보이고, hq_executive 는
  //   매핑된 건물 묶음만, platform_admin 만 전 건물 가시. 비할당 계정은 빈 배열.
  const conds: Array<ReturnType<typeof eq>> = [];
  const scope = await getAccessibleBuildingIds(req);
  const sf = buildingScopeFilter(scope, inspectionsTable.buildingId);
  if (sf === "empty") { res.json([]); return; }
  if (sf) conds.push(sf as ReturnType<typeof eq>);
  const inspections = await db
    .select()
    .from(inspectionsTable)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(inspectionsTable.nextDueDate);

  // [Task #544] 응답 정규화: (1) Date → ISO string 변환,
  //   (2) 과거 마이그레이션에서 들어간 deprecated category(예: "self_regular")
  //       는 zod enum 에 없어 .parse() 가 통째로 실패 — safeParse 로 행 단위
  //       검증 후 통과한 행만 응답에 포함한다(=UI 가 표시할 수 없는 행은 어차피
  //       무의미하므로 자르는 게 안전). 본격적인 schema drift 정리는 backlog
  //       "Fix drizzle date/time type mismatches" 에서 처리한다(본 task 범위 밖).
  const ItemSchema = (ListInspectionsResponse as unknown as { element: typeof ListInspectionsResponse })
    .element ?? ListInspectionsResponse;
  // [Task #554 빌드 수정] 명시적 타입 술어가 ItemSchema 의 출력 타입(strict
  //   inspection 행 타입)에 비해 `data: unknown` 으로 너무 넓어 TS 5.9 가 거부
  //   했다. TS 5.5+ 의 자동 narrowing 으로 `r.success` 분기만 남겨도 동일하게
  //   discriminated union 을 좁혀 준다.
  const normalized = inspections
    .map(normalizeInspectionRow)
    .map((row) => ItemSchema.safeParse(row))
    .filter((r) => r.success)
    .map((r) => r.data);

  res.json(normalized);
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

  let subItemsChanged = false;
  for (const row of presets) {
    const source = LEGAL_PRESETS.find((p) => p.name === row.name);
    if (!source) continue;
    if ((source.subItems ?? null) !== (row.subItems ?? null)) {
      await db
        .update(legalInspectionPresetsTable)
        .set({ subItems: source.subItems ?? null })
        .where(eq(legalInspectionPresetsTable.id, row.id));
      subItemsChanged = true;
    }
  }
  if (subItemsChanged) {
    presets = await db.select().from(legalInspectionPresetsTable);
  }

  // [Task #559] drizzle 의 timestamp 컬럼은 JS Date 객체를 반환하지만 응답
  //   스키마(ListInspectionPresetsResponse)는 createdAt 을 string 으로 기대해
  //   parse 가 ZodError("Expected string, received date") 로 500 을 던지고 있었다.
  //   res.json 직전에 Date → ISO string 으로 변환해 직렬화 형식을 맞춘다.
  const serialized = presets.map((p) => ({
    ...p,
    createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
  }));
  res.json(ListInspectionPresetsResponse.parse(serialized));
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
  // [Task #544] Date → ISO string 정규화 (위 헬퍼 doc 참고).
  res.status(201).json(UpdateInspectionResponse.parse(normalizeInspectionRow(inspection)));
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
    // [Task #544] Date → ISO string 정규화 (위 헬퍼 doc 참고).
    inspections: ListInspectionsResponse.parse(createdInspections.map(normalizeInspectionRow)),
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

  const gate = await assertOwnInspectionOr404(req, params.data.id);
  if (!gate.ok) {
    res.status(404).json({ error: "Inspection not found" });
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

  // [Task #544] Date → ISO string 정규화 (위 헬퍼 doc 참고).
  res.json(UpdateInspectionResponse.parse(normalizeInspectionRow(inspection)));
});

router.delete("/inspections/:id", async (req, res): Promise<void> => {
  const params = DeleteInspectionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const gate = await assertOwnInspectionOr404(req, params.data.id);
  if (!gate.ok) {
    res.status(404).json({ error: "Inspection not found" });
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

  const gate = await assertOwnInspectionOr404(req, params.data.id);
  if (!gate.ok) {
    res.status(404).json({ error: "Inspection not found" });
    return;
  }
  const inspection = gate.inspection;

  // useDates=false 로 codegen 된 zod 스키마라 inspectionDate 는 항상 문자열.
  const inspDateStr = String(parsed.data.inspectionDate);

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

  // [Task #544] Date → ISO string 정규화 (위 헬퍼 doc 참고). updated 는
  //   { inspection, log } 합성 객체이므로 inspection 키만 정규화한다.
  const normalized = (updated && typeof updated === "object" && "inspection" in updated)
    ? { ...(updated as Record<string, unknown>), inspection: normalizeInspectionRow((updated as { inspection: Record<string, unknown> }).inspection) }
    : updated;
  res.json(CompleteInspectionResponse.parse(normalized));
});

router.get("/inspections/:id/logs", async (req, res): Promise<void> => {
  const params = ListInspectionLogsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const gate = await assertOwnInspectionOr404(req, params.data.id);
  if (!gate.ok) {
    res.status(404).json({ error: "Inspection not found" });
    return;
  }

  const logs = await db
    .select()
    .from(inspectionLogsTable)
    .where(eq(inspectionLogsTable.inspectionId, params.data.id))
    .orderBy(desc(inspectionLogsTable.inspectionDate));

  res.json(ListInspectionLogsResponse.parse(logs));
});

// [Task #558/#596] generate-alerts 는 점검을 순회하며 알림/지출품의서를 생성하는
//   스케줄러성 엔드포인트. 매니저/시설직원이 직접 호출하면 응답으로 타 건물 점검
//   정보가 그대로 노출되므로 platform_admin / hq_executive 만 허용한다.
//   [#596] hq_executive 도 더 이상 super-user 가 아니다 — 본인이 매핑된 건물의
//   점검만 알림 대상이 되도록 scope 필터를 적용한다(매핑 0건이면 빈 결과).
router.post(
  "/inspections/generate-alerts",
  requireRole("platform_admin", "hq_executive"),
  async (req, res): Promise<void> => {
  const today = new Date();
  const currentMonth = today.getMonth() + 1;
  const currentDay = today.getDate();
  const scope = await getAccessibleBuildingIds(req);
  const sf = buildingScopeFilter(scope, inspectionsTable.buildingId);
  if (sf === "empty") {
    res.json(GenerateInspectionAlertsResponse.parse({
      alertsGenerated: 0, draftsGenerated: 0, inspections: [],
    }));
    return;
  }
  const inspections = sf
    ? await db.select().from(inspectionsTable).where(sf)
    : await db.select().from(inspectionsTable);

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

      await insertNotification({
        recipientType: "admin",
        notificationType: "inspection_alert",
        title: notifTitle,
        message: `${inspection.name} 점검이 예정되어 있습니다. 예정일: ${inspection.nextDueDate}`,
        relatedEntityType: "inspection",
        relatedEntityId: inspection.id,
      });
    }

    // [Task #법정업무-알림톡 작업 E / #4 fix] D-7 / D-0 / 초과(첫날 1회) alimtalk.
    //   inspection_alert(인앱) 의 월 단위 가드와 분리 — alimtalk 은 dispatchJobs 에서 templateCode 별 dedupe.
    //   채널·환경변수 미설정 시 어댑터가 devSimulate 자동 동작.
    //   today / dueDate 모두 자정 기준으로 정규화해야 D-0 판정이 안정. (시각 차이 어긋남 방지)
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const dueMidnight = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    const daysUntil = Math.round((dueMidnight.getTime() - todayMidnight.getTime()) / (1000 * 60 * 60 * 24));
    const isD7 = daysUntil === 7;
    const isD0 = daysUntil === 0;
    const isOverdueFirstDay = daysUntil < 0 && Math.abs(daysUntil) === 1;
    if (isD7 || isD0 || isOverdueFirstDay) {
      // 처리완료 액션이 있으면 발송 안 함.
      const completedActions = await db
        .select({ id: alertActionsTable.id })
        .from(alertActionsTable)
        .where(
          and(
            eq(alertActionsTable.relatedEntityType, "inspection"),
            eq(alertActionsTable.relatedEntityId, inspection.id),
            eq(alertActionsTable.actionType, "completed"),
          ),
        );
      if (completedActions.length === 0 && inspection.buildingId) {
        const templateCode = isD7 ? "mandatory_d7" : isD0 ? "mandatory_dday" : "mandatory_overdue";

        // [#4 fix] templateCode 별 dedupe — 같은 inspection 에 같은 templateCode 로
        //   이미 dispatchJobs 에 적재된 건이 있으면 skip (D-7 발송 후 D-0/초과는 별개로 발송 가능).
        const existingDispatch = await db
          .select({ id: dispatchJobsTable.id })
          .from(dispatchJobsTable)
          .where(
            and(
              // 마이그레이션 호환: 과거 aligo_kakao 로 적재된 행도 동일 발송으로 간주해 dedupe.
              or(
                eq(dispatchJobsTable.channel, "aligo_sms"),
                eq(dispatchJobsTable.channel, "aligo_kakao"),
              ),
              eq(dispatchJobsTable.relatedEntityType, "inspection"),
              eq(dispatchJobsTable.relatedEntityId, inspection.id),
              eq(dispatchJobsTable.triggerSource, templateCode),
            ),
          )
          .limit(1);

        if (existingDispatch.length === 0) {
          // building 이름 조회.
          const [bldg] = await db
            .select({ name: buildingsTable.name })
            .from(buildingsTable)
            .where(eq(buildingsTable.id, inspection.buildingId));
          const buildingName = bldg?.name ?? "";
          // manager + facility_staff phone 조회.
          const recipients = await db
            .select({ phone: usersTable.phone, role: usersTable.role })
            .from(usersTable)
            .where(
              and(
                eq(usersTable.buildingId, inspection.buildingId),
                inArray(usersTable.role, ["manager", "facility_staff"]),
              ),
            );

          let aligoMessage = "";
          if (isD7) {
            aligoMessage =
              `[관리의달인] ${inspection.name} 점검이 다가오고 있어요\n\n` +
              `${buildingName}님,\n` +
              `${inspection.nextDueDate}까지 ${inspection.name} 점검이 있습니다.\n\n` +
              `업체 예약이 필요하다면 견적을 받아보실 수 있어요.`;
          } else if (isD0) {
            aligoMessage =
              `[관리의달인] 오늘 ${inspection.name} 점검일이에요\n\n` +
              `${buildingName}님,\n` +
              `오늘(${inspection.nextDueDate}) ${inspection.name} 점검이 예정되어 있습니다.\n\n` +
              `처리 완료 후 앱에 기록해 두시면 보고서에 자동으로 반영됩니다.`;
          } else {
            aligoMessage =
              `[관리의달인] ${inspection.name} 점검 일정을 확인해 주세요\n\n` +
              `${buildingName}님,\n` +
              `${inspection.name} 점검 예정일(${inspection.nextDueDate})이 지났습니다.\n\n` +
              `처리하셨다면 앱에 완료 표시만 해주세요.\n` +
              `아직 미처리라면 빠른 일정 조율을 권해드립니다.`;
          }

          for (const r of recipients) {
            if (!r.phone) continue;
            try {
              await enqueueDispatch({
                buildingId: inspection.buildingId,
                channel: "aligo_sms",
                target: r.phone,
                payload: {
                  templateCode,
                  senderKey: process.env.ALIGO_SENDER_KEY ?? "",
                  senderNumber: process.env.ALIGO_SENDER_NUMBER ?? "",
                  message: aligoMessage,
                  receiverName: "",
                  buildingId: inspection.buildingId,
                },
                relatedEntityType: "inspection",
                relatedEntityId: inspection.id,
                triggerSource: templateCode,
              });
            } catch (err) {
              console.error("[inspections] aligo_sms dispatch failed", templateCode, r.phone, err);
            }
          }
        }
      }
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
  },
);

router.get("/inspections/upcoming", async (req, res): Promise<void> => {
  const today = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(today.getDate() + 30);

  const todayStr = today.toISOString().split("T")[0];
  const futureStr = thirtyDaysFromNow.toISOString().split("T")[0];

  // [Task #558/#596] 다가오는 점검 알림 위젯도 건물 단위 가시성에 묶는다.
  //   platform_admin → 전 건물, hq_executive → 매핑된 건물,
  //   manager/accountant/facility_staff → 본인 건물.
  const conds = [
    lte(inspectionsTable.nextDueDate, futureStr),
    gte(inspectionsTable.nextDueDate, todayStr),
  ];
  const scope = await getAccessibleBuildingIds(req);
  const sf = buildingScopeFilter(scope, inspectionsTable.buildingId);
  if (sf === "empty") {
    res.json([]);
    return;
  }
  if (sf) conds.push(sf);

  const inspections = await db
    .select()
    .from(inspectionsTable)
    .where(and(...conds))
    .orderBy(inspectionsTable.nextDueDate);

  // [Task #558] /inspections 와 동일하게 Date → ISO string 정규화 후 .parse 한다.
  res.json(GetUpcomingInspectionsResponse.parse(inspections.map(normalizeInspectionRow)));
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

// [Task #558] ai-matching 도 generate-alerts 와 동일하게 모든 건물의 다가오는
//   점검을 순회해 알림/입찰 초안/추천 업체를 응답으로 노출하는 스케줄러성
//   엔드포인트라 매니저/시설직원에게 열어 두면 타 건물 점검 정보가 새어 나간다.
//   platform_admin / hq_executive 만 호출 가능하도록 제한한다.
router.post(
  "/inspections/ai-matching",
  requireRole("platform_admin", "hq_executive"),
  async (req, res): Promise<void> => {
  try {
  const today = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(today.getDate() + 30);

  const todayStr = today.toISOString().split("T")[0];
  const futureStr = thirtyDaysFromNow.toISOString().split("T")[0];

  // [Task #596] hq_executive 는 본인 매핑 건물의 점검만 매칭 대상에 포함.
  const scope = await getAccessibleBuildingIds(req);
  const sf = buildingScopeFilter(scope, inspectionsTable.buildingId);
  if (sf === "empty") {
    res.json({
      results: [], totalInspections: 0, draftsGenerated: 0, notificationsCreated: 0,
    });
    return;
  }
  const conds = [
    lte(inspectionsTable.nextDueDate, futureStr),
    gte(inspectionsTable.nextDueDate, todayStr),
  ];
  if (sf) conds.push(sf);
  const upcomingInspections = await db
    .select()
    .from(inspectionsTable)
    .where(and(...conds))
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
    const inserted = await insertNotification({
      recipientType: "admin",
      notificationType: "ai_matching",
      title: `[AI 매칭] ${inspection.name} 점검 예정 알림`,
      message: `${inspection.name} 점검이 ${daysUntilDue}일 후(${inspection.nextDueDate}) 예정되어 있습니다. AI가 ${top3Vendors.length}개 업체를 추천했습니다.`,
      relatedEntityType: "inspection",
      relatedEntityId: inspection.id,
    });
    notificationId = inserted[0]?.id ?? null;
    notificationsCreated += inserted.length;

    if (top3Vendors.length > 0) {
      await insertNotification({
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
  },
);

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
    const gate = await assertOwnInspectionOr404(req, params.data.id);
    if (!gate.ok) {
      res.status(404).json({ error: "Inspection not found" });
      return;
    }
    const inspection = gate.inspection;
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
        // [Task #532] 선택된 특정 업체에게만 RFQ 알림을 보낸다 — vendor:<id>
        // (이전 코드는 "vendor" 라는 모호한 키를 써서 모든 협력업체 벨에
        //  방송되는 버그가 있었다.)
        await insertNotification({
          recipientType: `vendor:${vendorId}`,
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
