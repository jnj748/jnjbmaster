import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import cookieParser from "cookie-parser";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

// Provider env MUST be set before importing the oauth router (its config helper
// reads env at call time, but isProviderEnabled needs the values present).
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-oauth-tests";
process.env.NAVER_CLIENT_ID = "test-naver-id";
process.env.NAVER_CLIENT_SECRET = "test-naver-secret";
process.env.KAKAO_REST_API_KEY = "test-kakao-id";
process.env.KAKAO_CLIENT_SECRET = "test-kakao-secret";
process.env.GOOGLE_CLIENT_ID = "test-google-id";
process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
process.env.OAUTH_REDIRECT_BASE_URL = "http://localhost:5000";

const { db, usersTable, userSocialAccountsTable, pool } = await import("@workspace/db");
const { eq, inArray } = await import("drizzle-orm");
const { default: oauthRouter } = await import("../routes/oauth");
const { signToken } = await import("../middlewares/auth");
const { createStateAndCookie, OAUTH_COOKIE_NAME } = await import("../lib/oauth");

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use("/api", oauthRouter);

let server: Server;
let baseUrl: string;
const realFetch = globalThis.fetch.bind(globalThis);
const createdEmails: string[] = [];
const createdProviderUserIds: Array<{ provider: string; providerUserId: string }> = [];

function trackEmail(e: string) {
  createdEmails.push(e);
  return e;
}
function trackSocial(provider: string, providerUserId: string) {
  createdProviderUserIds.push({ provider, providerUserId });
  return providerUserId;
}

function uniqueEmail(prefix: string) {
  return trackEmail(`${prefix}-${crypto.randomUUID()}@oauth-test.local`);
}
function uniqueProviderUserId(provider: string) {
  return trackSocial(provider, `${provider}-uid-${crypto.randomUUID()}`);
}

type StubResponse = {
  urlMatch: RegExp;
  body: unknown;
  status?: number;
};
let stubs: StubResponse[] = [];

function installFetchStub(responses: StubResponse[]) {
  stubs = responses;
}
function clearFetchStub() {
  stubs = [];
}

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : (input as URL | Request).toString();
  for (const s of stubs) {
    if (s.urlMatch.test(url)) {
      return new Response(JSON.stringify(s.body), {
        status: s.status ?? 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }
  return realFetch(input as Parameters<typeof fetch>[0], init);
}) as typeof fetch;

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  // Cleanup: delete all test users and their social accounts.
  if (createdEmails.length > 0) {
    const users = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(inArray(usersTable.email, createdEmails));
    const ids = users.map((u) => u.id);
    if (ids.length > 0) {
      await db.delete(userSocialAccountsTable).where(inArray(userSocialAccountsTable.userId, ids));
      await db.delete(usersTable).where(inArray(usersTable.id, ids));
    }
  }
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
  await pool.end();
});

beforeEach(() => {
  clearFetchStub();
});

// --- helpers --------------------------------------------------------

function buildCallbackUrl(provider: string, state: string) {
  return `${baseUrl}/api/auth/oauth/${provider}/callback?code=test-code&state=${encodeURIComponent(state)}`;
}

function cookieHeader(value: object) {
  return `${OAUTH_COOKIE_NAME}=${encodeURIComponent(JSON.stringify(value))}`;
}

function makeStateAndCookieHeader(opts: {
  portalType: "building" | "partner" | "hq";
  intent?: "login" | "link";
  linkUserId?: number;
  withPkce?: boolean;
}) {
  const { state, cookie } = createStateAndCookie(
    {
      portalType: opts.portalType,
      intent: opts.intent ?? "login",
      ...(opts.linkUserId ? { linkUserId: opts.linkUserId } : {}),
    },
    !!opts.withPkce,
  );
  return { state, cookie: cookieHeader(cookie) };
}

