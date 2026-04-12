import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, alertActionsTable, inspectionsTable, inspectionLogsTable } from "@workspace/db";
import {
  ListAlertActionsQueryParams,
  ListAlertActionsResponse,
  CreateAlertActionBody,
  ListAlertActionsResponseItem,
} from "@workspace/api-zod";

const router: IRouter = Router();

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

  if (data.actionType === "completed" && data.relatedEntityType === "inspection") {
    if (data.completedDate) {
      await db.insert(inspectionLogsTable).values({
        inspectionId: data.relatedEntityId,
        inspectionDate: data.completedDate,
        result: "pass",
        memo: data.notes || "대시보드 알림에서 처리완료",
      });
    }

    if (data.nextCycleDate) {
      await db
        .update(inspectionsTable)
        .set({
          lastInspectionDate: data.completedDate,
          nextDueDate: data.nextCycleDate,
          status: "upcoming",
        })
        .where(eq(inspectionsTable.id, data.relatedEntityId));
    }
  }

  if (data.actionType === "postponed" && data.relatedEntityType === "inspection" && data.postponeDays) {
    const [inspection] = await db
      .select()
      .from(inspectionsTable)
      .where(eq(inspectionsTable.id, data.relatedEntityId));

    if (inspection) {
      const currentDue = new Date(inspection.nextDueDate);
      currentDue.setDate(currentDue.getDate() + data.postponeDays);
      const newDueDate = currentDue.toISOString().split("T")[0];

      await db
        .update(inspectionsTable)
        .set({ nextDueDate: newDueDate })
        .where(eq(inspectionsTable.id, data.relatedEntityId));
    }
  }

  const [action] = await db
    .insert(alertActionsTable)
    .values({
      alertType: data.alertType,
      relatedEntityType: data.relatedEntityType,
      relatedEntityId: data.relatedEntityId,
      actionType: data.actionType,
      completedDate: data.completedDate || null,
      nextCycleDate: data.nextCycleDate || null,
      postponeDays: data.postponeDays || null,
      postponeReason: data.postponeReason || null,
      rfqId: data.rfqId || null,
      notes: data.notes || null,
    })
    .returning();

  res.status(201).json(ListAlertActionsResponseItem.parse(action));
});

export default router;
