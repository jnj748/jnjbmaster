import { Router, type IRouter } from "express";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  safetyChecklistTemplateCategoriesTable,
  safetyChecklistTemplateItemsTable,
  safetyChecklistUserTemplatesTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";
// [Task #650] 응답도 codegen 된 zod 스키마로 검증해 다른 라우트와 일관성을 맞춘다.
//   주의: api-zod 가 노출하는 *런타임 zod* 스키마는 `*Response` 접미사이고,
//   `*200` 은 generated/types 의 TypeScript 전용 모델이므로 값으로 못 쓴다.
import {
  ListEffectiveSafetyChecklistTemplatesResponse as ListEffectiveTemplatesResponse,
  ListAdminSafetyChecklistCategoriesResponse as ListAdminCategoriesResponse,
  CreateSafetyChecklistCategoryResponse as CreateCategoryResponse,
  UpdateSafetyChecklistCategoryResponse as UpdateCategoryResponse,
  DeleteSafetyChecklistCategoryResponse as DeleteCategoryResponse,
  CreateSafetyChecklistTemplateItemResponse as CreateTemplateItemResponse,
  UpdateSafetyChecklistTemplateItemResponse as UpdateTemplateItemResponse,
  DeleteSafetyChecklistTemplateItemResponse as DeleteTemplateItemResponse,
  UpsertSafetyChecklistUserTemplateResponse as UpsertUserTemplateResponse,
  ResetSafetyChecklistUserTemplateResponse as ResetUserTemplateResponse,
} from "@workspace/api-zod";

// [Task #650] 안전점검표 템플릿 — 본사 관리(카테고리/항목) + 직원 개인 묶음.
//   기존에 코드 상수로 박혀 있던 카테고리/기본 항목을 DB 로 이관하고,
//   직원이 카테고리별로 본인만의 항목 묶음을 저장할 수 있게 한다.
const router: IRouter = Router();

// [Task #650] safetyChecklists.ts 의 _toIsoDateTime 와 같은 의도. drizzle 의
//   timestamp 컬럼은 Date 객체로 돌아오는 반면 응답 zod 스키마는 ISO string 을
//   기대하므로, .parse() 전에 Date → ISO string 으로 정규화해야 한다.
function toIsoOrNull(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  return d instanceof Date ? d.toISOString() : d;
}
type Tsable = { createdAt?: Date | string | null; updatedAt?: Date | string | null };
function serializeTimestamps<T extends Tsable>(row: T): T {
  return {
    ...row,
    createdAt: toIsoOrNull(row.createdAt) as T["createdAt"],
    updatedAt: toIsoOrNull(row.updatedAt) as T["updatedAt"],
  };
}

const platformAdminOnly = requireRole("platform_admin");
//   템플릿은 안전점검표 화면을 쓰는 모든 직원이 읽는다(파트너/입주민 제외).
const buildingStaffOnly = requireRole(
  "manager",
  "facility_staff",
  "accountant",
  "hq_executive",
  "platform_admin",
);

