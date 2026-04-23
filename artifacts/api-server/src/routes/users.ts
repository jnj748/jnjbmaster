import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { randomInt } from "crypto";

const router: IRouter = Router();

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pw = "";
  for (let i = 0; i < 10; i++) pw += chars[randomInt(chars.length)];
  return pw;
}

const validRoles = ["manager", "partner", "platform_admin", "hq_executive", "accountant", "facility_staff"];
const validPortals = ["building", "partner", "hq"];

// [카테고리 메뉴 제어] 플랫폼 관리자가 사용자별로 끌 수 있는 카테고리.
//   "dashboard" 는 홈 진입 보장을 위해 항상 활성 — 입력에서 제거.
const validCategories = ["residents", "facility", "accounting", "reports", "marketplace", "settings"] as const;
function sanitizeDisabledCategories(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (value === null) return [];
  if (!Array.isArray(value)) return [];
  const allow = new Set<string>(validCategories);
  return Array.from(new Set(value.filter((v): v is string => typeof v === "string" && allow.has(v))));
}
function parseDisabledCategories(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

router.get("/users", requireRole("manager", "platform_admin", "hq_executive"), async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        role: usersTable.role,
        phone: usersTable.phone,
        portalType: usersTable.portalType,
        createdAt: usersTable.createdAt,
        disabledCategories: usersTable.disabledCategories,
        // [Task #267] 플랫폼관리자 역할 현황 페이지에서 "활성 건물 수" 집계용.
        buildingId: usersTable.buildingId,
      })
      .from(usersTable)
      .orderBy(usersTable.createdAt);

    res.json(rows.map((u) => ({ ...u, disabledCategories: parseDisabledCategories(u.disabledCategories) })));
  } catch {
    res.status(500).json({ error: "사용자 목록을 불러올 수 없습니다" });
  }
});

router.post("/users", requireRole("manager", "platform_admin", "hq_executive"), async (req, res): Promise<void> => {
  try {
    const { email, password, name, role, phone, portalType, disabledCategories } = req.body;

    if (!email || !name || !role || !portalType) {
      res.status(400).json({ error: "필수 항목을 모두 입력해주세요" });
      return;
    }

    if (!validRoles.includes(role)) {
      res.status(400).json({ error: "유효하지 않은 역할입니다" });
      return;
    }

    const actorRole = req.user?.role;
    const privilegedRoles = ["platform_admin", "hq_executive"];
    if (privilegedRoles.includes(role) && actorRole !== "platform_admin") {
      res.status(403).json({ error: "해당 역할의 사용자는 플랫폼 관리자만 생성할 수 있습니다" });
      return;
    }

    if (!validPortals.includes(portalType)) {
      res.status(400).json({ error: "유효하지 않은 포털 유형입니다" });
      return;
    }

    if (portalType === "partner" && role !== "partner") {
      res.status(400).json({ error: "파트너사 포털은 파트너사 역할만 가능합니다" });
      return;
    }
    if (portalType === "hq" && !["hq_executive", "platform_admin"].includes(role)) {
      res.status(400).json({ error: "본사 포털은 총괄책임자 또는 플랫폼 관리자만 가능합니다" });
      return;
    }
    if (portalType === "building" && role === "partner") {
      res.status(400).json({ error: "건물관리 포털에서 파트너사 역할은 사용할 수 없습니다" });
      return;
    }

    const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (existing.length > 0) {
      res.status(409).json({ error: "이미 등록된 이메일입니다" });
      return;
    }

    const finalPassword = password || generateTempPassword();
    const passwordHash = await bcrypt.hash(finalPassword, 10);
    // [카테고리 메뉴 제어] disabledCategories 는 플랫폼 관리자만 설정 가능. 그 외 역할은 무시.
    const disabledForInsert =
      actorRole === "platform_admin" ? sanitizeDisabledCategories(disabledCategories) : undefined;
    const [user] = await db.insert(usersTable).values({
      email,
      passwordHash,
      name,
      role,
      phone: phone || null,
      portalType,
      // [Task #132] 관리자/HQ가 직접 만든 계정은 역할 선택 화면을 거치지 않는다.
      roleSelected: true,
      ...(disabledForInsert !== undefined ? { disabledCategories: JSON.stringify(disabledForInsert) } : {}),
    }).returning();

    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      portalType: user.portalType,
      createdAt: user.createdAt,
      disabledCategories: parseDisabledCategories(user.disabledCategories),
      ...((!password) && { tempPassword: finalPassword }),
    });
  } catch {
    res.status(500).json({ error: "사용자 등록에 실패했습니다" });
  }
});

