import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable, platformConsentsTable, platformConsentTypes, facilityStaffSignupRequestsTable, buildingsTable, userRoles, portalTypes } from "@workspace/db";
import { resolveTargetsAndNotify } from "./facilitySignupRequests";
import { signToken, authMiddleware } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  // [Task #132] 통합 가입: role/portalType은 옵션. 미지정 시 placeholder('manager'/'building')로 생성하고
  // role_selected=false 로 설정하여 /onboarding/role-select 에서 확정한다.
  const { email, password, name, phone, consents } = req.body;
  const requestedRole: string | undefined = req.body?.role;
  const requestedPortal: string | undefined = req.body?.portalType;

  if (!email || !password || !name) {
    res.status(400).json({ error: "필수 항목을 모두 입력해주세요" });
    return;
  }

  // [Task #137] 전화번호 필수화. 후속 응대(연체 안내·견적 회신 등) 연락 단절 방지.
  if (typeof phone !== "string" || phone.trim().length === 0) {
    res.status(400).json({ error: "전화번호를 입력해 주세요" });
    return;
  }

  const selfRegistrableRoles = ["manager", "accountant", "facility_staff", "partner"];
  const validPortals = ["building", "partner", "hq"];

  let role: string;
  let portalType: string;
  let roleSelected: boolean;
  if (!requestedRole) {
    // [Task #132] 통합 가입: 역할 미지정. 권한 노출을 막기 위해 facility_staff(가장 제한적)
    // placeholder + approvalStatus=pending 으로 생성. /onboarding/role-select 에서 확정한다.
    // 백엔드 approvalGateMiddleware가 roleSelected=false 도 함께 차단한다.
    role = "facility_staff";
    portalType = "building";
    roleSelected = false;
  } else {
    if (!selfRegistrableRoles.includes(requestedRole)) {
      res.status(400).json({ error: "자가 등록할 수 없는 역할입니다. 플랫폼 관리자에게 문의해주세요." });
      return;
    }
    role = requestedRole;
    portalType = requestedPortal ?? (role === "partner" ? "partner" : "building");
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
    roleSelected = true;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(409).json({ error: "이미 등록된 이메일입니다" });
    return;
  }

  const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null;
  const userAgent = req.headers["user-agent"] || null;
  const consentVersion = (consents && typeof consents === "object" && typeof consents.version === "string") ? consents.version : "1.0";

  // [Task #133] Two formats supported for backward compatibility:
  //   - decisions: [{type, agreed, version?}, ...]    ← preferred (records declines too)
  //   - types: ["intermediary_terms", ...]            ← legacy (agreed-only list)
  type Decision = { type: typeof platformConsentTypes[number]; agreed: boolean; version: string };
  const decisions: Decision[] = [];
  if (consents && typeof consents === "object" && Array.isArray((consents as { decisions?: unknown }).decisions)) {
    for (const d of (consents as { decisions: unknown[] }).decisions) {
      if (!d || typeof d !== "object") continue;
      const type = (d as { type?: unknown }).type;
      const agreed = (d as { agreed?: unknown }).agreed;
      const version = (d as { version?: unknown }).version;
      if (typeof type !== "string") continue;
      if (!platformConsentTypes.includes(type as typeof platformConsentTypes[number])) continue;
      decisions.push({
        type: type as typeof platformConsentTypes[number],
        agreed: agreed === true,
        version: typeof version === "string" && version ? version : consentVersion,
      });
    }
  } else if (consents && typeof consents === "object" && Array.isArray((consents as { types?: unknown }).types)) {
    for (const t of (consents as { types: unknown[] }).types) {
      if (typeof t !== "string") continue;
      if (!platformConsentTypes.includes(t as typeof platformConsentTypes[number])) continue;
      decisions.push({
        type: t as typeof platformConsentTypes[number],
        agreed: true,
        version: consentVersion,
      });
    }
  }

  const agreedTypes = new Set(decisions.filter((d) => d.agreed).map((d) => d.type));
  const requiredConsentTypes: string[] = ["intermediary_terms", "privacy_policy"];
  if (roleSelected && (role === "partner" || portalType === "partner")) {
    requiredConsentTypes.push("partner_terms");
  }
  const missingRequired = requiredConsentTypes.filter((t) => !agreedTypes.has(t as typeof platformConsentTypes[number]));
  if (missingRequired.length > 0) {
    res.status(400).json({ error: "필수 약관에 모두 동의해 주세요", missingConsents: missingRequired });
    return;
  }

  // [Task #132] 시설기사 placeholder 가입은 active. 역할 선택 시 pending 으로 전환.
  const initialApprovalStatus = roleSelected && role === "facility_staff" ? "pending" : "active";

  const passwordHash = await bcrypt.hash(password, 10);
  let user;
  try {
    const result = await db.transaction(async (tx) => {
      const [createdUser] = await tx.insert(usersTable).values({
        email,
        passwordHash,
        name,
        role: role as typeof userRoles[number],
        phone: phone.trim(),
        portalType: portalType as typeof portalTypes[number],
        approvalStatus: initialApprovalStatus,
        roleSelected,
      }).returning();

      // [Task #133] Persist all decisions including declines so we have the full
      // consent history per user/version.
      if (decisions.length > 0) {
        await tx.insert(platformConsentsTable).values(
          decisions.map((d) => ({
            userId: createdUser.id,
            consentType: d.type,
            version: d.version,
            status: d.agreed ? ("agreed" as const) : ("declined" as const),
            contextRef: "signup" as string | null,
            ipAddress,
            userAgent,
          }))
        );
      }

      // [Task #132] 역할이 가입 시점에 확정된 경우에만 시설기사 신청 레코드 생성.
      let createdSignupRequestId: number | null = null;
      if (roleSelected && role === "facility_staff") {
        const requestedAddress: string = (req.body?.facilityRequest?.address ?? "").trim();
        const sido: string | null = req.body?.facilityRequest?.sido ?? null;
        const sigungu: string | null = req.body?.facilityRequest?.sigungu ?? null;
        const [reqRow] = await tx.insert(facilityStaffSignupRequestsTable).values({
          userId: createdUser.id,
          requestedAddress: requestedAddress || "(주소 미지정)",
          sido,
          sigungu,
          status: "pending",
        }).returning();
        createdSignupRequestId = reqRow?.id ?? null;
      }

      return { user: createdUser, signupRequestId: createdSignupRequestId };
    });
    user = result.user;
    if (result.signupRequestId) {
      try { await resolveTargetsAndNotify(result.signupRequestId); }
      catch (e) { req.log?.warn?.({ err: e }, "Failed to resolve facility signup targets"); }
    }
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
      roleSelected: user.roleSelected,
      approvalStatus: user.approvalStatus,
    },
  });
});

