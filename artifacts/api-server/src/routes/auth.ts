import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { signToken, authMiddleware } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const { email, password, name, role, phone, portalType } = req.body;

  if (!email || !password || !name || !role || !portalType) {
    res.status(400).json({ error: "필수 항목을 모두 입력해주세요" });
    return;
  }

  const selfRegistrableRoles = ["facility_staff", "vendor"];
  if (!selfRegistrableRoles.includes(role)) {
    res.status(400).json({ error: "자가 등록은 시설관리 담당자 또는 견적 업체만 가능합니다. 관리소장에게 문의해주세요." });
    return;
  }

  const validPortals = ["building", "vendor"];
  if (!validPortals.includes(portalType)) {
    res.status(400).json({ error: "유효하지 않은 포털 유형입니다" });
    return;
  }

  if (portalType === "vendor" && role !== "vendor") {
    res.status(400).json({ error: "가입업체 포털은 vendor 역할만 가능합니다" });
    return;
  }
  if (portalType === "building" && role === "vendor") {
    res.status(400).json({ error: "건물관리 포털에서 vendor 역할은 사용할 수 없습니다" });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(409).json({ error: "이미 등록된 이메일입니다" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(usersTable).values({
    email,
    passwordHash,
    name,
    role,
    phone: phone || null,
    portalType,
  }).returning();

  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    portalType: user.portalType,
  });

  res.status(201).json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      portalType: user.portalType,
    },
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const { email, password, portalType } = req.body;

  if (!email || !password || !portalType) {
    res.status(400).json({ error: "이메일, 비밀번호, 포털 유형을 입력해주세요" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다" });
    return;
  }

  if (user.portalType !== portalType) {
    res.status(401).json({ error: "해당 포털에서 로그인할 수 없는 계정입니다" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다" });
    return;
  }

  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    portalType: user.portalType,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      portalType: user.portalType,
    },
  });
});

router.get("/auth/me", authMiddleware, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
  if (!user) {
    res.status(404).json({ error: "사용자를 찾을 수 없습니다" });
    return;
  }

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone,
      portalType: user.portalType,
    },
  });
});

export default router;