function googleStubs(profile: {
  sub: string;
  email: string | null;
  email_verified: boolean;
  name?: string | null;
}): StubResponse[] {
  return [
    { urlMatch: /oauth2\.googleapis\.com\/token/, body: { access_token: "tok-google" } },
    {
      urlMatch: /openidconnect\.googleapis\.com\/v1\/userinfo/,
      body: profile,
    },
  ];
}

function naverStubs(profile: { id: string; email: string | null; name: string }): StubResponse[] {
  return [
    { urlMatch: /nid\.naver\.com\/oauth2\.0\/token/, body: { access_token: "tok-naver" } },
    {
      urlMatch: /openapi\.naver\.com\/v1\/nid\/me/,
      body: { response: profile },
    },
  ];
}

async function fetchManual(url: string, init: RequestInit = {}) {
  // Use the real fetch directly to avoid going through the stub for HTTP to our test server.
  return realFetch(url, { ...init, redirect: "manual" });
}

// --- tests ----------------------------------------------------------

test("init: HQ portal is rejected with 400", async () => {
  const res = await fetchManual(`${baseUrl}/api/auth/oauth/google/init?portalType=hq`);
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /본부장 포털은 소셜 로그인을 사용할 수 없습니다/);
});

test("init: building portal returns redirect to provider authorize URL", async () => {
  const res = await fetchManual(`${baseUrl}/api/auth/oauth/google/init?portalType=building`);
  assert.equal(res.status, 302);
  const location = res.headers.get("location") || "";
  assert.match(location, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
  // The CSRF cookie must be set
  const setCookie = res.headers.get("set-cookie") || "";
  assert.match(setCookie, new RegExp(`${OAUTH_COOKIE_NAME}=`));
});

test("link/init: HQ portal user is rejected with 403", async () => {
  // Insert an HQ user (must exist in DB for approvalGateMiddleware to look up + pass).
  const email = uniqueEmail("hq-link");
  const [user] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash: "hq-no-real-hash",
      name: "본사 임원",
      role: "hq_executive",
      portalType: "hq",
      approvalStatus: "active",
      roleSelected: true,
    })
    .returning();

  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    portalType: user.portalType,
  });

  const res = await fetchManual(`${baseUrl}/api/auth/oauth/google/link/init`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /본부장 포털 계정은 소셜 계정을 연결할 수 없습니다/);
});

test("callback Branch 1: existing social account → instant login token", async () => {
  const email = uniqueEmail("branch1");
  const providerUserId = uniqueProviderUserId("google");
  const [user] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash: null,
      name: "기존 소셜 사용자",
      role: "manager",
      portalType: "building",
      approvalStatus: "active",
      roleSelected: true,
    })
    .returning();
  await db.insert(userSocialAccountsTable).values({
    userId: user.id,
    provider: "google",
    providerUserId,
    email,
    displayName: "기존 소셜 사용자",
  });

  installFetchStub(
    googleStubs({ sub: providerUserId, email, email_verified: true, name: "기존 소셜 사용자" }),
  );

  const { state, cookie } = makeStateAndCookieHeader({
    portalType: "building",
    withPkce: true,
  });

  const res = await fetchManual(buildCallbackUrl("google", state), {
    headers: { Cookie: cookie, "X-Forwarded-For": `1.2.3.${Math.floor(Math.random() * 250) + 1}` },
  });

  assert.equal(res.status, 302);
  const location = res.headers.get("location") || "";
  assert.match(location, /\/auth\/callback#token=/);
  assert.ok(!location.includes("error="), `unexpected error in redirect: ${location}`);
});

