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
import { signToken, authMiddleware, approvalGateMiddleware } from "../middlewares/auth";
// [역할 라벨 SoT] 한국어 역할 라벨은 단일 소스에서 가져온다.
import { ROLE_LABELS } from "@workspace/shared/role-labels";
import {
  buildAuthorizeUrl,
  checkCallbackRateLimit,
  createPendingSignupToken,
  createStateAndCookie,
  exchangeCodeForToken,
  fetchProfile,
  getProviderConfig,
  getRedirectBaseUrl,
  isProviderEnabled,
  OAUTH_COOKIE_NAME,
  verifyPendingSignupToken,
  verifyStateWithCookie,
} from "../lib/oauth";

const COOKIE_OPTS = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 10 * 60 * 1000,
};

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
    res.status(400).json({ error: `${ROLE_LABELS.hq_executive} 포털은 소셜 로그인을 사용할 수 없습니다. 이메일·비밀번호로 로그인해 주세요.` });
    return;
  }

  const cfg = getProviderConfig(provider);
  const { state, cookie } = createStateAndCookie(
    { portalType: portalType as "building" | "partner", intent: "login" },
    cfg.supportsPkce,
  );
  res.cookie(OAUTH_COOKIE_NAME, JSON.stringify(cookie), COOKIE_OPTS);
  res.redirect(buildAuthorizeUrl(provider, state, cookie.pkceVerifier));
});

// Returns the authorize URL as JSON so the SPA (which sends a Bearer token via fetch)
// can then perform window.location.href = authorizeUrl. A 302 here would be useless
// because the browser navigation that follows wouldn't carry the Authorization header.
router.get("/auth/oauth/:provider/link/init", authMiddleware, approvalGateMiddleware, async (req, res): Promise<void> => {
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
    res.status(403).json({ error: `${ROLE_LABELS.hq_executive} 포털 계정은 소셜 계정을 연결할 수 없습니다` });
    return;
  }
  const cfg = getProviderConfig(provider);
  const { state, cookie } = createStateAndCookie(
    {
      portalType: req.user!.portalType as "building" | "partner",
      intent: "link",
      linkUserId: req.user!.userId,
    },
    cfg.supportsPkce,
  );
  res.cookie(OAUTH_COOKIE_NAME, JSON.stringify(cookie), COOKIE_OPTS);
  res.json({ authorizeUrl: buildAuthorizeUrl(provider, state, cookie.pkceVerifier) });
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
  let pkceVerifier: string | undefined;
  try {
    const verified = verifyStateWithCookie(stateParam, req.cookies?.[OAUTH_COOKIE_NAME]);
    state = verified.state;
    pkceVerifier = verified.pkceVerifier;
  } catch (err) {
    req.log?.warn?.({ err: (err as Error).message, provider }, "OAuth state verification failed");
    res.clearCookie(OAUTH_COOKIE_NAME, { path: "/" });
    res.redirect(frontendUrl(`/auth/callback#error=invalid_state`));
    return;
  }
  // One-shot: clear the CSRF cookie immediately so it cannot be replayed
  res.clearCookie(OAUTH_COOKIE_NAME, { path: "/" });

  let profile;
  try {
    const accessToken = await exchangeCodeForToken(provider, code, stateParam, pkceVerifier);
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
      }).onConflictDoNothing();
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
      // Hard policy: HQ portal accounts must never receive a JWT via social login,
      // even if a stale social link from before the policy still exists in DB.
      if (user.portalType === "hq") {
        res.redirect(frontendUrl(`/auth/callback#error=hq_not_allowed`));
        return;
      }
      if (user.portalType !== state.portalType) {
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
      }).onConflictDoNothing();
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
    emailVerified: profile.emailVerified,
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

  // [Task #133] Accept either decisions[] (preferred) or types[] (legacy).
  const consentVersionFromBody = (consents && typeof consents.version === "string") ? consents.version : "1.0";
  type Decision = { type: typeof platformConsentTypes[number]; agreed: boolean; version: string };
  const decisions: Decision[] = [];
  if (consents && Array.isArray(consents.decisions)) {
    for (const d of consents.decisions) {
      if (!d || typeof d !== "object") continue;
      const type = d.type;
      if (typeof type !== "string") continue;
      if (!platformConsentTypes.includes(type as typeof platformConsentTypes[number])) continue;
      decisions.push({
        type: type as typeof platformConsentTypes[number],
        agreed: d.agreed === true,
        version: typeof d.version === "string" && d.version ? d.version : consentVersionFromBody,
      });
    }
  } else if (consents && Array.isArray(consents.types)) {
    for (const t of consents.types) {
      if (typeof t !== "string") continue;
      if (!platformConsentTypes.includes(t as typeof platformConsentTypes[number])) continue;
      decisions.push({
        type: t as typeof platformConsentTypes[number],
        agreed: true,
        version: consentVersionFromBody,
      });
    }
  }

  const agreedTypes = new Set(decisions.filter((d) => d.agreed).map((d) => d.type));
  const missing = requiredConsentTypes.filter((t) => !agreedTypes.has(t as typeof platformConsentTypes[number]));
  if (missing.length > 0) {
    res.status(400).json({ error: "필수 약관에 모두 동의해 주세요", missingConsents: missing });
    return;
  }

  // Collision: an account with this email already exists.
  // We MUST NOT silently link & log the user in unless we can prove ownership of the email.
  // - pending.email + pending.emailVerified: the OAuth provider attested ownership → safe to link.
  // - Otherwise (user-typed fallback email or unverified provider email): refuse the link
  //   and require the user to log in normally first, then link from Settings.
  const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, finalEmail));
  if (existing) {
    const providerVerifiedThisEmail = !!(
      pending.email
      && pending.emailVerified
      && pending.email.trim().toLowerCase() === finalEmail
    );
    if (!providerVerifiedThisEmail) {
      res.status(409).json({
        error: "이미 가입된 이메일입니다. 이메일·비밀번호로 로그인한 뒤 [설정 > 소셜 계정]에서 연결해 주세요.",
        code: "email_collision_unverified",
      });
      return;
    }
    if (existing.portalType === "hq") {
      res.status(403).json({ error: `${ROLE_LABELS.hq_executive} 포털 계정에는 소셜 로그인을 연결할 수 없습니다` });
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
        // [Task #132] OAuth 가입은 가입 시점에 역할이 확정되므로 역할 선택 화면을 거치지 않는다.
        roleSelected: true,
      }).returning();

      await tx.insert(userSocialAccountsTable).values({
        userId: newUser.id,
        provider: pending.provider,
        providerUserId: pending.providerUserId,
        email: pending.email,
        displayName: pending.name,
      });

      // [Task #133] Persist all decisions including declines.
      if (decisions.length > 0) {
        await tx.insert(platformConsentsTable).values(
          decisions.map((d) => ({
            userId: newUser.id,
            consentType: d.type,
            version: d.version,
            status: d.agreed ? ("agreed" as const) : ("declined" as const),
            contextRef: `signup_${pending.provider}` as string | null,
            ipAddress,
            userAgent,
          }))
        );
      }

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
router.get("/auth/social-accounts", authMiddleware, approvalGateMiddleware, async (req, res): Promise<void> => {
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

router.delete("/auth/social-accounts/:provider", authMiddleware, approvalGateMiddleware, async (req, res): Promise<void> => {
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