// ── 효과 템플릿 ────────────────────────────────────────────────
//   각 활성 카테고리에 대해 (사용자 묶음이 있으면 그것, 없으면 본사 기본 항목)을 반환.
router.get(
  "/safety-checklist-templates/effective",
  buildingStaffOnly,
  async (req, res): Promise<void> => {
    const userId = req.user!.userId;
    const cats = await db
      .select()
      .from(safetyChecklistTemplateCategoriesTable)
      .where(eq(safetyChecklistTemplateCategoriesTable.isActive, true))
      .orderBy(
        asc(safetyChecklistTemplateCategoriesTable.sortOrder),
        asc(safetyChecklistTemplateCategoriesTable.id),
      );
    const allItems = await db
      .select()
      .from(safetyChecklistTemplateItemsTable)
      .where(eq(safetyChecklistTemplateItemsTable.isActive, true))
      .orderBy(
        asc(safetyChecklistTemplateItemsTable.sortOrder),
        asc(safetyChecklistTemplateItemsTable.id),
      );
    const userRows = await db
      .select()
      .from(safetyChecklistUserTemplatesTable)
      .where(eq(safetyChecklistUserTemplatesTable.userId, userId));

    const userByCat = new Map<string, string[]>();
    for (const r of userRows) {
      try {
        const parsed = JSON.parse(r.items);
        if (Array.isArray(parsed)) userByCat.set(r.category, parsed.map(String));
      } catch {
        // 잘못 저장된 행은 빈 묶음 취급.
      }
    }
    const itemsByCat = new Map<number, string[]>();
    for (const it of allItems) {
      const arr = itemsByCat.get(it.categoryId) ?? [];
      arr.push(it.itemName);
      itemsByCat.set(it.categoryId, arr);
    }

    const categories = cats.map((c) => {
      const userItems = userByCat.get(c.value);
      const items = userItems ?? itemsByCat.get(c.id) ?? [];
      return {
        value: c.value,
        label: c.label,
        items,
        source: userItems ? ("user" as const) : ("default" as const),
      };
    });
    res.json(ListEffectiveTemplatesResponse.parse({ categories }));
  },
);

// ── 관리자: 전체 카테고리 + 기본 항목 ─────────────────────────
router.get(
  "/safety-checklist-templates/admin/categories",
  platformAdminOnly,
  async (_req, res): Promise<void> => {
    const cats = await db
      .select()
      .from(safetyChecklistTemplateCategoriesTable)
      .orderBy(
        asc(safetyChecklistTemplateCategoriesTable.sortOrder),
        asc(safetyChecklistTemplateCategoriesTable.id),
      );
    const items = await db
      .select()
      .from(safetyChecklistTemplateItemsTable)
      .orderBy(
        asc(safetyChecklistTemplateItemsTable.sortOrder),
        asc(safetyChecklistTemplateItemsTable.id),
      );
    const grouped = new Map<number, typeof items>();
    for (const it of items) {
      const arr = grouped.get(it.categoryId) ?? [];
      arr.push(it);
      grouped.set(it.categoryId, arr);
    }
    const categories = cats.map((c) => ({
      id: c.id,
      value: c.value,
      label: c.label,
      sortOrder: c.sortOrder,
      isActive: c.isActive,
      items: (grouped.get(c.id) ?? []).map(serializeTimestamps),
    }));
    res.json(ListAdminCategoriesResponse.parse({ categories }));
  },
);

const CategoryBody = z.object({
  value: z
    .string()
    .min(1)
    .max(50)
    // safety_checklists.category enum 과 동일한 슬러그 형식만 허용 (영문/숫자/밑줄).
    .regex(/^[a-z0-9_]+$/, "value 는 소문자/숫자/밑줄만 허용됩니다"),
  label: z.string().min(1).max(80),
  sortOrder: z.number().int().min(0).max(10000).default(100),
  isActive: z.boolean().default(true),
});

router.post(
  "/safety-checklist-templates/admin/categories",
  platformAdminOnly,
  async (req, res): Promise<void> => {
    const parsed = CategoryBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const existing = await db
      .select({ id: safetyChecklistTemplateCategoriesTable.id })
      .from(safetyChecklistTemplateCategoriesTable)
      .where(eq(safetyChecklistTemplateCategoriesTable.value, parsed.data.value))
      .limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "이미 존재하는 카테고리 값입니다" });
      return;
    }
    const [row] = await db
      .insert(safetyChecklistTemplateCategoriesTable)
      .values(parsed.data)
      .returning();
    res.json(CreateCategoryResponse.parse({ category: serializeTimestamps(row) }));
  },
);

