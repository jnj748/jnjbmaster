import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  usersTable,
  userSocialAccountsTable,
  platformConsentsTable,
  platformConsentTypes,
  socialProviders,
  type SocialProvider,
} from "@workspace/db";
import { signToken, authMiddleware } from "../middlewares/auth";
import {
  buildAuthorizeUrl,
  checkCallbackRateLimit,
  createPendingSignupToken,
  createState,
  exchangeCodeForToken,
  fetchProfile,
  getRedirectBaseUrl,
  isProviderEnabled,
  verifyPendingSignupToken,
  verifyState,
} from "../lib/oauth";

const router: IRouter = Router();

function isSocialProvider(s: string): s is SocialProvider {
  return (socialProviders as readonly string[]).includes(s);
}

function frontendUrl(path: string): string {
  return `${getRedirectBaseUrl()}${path}`;
}

router.get("/auth/oauth/providers", (_req, res): void => {
  res.json({
    providers: socialProviders.map((p) => ({ provider: p, enabled: isProviderEnabled(p) })),
  });
});

router.get("/auth/oauth/:provider/init", async (req, res): Promise<void> => {
  const provider = req.params.provider;
  const portalType = String(req.query.portalType || "");

  if (!isSocialProvider(provider)) {
    res.status(400).json({ error: "지원하지 않는 공급자입니다" });
    return;
  }
  if (!isProviderEnabled(provider)) {
    res.status(503).json({ error: `${provider} 로그인이 구성되지 않았습니다` });
    return;
  }
  if (!["building", "partner"].includes(portalType)) {
    res.status(400).json({ error: "본사 포털은 소셜 로그인을 사용할 수 없습니다. 이메일·비밀번호로 로그인해 주세요." });
    return;
  }

  const state = createState({ portalType: portalType as "building" | "partner", intent: "login" });
  res.redirect(buildAuthorizeUrl(provider, state));
});

// Returns the authorize URL as JSON so the SPA (which sends a Bearer token via fetch)
// can then perform window.location.href = authorizeUrl. A 302 here would be useless
// because the browser navigation that follows wouldn't carry the Authorization header.
router.get("/auth/oauth/:provider/link/init", authMiddleware, async (req, res): Promise<void> => {
  const provider = String(req.params.provider);
  if (!isSocialProvider(provider)) {
    res.status(400).json({ error: "지원하지 않는 공급자입니다" });
    return;
  }
  if (!isProviderEnabled(provider)) {
    res.status(503).json({ error: `${provider} 로그인이 구성되지 않았습니다` });
    return;
  }
  if (req.user!.portalType === "hq") {
    res.status(403).json({ error: "본사 포털 계정은 소셜 계정을 연결할 수 없습니다" });
    return;
  }
  const state = createState({
    portalType: req.user!.portalType as "building" | "partner",
    intent: "link",
    linkUserId: req.user!.userId,
  });
  res.json({ authorizeUrl: buildAuthorizeUrl(provider, state) });
});

