// [Task #132] 파트너 분야(카테고리) CRUD.
// [Task #734] 2단(대분류·자식) 확장:
//   - GET 응답에 parentCode·active 포함, 기본은 active=true 만 반환.
//     본사 관리자 화면은 ?includeInactive=1 로 비활성 항목까지 조회.
//   - POST/PUT 가 parentCode·active 를 받음. parentCode 가 지정되면 부모 존재
//     여부와 "부모는 대분류여야 함(parentCode=null)" 을 검증.
//   - 변경 시점에 reloadCategoryParentMap() 으로 매칭 모듈의 부모맵을 즉시 갱신.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, vendorCategoriesTable, VENDOR_CATEGORY_SEED } from "@workspace/db";
import { authMiddleware, requireRole } from "../middlewares/auth";
import { asc, eq } from "drizzle-orm";
import { setCategoryParentMap } from "@workspace/shared/rfq-vendor-matching";

const router: IRouter = Router();

/**
 * 카테고리 마스터를 한 번 읽어 매칭 모듈의 부모맵을 갱신한다.
 * - 부팅 시 1회 + 본사 관리자 CRUD 직후 호출.
 * - 실패해도 매칭 모듈은 빈 맵으로 안전하게 동작(자동 부모 포함만 비활성).
 */
export async function reloadCategoryParentMap(): Promise<void> {
  const rows = await db.select().from(vendorCategoriesTable);
  const map: Record<string, string> = {};
  for (const r of rows) {
    if (r.parentCode) map[r.code] = r.parentCode;
  }
  setCategoryParentMap(map);
}

// 가입 위저드 + 본사 관리자가 공유. 인증된 사용자라면 누구나 조회 가능.
router.get("/vendor-categories", authMiddleware, async (req: Request, res: Response) => {
  const includeInactive = String(req.query.includeInactive ?? "") === "1";
  const rows = await db
    .select()
    .from(vendorCategoriesTable)
    .orderBy(asc(vendorCategoriesTable.sortOrder));
  const filtered = includeInactive ? rows : rows.filter((r) => r.active);
  res.json({ categories: filtered });
});

router.post(
  "/vendor-categories",
  authMiddleware,
  requireRole("platform_admin"),
  async (req: Request, res: Response) => {
    const { code, label, parentCode, sortOrder, active } = req.body ?? {};
    if (typeof code !== "string" || !code.trim() || typeof label !== "string" || !label.trim()) {
      res.status(400).json({ error: "code, label 필수" });
      return;
    }
    if (parentCode != null && parentCode !== "") {
      const [parent] = await db
        .select()
        .from(vendorCategoriesTable)
        .where(eq(vendorCategoriesTable.code, String(parentCode)));
      if (!parent) {
        res.status(400).json({ error: "지정한 parent_code 가 존재하지 않습니다" });
        return;
      }
      if (parent.parentCode) {
        res.status(400).json({ error: "자식 카테고리(2단)는 부모로 지정할 수 없습니다" });
        return;
      }
    }
    try {
      const [row] = await db
        .insert(vendorCategoriesTable)
        .values({
          code: code.trim(),
          label: label.trim(),
          parentCode: parentCode != null && parentCode !== "" ? String(parentCode) : null,
          sortOrder: typeof sortOrder === "number" ? sortOrder : 0,
          active: typeof active === "boolean" ? active : true,
        })
        .returning();
      await reloadCategoryParentMap();
      res.status(201).json({ category: row });
    } catch {
      res.status(409).json({ error: "이미 존재하는 코드입니다" });
    }
  },
);

router.put(
  "/vendor-categories/:id",
  authMiddleware,
  requireRole("platform_admin"),
  async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "id 가 올바르지 않습니다" });
      return;
    }
    const { label, parentCode, sortOrder, active } = req.body ?? {};
    if (parentCode != null && parentCode !== "") {
      const [parent] = await db
        .select()
        .from(vendorCategoriesTable)
        .where(eq(vendorCategoriesTable.code, String(parentCode)));
      if (!parent) {
        res.status(400).json({ error: "지정한 parent_code 가 존재하지 않습니다" });
        return;
      }
      if (parent.parentCode) {
        res.status(400).json({ error: "자식 카테고리(2단)는 부모로 지정할 수 없습니다" });
        return;
      }
      if (parent.id === id) {
        res.status(400).json({ error: "자기 자신을 부모로 지정할 수 없습니다" });
        return;
      }
    }
    const updates: Record<string, unknown> = {};
    if (typeof label === "string" && label.trim()) updates.label = label.trim();
    if (parentCode !== undefined) {
      updates.parentCode = parentCode == null || parentCode === "" ? null : String(parentCode);
    }
    if (typeof sortOrder === "number") updates.sortOrder = sortOrder;
    if (typeof active === "boolean") updates.active = active;
    const [row] = await db
      .update(vendorCategoriesTable)
      .set(updates)
      .where(eq(vendorCategoriesTable.id, id))
      .returning();
    await reloadCategoryParentMap();
    res.json({ category: row });
  },
);

router.delete(
  "/vendor-categories/:id",
  authMiddleware,
  requireRole("platform_admin"),
  async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "id 가 올바르지 않습니다" });
      return;
    }
    // 안전장치: 자식이 있는 대분류는 삭제 불가 (active=false 로 비활성 권장).
    const [target] = await db
      .select()
      .from(vendorCategoriesTable)
      .where(eq(vendorCategoriesTable.id, id));
    if (!target) {
      res.status(404).json({ error: "해당 카테고리를 찾을 수 없습니다" });
      return;
    }
    if (!target.parentCode) {
      const children = await db
        .select()
        .from(vendorCategoriesTable)
        .where(eq(vendorCategoriesTable.parentCode, target.code));
      if (children.length > 0) {
        res.status(409).json({
          error: "자식 카테고리가 있어 삭제할 수 없습니다. 먼저 자식을 삭제하거나 비활성화해 주세요.",
        });
        return;
      }
    }
    await db.delete(vendorCategoriesTable).where(eq(vendorCategoriesTable.id, id));
    await reloadCategoryParentMap();
    res.json({ ok: true });
  },
);

export async function seedVendorCategories(): Promise<void> {
  const existing = await db.select().from(vendorCategoriesTable);
  if (existing.length > 0) return;
  await db.insert(vendorCategoriesTable).values(VENDOR_CATEGORY_SEED);
}

export default router;
