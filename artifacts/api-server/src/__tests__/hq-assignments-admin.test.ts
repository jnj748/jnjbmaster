// [Task #596] /admin/hq-assignments 권한 + 입력 검증 회귀.
//
//   - 비로그인 → 401
//   - 비-platform_admin (manager / hq_executive) → 403
//   - platform_admin → 정상 동작
//   - 잘못된 입력 (비숫자 hqUserId, 매핑할 수 없는 역할, 존재하지 않는 건물) → 4xx
//   - PUT by-user 의 buildingIds 무효 항목 무시 + 멱등 동작
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-hq-assignments-admin";

const { db, usersTable, buildingsTable, hqBuildingAssignmentsTable, pool } = await import("@workspace/db");
const { eq, inArray } = await import("drizzle-orm");
const { default: hqAssignmentsRouter } = await import("../routes/hqAssignments");

let currentUser: { userId: number; role: string; email: string | null; portalType: string } | null = null;
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  if (currentUser) (req as unknown as { user: typeof currentUser }).user = currentUser;
  (req as unknown as { log: { warn: () => void; error: () => void; info: () => void } }).log = {
    warn: () => {},
    error: () => {},
    info: () => {},
  };
  next();
});
app.use("/api", hqAssignmentsRouter);

let server: Server;
let baseUrl: string;
const createdUserIds: number[] = [];
const createdBuildingIds: number[] = [];
const createdAssignmentIds: number[] = [];

let buildingAId: number;
let buildingBId: number;
let buildingCId: number;
let platformAdminId: number;
let managerId: number;
let hqExecutiveId: number;
let nonHqUserId: number;

async function createBuilding(name: string): Promise<number> {
  const [b] = await db.insert(buildingsTable).values({
    name, addressFull: `테스트주소-${name}`, totalUnits: 10,
  } as typeof buildingsTable.$inferInsert).returning();
  createdBuildingIds.push(b.id);
  return b.id;
}

async function createUser(role: string, buildingId: number | null, portalType = role === "platform_admin" ? "platform" : role === "hq_executive" ? "hq" : "building"): Promise<number> {
  const [u] = await db.insert(usersTable).values({
    email: `${role}-${crypto.randomUUID()}@hq-assign-test.local`,
    name: `${role}-사용자`,
    role,
    portalType,
    approvalStatus: "active",
    buildingId: buildingId ?? undefined,
  } as typeof usersTable.$inferInsert).returning();
  createdUserIds.push(u.id);
  return u.id;
}

function asUser(userId: number, role: string) {
  currentUser = {
    userId,
    role,
    email: `${role}-${userId}@hq-assign-test.local`,
    portalType: role === "platform_admin" ? "platform" : role === "hq_executive" ? "hq" : "building",
  };
}

function noUser() { currentUser = null; }

