import crypto from "crypto";
import jwt from "jsonwebtoken";

const STATE_SECRET = process.env.JWT_SECRET || "dev-jwt-secret-change-in-production";

export const SOCIAL_PROVIDERS = ["naver", "kakao", "google"] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

export interface ProviderProfile {
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

interface ProviderConfig {
  clientId: string | undefined;
  clientSecret: string | undefined;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  buildProfileRequest: (accessToken: string) => { url: string; init?: RequestInit };
  parseProfile: (raw: unknown) => ProviderProfile;
  /** Some providers require sending client credentials in the token request body. */
  tokenAuthMethod: "basic" | "body";
  extraAuthorizeParams?: Record<string, string>;
  /** Whether this provider supports PKCE (RFC 7636). Naver currently does not document support. */
  supportsPkce: boolean;
}

export function getProviderConfig(provider: SocialProvider): ProviderConfig {
  switch (provider) {
    case "naver":
      return {
        clientId: process.env.NAVER_CLIENT_ID,
        clientSecret: process.env.NAVER_CLIENT_SECRET,
        authorizeUrl: "https://nid.naver.com/oauth2.0/authorize",
        tokenUrl: "https://nid.naver.com/oauth2.0/token",
        scope: "",
        tokenAuthMethod: "body",
        supportsPkce: false,
        buildProfileRequest: (token) => ({
          url: "https://openapi.naver.com/v1/nid/me",
          init: { headers: { Authorization: `Bearer ${token}` } },
        }),
        parseProfile: (raw) => {
          const r = raw as { response?: { id?: string; email?: string; name?: string; nickname?: string } };
          const r2 = r.response || {};
          if (!r2.id) throw new Error("네이버 프로필 ID를 찾을 수 없습니다");
          return {
            providerUserId: String(r2.id),
            email: r2.email || null,
            // Naver does not expose an email-verified flag; treat as unverified
            // so silent auto-link by email is not allowed.
            emailVerified: false,
            name: r2.name || r2.nickname || null,
          };
        },
      };
    case "kakao":
      return {
        clientId: process.env.KAKAO_REST_API_KEY,
        clientSecret: process.env.KAKAO_CLIENT_SECRET,
        authorizeUrl: "https://kauth.kakao.com/oauth/authorize",
        tokenUrl: "https://kauth.kakao.com/oauth/token",
        scope: "account_email profile_nickname",
        tokenAuthMethod: "body",
        supportsPkce: true,
        buildProfileRequest: (token) => ({
          url: "https://kapi.kakao.com/v2/user/me",
          init: { headers: { Authorization: `Bearer ${token}` } },
        }),
        parseProfile: (raw) => {
          const r = raw as {
            id?: number | string;
            kakao_account?: {
              email?: string;
              is_email_verified?: boolean;
              is_email_valid?: boolean;
              profile?: { nickname?: string };
            };
          };
          if (!r.id) throw new Error("카카오 프로필 ID를 찾을 수 없습니다");
          const ka = r.kakao_account;
          return {
            providerUserId: String(r.id),
            email: ka?.email || null,
            emailVerified: !!(ka?.email && ka.is_email_verified === true && ka.is_email_valid !== false),
            name: ka?.profile?.nickname || null,
          };
        },
      };
    case "google":
      return {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        scope: "openid email profile",
        tokenAuthMethod: "body",
        supportsPkce: true,
        extraAuthorizeParams: { access_type: "online", prompt: "select_account" },
        buildProfileRequest: (token) => ({
          url: "https://openidconnect.googleapis.com/v1/userinfo",
          init: { headers: { Authorization: `Bearer ${token}` } },
        }),
        parseProfile: (raw) => {
          const r = raw as { sub?: string; email?: string; email_verified?: boolean; name?: string };
          if (!r.sub) throw new Error("Google 프로필 ID를 찾을 수 없습니다");
          return {
            providerUserId: String(r.sub),
            email: r.email || null,
            emailVerified: !!(r.email && r.email_verified === true),
            name: r.name || null,
          };
        },
      };
  }
}

export function isProviderEnabled(provider: SocialProvider): boolean {
  const cfg = getProviderConfig(provider);
  return !!cfg.clientId && !!cfg.clientSecret;
}

export function getRedirectBaseUrl(): string {
  if (process.env.OAUTH_REDIRECT_BASE_URL) {
    return process.env.OAUTH_REDIRECT_BASE_URL.replace(/\/+$/, "");
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  if (process.env.REPLIT_DOMAINS) {
    const first = process.env.REPLIT_DOMAINS.split(",")[0]?.trim();
    if (first) return `https://${first}`;
  }
  return "http://localhost:5000";
}

export function getCallbackUrl(provider: SocialProvider): string {
  return `${getRedirectBaseUrl()}/api/auth/oauth/${provider}/callback`;
}

export interface OAuthStatePayload {
  /** Hash of the secret nonce stored in the httpOnly cookie. CSRF binding. */
  nonceHash: string;
  portalType: "building" | "partner" | "hq";
  intent: "login" | "link";
  linkUserId?: number;
  /** SHA-256(verifier) when PKCE is enabled; verifier itself lives only in the cookie. */
  pkceChallenge?: string;
  exp: number;
}

export interface OAuthCookiePayload {
  nonce: string;
  pkceVerifier?: string;
}

export const OAUTH_COOKIE_NAME = "oauth_csrf";

function sha256base64url(input: string): string {
  return crypto.createHash("sha256").update(input).digest("base64url");
}

/** Generates the secret cookie payload + the corresponding signed state JWT. */
export function createStateAndCookie(
  payload: Omit<OAuthStatePayload, "nonceHash" | "pkceChallenge" | "exp">,
  withPkce: boolean,
): { state: string; cookie: OAuthCookiePayload } {
  const nonce = crypto.randomBytes(24).toString("base64url");
  const pkceVerifier = withPkce ? crypto.randomBytes(32).toString("base64url") : undefined;
  const fullPayload: OAuthStatePayload = {
    ...payload,
    nonceHash: sha256base64url(nonce),
    pkceChallenge: pkceVerifier ? sha256base64url(pkceVerifier) : undefined,
    exp: Math.floor(Date.now() / 1000) + 600,
  };
  return {
    state: jwt.sign(fullPayload, STATE_SECRET),
    cookie: { nonce, pkceVerifier },
  };
}

/**
 * Verifies the state JWT and binds it to the cookie payload (defends CSRF).
 * Throws on signature/expiry/cookie-mismatch failures.
 */
export function verifyStateWithCookie(state: string, cookieRaw: string | undefined): {
  state: OAuthStatePayload;
  pkceVerifier?: string;
} {
  const decoded = jwt.verify(state, STATE_SECRET) as OAuthStatePayload;
  if (!cookieRaw) throw new Error("missing_cookie");
  let cookie: OAuthCookiePayload;
  try {
    cookie = JSON.parse(cookieRaw) as OAuthCookiePayload;
  } catch {
    throw new Error("bad_cookie");
  }
  if (!cookie.nonce || sha256base64url(cookie.nonce) !== decoded.nonceHash) {
    throw new Error("nonce_mismatch");
  }
  if (decoded.pkceChallenge) {
    if (!cookie.pkceVerifier || sha256base64url(cookie.pkceVerifier) !== decoded.pkceChallenge) {
      throw new Error("pkce_mismatch");
    }
  }
  return { state: decoded, pkceVerifier: cookie.pkceVerifier };
}

export interface PendingSignupPayload {
  provider: SocialProvider;
  providerUserId: string;
  email: string | null;
  /** Whether the OAuth provider attested ownership of `email`. Required for email-based auto-link. */
  emailVerified: boolean;
  name: string | null;
  portalType: "building" | "partner";
  exp: number;
}

export function createPendingSignupToken(payload: Omit<PendingSignupPayload, "exp">): string {
  const full: PendingSignupPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + 1800,
  };
  return jwt.sign(full, STATE_SECRET);
}

export function verifyPendingSignupToken(token: string): PendingSignupPayload {
  return jwt.verify(token, STATE_SECRET) as PendingSignupPayload;
}

export async function exchangeCodeForToken(
  provider: SocialProvider,
  code: string,
  state: string,
  pkceVerifier?: string,
): Promise<string> {
  const cfg = getProviderConfig(provider);
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new Error(`${provider} OAuth가 구성되지 않았습니다`);
  }

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getCallbackUrl(provider),
  });
  // Naver requires state in token request
  if (provider === "naver") params.set("state", state);
  if (cfg.supportsPkce && pkceVerifier) params.set("code_verifier", pkceVerifier);

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };

  if (cfg.tokenAuthMethod === "basic") {
    const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
    headers.Authorization = `Basic ${basic}`;
  } else {
    params.set("client_id", cfg.clientId);
    params.set("client_secret", cfg.clientSecret);
  }

  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers,
    body: params.toString(),
  });
  const body = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`토큰 교환 실패: ${body.error_description || body.error || res.status}`);
  }
  return body.access_token;
}

