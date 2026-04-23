import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";
import {
  db,
  roleMenuOverridesTable,
  menuOverrideRoles,
  type MenuOverrideRole,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// 모든 인증 사용자는 본인 사이드바 계산을 위해 GET 가능 (전체 매트릭스).
// 데이터 양이 작고(블록×역할), 클라이언트가 캐시한다.
router.get("/platform/menu-overrides", async (_req, res): Promise<void> => {
  const rows = await db.select().from(roleMenuOverridesTable);
  res.json(rows);
});

const OverrideRow = z.object({
  role: z.enum(menuOverrideRoles as unknown as [string, ...string[]]),
  blockId: z.string().min(1).max(200),
  enabled: z.boolean(),
});
const PutBody = z.object({
  overrides: z.array(OverrideRow),
});

// 플랫폼만 저장. 전체 페이로드를 받아 차이만 upsert/delete (단순화: 전부 upsert).
router.put(
  "/platform/menu-overrides",
  requireRole("platform_admin"),
  async (req, res): Promise<void> => {
    const parsed = PutBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const userId = req.user?.userId ?? null;
    // 전체 페이로드를 트랜잭션으로 묶어 atomicity 보장.
    await db.transaction(async (tx) => {
      for (const o of parsed.data.overrides) {
        // enabled=true 인 행은 "기본값"이라 굳이 보존할 필요 없음 → 삭제하여 row 수 최소화.
        if (o.enabled) {
          await tx
            .delete(roleMenuOverridesTable)
            .where(
              and(
                eq(roleMenuOverridesTable.role, o.role as MenuOverrideRole),
                eq(roleMenuOverridesTable.blockId, o.blockId),
              ),
            );
          continue;
        }
        const existing = await tx
          .select()
          .from(roleMenuOverridesTable)
          .where(
            and(
              eq(roleMenuOverridesTable.role, o.role as MenuOverrideRole),
              eq(roleMenuOverridesTable.blockId, o.blockId),
            ),
          );
        if (existing.length > 0) {
          await tx
            .update(roleMenuOverridesTable)
            .set({ enabled: false, updatedBy: userId, updatedAt: new Date() })
            .where(eq(roleMenuOverridesTable.id, existing[0].id));
        } else {
          await tx.insert(roleMenuOverridesTable).values({
            role: o.role as MenuOverrideRole,
            blockId: o.blockId,
            enabled: false,
            updatedBy: userId,
          });
        }
      }
    });
    const rows = await db.select().from(roleMenuOverridesTable);
    res.json(rows);
  },
);

// 모든 오버라이드 삭제 → 기본값 복원.
router.delete(
  "/platform/menu-overrides",
  requireRole("platform_admin"),
  async (_req, res): Promise<void> => {
    await db.delete(roleMenuOverridesTable);
    res.json({ ok: true });
  },
);

export default router;
