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

// 플랫폼만 저장. 전체 페이로드를 받아 (role, blockId) 별로 upsert.
//   [요청] 셀 의미를 일관시키기 위해 enabled=true 도 저장한다(이전엔 true=삭제였다).
//   - true  : 명시적 ON  → 사이드바/라우트 가드가 access 화이트리스트를 우회해 노출.
//   - false : 명시적 OFF → 사이드바/라우트에서 무조건 숨김.
//   기본값(=access 화이트리스트 그대로)으로 복원하려면 DELETE /platform/menu-overrides 사용.
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
    await db.transaction(async (tx) => {
      for (const o of parsed.data.overrides) {
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
            .set({ enabled: o.enabled, updatedBy: userId, updatedAt: new Date() })
            .where(eq(roleMenuOverridesTable.id, existing[0].id));
        } else {
          await tx.insert(roleMenuOverridesTable).values({
            role: o.role as MenuOverrideRole,
            blockId: o.blockId,
            enabled: o.enabled,
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
