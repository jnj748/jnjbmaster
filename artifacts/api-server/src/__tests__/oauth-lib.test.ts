import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

// JWT_SECRET must be set BEFORE importing oauth lib so its module-scoped constant resolves.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-oauth-tests";

const {
  createStateAndCookie,
  verifyStateWithCookie,
  createPendingSignupToken,
  verifyPendingSignupToken,
  checkCallbackRateLimit,
  buildAuthorizeUrl,
  getProviderConfig,
  isProviderEnabled,
  OAUTH_COOKIE_NAME,
} = await import("../lib/oauth");

test("OAUTH_COOKIE_NAME is stable", () => {
  assert.equal(OAUTH_COOKIE_NAME, "oauth_csrf");
});

test("createStateAndCookie + verifyStateWithCookie round trips (no PKCE)", () => {
  const { state, cookie } = createStateAndCookie(
    { portalType: "building", intent: "login" },
    false,
  );
  const verified = verifyStateWithCookie(state, JSON.stringify(cookie));
  assert.equal(verified.state.portalType, "building");
  assert.equal(verified.state.intent, "login");
  assert.equal(verified.pkceVerifier, undefined);
});

test("createStateAndCookie + verifyStateWithCookie round trips (with PKCE)", () => {
  const { state, cookie } = createStateAndCookie(
    { portalType: "partner", intent: "login" },
    true,
  );
  assert.ok(cookie.pkceVerifier, "pkce verifier should be present in cookie");
  const verified = verifyStateWithCookie(state, JSON.stringify(cookie));
  assert.equal(verified.state.portalType, "partner");
  assert.equal(verified.pkceVerifier, cookie.pkceVerifier);
});

test("verifyStateWithCookie rejects when nonce cookie is missing", () => {
  const { state } = createStateAndCookie(
    { portalType: "building", intent: "login" },
    false,
  );
  assert.throws(() => verifyStateWithCookie(state, undefined), /missing_cookie/);
});

test("verifyStateWithCookie rejects when nonce mismatches (CSRF defense)", () => {
  const { state } = createStateAndCookie(
    { portalType: "building", intent: "login" },
    false,
  );
  const tampered = JSON.stringify({ nonce: "attacker-controlled-nonce" });
  assert.throws(() => verifyStateWithCookie(state, tampered), /nonce_mismatch/);
});

test("verifyStateWithCookie rejects PKCE verifier mismatch", () => {
  const { state, cookie } = createStateAndCookie(
    { portalType: "building", intent: "login" },
    true,
  );
  const tampered = JSON.stringify({
    nonce: cookie.nonce,
    pkceVerifier: crypto.randomBytes(32).toString("base64url"),
  });
  assert.throws(() => verifyStateWithCookie(state, tampered), /pkce_mismatch/);
});

test("createPendingSignupToken + verifyPendingSignupToken round trips", () => {
  const token = createPendingSignupToken({
    provider: "google",
    providerUserId: "g-12345",
    email: "user@example.com",
    emailVerified: true,
    name: "홍길동",
    portalType: "building",
  });
  const decoded = verifyPendingSignupToken(token);
  assert.equal(decoded.provider, "google");
  assert.equal(decoded.providerUserId, "g-12345");
  assert.equal(decoded.email, "user@example.com");
  assert.equal(decoded.emailVerified, true);
  assert.equal(decoded.portalType, "building");
});

test("Naver profile parser marks email as unverified (provider gives no flag)", () => {
  const cfg = getProviderConfig("naver");
  const profile = cfg.parseProfile({
    response: { id: "n-1", email: "naver@example.com", name: "네이버유저" },
  });
  assert.equal(profile.providerUserId, "n-1");
  assert.equal(profile.email, "naver@example.com");
  assert.equal(profile.emailVerified, false, "Naver must never report verified email");
  assert.equal(profile.name, "네이버유저");
});

test("Kakao profile parser respects is_email_verified=true", () => {
  const cfg = getProviderConfig("kakao");
  const verified = cfg.parseProfile({
    id: 9999,
    kakao_account: {
      email: "k@example.com",
      is_email_verified: true,
      is_email_valid: true,
      profile: { nickname: "카카오" },
    },
  });
  assert.equal(verified.emailVerified, true);
  assert.equal(verified.providerUserId, "9999");
  assert.equal(verified.name, "카카오");

  const unverified = cfg.parseProfile({
    id: 9999,
    kakao_account: {
      email: "k@example.com",
      is_email_verified: false,
      profile: { nickname: "카카오" },
    },
  });
  assert.equal(unverified.emailVerified, false);
});

test("Google profile parser sets emailVerified iff email_verified === true", () => {
  const cfg = getProviderConfig("google");
  const v = cfg.parseProfile({ sub: "g1", email: "g@example.com", email_verified: true, name: "구글" });
  assert.equal(v.emailVerified, true);
  const u = cfg.parseProfile({ sub: "g2", email: "g@example.com", email_verified: false, name: "구글" });
  assert.equal(u.emailVerified, false);
});

test("isProviderEnabled is false when client id/secret missing", () => {
  const prevId = process.env.GOOGLE_CLIENT_ID;
  const prevSecret = process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  try {
    assert.equal(isProviderEnabled("google"), false);
  } finally {
    if (prevId !== undefined) process.env.GOOGLE_CLIENT_ID = prevId;
    if (prevSecret !== undefined) process.env.GOOGLE_CLIENT_SECRET = prevSecret;
  }
});

test("buildAuthorizeUrl includes PKCE challenge for providers that support it", () => {
  process.env.GOOGLE_CLIENT_ID = "test-google-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
  const verifier = crypto.randomBytes(32).toString("base64url");
  const url = buildAuthorizeUrl("google", "state-jwt", verifier);
  assert.ok(url.includes("code_challenge="), "Google must send PKCE challenge");
  assert.ok(url.includes("code_challenge_method=S256"));
});

test("buildAuthorizeUrl skips PKCE challenge for providers that don't support it", () => {
  process.env.NAVER_CLIENT_ID = "test-naver-id";
  process.env.NAVER_CLIENT_SECRET = "test-naver-secret";
  const url = buildAuthorizeUrl("naver", "state-jwt");
  assert.ok(!url.includes("code_challenge="), "Naver must NOT send PKCE challenge");
});

test("checkCallbackRateLimit allows up to 5 requests per IP per minute, then rejects", () => {
  const ip = `unit-test-ip-${crypto.randomUUID()}`;
  for (let i = 0; i < 5; i++) {
    assert.equal(checkCallbackRateLimit(ip), true, `request #${i + 1} should pass`);
  }
  assert.equal(checkCallbackRateLimit(ip), false, "6th request must be rate limited");
});