// [Task #132] 가입 직후 역할 선택. role_selected=false 인 사용자만 호출 가능.
router.post("/auth/select-role", authMiddleware, async (req, res): Promise<void> => {
  const userId = req.user!.userId;
  const { role: selectedRole, facilityRequest } = req.body ?? {};
  const allowed = ["manager", "accountant", "facility_staff", "partner"];
  if (!allowed.includes(selectedRole)) {
    res.status(400).json({ error: "유효하지 않은 역할입니다" });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "사용자를 찾을 수 없습니다" });
    return;
  }
  if (user.roleSelected) {
    res.status(409).json({ error: "이미 역할이 확정된 계정입니다" });
    return;
  }

  const newPortalType: "building" | "partner" = selectedRole === "partner" ? "partner" : "building";
  const newApprovalStatus = selectedRole === "facility_staff" ? "pending" : "active";

  try {
    const updated = await db.transaction(async (tx) => {
      const [u] = await tx.update(usersTable).set({
        role: selectedRole,
        portalType: newPortalType,
        approvalStatus: newApprovalStatus,
        roleSelected: true,
      }).where(eq(usersTable.id, userId)).returning();

      let createdSignupRequestId: number | null = null;
      if (selectedRole === "facility_staff") {
        const requestedAddress: string = (facilityRequest?.address ?? "").trim();
        const sido: string | null = facilityRequest?.sido ?? null;
        const sigungu: string | null = facilityRequest?.sigungu ?? null;
        const [reqRow] = await tx.insert(facilityStaffSignupRequestsTable).values({
          userId: u.id,
          requestedAddress: requestedAddress || "(주소 미지정)",
          sido,
          sigungu,
          status: "pending",
        }).returning();
        createdSignupRequestId = reqRow?.id ?? null;
      }
      return { user: u, signupRequestId: createdSignupRequestId };
    });
    const updatedUser = updated.user;
    if (updated.signupRequestId) {
      try { await resolveTargetsAndNotify(updated.signupRequestId); }
      catch (e) { req.log?.warn?.({ err: e }, "Failed to resolve facility signup targets (select-role)"); }
    }

    const newToken = signToken({
      userId: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role,
      portalType: updatedUser.portalType,
    });

    res.json({
      token: newToken,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        phone: updatedUser.phone,
        vendorId: updatedUser.vendorId,
        portalType: updatedUser.portalType,
        roleSelected: updatedUser.roleSelected,
        approvalStatus: updatedUser.approvalStatus,
      },
    });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to select role");
    res.status(500).json({ error: "역할 설정 중 오류가 발생했습니다" });
  }
});

