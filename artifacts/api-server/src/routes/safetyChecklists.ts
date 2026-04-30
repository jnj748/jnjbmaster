import { insertNotification } from "../lib/notificationRecipient";
import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, safetyChecklistsTable, safetyChecklistItemsTable, maintenanceLogsTable, notificationsTable, usersTable, safetyChecklistTemplateCategoriesTable } from "@workspace/db";
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
import { isBuildingScopedRole } from "../middlewares/buildingScope";

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
// [Task #650] 경리(accountant) 역할도 안전점검표 페이지에 접근할 수 있도록 허용한다.
router.use("/safety-checklists", requireRole("manager", "platform_admin", "facility_staff", "accountant"));
async function getUserBuildingId(userId: number): Promise<number | null> {
  const user = await db.select({ buildingId: usersTable.buildingId }).from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  return user?.buildingId ?? null;
}

// [Task #650] HQ 가 관리하는 활성 카테고리 목록에 속하는지 검증한다.
//   OpenAPI/Zod 의 category 필드가 enum → string 으로 완화되었기 때문에
//   서버는 템플릿 카테고리 테이블을 단일 진실 원천으로 사용해 직접 호출도 막는다.
async function isActiveTemplateCategory(value: string): Promise<boolean> {
  const [row] = await db
    .select({ id: safetyChecklistTemplateCategoriesTable.id })
    .from(safetyChecklistTemplateCategoriesTable)
    .where(
      and(
        eq(safetyChecklistTemplateCategoriesTable.value, value),
        eq(safetyChecklistTemplateCategoriesTable.isActive, true),
      ),
    )
    .limit(1);
  return Boolean(row);
}

// [Task #558] rfqs.ts 의 serializeRfqRow 와 동일한 의도. drizzle 의 timestamp/
//   date 컬럼은 Date 객체로 돌아오는 반면 응답 zod 스키마는 ISO string 을
//   기대하므로, .parse() 직전에 Date → ISO string / 'YYYY-MM-DD' 로 정규화한다.
function _toIsoDay(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  if (d instanceof Date) return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
  return d;
}
function _toIsoDateTime(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  return d instanceof Date ? d.toISOString() : d;
}
type ChecklistDateFields = {
  inspectionDate?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
};
function serializeChecklistRow<T extends ChecklistDateFields>(row: T): T {
  return {
    ...row,
    inspectionDate: _toIsoDay(row.inspectionDate),
    createdAt: _toIsoDateTime(row.createdAt),
    updatedAt: _toIsoDateTime(row.updatedAt),
  };
}
type ChecklistItemDateFields = { createdAt?: Date | string | null };
function serializeChecklistItem<T extends ChecklistItemDateFields>(row: T): T {
  return { ...row, createdAt: _toIsoDateTime(row.createdAt) };
}

router.get("/safety-checklists", async (req, res): Promise<void> => {
  const params = ListSafetyChecklistsQueryParams.safeParse(req.query);
  const conditions = [];

  // [Task #558] 건물 단위 역할(manager/accountant/facility_staff)은 본인 소속
  //   건물의 안전점검표만 노출. buildingId 미지정 계정은 빈 배열.
  if (isBuildingScopedRole(req.user?.role)) {
    const userBuildingId = req.user?.userId ? await getUserBuildingId(req.user.userId) : null;
    if (userBuildingId == null) {
      res.json(ListSafetyChecklistsResponse.parse([]));
      return;
    }
    conditions.push(eq(safetyChecklistsTable.buildingId, userBuildingId));
  }

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

  res.json(ListSafetyChecklistsResponse.parse(checklists.map(serializeChecklistRow)));
});