router.patch(
  "/safety-checklist-templates/admin/categories/:id",
  platformAdminOnly,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "잘못된 id" });
      return;
    }
    const parsed = CategoryBody.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    // value 변경은 기존에 저장된 사용자 묶음/체크리스트와의 연결이 끊기므로 허용하지 않는다.
    if (parsed.data.value !== undefined) {
      const cur = await db
        .select({ value: safetyChecklistTemplateCategoriesTable.value })
        .from(safetyChecklistTemplateCategoriesTable)
        .where(eq(safetyChecklistTemplateCategoriesTable.id, id))
        .limit(1);
      if (cur[0] && cur[0].value !== parsed.data.value) {
        res.status(400).json({ error: "카테고리 value(슬러그)는 변경할 수 없습니다" });
        return;
      }
    }
    const patch: Record<string, unknown> = {};
    if (parsed.data.label !== undefined) patch.label = parsed.data.label;
    if (parsed.data.sortOrder !== undefined) patch.sortOrder = parsed.data.sortOrder;
    if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;
    // [Task #650 round-8] 빈 PATCH 본문은 명시적으로 400 으로 거절(Drizzle SET 절 빈 객체 방지).
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "변경할 필드가 없습니다" });
      return;
    }
    const [row] = await db
      .update(safetyChecklistTemplateCategoriesTable)
      .set(patch)
      .where(eq(safetyChecklistTemplateCategoriesTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "카테고리를 찾을 수 없습니다" });
      return;
    }
    res.json(UpdateCategoryResponse.parse({ category: serializeTimestamps(row) }));
  },
);

router.delete(
  "/safety-checklist-templates/admin/categories/:id",
  platformAdminOnly,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "잘못된 id" });
      return;
    }
    // [Task #650 round-8] 카테고리·산하 항목·사용자 묶음 삭제는 트랜잭션으로 묶어
    //   부분 실패로 인한 데이터 불일치를 방지한다.
    const ok = await db.transaction(async (tx) => {
      const target = await tx
        .select({
          id: safetyChecklistTemplateCategoriesTable.id,
          value: safetyChecklistTemplateCategoriesTable.value,
        })
        .from(safetyChecklistTemplateCategoriesTable)
        .where(eq(safetyChecklistTemplateCategoriesTable.id, id))
        .limit(1);
      if (target.length === 0) return false;
      await tx
        .delete(safetyChecklistTemplateItemsTable)
        .where(eq(safetyChecklistTemplateItemsTable.categoryId, id));
      await tx
        .delete(safetyChecklistUserTemplatesTable)
        .where(eq(safetyChecklistUserTemplatesTable.category, target[0]!.value));
      await tx
        .delete(safetyChecklistTemplateCategoriesTable)
        .where(eq(safetyChecklistTemplateCategoriesTable.id, id));
      return true;
    });
    if (!ok) {
      res.status(404).json({ error: "카테고리를 찾을 수 없습니다" });
      return;
    }
    res.json(DeleteCategoryResponse.parse({ ok: true }));
  },
);

const ItemBody = z.object({
  itemName: z.string().min(1).max(200),
  sortOrder: z.number().int().min(0).max(10000).default(100),
  isActive: z.boolean().default(true),
});

router.post(
  "/safety-checklist-templates/admin/categories/:categoryId/items",
  platformAdminOnly,
  async (req, res): Promise<void> => {
    const categoryId = Number(req.params.categoryId);
    if (!Number.isFinite(categoryId)) {
      res.status(400).json({ error: "잘못된 categoryId" });
      return;
    }
    const parsed = ItemBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const cat = await db
      .select({ id: safetyChecklistTemplateCategoriesTable.id })
      .from(safetyChecklistTemplateCategoriesTable)
      .where(eq(safetyChecklistTemplateCategoriesTable.id, categoryId))
      .limit(1);
    if (cat.length === 0) {
      res.status(404).json({ error: "카테고리를 찾을 수 없습니다" });
      return;
    }
    const [row] = await db
      .insert(safetyChecklistTemplateItemsTable)
      .values({
        categoryId,
        itemName: parsed.data.itemName,
        sortOrder: parsed.data.sortOrder,
        isActive: parsed.data.isActive,
      })
      .returning();
    res.json(CreateTemplateItemResponse.parse({ item: serializeTimestamps(row) }));
  },
);

