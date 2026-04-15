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

router.get("/users", requireRole("manager", "platform_admin", "hq_executive"), async (_req, res): Promise<void> => {
  try {
    const users = await db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        role: usersTable.role,
        phone: usersTable.phone,
        portalType: usersTable.portalType,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .orderBy(usersTable.createdAt);

    res.json(users);
  } catch {
    res.status(500).json({ error: "사용자 목록을 불러올 수 없습니다" });
  }
});

router.post("/users", requireRole("manager", "platform_admin", "hq_executive"), async (req, res): Promise<void> => {
  try {
    const { email, password, name, role, phone, portalType } = req.body;

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
    const [user] = await db.insert(usersTable).values({
      email,
      passwordHash,
      name,
      role,
      phone: phone || null,
      portalType,
    }).returning();

    res.status(201).json({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      portalType: user.portalType,
      createdAt: user.createdAt,
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

    const { name, role, phone, portalType } = req.body;
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
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
