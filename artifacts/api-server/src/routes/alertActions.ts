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
// [Task #304] hq_executive(본부장)도 anchored 하자담보 등 템플릿 알림에 대해
//   처리완료/연기 액션을 직접 수행할 수 있어야 한다(spec: "본부장이 수동 처리할 수
//   있는 액션이 있음"). facility_staff/accountant 역시 자신 화면의 알림을 처리할
//   수 있어야 자신의 후속 노출이 정상적으로 억제된다.
router.use(
  "/alert-actions",
  requireRole("manager", "platform_admin", "hq_executive", "facility_staff", "accountant"),
);
router.get("/alert-actions", async (req, res): Promise<void> => {
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

router.post("/alert-actions", async (req, res): Promise<void> => {
  const parsed = CreateAlertActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const data = parsed.data;
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
