// [Task #132] 회계 초기 자료 업로드 메타데이터.
import { Router, type IRouter, type Request, type Response } from "express";
import { db, accountingInitialFilesTable, usersTable } from "@workspace/db";
import { authMiddleware, requireRole } from "../middlewares/auth";
import { and, desc, eq } from "drizzle-orm";

const router: IRouter = Router();

router.use("/accounting-initial-files", authMiddleware, requireRole("manager", "accountant", "platform_admin", "hq_executive"));

// 다른 건물 자료에 접근하려면 platform_admin/hq_executive 만 허용. 그 외는 본인 buildingId 만.
function canAccessBuilding(user: { role: string; buildingId: number | null } | undefined, buildingId: number) {
  if (!user) return false;
  if (user.role === "platform_admin" || user.role === "hq_executive") return true;
  return user.buildingId === buildingId;
}

router.get("/accounting-initial-files", async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  if (!user?.buildingId && user?.role !== "platform_admin" && user?.role !== "hq_executive") {
    res.json({ files: [] }); return;
  }
  const buildingId = req.query.buildingId ? Number(req.query.buildingId) : user!.buildingId!;
  if (!canAccessBuilding(user, buildingId)) {
    res.status(403).json({ error: "이 건물의 회계 자료에 접근할 수 없습니다" }); return;
  }
  const rows = await db.select().from(accountingInitialFilesTable)
    .where(eq(accountingInitialFilesTable.buildingId, buildingId))
    .orderBy(desc(accountingInitialFilesTable.createdAt));
  res.json({ files: rows });
});

router.post("/accounting-initial-files", async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { category, fileUrl, originalName, periodNote, buildingId: bodyBid } = req.body;
  if (!category || !fileUrl) { res.status(400).json({ error: "category, fileUrl 필수" }); return; }
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  const buildingId = bodyBid ? Number(bodyBid) : user?.buildingId;
  if (!buildingId) { res.status(400).json({ error: "buildingId가 필요합니다" }); return; }
  if (!canAccessBuilding(user, buildingId)) {
    res.status(403).json({ error: "이 건물에 자료를 업로드할 권한이 없습니다" }); return;
  }
  const [row] = await db.insert(accountingInitialFilesTable).values({
    buildingId, category, fileUrl, originalName: originalName ?? null, periodNote: periodNote ?? null, uploadedBy: userId,
  }).returning();
  res.status(201).json({ file: row });
});

router.delete("/accounting-initial-files/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id));
  const userId = req.user!.userId;
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  const [row] = await db.select().from(accountingInitialFilesTable).where(eq(accountingInitialFilesTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  if (user?.role !== "platform_admin" && row.buildingId !== user?.buildingId) {
    res.status(403).json({ error: "권한이 없습니다" }); return;
  }
  await db.delete(accountingInitialFilesTable).where(eq(accountingInitialFilesTable.id, id));
  res.json({ ok: true });
});

export default router;
