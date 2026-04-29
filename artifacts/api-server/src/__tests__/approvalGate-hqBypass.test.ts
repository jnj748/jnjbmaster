import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-approval-gate-tests";

const { db, usersTable, pool } = await import("@workspace/db");
const { inArray } = await import("drizzle-orm");
const { signToken, authMiddleware, approvalGateMiddleware } = await import(
  "../middlewares/auth"
);

// [Task #590] approvalGateMiddleware 의 HQ 우회 동작 검증.
//
// 본사(HQ) 포털 역할(platform_admin/hq_executive)은 시설기사 가입 승인 흐름의
// 대상이 아닌데도, approval_status 가 어떤 이유로든 "active" 가 아니게 되면
// 게이트가 모든 /platform/* 엔드포인트를 403 으로 막아 "이용현황을 불러올 수
// 없습니다" 오류를 일으켰다. HQ 역할은 게이트에서 즉시 통과시켜야 한다.
//
// 시나리오:
//  1. platform_admin (approvalStatus="pending") — 보호 엔드포인트 호출 시 200.
//  2. hq_executive (approvalStatus="rejected") — 보호 엔드포인트 호출 시 200.
//  3. facility_staff (approvalStatus="pending") — 화이트리스트 밖 엔드포인트
//     는 여전히 403 으로 차단(기존 동작 유지).
//  4. facility_staff (approvalStatus="pending") — 화이트리스트 안 엔드포인트
//     (GET /auth/me)는 통과.
//  5. roleSelected=false 사용자는 여전히 차단(기존 동작 유지).
//  6. 일반 manager (approvalStatus="active") 는 정상 통과.

const app = express();
app.use(express.json());
app.use(authMiddleware);
app.use(approvalGateMiddleware);
// 임의 보호 엔드포인트 - HQ 화면이 호출하는 /platform/* 류를 모사.
app.get("/platform/usage-analytics", (_req, res) => {
  res.json({ ok: true });
});
app.get("/auth/me", (_req, res) => {
  res.json({ ok: true });
});

let server: Server;
let baseUrl: string;
const createdEmails: string[] = [];

function uniqueEmail(prefix: string) {
  const e = `${prefix}-${crypto.randomUUID()}@approval-gate-test.local`;
  createdEmails.push(e);
  return e;
}

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  if (createdEmails.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.email, createdEmails));
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

async function insertUser(opts: {
  emailPrefix: string;
  role: "platform_admin" | "hq_executive" | "facility_staff" | "manager";
  portalType: "building" | "hq" | "partner";
  approvalStatus: "active" | "pending" | "rejected";
  roleSelected: boolean;
}) {
  const email = uniqueEmail(opts.emailPrefix);
  const [user] = await db
    .insert(usersTable)
    .values({
      email,
      passwordHash: "no-real-hash",
      name: `${opts.role} test user`,
      role: opts.role,
      portalType: opts.portalType,
      approvalStatus: opts.approvalStatus,
      roleSelected: opts.roleSelected,
    })
    .returning();
  const token = signToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    portalType: user.portalType,
  });
  return { user, token };
}

test("platform_admin (approvalStatus=pending) bypasses gate on /platform/* endpoints", async () => {
  const { token } = await insertUser({
    emailPrefix: "platform-admin-pending",
    role: "platform_admin",
    portalType: "hq",
    approvalStatus: "pending",
    roleSelected: true,
  });
  const res = await fetch(`${baseUrl}/platform/usage-analytics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200, `expected 200 but got ${res.status}`);
});

test("hq_executive (approvalStatus=rejected) bypasses gate on /platform/* endpoints", async () => {
  const { token } = await insertUser({
    emailPrefix: "hq-executive-rejected",
    role: "hq_executive",
    portalType: "hq",
    approvalStatus: "rejected",
    roleSelected: true,
  });
  const res = await fetch(`${baseUrl}/platform/usage-analytics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200, `expected 200 but got ${res.status}`);
});

test("platform_admin (approvalStatus=active) — sanity passes gate", async () => {
  const { token } = await insertUser({
    emailPrefix: "platform-admin-active",
    role: "platform_admin",
    portalType: "hq",
    approvalStatus: "active",
    roleSelected: true,
  });
  const res = await fetch(`${baseUrl}/platform/usage-analytics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
});

test("facility_staff (approvalStatus=pending) is still blocked on protected endpoints", async () => {
  const { token } = await insertUser({
    emailPrefix: "facility-pending",
    role: "facility_staff",
    portalType: "building",
    approvalStatus: "pending",
    roleSelected: true,
  });
  const res = await fetch(`${baseUrl}/platform/usage-analytics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /가입 승인 대기 중/);
});

test("facility_staff (approvalStatus=pending) is allowed on whitelisted GET /auth/me", async () => {
  const { token } = await insertUser({
    emailPrefix: "facility-pending-me",
    role: "facility_staff",
    portalType: "building",
    approvalStatus: "pending",
    roleSelected: true,
  });
  const res = await fetch(`${baseUrl}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
});

test("user with roleSelected=false is still blocked", async () => {
  const { token } = await insertUser({
    emailPrefix: "no-role-selected",
    role: "facility_staff", // placeholder role used during signup-without-role
    portalType: "building",
    approvalStatus: "pending",
    roleSelected: false,
  });
  const res = await fetch(`${baseUrl}/platform/usage-analytics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { error: string };
  assert.match(body.error, /역할 선택이 필요합니다/);
});

test("manager (approvalStatus=active) passes gate normally", async () => {
  const { token } = await insertUser({
    emailPrefix: "manager-active",
    role: "manager",
    portalType: "building",
    approvalStatus: "active",
    roleSelected: true,
  });
  const res = await fetch(`${baseUrl}/platform/usage-analytics`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 200);
});