router.post("/auth/login", async (req, res): Promise<void> => {
  // [Task #132] 통합 로그인: portalType 미지정 허용. 지정 시 hq 포털만 별도 검증.
  const { email, password, portalType } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: "이메일과 비밀번호를 입력해주세요" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(401).json({ error: "이메일 또는 비밀번호가 올바르지 않습니다" });
    return;
  }

  if (portalType) {
    // 명시적 portalType이 들어오면 검증. 통합 로그인(/login)에서는 portalType을 보내지 않음.
    const portalMatch = user.portalType === portalType
      || (portalType === "building" && ["building", "hq"].includes(user.portalType))
      || (portalType === "hq" && ["hq", "building"].includes(user.portalType) && ["hq_executive", "platform_admin"].includes(user.role));
    if (!portalMatch) {
      res.status(401).json({ error: "해당 포털에서 로그인할 수 없는 계정입니다" });
      return;
    }
  }

  if (!user.passwordHash) {
    res.status(401).json({ error: "이 계정은 소셜 로그인으로 가입되었습니다. 소셜 로그인 버튼을 사용하거나 비밀번호를 먼저 설정해 주세요." });
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
      roleSelected: user.roleSelected,
      approvalStatus: user.approvalStatus,
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
      approvalStatus: user.approvalStatus,
      roleSelected: user.roleSelected,
      hasPassword: !!user.passwordHash,
      // [카테고리 메뉴 제어] 프론트엔드(layout.tsx)가 사이드바·하단 네비를 가릴 때 사용.
      disabledCategories: parseDisabledCategories(user.disabledCategories),
    },
  });
});

// [카테고리 메뉴 제어] DB에는 JSON 문자열로 보관. 파싱 실패 시 빈 배열.
function parseDisabledCategories(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

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

  if (!newPassword) {
    res.status(400).json({ error: "새 비밀번호를 입력해주세요" });
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

    // Social-only users (no existing password) can set an initial password without currentPassword.
    // Users with an existing password must provide and prove the current one.
    if (user.passwordHash) {
      if (!currentPassword) {
        res.status(400).json({ error: "현재 비밀번호를 입력해주세요" });
        return;
      }
      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        res.status(400).json({ error: "현재 비밀번호가 일치하지 않습니다" });
        return;
      }
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.update(usersTable).set({ passwordHash: hashed }).where(eq(usersTable.id, userId));

    res.json({ message: "비밀번호가 변경되었습니다" });
  } catch {
    res.status(500).json({ error: "비밀번호 변경에 실패했습니다" });
  }
});

export default router;