before(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}/api`;

  buildingAId = await createBuilding(`A-${crypto.randomUUID().slice(0, 6)}`);
  buildingBId = await createBuilding(`B-${crypto.randomUUID().slice(0, 6)}`);
  buildingCId = await createBuilding(`C-${crypto.randomUUID().slice(0, 6)}`);

  platformAdminId = await createUser("platform_admin", null);
  managerId = await createUser("manager", buildingAId);
  hqExecutiveId = await createUser("hq_executive", null);
  nonHqUserId = await createUser("manager", buildingAId);
});

after(async () => {
  if (createdAssignmentIds.length > 0) {
    await db.delete(hqBuildingAssignmentsTable).where(inArray(hqBuildingAssignmentsTable.id, createdAssignmentIds));
  }
  await db.delete(hqBuildingAssignmentsTable).where(inArray(hqBuildingAssignmentsTable.hqUserId, createdUserIds.length > 0 ? createdUserIds : [-1]));
  if (createdUserIds.length > 0) await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  if (createdBuildingIds.length > 0) await db.delete(buildingsTable).where(inArray(buildingsTable.id, createdBuildingIds));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
});

test("[Task #596] /admin/hq-assignments — 비로그인은 401", async () => {
  noUser();
  for (const path of ["/admin/hq-assignments", "/admin/hq-users"]) {
    const res = await fetch(`${baseUrl}${path}`);
    assert.equal(res.status, 401, `${path}: 비로그인은 401`);
  }
});

test("[Task #596] /admin/hq-assignments — 비-platform_admin 은 403", async () => {
  for (const [uid, role] of [[managerId, "manager"], [hqExecutiveId, "hq_executive"]] as const) {
    asUser(uid, role);
    const getRes = await fetch(`${baseUrl}/admin/hq-assignments`);
    assert.equal(getRes.status, 403, `${role}: GET 차단`);
    const postRes = await fetch(`${baseUrl}/admin/hq-assignments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hqUserId: hqExecutiveId, buildingId: buildingAId }),
    });
    assert.equal(postRes.status, 403, `${role}: POST 차단`);
    const delRes = await fetch(`${baseUrl}/admin/hq-assignments/9999999`, { method: "DELETE" });
    assert.equal(delRes.status, 403, `${role}: DELETE 차단`);
    const putRes = await fetch(`${baseUrl}/admin/hq-assignments/by-user/${hqExecutiveId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ buildingIds: [buildingAId] }),
    });
    assert.equal(putRes.status, 403, `${role}: PUT by-user 차단`);
  }
});

test("[Task #596] POST /admin/hq-assignments — 비숫자 hqUserId/buildingId 는 400", async () => {
  asUser(platformAdminId, "platform_admin");
  for (const body of [
    { hqUserId: "abc", buildingId: buildingAId },
    { hqUserId: hqExecutiveId, buildingId: "xyz" },
    {},
  ]) {
    const res = await fetch(`${baseUrl}/admin/hq-assignments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(res.status, 400, `유효하지 않은 입력: ${JSON.stringify(body)}`);
  }
});

test("[Task #596] POST /admin/hq-assignments — hq_executive 가 아닌 사용자는 400", async () => {
  asUser(platformAdminId, "platform_admin");
  const res = await fetch(`${baseUrl}/admin/hq-assignments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hqUserId: nonHqUserId, buildingId: buildingAId }),
  });
  assert.equal(res.status, 400, "manager 역할 사용자에게 매핑 불가");
  const data = await res.json() as { error: string };
  assert.match(data.error, /본부장|hq_executive/);
});

test("[Task #596] POST /admin/hq-assignments — 존재하지 않는 사용자/건물은 404", async () => {
  asUser(platformAdminId, "platform_admin");
  const r1 = await fetch(`${baseUrl}/admin/hq-assignments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hqUserId: 99999999, buildingId: buildingAId }),
  });
  assert.equal(r1.status, 404, "없는 hq 사용자 → 404");
  const r2 = await fetch(`${baseUrl}/admin/hq-assignments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hqUserId: hqExecutiveId, buildingId: 99999999 }),
  });
  assert.equal(r2.status, 404, "없는 건물 → 404");
});

test("[Task #596] POST /admin/hq-assignments — 정상 생성 + 중복은 멱등", async () => {
  asUser(platformAdminId, "platform_admin");
  const r1 = await fetch(`${baseUrl}/admin/hq-assignments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hqUserId: hqExecutiveId, buildingId: buildingAId }),
  });
  assert.equal(r1.status, 201);
  const d1 = await r1.json() as { assignment: { id: number } };
  createdAssignmentIds.push(d1.assignment.id);

  // 중복 호출 — 200(alreadyExisted: true) 으로 멱등 처리
  const r2 = await fetch(`${baseUrl}/admin/hq-assignments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hqUserId: hqExecutiveId, buildingId: buildingAId }),
  });
  assert.equal(r2.status, 200);
  const d2 = await r2.json() as { alreadyExisted: boolean };
  assert.equal(d2.alreadyExisted, true);
});

test("[Task #596] DELETE /admin/hq-assignments/:id — 비숫자는 400, 미존재는 404", async () => {
  asUser(platformAdminId, "platform_admin");
  const r1 = await fetch(`${baseUrl}/admin/hq-assignments/abc`, { method: "DELETE" });
  assert.equal(r1.status, 400);
  const r2 = await fetch(`${baseUrl}/admin/hq-assignments/99999999`, { method: "DELETE" });
  assert.equal(r2.status, 404);
});

test("[Task #596] PUT /admin/hq-assignments/by-user/:hqUserId — set 동기화 동작", async () => {
  asUser(platformAdminId, "platform_admin");
  // 초기 상태: A 매핑(이전 테스트에서 생성됨) → desired = [B, C]
  const res = await fetch(`${baseUrl}/admin/hq-assignments/by-user/${hqExecutiveId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    // "garbage" 는 Number()→NaN 으로 무시. (null/undefined 는 0 으로 변환되어
    //   FK 위반을 일으키므로 클라이언트가 보내지 않는다고 가정한다.)
    body: JSON.stringify({ buildingIds: [buildingBId, buildingCId, "garbage"] }),
  });
  assert.equal(res.status, 200);
  const data = await res.json() as { added: number; removed: number };
  assert.equal(data.added, 2, "B, C 신규 추가");
  assert.equal(data.removed, 1, "A 제거");

  // 검증: 현재 매핑이 정확히 {B, C}
  const rows = await db.select({ buildingId: hqBuildingAssignmentsTable.buildingId, id: hqBuildingAssignmentsTable.id })
    .from(hqBuildingAssignmentsTable)
    .where(eq(hqBuildingAssignmentsTable.hqUserId, hqExecutiveId));
  for (const r of rows) createdAssignmentIds.push(r.id);
  const set = new Set(rows.map(r => r.buildingId));
  assert.deepEqual([...set].sort(), [buildingBId, buildingCId].sort());
});