router.patch(
  "/safety-checklist-templates/admin/items/:id",
  platformAdminOnly,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "잘못된 id" });
      return;
    }
    const parsed = ItemBody.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const patch: Record<string, unknown> = {};
    if (parsed.data.itemName !== undefined) patch.itemName = parsed.data.itemName;
    if (parsed.data.sortOrder !== undefined) patch.sortOrder = parsed.data.sortOrder;
    if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;
    // [Task #650 round-8] 빈 PATCH 본문은 명시적으로 400 으로 거절(Drizzle SET 절 빈 객체 방지).
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: "변경할 필드가 없습니다" });
      return;
    }
    const [row] = await db
      .update(safetyChecklistTemplateItemsTable)
      .set(patch)
      .where(eq(safetyChecklistTemplateItemsTable.id, id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "항목을 찾을 수 없습니다" });
      return;
    }
    res.json(UpdateTemplateItemResponse.parse({ item: serializeTimestamps(row) }));
  },
);

router.delete(
  "/safety-checklist-templates/admin/items/:id",
  platformAdminOnly,
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "잘못된 id" });
      return;
    }
    // [Task #650 round-7] 존재하지 않는 id 는 명시적으로 404 로 응답한다.
    const deleted = await db
      .delete(safetyChecklistTemplateItemsTable)
      .where(eq(safetyChecklistTemplateItemsTable.id, id))
      .returning({ id: safetyChecklistTemplateItemsTable.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: "항목을 찾을 수 없습니다" });
      return;
    }
    res.json(DeleteTemplateItemResponse.parse({ ok: true }));
  },
);

// ── 사용자 개인 묶음 ──────────────────────────────────────────
const UserTemplateBody = z.object({
  items: z.array(z.string().min(1).max(200)).max(200),
});

router.put(
  "/safety-checklist-templates/user/:category",
  buildingStaffOnly,
  async (req, res): Promise<void> => {
    const category = String(req.params.category ?? "");
    if (!category) {
      res.status(400).json({ error: "잘못된 category" });
      return;
    }
    // 활성/비활성 무관하게 존재하는 카테고리에만 저장 가능.
    const cat = await db
      .select({ value: safetyChecklistTemplateCategoriesTable.value })
      .from(safetyChecklistTemplateCategoriesTable)
      .where(eq(safetyChecklistTemplateCategoriesTable.value, category))
      .limit(1);
    if (cat.length === 0) {
      res.status(404).json({ error: "카테고리를 찾을 수 없습니다" });
      return;
    }
    const parsed = UserTemplateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const userId = req.user!.userId;
    const itemsJson = JSON.stringify(parsed.data.items);
    const [row] = await db
      .insert(safetyChecklistUserTemplatesTable)
      .values({ userId, category, items: itemsJson })
      .onConflictDoUpdate({
        target: [
          safetyChecklistUserTemplatesTable.userId,
          safetyChecklistUserTemplatesTable.category,
        ],
        set: { items: itemsJson, updatedAt: new Date() },
      })
      .returning();
    res.json(
      UpsertUserTemplateResponse.parse({
        template: { ...serializeTimestamps(row), items: parsed.data.items },
      }),
    );
  },
);

router.delete(
  "/safety-checklist-templates/user/:category",
  buildingStaffOnly,
  async (req, res): Promise<void> => {
    const category = String(req.params.category ?? "");
    if (!category) {
      res.status(400).json({ error: "잘못된 category" });
      return;
    }
    const userId = req.user!.userId;
    await db
      .delete(safetyChecklistUserTemplatesTable)
      .where(
        and(
          eq(safetyChecklistUserTemplatesTable.userId, userId),
          eq(safetyChecklistUserTemplatesTable.category, category),
        ),
      );
    res.json(ResetUserTemplateResponse.parse({ ok: true }));
  },
);

export default router;
