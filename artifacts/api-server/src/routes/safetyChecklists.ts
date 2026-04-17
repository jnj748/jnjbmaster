import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, safetyChecklistsTable, safetyChecklistItemsTable, maintenanceLogsTable, notificationsTable, usersTable } from "@workspace/db";
import {
  ListSafetyChecklistsQueryParams,
  ListSafetyChecklistsResponse,
  CreateSafetyChecklistBody,
  GetSafetyChecklistParams,
  GetSafetyChecklistResponse,
  UpdateSafetyChecklistParams,
  UpdateSafetyChecklistBody,
  UpdateSafetyChecklistResponse,
  DeleteSafetyChecklistParams,
  AddSafetyChecklistItemParams,
  AddSafetyChecklistItemBody,
  UpdateSafetyChecklistItemParams,
  UpdateSafetyChecklistItemBody,
  UpdateSafetyChecklistItemResponse,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const CATEGORY_LABELS: Record<string, string> = {
  electrical: "전기설비",
  fire_safety: "소방시설",
  generator: "비상발전기",
  water_tank: "저수조",
  other: "기타",
};

const CATEGORY_TO_MAINTENANCE: Record<string, string> = {
  electrical: "equipment_repair",
  fire_safety: "equipment_repair",
  generator: "equipment_repair",
  water_tank: "plumbing",
  other: "other",
};

const router: IRouter = Router();
router.use("/safety-checklists", requireRole("manager", "platform_admin", "facility_staff"));
async function getUserBuildingId(userId: number): Promise<number | null> {
  const user = await db.select({ buildingId: usersTable.buildingId }).from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  return user?.buildingId ?? null;
}

router.get("/safety-checklists", async (req, res): Promise<void> => {
  const params = ListSafetyChecklistsQueryParams.safeParse(req.query);
  const conditions = [];

  if (params.success) {
    if (params.data.category) {
      conditions.push(eq(safetyChecklistsTable.category, params.data.category));
    }
    if (params.data.status) {
      conditions.push(eq(safetyChecklistsTable.status, params.data.status));
    }
  }

  const checklists = await db
    .select()
    .from(safetyChecklistsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(safetyChecklistsTable.inspectionDate));

  res.json(ListSafetyChecklistsResponse.parse(checklists));
});

router.post("/safety-checklists", async (req, res): Promise<void> => {
  const parsed = CreateSafetyChecklistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { items, ...checklistData } = parsed.data;
  const buildingId = await getUserBuildingId(req.user!.userId);

  const [checklist] = await db.insert(safetyChecklistsTable).values({ ...checklistData, buildingId }).returning();

  if (items && items.length > 0) {
    await db.insert(safetyChecklistItemsTable).values(
      items.map((item) => ({
        checklistId: checklist.id,
        itemName: item.itemName,
        checked: item.checked ?? false,
        result: item.result ?? null,
        notes: item.notes ?? null,
      }))
    );
  }

  res.status(201).json(UpdateSafetyChecklistResponse.parse(checklist));
});

router.get("/safety-checklists/:id", async (req, res): Promise<void> => {
  const params = GetSafetyChecklistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [checklist] = await db
    .select()
    .from(safetyChecklistsTable)
    .where(eq(safetyChecklistsTable.id, params.data.id));

  if (!checklist) {
    res.status(404).json({ error: "Checklist not found" });
    return;
  }

  const items = await db
    .select()
    .from(safetyChecklistItemsTable)
    .where(eq(safetyChecklistItemsTable.checklistId, params.data.id));

  res.json(GetSafetyChecklistResponse.parse({ ...checklist, items }));
});

router.patch("/safety-checklists/:id", async (req, res): Promise<void> => {
  const params = UpdateSafetyChecklistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSafetyChecklistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [checklist] = await db
    .update(safetyChecklistsTable)
    .set(parsed.data)
    .where(eq(safetyChecklistsTable.id, params.data.id))
    .returning();

  if (!checklist) {
    res.status(404).json({ error: "Checklist not found" });
    return;
  }

  res.json(UpdateSafetyChecklistResponse.parse(checklist));
});

router.delete("/safety-checklists/:id", async (req, res): Promise<void> => {
  const params = DeleteSafetyChecklistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  await db.delete(safetyChecklistItemsTable).where(eq(safetyChecklistItemsTable.checklistId, params.data.id));
  const [checklist] = await db.delete(safetyChecklistsTable).where(eq(safetyChecklistsTable.id, params.data.id)).returning();

  if (!checklist) {
    res.status(404).json({ error: "Checklist not found" });
    return;
  }

  res.sendStatus(204);
});

router.post("/safety-checklists/:id/items", async (req, res): Promise<void> => {
  const params = AddSafetyChecklistItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = AddSafetyChecklistItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db
    .insert(safetyChecklistItemsTable)
    .values({ ...parsed.data, checklistId: params.data.id })
    .returning();

  res.status(201).json(UpdateSafetyChecklistItemResponse.parse(item));
});

router.patch("/safety-checklists/items/:itemId", async (req, res): Promise<void> => {
  const params = UpdateSafetyChecklistItemParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSafetyChecklistItemBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [item] = await db
    .update(safetyChecklistItemsTable)
    .set(parsed.data)
    .where(eq(safetyChecklistItemsTable.id, params.data.itemId))
    .returning();

  if (!item) {
    res.status(404).json({ error: "Item not found" });
    return;
  }

  if (parsed.data.result === "불량") {
    const [existingLog] = await db
      .select({ id: maintenanceLogsTable.id })
      .from(maintenanceLogsTable)
      .where(
        and(
          eq(maintenanceLogsTable.sourceType, "safety_checklist"),
          eq(maintenanceLogsTable.checklistItemId, item.id)
        )
      );

    if (!existingLog) {
    const [checklist] = await db
      .select()
      .from(safetyChecklistsTable)
      .where(eq(safetyChecklistsTable.id, item.checklistId));

    if (checklist) {
      const categoryLabel = CATEGORY_LABELS[checklist.category] || checklist.category;
      const maintenanceCategory = CATEGORY_TO_MAINTENANCE[checklist.category] || "other";
      const today = new Date().toISOString().split("T")[0];

      const [maintenanceLog] = await db.insert(maintenanceLogsTable).values({
        buildingId: checklist.buildingId,
        title: `[불량] ${item.itemName}`,
        description: `안전점검표 "${checklist.title}"에서 불량 발견: ${item.itemName}. 카테고리: ${categoryLabel}`,
        category: maintenanceCategory,
        workDate: today,
        worker: checklist.inspector,
        status: "pending",
        sourceType: "safety_checklist",
        checklistItemId: item.id,
        notes: item.notes || null,
      }).returning();

      await db.insert(notificationsTable).values({
        recipientType: "admin",
        notificationType: "defect_found",
        title: `🚨 불량 발견: ${item.itemName}`,
        message: `[${categoryLabel}] ${checklist.title} 점검 중 "${item.itemName}" 항목에서 불량이 발견되었습니다. 보수 업무가 자동 생성되었습니다.`,
        relatedEntityType: "maintenance_log",
        relatedEntityId: maintenanceLog.id,
      });

      if (checklist.status !== "issue_found") {
        await db
          .update(safetyChecklistsTable)
          .set({ status: "issue_found" })
          .where(eq(safetyChecklistsTable.id, checklist.id));
      }
    }
    }
  }

  res.json(UpdateSafetyChecklistItemResponse.parse(item));
});

export default router;