router.get("/auth/oauth/:provider/callback", async (req, res): Promise<void> => {
  const provider = req.params.provider;
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";

  if (!checkCallbackRateLimit(ip)) {
    res.redirect(frontendUrl(`/auth/callback#error=${encodeURIComponent("rate_limit")}`));
    return;
  }
  if (!isSocialProvider(provider)) {
    res.redirect(frontendUrl(`/auth/callback#error=${encodeURIComponent("invalid_provider")}`));
    return;
  }

  const code = String(req.query.code || "");
  const stateParam = String(req.query.state || "");

  if (req.query.error) {
    res.redirect(frontendUrl(`/auth/callback#error=${encodeURIComponent(String(req.query.error))}`));
    return;
  }
  if (!code || !stateParam) {
    res.redirect(frontendUrl(`/auth/callback#error=missing_params`));
    return;
  }

  let state;
  try {
    state = verifyState(stateParam);
  } catch {
    res.redirect(frontendUrl(`/auth/callback#error=invalid_state`));
    return;
  }

  let profile;
  try {
    const accessToken = await exchangeCodeForToken(provider, code, stateParam);
    profile = await fetchProfile(provider, accessToken);
  } catch (err) {
    req.log?.error?.({ err, provider }, "OAuth exchange failed");
    res.redirect(frontendUrl(`/auth/callback#error=oauth_failed`));
    return;
  }

  // === Branch 0: link intent (signed-in user adds a social account) ===
  if (state.intent === "link" && state.linkUserId) {
    const [existing] = await db
      .select()
      .from(userSocialAccountsTable)
      .where(and(eq(userSocialAccountsTable.provider, provider), eq(userSocialAccountsTable.providerUserId, profile.providerUserId)));
    if (existing && existing.userId !== state.linkUserId) {
      res.redirect(frontendUrl(`/settings#error=already_linked_to_other_account`));
      return;
    }
    if (!existing) {
      await db.insert(userSocialAccountsTable).values({
        userId: state.linkUserId,
        provider,
        providerUserId: profile.providerUserId,
        email: profile.email,
        displayName: profile.name,
      });
    }
    res.redirect(frontendUrl(`/settings#linked=${provider}`));
    return;
  }

  if (state.portalType === "hq") {
    res.redirect(frontendUrl(`/auth/callback#error=hq_not_allowed`));
    return;
  }

  // === Branch 1: existing social-account user → instant login ===
  const [existingSocial] = await db
    .select()
    .from(userSocialAccountsTable)
    .where(and(eq(userSocialAccountsTable.provider, provider), eq(userSocialAccountsTable.providerUserId, profile.providerUserId)));

  if (existingSocial) {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, existingSocial.userId));
    if (user) {
      const portalMatch = user.portalType === state.portalType
        || (state.portalType === "building" && ["building", "hq"].includes(user.portalType));
      if (!portalMatch) {
        res.redirect(frontendUrl(`/auth/callback#error=portal_mismatch`));
        return;
      }
      const token = signToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        portalType: user.portalType,
      });
      res.redirect(frontendUrl(`/auth/callback#token=${encodeURIComponent(token)}`));
      return;
    }
  }

  // === Branch 2: existing email account → auto-link (only if provider verified the email) ===
  // If the provider didn't verify the email (e.g. Naver, or Google without email_verified),
  // we must NOT silently take over an existing local account — fall through to the pending
  // signup path, where the user must explicitly authenticate (collision check happens there).
  if (profile.email && profile.emailVerified) {
    const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.email, profile.email));
    if (existingUser) {
      // Refuse silent link to HQ admin accounts via social
      if (existingUser.portalType === "hq") {
        res.redirect(frontendUrl(`/auth/callback#error=hq_not_allowed`));
        return;
      }
      const portalMatch = existingUser.portalType === state.portalType
        || (state.portalType === "building" && existingUser.portalType === "building");
      if (!portalMatch) {
        res.redirect(frontendUrl(`/auth/callback#error=portal_mismatch`));
        return;
      }
      await db.insert(userSocialAccountsTable).values({
        userId: existingUser.id,
        provider,
        providerUserId: profile.providerUserId,
        email: profile.email,
        displayName: profile.name,
      });
      const token = signToken({
        userId: existingUser.id,
        email: existingUser.email,
        role: existingUser.role,
        portalType: existingUser.portalType,
      });
      res.redirect(frontendUrl(`/auth/callback#token=${encodeURIComponent(token)}&linked=${provider}`));
      return;
    }
  }

  // === Branch 3: new user → pending signup token, frontend collects consents (and email if missing) ===
  const pendingToken = createPendingSignupToken({
    provider,
    providerUserId: profile.providerUserId,
    email: profile.email,
    name: profile.name,
    portalType: state.portalType as "building" | "partner",
  });
  res.redirect(frontendUrl(`/auth/social-signup#pending=${encodeURIComponent(pendingToken)}`));
});