router.patch("/users/:id", requireRole("manager", "platform_admin", "hq_executive"), async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "유효하지 않은 ID입니다" });
      return;
    }

    const { name, role, phone, portalType, disabledCategories } = req.body;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    // [카테고리 메뉴 제어] 플랫폼 관리자만 disabledCategories 수정 가능.
    if (disabledCategories !== undefined) {
      if (req.user?.role !== "platform_admin") {
        res.status(403).json({ error: "카테고리 메뉴 설정은 플랫폼 관리자만 변경할 수 있습니다" });
        return;
      }
      const sanitized = sanitizeDisabledCategories(disabledCategories) ?? [];
      updateData.disabledCategories = JSON.stringify(sanitized);
    }
    if (role !== undefined) {
      if (!validRoles.includes(role)) {
        res.status(400).json({ error: "유효하지 않은 역할입니다" });
        return;
      }
      const actorRole = req.user?.role;
      const privilegedRoles = ["platform_admin", "hq_executive"];
      if (privilegedRoles.includes(role) && actorRole !== "platform_admin") {
        res.status(403).json({ error: "해당 역할로의 변경은 플랫폼 관리자만 가능합니다" });
        return;
      }
      updateData.role = role;
    }
    if (portalType !== undefined) {
      if (!validPortals.includes(portalType)) {
        res.status(400).json({ error: "유효하지 않은 포털 유형입니다" });
        return;
      }
      updateData.portalType = portalType;
    }
    if (phone !== undefined) updateData.phone = phone;

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ error: "수정할 항목이 없습니다" });
      return;
    }

    const [existing] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!existing) {
      res.status(404).json({ error: "사용자를 찾을 수 없습니다" });
      return;
    }
    const finalRole = (updateData.role as string) ?? existing.role;
    const finalPortal = (updateData.portalType as string) ?? existing.portalType;
    if (finalRole === "partner" && finalPortal !== "partner") {
      res.status(400).json({ error: "파트너사 역할은 파트너사 포털만 사용할 수 있습니다" });
      return;
    }
    if (finalPortal === "partner" && finalRole !== "partner") {
      res.status(400).json({ error: "파트너사 포털은 파트너사 역할만 가능합니다" });
      return;
    }
    if (finalPortal === "hq" && !["hq_executive", "platform_admin"].includes(finalRole)) {
      res.status(400).json({ error: "본사 포털은 총괄책임자 또는 플랫폼 관리자만 가능합니다" });
      return;
    }
    if (finalPortal === "building" && finalRole === "partner") {
      res.status(400).json({ error: "건물관리 포털에서 파트너사 역할은 사용할 수 없습니다" });
      return;
    }

    const [user] = await db
      .update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, id))
      .returning();

    if (!user) {
      res.status(404).json({ error: "사용자를 찾을 수 없습니다" });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      portalType: user.portalType,
      createdAt: user.createdAt,
      disabledCategories: parseDisabledCategories(user.disabledCategories),
    });
  } catch {
    res.status(500).json({ error: "사용자 수정에 실패했습니다" });
  }
});

router.delete("/users/:id", requireRole("platform_admin"), async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "유효하지 않은 ID입니다" });
      return;
    }

    const [user] = await db
      .delete(usersTable)
      .where(eq(usersTable.id, id))
      .returning();

    if (!user) {
      res.status(404).json({ error: "사용자를 찾을 수 없습니다" });
      return;
    }

    res.sendStatus(204);
  } catch {
    res.status(500).json({ error: "사용자 삭제에 실패했습니다" });
  }
});

export default router;