test("callback Branch 1: existing social user with portal mismatch → portal_mismatch error", async () => {
  const email = uniqueEmail("portal-mismatch");
  const providerUserId = uniqueProviderUserId("google");
  const [user] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash: null,
      name: "파트너 사용자",
      role: "partner",
      portalType: "partner",
      approvalStatus: "active",
      roleSelected: true,
    })
    .returning();
  await db.insert(userSocialAccountsTable).values({
    userId: user.id,
    provider: "google",
    providerUserId,
    email,
    displayName: "파트너",
  });

  installFetchStub(googleStubs({ sub: providerUserId, email, email_verified: true, name: "파트너" }));
  // Caller pretends to log into building portal — must be refused.
  const { state, cookie } = makeStateAndCookieHeader({ portalType: "building", withPkce: true });
  const res = await fetchManual(buildCallbackUrl("google", state), {
    headers: { Cookie: cookie, "X-Forwarded-For": `2.2.3.${Math.floor(Math.random() * 250) + 1}` },
  });
  assert.equal(res.status, 302);
  assert.match(res.headers.get("location") || "", /error=portal_mismatch/);
});

test("callback Branch 2: existing local user + Google verified email → auto-link + login", async () => {
  const email = uniqueEmail("branch2");
  const providerUserId = uniqueProviderUserId("google");
  await db
    .insert(usersTable)
    .values({
      email,
      passwordHash: "fake-hash",
      name: "기존 로컬",
      role: "manager",
      portalType: "building",
      approvalStatus: "active",
      roleSelected: true,
    })
    .returning();

  installFetchStub(googleStubs({ sub: providerUserId, email, email_verified: true, name: "기존 로컬" }));
  const { state, cookie } = makeStateAndCookieHeader({ portalType: "building", withPkce: true });

  const res = await fetchManual(buildCallbackUrl("google", state), {
    headers: { Cookie: cookie, "X-Forwarded-For": `3.3.3.${Math.floor(Math.random() * 250) + 1}` },
  });

  assert.equal(res.status, 302);
  const location = res.headers.get("location") || "";
  assert.match(location, /\/auth\/callback#token=.*linked=google/);

  // Confirm the social account is now linked in DB.
  const links = await db
    .select()
    .from(userSocialAccountsTable)
    .where(eq(userSocialAccountsTable.providerUserId, providerUserId));
  assert.equal(links.length, 1);
  assert.equal(links[0].provider, "google");
});

test("callback Branch 2 refusal: Naver email_verified=false must NOT auto-link to existing local user", async () => {
  const email = uniqueEmail("naver-unverified");
  const providerUserId = uniqueProviderUserId("naver");
  await db.insert(usersTable).values({
    email,
    passwordHash: "fake-hash",
    name: "기존 로컬 (네이버 충돌)",
    role: "manager",
    portalType: "building",
    approvalStatus: "active",
    roleSelected: true,
  });

  installFetchStub(naverStubs({ id: providerUserId, email, name: "네이버" }));
  const { state, cookie } = makeStateAndCookieHeader({ portalType: "building", withPkce: false });

  const res = await fetchManual(buildCallbackUrl("naver", state), {
    headers: { Cookie: cookie, "X-Forwarded-For": `4.4.4.${Math.floor(Math.random() * 250) + 1}` },
  });

  // Must NOT issue a token; must fall through to pending-signup screen.
  assert.equal(res.status, 302);
  const location = res.headers.get("location") || "";
  assert.ok(!location.includes("token="), `unexpected token in redirect: ${location}`);
  assert.match(location, /\/auth\/social-signup#pending=/);

  // No silent link should have been created.
  const links = await db
    .select()
    .from(userSocialAccountsTable)
    .where(eq(userSocialAccountsTable.providerUserId, providerUserId));
  assert.equal(links.length, 0);
});

test("callback Branch 2 refusal: Google email_verified=false must NOT auto-link to existing local user", async () => {
  const email = uniqueEmail("google-unverified");
  const providerUserId = uniqueProviderUserId("google");
  await db.insert(usersTable).values({
    email,
    passwordHash: "fake-hash",
    name: "기존 로컬 (구글 충돌)",
    role: "manager",
    portalType: "building",
    approvalStatus: "active",
    roleSelected: true,
  });

  installFetchStub(googleStubs({ sub: providerUserId, email, email_verified: false, name: "구글" }));
  const { state, cookie } = makeStateAndCookieHeader({ portalType: "building", withPkce: true });

  const res = await fetchManual(buildCallbackUrl("google", state), {
    headers: { Cookie: cookie, "X-Forwarded-For": `5.5.5.${Math.floor(Math.random() * 250) + 1}` },
  });

  assert.equal(res.status, 302);
  const location = res.headers.get("location") || "";
  assert.ok(!location.includes("token="), `unexpected token in redirect: ${location}`);
  assert.match(location, /\/auth\/social-signup#pending=/);

  const links = await db
    .select()
    .from(userSocialAccountsTable)
    .where(eq(userSocialAccountsTable.providerUserId, providerUserId));
  assert.equal(links.length, 0);
});

test("callback Branch 3: brand-new social user → pending signup token", async () => {
  const email = uniqueEmail("branch3");
  const providerUserId = uniqueProviderUserId("google");

  installFetchStub(googleStubs({ sub: providerUserId, email, email_verified: true, name: "신규" }));
  const { state, cookie } = makeStateAndCookieHeader({ portalType: "building", withPkce: true });

  const res = await fetchManual(buildCallbackUrl("google", state), {
    headers: { Cookie: cookie, "X-Forwarded-For": `6.6.6.${Math.floor(Math.random() * 250) + 1}` },
  });

  assert.equal(res.status, 302);
  const location = res.headers.get("location") || "";
  assert.match(location, /\/auth\/social-signup#pending=/);
  assert.ok(!location.includes("token="), "must not issue an auth token to brand-new users");

  // No user nor social account should have been created at this stage.
  const users = await db.select().from(usersTable).where(eq(usersTable.email, email));
  assert.equal(users.length, 0);
  const links = await db
    .select()
    .from(userSocialAccountsTable)
    .where(eq(userSocialAccountsTable.providerUserId, providerUserId));
  assert.equal(links.length, 0);
});

test("callback: HQ portal in state is rejected (hq_not_allowed)", async () => {
  // Even if state is signed with portalType=hq, callback must refuse before issuing tokens.
  const providerUserId = uniqueProviderUserId("google");
  installFetchStub(
    googleStubs({ sub: providerUserId, email: "irrelevant@example.com", email_verified: true, name: "x" }),
  );
  const { state, cookie } = makeStateAndCookieHeader({ portalType: "hq", withPkce: true });
  const res = await fetchManual(buildCallbackUrl("google", state), {
    headers: { Cookie: cookie, "X-Forwarded-For": `7.7.7.${Math.floor(Math.random() * 250) + 1}` },
  });
  assert.equal(res.status, 302);
  assert.match(res.headers.get("location") || "", /error=hq_not_allowed/);
});

test("callback: rate limit triggers on 6th request from same IP within 1 minute", async () => {
  const ip = `9.9.9.${Math.floor(Math.random() * 250) + 1}`;
  // Use a cheap branch-3 stub so each call doesn't depend on DB state.
  // We send 6 callbacks with the same X-Forwarded-For — first 5 should attempt the OAuth flow
  // (302 to /auth/social-signup or some redirect), 6th must be rate_limit error.
  let lastLocation = "";
  for (let i = 0; i < 6; i++) {
    installFetchStub(
      googleStubs({
        sub: uniqueProviderUserId("google"),
        email: uniqueEmail(`rl-${i}`),
        email_verified: true,
        name: "rl",
      }),
    );
    const { state, cookie } = makeStateAndCookieHeader({ portalType: "building", withPkce: true });
    const res = await fetchManual(buildCallbackUrl("google", state), {
      headers: { Cookie: cookie, "X-Forwarded-For": ip },
    });
    assert.equal(res.status, 302);
    lastLocation = res.headers.get("location") || "";
    if (i < 5) {
      assert.ok(!lastLocation.includes("rate_limit"), `request #${i + 1} must not be rate-limited yet`);
    }
  }
  assert.match(lastLocation, /error=rate_limit/, "6th request must hit rate limit");
});