router.post("/auth/oauth/complete-signup", async (req, res): Promise<void> => {
  const { pendingToken, email, name, phone, consents } = req.body || {};
  if (!pendingToken) {
    res.status(400).json({ error: "유효하지 않은 요청입니다" });
    return;
  }

  let pending;
  try {
    pending = verifyPendingSignupToken(pendingToken);
  } catch {
    res.status(400).json({ error: "가입 세션이 만료되었습니다. 다시 시도해 주세요." });
    return;
  }

  const finalEmail = (pending.email || email || "").trim().toLowerCase();
  const finalName = (pending.name || name || "").trim();
  if (!finalEmail) {
    res.status(400).json({ error: "이메일을 입력해 주세요" });
    return;
  }
  if (!finalName) {
    res.status(400).json({ error: "이름을 입력해 주세요" });
    return;
  }

  const role = pending.portalType === "partner" ? "partner" : "manager";
  const requiredConsentTypes = ["intermediary_terms", "privacy_policy"];
  if (role === "partner") requiredConsentTypes.push("partner_terms");

  const requestedTypes: string[] = Array.isArray(consents?.types) ? consents.types : [];
  const validTypes = requestedTypes.filter((t): t is typeof platformConsentTypes[number] =>
    platformConsentTypes.includes(t as typeof platformConsentTypes[number])
  );
  const missing = requiredConsentTypes.filter((t) => !validTypes.includes(t as typeof platformConsentTypes[number]));
  if (missing.length > 0) {
    res.status(400).json({ error: "필수 약관에 모두 동의해 주세요", missingConsents: missing });
    return;
  }

  // Block duplicate email collisions
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, finalEmail));
  if (existing) {
    // existing email → just link to that account
    if (existing.portalType === "hq") {
      res.status(403).json({ error: "본사 포털 계정에는 소셜 로그인을 연결할 수 없습니다" });
      return;
    }
    if (existing.portalType !== pending.portalType) {
      res.status(409).json({ error: "이 이메일은 다른 포털에 이미 가입되어 있습니다" });
      return;
    }
    await db.insert(userSocialAccountsTable).values({
      userId: existing.id,
      provider: pending.provider,
      providerUserId: pending.providerUserId,
      email: pending.email,
      displayName: pending.name,
    }).onConflictDoNothing();
    const token = signToken({
      userId: existing.id,
      email: existing.email,
      role: existing.role,
      portalType: existing.portalType,
    });
    res.json({
      token,
      linked: true,
      user: {
        id: existing.id, email: existing.email, name: existing.name, role: existing.role,
        phone: existing.phone, portalType: existing.portalType,
      },
    });
    return;
  }

  const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || null;
  const userAgent = req.headers["user-agent"] || null;
  const consentVersion = (consents && typeof consents.version === "string") ? consents.version : "1.0";

  let createdUser;
  try {
    createdUser = await db.transaction(async (tx) => {
      const [newUser] = await tx.insert(usersTable).values({
        email: finalEmail,
        passwordHash: null,
        name: finalName,
        role,
        phone: phone?.trim() || null,
        portalType: pending.portalType,
      }).returning();

      await tx.insert(userSocialAccountsTable).values({
        userId: newUser.id,
        provider: pending.provider,
        providerUserId: pending.providerUserId,
        email: pending.email,
        displayName: pending.name,
      });

      await tx.insert(platformConsentsTable).values(
        validTypes.map((consentType) => ({
          userId: newUser.id,
          consentType,
          version: consentVersion,
          contextRef: `signup_${pending.provider}` as string | null,
          ipAddress,
          userAgent,
        }))
      );

      return newUser;
    });
  } catch (err) {
    req.log?.error?.({ err }, "Social signup failed");
    res.status(500).json({ error: "회원가입 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요." });
    return;
  }

  const token = signToken({
    userId: createdUser.id,
    email: createdUser.email,
    role: createdUser.role,
    portalType: createdUser.portalType,
  });

  res.status(201).json({
    token,
    linked: false,
    user: {
      id: createdUser.id,
      email: createdUser.email,
      name: createdUser.name,
      role: createdUser.role,
      phone: createdUser.phone,
      portalType: createdUser.portalType,
    },
  });
});

// Authenticated: list and unlink social accounts
router.get("/auth/social-accounts", authMiddleware, async (req, res): Promise<void> => {
  const rows = await db
    .select({
      provider: userSocialAccountsTable.provider,
      email: userSocialAccountsTable.email,
      displayName: userSocialAccountsTable.displayName,
      connectedAt: userSocialAccountsTable.connectedAt,
    })
    .from(userSocialAccountsTable)
    .where(eq(userSocialAccountsTable.userId, req.user!.userId));
  res.json({ accounts: rows });
});

router.delete("/auth/social-accounts/:provider", authMiddleware, async (req, res): Promise<void> => {
  const provider = String(req.params.provider);
  if (!isSocialProvider(provider)) {
    res.status(400).json({ error: "지원하지 않는 공급자입니다" });
    return;
  }

  const userId = req.user!.userId;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ error: "사용자를 찾을 수 없습니다" });
    return;
  }
  const accounts = await db.select().from(userSocialAccountsTable).where(eq(userSocialAccountsTable.userId, userId));
  const target = accounts.find((a) => a.provider === provider);
  if (!target) {
    res.status(404).json({ error: "연결된 계정을 찾을 수 없습니다" });
    return;
  }
  // If user has no password and this is the last social account, block
  if (!user.passwordHash && accounts.length <= 1) {
    res.status(400).json({ error: "마지막 소셜 계정을 해제하려면 먼저 비밀번호를 설정해 주세요" });
    return;
  }

  await db.delete(userSocialAccountsTable).where(and(
    eq(userSocialAccountsTable.userId, userId),
    eq(userSocialAccountsTable.provider, provider),
  ));
  res.json({ ok: true });
});

export default router;