// [Task #558] 단건 핸들러용 공통 게이트. 건물 단위 역할이면 다른 건물 ID 직접
//   호출 시 존재 자체를 노출하지 않기 위해 404 로 응답한다.
async function assertOwnChecklistOr404(
  req: import("express").Request,
  checklistId: number,
): Promise<{ ok: true; checklist: typeof safetyChecklistsTable.$inferSelect } | { ok: false }> {
  const [checklist] = await db
    .select()
    .from(safetyChecklistsTable)
    .where(eq(safetyChecklistsTable.id, checklistId));
  if (!checklist) return { ok: false };
  if (!isBuildingScopedRole(req.user?.role)) return { ok: true, checklist };
  if (!req.user?.userId) return { ok: false };
  const userBuildingId = await getUserBuildingId(req.user.userId);
  if (userBuildingId == null || checklist.buildingId == null || checklist.buildingId !== userBuildingId) {
    return { ok: false };
  }
  return { ok: true, checklist };
}

router.post("/safety-checklists", async (req, res): Promise<void> => {
  const parsed = CreateSafetyChecklistBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // [Task #650] 직접 호출 방지: 카테고리는 HQ 가 관리하는 활성 템플릿이어야 한다.
  if (!(await isActiveTemplateCategory(parsed.data.category))) {
    res.status(400).json({ error: "유효하지 않은 카테고리입니다" });
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

  res.status(201).json(UpdateSafetyChecklistResponse.parse(serializeChecklistRow(checklist)));
});

router.get("/safety-checklists/:id", async (req, res): Promise<void> => {
  const params = GetSafetyChecklistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const gate = await assertOwnChecklistOr404(req, params.data.id);
  if (!gate.ok) {
    res.status(404).json({ error: "Checklist not found" });
    return;
  }

  const items = await db
    .select()
    .from(safetyChecklistItemsTable)
    .where(eq(safetyChecklistItemsTable.checklistId, params.data.id));

  res.json(GetSafetyChecklistResponse.parse(serializeChecklistRow({ ...gate.checklist, items: items.map(serializeChecklistItem) })));
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

  // [Task #650] category 필드가 본문에 포함된 경우에는 빈 문자열도 거부하고
  //   반드시 활성 템플릿이어야 한다. (truthy 체크만 하면 ""가 우회한다.)
  if (Object.prototype.hasOwnProperty.call(parsed.data, "category")) {
    const cat = parsed.data.category;
    if (!cat || !(await isActiveTemplateCategory(cat))) {
      res.status(400).json({ error: "유효하지 않은 카테고리입니다" });
      return;
    }
  }

  const gate = await assertOwnChecklistOr404(req, params.data.id);
  if (!gate.ok) {
    res.status(404).json({ error: "Checklist not found" });
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

  res.json(UpdateSafetyChecklistResponse.parse(serializeChecklistRow(checklist)));
});

router.delete("/safety-checklists/:id", async (req, res): Promise<void> => {
  const params = DeleteSafetyChecklistParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const gate = await assertOwnChecklistOr404(req, params.data.id);
  if (!gate.ok) {
    res.status(404).json({ error: "Checklist not found" });
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

  const gate = await assertOwnChecklistOr404(req, params.data.id);
  if (!gate.ok) {
    res.status(404).json({ error: "Checklist not found" });
    return;
  }

  const [item] = await db
    .insert(safetyChecklistItemsTable)
    .values({ ...parsed.data, checklistId: params.data.id })
    .returning();

  res.status(201).json(UpdateSafetyChecklistItemResponse.parse(serializeChecklistItem(item)));
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

  // [Task #558] item → checklist 조인을 통해 buildingId 게이트.
  if (isBuildingScopedRole(req.user?.role)) {
    const [parent] = await db
      .select({ buildingId: safetyChecklistsTable.buildingId })
      .from(safetyChecklistItemsTable)
      .innerJoin(
        safetyChecklistsTable,
        eq(safetyChecklistItemsTable.checklistId, safetyChecklistsTable.id),
      )
      .where(eq(safetyChecklistItemsTable.id, params.data.itemId));
    if (!parent) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
    const userBuildingId = req.user?.userId ? await getUserBuildingId(req.user.userId) : null;
    if (userBuildingId == null || parent.buildingId == null || parent.buildingId !== userBuildingId) {
      res.status(404).json({ error: "Item not found" });
      return;
    }
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

      await insertNotification({
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

  res.json(UpdateSafetyChecklistItemResponse.parse(serializeChecklistItem(item)));
});

export default router;
