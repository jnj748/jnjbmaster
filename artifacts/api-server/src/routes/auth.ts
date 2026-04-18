import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable, platformConsentsTable, platformConsentTypes } from "@workspace/db";
import { signToken, authMiddleware } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const { email, password, name, role, phone, portalType, consents } = req.body;

  if (!email || !password || !name || !role || !portalType) {
    res.status(400).json({ error: "필수 항목을 모두 입력해주세요" });
    return;
  }

  const selfRegistrableRoles = ["manager", "partner"];
  if (!selfRegistrableRoles.includes(role)) {
    res.status(400).json({ error: "자가 등록은 관리소장 또는 파트너사만 가능합니다. 플랫폼 관리자에게 문의해주세요." });
    return;
  }

  const validPortals = ["building", "partner", "hq"];
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

  const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null;
  const userAgent = req.headers["user-agent"] || null;
  const consentVersion = (consents && typeof consents === "object" && typeof consents.version === "string") ? consents.version : "1.0";
  const requestedConsentTypes: string[] = (consents && typeof consents === "object" && Array.isArray(consents.types)) ? consents.types : [];
  const validConsentTypes = requestedConsentTypes.filter((t): t is typeof platformConsentTypes[number] =>
    platformConsentTypes.includes(t as typeof platformConsentTypes[number])
  );

  const requiredConsentTypes: string[] = ["intermediary_terms", "privacy_policy"];
  if (role === "partner" || portalType === "partner") {
    requiredConsentTypes.push("partner_terms");
  }
  const missingRequired = requiredConsentTypes.filter((t) => !validConsentTypes.includes(t as typeof platformConsentTypes[number]));
  if (missingRequired.length > 0) {
    res.status(400).json({ error: "필수 약관에 모두 동의해 주세요", missingConsents: missingRequired });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  let user;
  try {
    user = await db.transaction(async (tx) => {
      const [createdUser] = await tx.insert(usersTable).values({
        email,
        passwordHash,
        name,
        role,
        phone: phone || null,
        portalType,
      }).returning();

      await tx.insert(platformConsentsTable).values(
        validConsentTypes.map((consentType) => ({
          userId: createdUser.id,
          consentType,
          version: consentVersion,
          contextRef: "signup" as string | null,
          ipAddress,
          userAgent,
        }))
      );

      return createdUser;
    });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to create user with consents");
    res.status(500).json({ error: "회원가입 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." });
    return;
  }

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
      vendorId: user.vendorId,
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

  const portalMatch = user.portalType === portalType
    || (portalType === "building" && ["building", "hq"].includes(user.portalType))
    || (portalType === "hq" && ["hq", "building"].includes(user.portalType) && ["hq_executive", "platform_admin"].includes(user.role));
  if (!portalMatch) {
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
      vendorId: user.vendorId,
      portalType: user.portalType,
      buildingSido: user.buildingSido,
      buildingSigungu: user.buildingSigungu,
    },
  });
});

router.post("/auth/auto-login", async (_req, res): Promise<void> => {
  const AUTO_EMAIL = "auto@manager.local";
  let [user] = await db.select().from(usersTable).where(eq(usersTable.email, AUTO_EMAIL));

  if (!user) {
    const passwordHash = await bcrypt.hash("auto-login-no-password", 10);
    [user] = await db.insert(usersTable).values({
      email: AUTO_EMAIL,
      passwordHash,
      name: "관리소장",
      role: "manager",
      portalType: "building",
    }).returning();
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
      vendorId: user.vendorId,
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
      vendorId: user.vendorId,
      portalType: user.portalType,
      buildingSido: user.buildingSido,
      buildingSigungu: user.buildingSigungu,
      onboardingPreference: user.onboardingPreference,
    },
  });
});

router.put("/auth/me", authMiddleware, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const { name, phone } = req.body;

  if (!name || !name.trim()) {
    res.status(400).json({ error: "이름을 입력해주세요" });
    return;
  }

  try {
    const [updated] = await db
      .update(usersTable)
      .set({ name: name.trim(), phone: phone?.trim() || null })
      .where(eq(usersTable.id, userId))
      .returning();

    res.json({
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        phone: updated.phone,
      },
    });
  } catch {
    res.status(500).json({ error: "정보 수정에 실패했습니다" });
  }
});

router.put("/auth/me/password", authMiddleware, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "현재 비밀번호와 새 비밀번호를 입력해주세요" });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({ error: "새 비밀번호는 8자 이상이어야 합니다" });
    return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) {
      res.status(404).json({ error: "사용자를 찾을 수 없습니다" });
      return;
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      res.status(400).json({ error: "현재 비밀번호가 일치하지 않습니다" });
      return;
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.update(usersTable).set({ passwordHash: hashed }).where(eq(usersTable.id, userId));

    res.json({ message: "비밀번호가 변경되었습니다" });
  } catch {
    res.status(500).json({ error: "비밀번호 변경에 실패했습니다" });
  }
});

export default router;