export async function fetchProfile(
  provider: SocialProvider,
  accessToken: string,
): Promise<ProviderProfile> {
  const cfg = getProviderConfig(provider);
  const req = cfg.buildProfileRequest(accessToken);
  const res = await fetch(req.url, req.init);
  if (!res.ok) {
    throw new Error(`프로필 조회 실패: ${res.status}`);
  }
  const raw = await res.json();
  return cfg.parseProfile(raw);
}

export function buildAuthorizeUrl(
  provider: SocialProvider,
  state: string,
  pkceVerifier?: string,
): string {
  const cfg = getProviderConfig(provider);
  if (!cfg.clientId) throw new Error(`${provider} OAuth가 구성되지 않았습니다`);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: getCallbackUrl(provider),
    state,
  });
  if (cfg.scope) params.set("scope", cfg.scope);
  if (cfg.supportsPkce && pkceVerifier) {
    params.set("code_challenge", sha256base64url(pkceVerifier));
    params.set("code_challenge_method", "S256");
  }
  if (cfg.extraAuthorizeParams) {
    for (const [k, v] of Object.entries(cfg.extraAuthorizeParams)) params.set(k, v);
  }
  return `${cfg.authorizeUrl}?${params.toString()}`;
}

// Simple in-memory rate limiter for callback endpoint
const rateLimitBuckets = new Map<string, number[]>();
export function checkCallbackRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const limit = 5;
  const arr = (rateLimitBuckets.get(ip) || []).filter((t) => now - t < windowMs);
  if (arr.length >= limit) {
    rateLimitBuckets.set(ip, arr);
    return false;
  }
  arr.push(now);
  rateLimitBuckets.set(ip, arr);
  return true;
}
