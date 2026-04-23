import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, alertActionsTable, inspectionsTable, inspectionLogsTable, tasksTable, taxSchedulesTable } from "@workspace/db";
import {
  ListAlertActionsQueryParams,
  ListAlertActionsResponse,
  CreateAlertActionBody,
  ListAlertActionsResponseItem,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
// [Task #304] GET 과 POST 는 권한이 다르므로 router.use 로 일괄 적용하지 않고
//   각 라우트에 개별 가드를 둔다. router.use 미들웨어가 먼저 실행되면 POST 의
//   확장된 권한이 무력화되기 때문이다.
// GET 은 기존과 동일하게 관리자급(manager / platform_admin)만 조회 가능.
// 비관리자 역할이 추가될 경우 row-level scoping(userId / buildingId)이 필요하므로
// 현재 단계에서는 GET 권한을 확장하지 않는다.
router.get("/alert-actions", requireRole("manager", "platform_admin"), async (req, res): Promise<void> => {
  const params = ListAlertActionsQueryParams.safeParse(req.query);
  const conditions = [];

  if (params.success && params.data.alertType) {
    conditions.push(eq(alertActionsTable.alertType, params.data.alertType));
  }
  if (params.success && params.data.relatedEntityId) {
    conditions.push(eq(alertActionsTable.relatedEntityId, params.data.relatedEntityId));
  }

  const actions = await db
    .select()
    .from(alertActionsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(alertActionsTable.createdAt));

  res.json(ListAlertActionsResponse.parse(actions));
});

// [Task #304] POST 만 hq_executive / facility_staff / accountant 에게 추가 허용.
//   본부장은 anchored 하자담보 만료 등 템플릿 알림을 직접 처리완료/연기 가능해야
//   하고(spec), 시설/회계 담당도 자신의 알림을 처리하지 못하면 후속 노출이
//   계속 반복되기 때문이다. GET 은 위에서 막혀 있으므로 cross-tenant 노출이 없다.
router.post("/alert-actions", requireRole(
  "manager",
  "platform_admin",
  "hq_executive",
  "facility_staff",
  "accountant",
), async (req, res): Promise<void> => {
  const parsed = CreateAlertActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;

  // [Task #304] 권한 스코프 가드.
  //   manager / platform_admin 은 기존과 동일하게 모든 alertType 에 대해 처리 가능.
  //   확장된 역할(hq_executive / facility_staff / accountant)은 anchored 하자담보
  //   만료 등 "템플릿 알림"만 처리하도록 제한한다. 즉 alertType 이
  //   task_template_mandatory / task_template_suggested 이고 relatedEntityType 이
  //   task_template 일 때만 통과시키며, 기존 inspection / task / tax 엔티티의
  //   상태/일정을 임의로 변경할 수 없다(IDOR 방지).
  const role = req.user?.role;
  const isPrivileged = role === "manager" || role === "platform_admin";
  if (!isPrivileged) {
    const isTemplateAlert =
      (data.alertType === "task_template_mandatory" || data.alertType === "task_template_suggested") &&
      data.relatedEntityType === "task_template";
    if (!isTemplateAlert) {
      res.status(403).json({ error: "해당 알림을 처리할 권한이 없습니다." });
      return;
    }
  }

  let computedNextCycleDate: string | null = null;
  let actedOnDueDate: string | null = null;

  if (data.actionType === "completed" && data.relatedEntityType === "inspection") {
    const [inspection] = await db
      .select()
      .from(inspectionsTable)
      .where(eq(inspectionsTable.id, data.relatedEntityId));

    if (inspection) {
      actedOnDueDate = inspection.nextDueDate;
    }

    if (data.completedDate) {
      await db.insert(inspectionLogsTable).values({
        inspectionId: data.relatedEntityId,
        inspectionDate: data.completedDate,
        result: "pass",
        memo: data.notes || "대시보드 알림에서 처리완료",
      });
    }

    computedNextCycleDate = data.nextCycleDate || null;
    if (!computedNextCycleDate && inspection && data.completedDate) {
      const completedDt = new Date(data.completedDate);
      if (inspection.legalCycleMonths) {
        completedDt.setMonth(completedDt.getMonth() + inspection.legalCycleMonths);
      } else if (inspection.intervalDays) {
        completedDt.setDate(completedDt.getDate() + inspection.intervalDays);
      } else {
        completedDt.setMonth(completedDt.getMonth() + 6);
      }
      computedNextCycleDate = completedDt.toISOString().split("T")[0];
    }

    if (computedNextCycleDate) {
      await db
        .update(inspectionsTable)
        .set({
          lastInspectionDate: data.completedDate,
          nextDueDate: computedNextCycleDate!,
          status: "upcoming",
        })
        .where(eq(inspectionsTable.id, data.relatedEntityId));
    }
  }

  if (data.actionType === "completed" && data.relatedEntityType === "task") {
    await db
      .update(tasksTable)
      .set({ status: "completed" })
      .where(eq(tasksTable.id, data.relatedEntityId));
  }

  if (data.actionType === "completed" && data.relatedEntityType === "tax") {
    await db
      .update(taxSchedulesTable)
      .set({ status: "completed" })
      .where(eq(taxSchedulesTable.id, data.relatedEntityId));
  }

  if (data.actionType === "postponed" && data.postponeDays) {
    if (data.relatedEntityType === "inspection") {
      const [inspection] = await db
        .select()
        .from(inspectionsTable)
        .where(eq(inspectionsTable.id, data.relatedEntityId));

      if (inspection) {
        actedOnDueDate = inspection.nextDueDate;
        const currentDue = new Date(inspection.nextDueDate);
        currentDue.setDate(currentDue.getDate() + data.postponeDays);
        await db
          .update(inspectionsTable)
          .set({ nextDueDate: currentDue.toISOString().split("T")[0] })
          .where(eq(inspectionsTable.id, data.relatedEntityId));
      }
    }

    if (data.relatedEntityType === "task") {
      const [task] = await db
        .select()
        .from(tasksTable)
        .where(eq(tasksTable.id, data.relatedEntityId));

      if (task && task.dueDate) {
        actedOnDueDate = task.dueDate;
        const currentDue = new Date(task.dueDate);
        currentDue.setDate(currentDue.getDate() + data.postponeDays);
        await db
          .update(tasksTable)
          .set({ dueDate: currentDue.toISOString().split("T")[0] })
          .where(eq(tasksTable.id, data.relatedEntityId));
      }
    }

    if (data.relatedEntityType === "tax") {
      const [tax] = await db
        .select()
        .from(taxSchedulesTable)
        .where(eq(taxSchedulesTable.id, data.relatedEntityId));

      if (tax) {
        actedOnDueDate = tax.dueDate;
        const currentDue = new Date(tax.dueDate);
        currentDue.setDate(currentDue.getDate() + data.postponeDays);
        await db
          .update(taxSchedulesTable)
          .set({ dueDate: currentDue.toISOString().split("T")[0] })
          .where(eq(taxSchedulesTable.id, data.relatedEntityId));
      }
    }
  }

  const [action] = await db
    .insert(alertActionsTable)
    .values({
      // [Task #304] auth payload 키는 `userId` 임 (`id` 아님). 잘못된 키로
      //   null 이 저장되면 resolveActiveTemplateAlerts 의 사용자별 액션 매칭이
      //   실패해 처리완료/연기 후에도 알림이 다시 노출된다.
      userId: req.user?.userId ?? null,
      alertType: data.alertType,
      relatedEntityType: data.relatedEntityType,
      relatedEntityId: data.relatedEntityId,
      actionType: data.actionType,
      completedDate: data.completedDate || null,
      nextCycleDate: computedNextCycleDate || data.nextCycleDate || null,
      actedOnDueDate,
      postponeDays: data.postponeDays || null,
      postponeReason: data.postponeReason || null,
      rfqId: data.rfqId || null,
      notes: data.notes || null,
      closeUpPhotoUrl: data.closeUpPhotoUrl || null,
      widePhotoUrl: data.widePhotoUrl || null,
      delayReason: data.delayReason || null,
      delayReasonDetail: data.delayReasonDetail || null,
    })
    .returning();

  res.status(201).json(ListAlertActionsResponseItem.parse(action));
});

export default router;