test("[Task #596] PUT /admin/hq-assignments/by-user/:hqUserId — 비숫자 hqUserId 는 400", async () => {
  asUser(platformAdminId, "platform_admin");
  const res = await fetch(`${baseUrl}/admin/hq-assignments/by-user/abc`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ buildingIds: [] }),
  });
  assert.equal(res.status, 400);
});

test("[Task #596] PUT /admin/hq-assignments/by-user/:hqUserId — hq_executive 가 아닌 사용자는 400", async () => {
  asUser(platformAdminId, "platform_admin");
  const res = await fetch(`${baseUrl}/admin/hq-assignments/by-user/${nonHqUserId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ buildingIds: [buildingAId] }),
  });
  assert.equal(res.status, 400);
});

test("[Task #596] GET /hq/assigned-buildings — 본부장 본인 매핑만 노출", async () => {
  asUser(hqExecutiveId, "hq_executive");
  const res = await fetch(`${baseUrl}/hq/assigned-buildings`);
  assert.equal(res.status, 200);
  const data = await res.json() as { unrestricted: boolean; assignments: Array<{ buildingId: number }> };
  assert.equal(data.unrestricted, false);
  const ids = new Set(data.assignments.map(a => a.buildingId));
  assert.ok(ids.has(buildingBId));
  assert.ok(ids.has(buildingCId));
  assert.ok(!ids.has(buildingAId), "이전 테스트에서 제거된 A 는 보이면 안 됨");
});

test("[Task #596] GET /hq/assigned-buildings — manager 역할은 403", async () => {
  asUser(managerId, "manager");
  const res = await fetch(`${baseUrl}/hq/assigned-buildings`);
  assert.equal(res.status, 403);
});

test("[Task #596] GET /hq/assigned-buildings — platform_admin 은 unrestricted=true", async () => {
  asUser(platformAdminId, "platform_admin");
  const res = await fetch(`${baseUrl}/hq/assigned-buildings`);
  assert.equal(res.status, 200);
  const data = await res.json() as { unrestricted: boolean };
  assert.equal(data.unrestricted, true);
});
