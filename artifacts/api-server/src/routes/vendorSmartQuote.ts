// [S1 스마트견적] 파트너의 스마트견적 가입 정보 조회/수정.
//   - GET /me/vendor/smart-quote : 본인 가입 정보. 없으면 default(paused) 로 빈 응답.
//   - PUT /me/vendor/smart-quote : upsert. 토글 + 일일 한도 + 대상 카테고리/지역.
//
//   S3 단계에서 자동 제출 엔진을 켜면 본 라우트가 저장한 데이터로 동작한다.
//   현재는 파트너가 미리 설정만 해두는 단계.
import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  usersTable,
  vendorSmartQuoteTable,
  type VendorSmartQuote,
} from "@workspace/db";

const router: Router = Router();

const SMART_QUOTE_DEFAULT = {
  status: "paused" as const,
  dailyCreditBudget: 9000,
  dailyMaxCount: 3,
  targetCategories: [] as string[],
  targetRegions: null,
  pausedReason: null,
  lastPausedAt: null,
};

const PutBody = z.object({
  status: z.enum(["active", "paused"]),
  dailyCreditBudget: z.number().int().min(0).max(1_000_000),
  dailyMaxCount: z.number().int().min(1).max(5),
  targetCategories: z.array(z.string()).max(50),
  targetRegions: z.unknown().nullable().optional(),
});

function serialize(row: VendorSmartQuote | null) {
  if (!row) return { ...SMART_QUOTE_DEFAULT, vendorId: null };
  return {
    vendorId: row.vendorId,
    status: row.status,
    dailyCreditBudget: row.dailyCreditBudget,
    dailyMaxCount: row.dailyMaxCount,
    targetCategories: row.targetCategories ?? [],
    targetRegions: row.targetRegions ?? null,
    pausedReason: row.pausedReason ?? null,
    lastPausedAt: row.lastPausedAt,
  };
}

async function resolveVendorId(req: Request, res: Response): Promise<number | null> {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.role !== "partner") {
    res.status(403).json({ error: "파트너 계정만 사용할 수 있습니다" });
    return null;
  }
  if (!user.vendorId) {
    res.status(404).json({ error: "연결된 업체가 없습니다" });
    return null;
  }
  return user.vendorId;
}

router.get("/me/vendor/smart-quote", async (req: Request, res: Response): Promise<void> => {
  const vendorId = await resolveVendorId(req, res);
  if (vendorId == null) return;
  const [row] = await db
    .select()
    .from(vendorSmartQuoteTable)
    .where(eq(vendorSmartQuoteTable.vendorId, vendorId));
  res.json(serialize(row ?? null));
});

router.put("/me/vendor/smart-quote", async (req: Request, res: Response): Promise<void> => {
  const vendorId = await resolveVendorId(req, res);
  if (vendorId == null) return;
  const parsed = PutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const body = parsed.data;
  const now = new Date();
  // 활성 → 일시정지로 바뀔 때만 lastPausedAt/pausedReason 갱신.
  const [existing] = await db
    .select()
    .from(vendorSmartQuoteTable)
    .where(eq(vendorSmartQuoteTable.vendorId, vendorId));
  const becamePaused = existing?.status === "active" && body.status === "paused";
  const updateValues = {
    status: body.status,
    dailyCreditBudget: body.dailyCreditBudget,
    dailyMaxCount: body.dailyMaxCount,
    targetCategories: body.targetCategories,
    targetRegions: (body.targetRegions ?? null) as unknown as VendorSmartQuote["targetRegions"],
    pausedReason: becamePaused ? "manual" : (body.status === "paused" ? existing?.pausedReason ?? "manual" : null),
    lastPausedAt: becamePaused ? now : existing?.lastPausedAt ?? null,
    updatedAt: now,
  };
  const [row] = await db
    .insert(vendorSmartQuoteTable)
    .values({ vendorId, ...updateValues, createdAt: now })
    .onConflictDoUpdate({
      target: vendorSmartQuoteTable.vendorId,
      set: updateValues,
    })
    .returning();
  res.json(serialize(row ?? null));
});

export default router;
