// [Task #132] 파트너 분야(카테고리) CRUD.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, vendorCategoriesTable, VENDOR_CATEGORY_SEED } from "@workspace/db";
import { authMiddleware, requireRole } from "../middlewares/auth";
import { asc, eq } from "drizzle-orm";

const router: IRouter = Router();

// Public-ish (인증 필요): 가입 위저드에서 사용.
router.get("/vendor-categories", authMiddleware, async (_req: Request, res: Response) => {
  const rows = await db.select().from(vendorCategoriesTable).orderBy(asc(vendorCategoriesTable.sortOrder));
  res.json({ categories: rows });
});

router.post("/vendor-categories", authMiddleware, requireRole("platform_admin"), async (req: Request, res: Response) => {
  const { code, label, sortOrder } = req.body;
  if (!code || !label) { res.status(400).json({ error: "code, label 필수" }); return; }
  try {
    const [row] = await db.insert(vendorCategoriesTable).values({ code, label, sortOrder: sortOrder ?? 0 }).returning();
    res.status(201).json({ category: row });
  } catch {
    res.status(409).json({ error: "이미 존재하는 코드입니다" });
  }
});

router.put("/vendor-categories/:id", authMiddleware, requireRole("platform_admin"), async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  const { label, sortOrder } = req.body;
  const [row] = await db.update(vendorCategoriesTable).set({ label, sortOrder }).where(eq(vendorCategoriesTable.id, id)).returning();
  res.json({ category: row });
});

router.delete("/vendor-categories/:id", authMiddleware, requireRole("platform_admin"), async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  await db.delete(vendorCategoriesTable).where(eq(vendorCategoriesTable.id, id));
  res.json({ ok: true });
});

export async function seedVendorCategories(): Promise<void> {
  const existing = await db.select().from(vendorCategoriesTable);
  if (existing.length > 0) return;
  await db.insert(vendorCategoriesTable).values(VENDOR_CATEGORY_SEED);
}

export default router;
