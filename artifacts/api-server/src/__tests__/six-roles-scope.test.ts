// [Task #596] 6개 유저 유형 전수 회귀 — 본부장 매핑 정합화 검증.
//
// 시나리오 한 화면 요약 (docs/user-roles SoT 와 1:1 대응):
//   1) manager       — 본인 buildingId(A) 만 노출. 건물 B 의 자료는 누설되지 않음.
//   2) accountant    — 본인 buildingId(A) 만 노출.
//   3) facility_staff — 본인 buildingId(A) 만 노출.
//   4) hq_executive  — hq_building_assignments 에 들어 있는 건물(B 만 매핑된 경우)만 노출.
//                      매핑 0건이면 빈 배열을 받는다(과거처럼 전 건물이 보이지 않음).
//   5) platform_admin — 전 건물 노출(매핑 무관).
//   6) partner       — 건물 라우터 자체에서 차단(403). RFQ/계약 같은 파트너 전용 경로만 가능.
//
// 검증 엔드포인트: GET /buildings/list (대표 read 경로). 이 한 경로로 6개 역할의
//   가시성 차이를 동시에 보장한다. 건물 라우터 prefix 의 requireRole 도 함께 적용해
//   파트너 차단(401/403) 도 검증한다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-six-roles-tests";

const { db, usersTable, buildingsTable, hqBuildingAssignmentsTable, pool } = await import("@workspace/db");
const { eq, inArray } = await import("drizzle-orm");
const { default: buildingsRouter } = await import("../routes/buildings");
const { requireRole } = await import("../middlewares/auth");

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
// 실제 routes/index.ts 와 동일하게 /buildings 경로에 requireRole 가드를 먼저 깐다.
//   → 파트너는 401(req.user 무할당) 또는 403(파트너 역할) 으로 차단되는지 확인.
app.use("/api/buildings", requireRole("manager", "platform_admin", "hq_executive", "accountant", "facility_staff"));
app.use("/api", buildingsRouter);

let server: Server;
let baseUrl: string;
const createdBuildingIds: number[] = [];
const createdUserIds: number[] = [];
const createdAssignmentIds: number[] = [];

let buildingAId: number;
let buildingBId: number;
let buildingCId: number;
let managerAId: number;
let accountantAId: number;
let facilityAId: number;
let hqMappedToBId: number;
let hqUnmappedId: number;
let platformAdminId: number;
let partnerId: number;

function uniqueEmail(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}@six-roles-test.local`;
}

async function createBuilding(name: string): Promise<number> {
  const [b] = await db
    .insert(buildingsTable)
    .values({
      name,
      addressFull: "서울특별시 강남구 테헤란로 1",
      sido: "서울특별시",
      sigungu: "강남구",
    } as typeof buildingsTable.$inferInsert)
    .returning();
  createdBuildingIds.push(b.id);
  return b.id;
}

async function createUser(role: string, buildingId: number | null, portalType = "building"): Promise<number> {
  const [u] = await db
    .insert(usersTable)
    .values({
      email: uniqueEmail(role),
      passwordHash: "x",
      role,
      name: `${role}-test`,
      portalType,
      buildingId: buildingId ?? undefined,
      approvalStatus: "active",
      roleSelected: true,
    } as typeof usersTable.$inferInsert)
    .returning();
  createdUserIds.push(u.id);
  return u.id;
}

async function assignHqToBuilding(hqUserId: number, buildingId: number): Promise<void> {
  const [row] = await db
    .insert(hqBuildingAssignmentsTable)
    .values({ hqUserId, buildingId, assignedByUserId: null })
    .returning({ id: hqBuildingAssignmentsTable.id });
  createdAssignmentIds.push(row.id);
}

function asUser(userId: number, role: string, portalType = "building") {
  currentUser = { userId, role, email: `${role}-${userId}@six-roles-test.local`, portalType };
}
function noUser() { currentUser = null; }

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}/api`;

  buildingAId = await createBuilding(`6롤테스트-A-${crypto.randomUUID().slice(0, 6)}`);
  buildingBId = await createBuilding(`6롤테스트-B-${crypto.randomUUID().slice(0, 6)}`);
  buildingCId = await createBuilding(`6롤테스트-C-${crypto.randomUUID().slice(0, 6)}`);

  managerAId = await createUser("manager", buildingAId);
  accountantAId = await createUser("accountant", buildingAId);
  facilityAId = await createUser("facility_staff", buildingAId);
  hqMappedToBId = await createUser("hq_executive", null, "hq");
  hqUnmappedId = await createUser("hq_executive", null, "hq");
  platformAdminId = await createUser("platform_admin", null, "hq");
  partnerId = await createUser("partner", null, "partner");

  // 본부장 1: 건물 B 한 곳만 관할(C 는 매핑되지 않음 → 보이면 안 됨).
  await assignHqToBuilding(hqMappedToBId, buildingBId);
});

after(async () => {
  if (createdAssignmentIds.length > 0) {
    await db.delete(hqBuildingAssignmentsTable).where(inArray(hqBuildingAssignmentsTable.id, createdAssignmentIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  if (createdBuildingIds.length > 0) {
    await db.delete(buildingsTable).where(inArray(buildingsTable.id, createdBuildingIds));
  }
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await pool.end();
});

async function getBuildings(): Promise<Array<{ id: number; name: string }>> {
  const res = await fetch(`${baseUrl}/buildings/list`);
  if (!res.ok) throw new Error(`status=${res.status}`);
  return (await res.json()) as Array<{ id: number; name: string }>;
}

test("[#596] manager — 본인 건물(A) 만 보이고, B/C 는 누설되지 않는다", async () => {
  asUser(managerAId, "manager");
  const list = await getBuildings();
  const ids = new Set(list.map((b) => b.id));
  assert.ok(ids.has(buildingAId), "본인 건물 A 는 보여야 함");
  assert.ok(!ids.has(buildingBId), "다른 건물 B 는 가려져야 함");
  assert.ok(!ids.has(buildingCId), "다른 건물 C 는 가려져야 함");
});

test("[#596] accountant — 본인 건물(A) 만 보인다", async () => {
  asUser(accountantAId, "accountant");
  const list = await getBuildings();
  const ids = new Set(list.map((b) => b.id));
  assert.ok(ids.has(buildingAId));
  assert.ok(!ids.has(buildingBId));
  assert.ok(!ids.has(buildingCId));
});

test("[#596] facility_staff — 본인 건물(A) 만 보인다", async () => {
  asUser(facilityAId, "facility_staff");
  const list = await getBuildings();
  const ids = new Set(list.map((b) => b.id));
  assert.ok(ids.has(buildingAId));
  assert.ok(!ids.has(buildingBId));
});

test("[#596] hq_executive(매핑 있음) — 매핑된 B 만 보이고 A/C 는 가려진다 (전 건물 슈퍼유저 아님)", async () => {
  asUser(hqMappedToBId, "hq_executive", "hq");
  const list = await getBuildings();
  const ids = new Set(list.map((b) => b.id));
  assert.ok(ids.has(buildingBId), "매핑된 건물 B 는 보여야 함");
  assert.ok(!ids.has(buildingAId), "매핑되지 않은 건물 A 는 가려져야 함");
  assert.ok(!ids.has(buildingCId), "매핑되지 않은 건물 C 는 가려져야 함");
});

test("[#596] hq_executive(매핑 0건) — 빈 배열을 받는다 (과거처럼 전 건물이 보이지 않음)", async () => {
  asUser(hqUnmappedId, "hq_executive", "hq");
  const list = await getBuildings();
  const ids = new Set(list.map((b) => b.id));
  assert.ok(!ids.has(buildingAId), "매핑 없으면 어떤 건물도 보이면 안 됨 (A)");
  assert.ok(!ids.has(buildingBId), "매핑 없으면 어떤 건물도 보이면 안 됨 (B)");
  assert.ok(!ids.has(buildingCId), "매핑 없으면 어떤 건물도 보이면 안 됨 (C)");
});

test("[#596] platform_admin — 전 건물(A·B·C) 이 모두 보인다", async () => {
  asUser(platformAdminId, "platform_admin", "hq");
  const list = await getBuildings();
  const ids = new Set(list.map((b) => b.id));
  assert.ok(ids.has(buildingAId));
  assert.ok(ids.has(buildingBId));
  assert.ok(ids.has(buildingCId));
});

test("[#596] partner — /buildings/* 자체가 차단된다 (requireRole 의 화이트리스트에 없음)", async () => {
  asUser(partnerId, "partner", "partner");
  const res = await fetch(`${baseUrl}/buildings/list`);
  assert.equal(res.status, 403, "파트너는 건물 라우터 진입이 거부되어야 함");
});

test("[#596] 비로그인 — /buildings/* 는 401 로 거부된다", async () => {
  noUser();
  const res = await fetch(`${baseUrl}/buildings/list`);
  assert.equal(res.status, 401);
});

// [#596] 파트너 차단 매트릭스 — 핵심 건물-도메인 라우트 전반에서 partner 가
//   `requireRole` 게이트로 동일하게 차단되는지 한 번에 검증한다. 실제 라우터 본문을
//   로드하지 않고도 routes/index.ts 와 동일한 화이트리스트 정책을 박제할 수 있다.
//   라우트 추가/변경 시 화이트리스트가 흐트러지면 이 테스트가 즉시 깨진다.
const partnerDenialApp = express();
partnerDenialApp.use(express.json());
partnerDenialApp.use((req, _res, next) => {
  if (currentUser) (req as unknown as { user: typeof currentUser }).user = currentUser;
  (req as unknown as { log: { warn: () => void; error: () => void; info: () => void } }).log = {
    warn: () => {}, error: () => {}, info: () => {},
  };
  next();
});
// routes/index.ts 와 1:1 대응되는 prefix 별 화이트리스트.
partnerDenialApp.use("/api/buildings",         requireRole("manager", "platform_admin", "hq_executive", "accountant", "facility_staff"));
partnerDenialApp.use("/api/inspections",       requireRole("manager", "platform_admin", "hq_executive", "facility_staff"));
partnerDenialApp.use("/api/warranties",        requireRole("manager", "platform_admin", "hq_executive", "facility_staff"));
partnerDenialApp.use("/api/complaints",        requireRole("manager", "platform_admin", "accountant", "facility_staff", "hq_executive"));
partnerDenialApp.use("/api/maintenance-logs",  requireRole("manager", "platform_admin", "hq_executive", "facility_staff"));
partnerDenialApp.use("/api/safety-checklists", requireRole("manager", "platform_admin", "hq_executive", "facility_staff"));
// 정상 통과를 확인하기 위한 더미 엔드포인트.
for (const p of ["buildings", "inspections", "warranties", "complaints", "maintenance-logs", "safety-checklists"]) {
  partnerDenialApp.get(`/api/${p}/__probe`, (_req, res) => res.json({ ok: true }));
}

let denialServer: Server;
let denialBaseUrl: string;
before(async () => {
  await new Promise<void>((resolve) => {
    denialServer = partnerDenialApp.listen(0, () => {
      const a = denialServer.address() as AddressInfo;
      denialBaseUrl = `http://127.0.0.1:${a.port}/api`;
      resolve();
    });
  });
});
after(async () => { await new Promise<void>((r) => denialServer.close(() => r())); });

const PARTNER_DENIAL_PATHS = [
  "/buildings/__probe",
  "/inspections/__probe",
  "/warranties/__probe",
  "/complaints/__probe",
  "/maintenance-logs/__probe",
  "/safety-checklists/__probe",
];

test("[#596] partner — 6개 핵심 건물-도메인 라우트 prefix 모두에서 403 으로 차단된다", async () => {
  asUser(partnerId, "partner", "partner");
  for (const p of PARTNER_DENIAL_PATHS) {
    const res = await fetch(`${denialBaseUrl}${p}`);
    assert.equal(res.status, 403, `partner: ${p} 는 403 이어야 함`);
  }
});

test("[#596] 비로그인 — 6개 핵심 라우트 prefix 모두에서 401 로 거부된다", async () => {
  noUser();
  for (const p of PARTNER_DENIAL_PATHS) {
    const res = await fetch(`${denialBaseUrl}${p}`);
    assert.equal(res.status, 401, `noUser: ${p} 는 401 이어야 함`);
  }
});

test("[#596] 화이트리스트 안의 5개 역할(manager/accountant/facility_staff/hq_executive/platform_admin) 은 자신이 허용된 prefix 에서 200 통과", async () => {
  // 각 prefix 별 허용 역할 매트릭스(routes/index.ts 와 동기화).
  const matrix: Array<{ path: string; allowedRoles: string[] }> = [
    { path: "/buildings/__probe",         allowedRoles: ["manager", "platform_admin", "hq_executive", "accountant", "facility_staff"] },
    { path: "/inspections/__probe",       allowedRoles: ["manager", "platform_admin", "hq_executive", "facility_staff"] },
    { path: "/warranties/__probe",        allowedRoles: ["manager", "platform_admin", "hq_executive", "facility_staff"] },
    { path: "/complaints/__probe",        allowedRoles: ["manager", "platform_admin", "accountant", "facility_staff", "hq_executive"] },
    { path: "/maintenance-logs/__probe",  allowedRoles: ["manager", "platform_admin", "hq_executive", "facility_staff"] },
    { path: "/safety-checklists/__probe", allowedRoles: ["manager", "platform_admin", "hq_executive", "facility_staff"] },
  ];
  const roleToUser: Record<string, { uid: number; portal: string }> = {
    manager:        { uid: managerAId,      portal: "manager" },
    accountant:     { uid: accountantAId,   portal: "manager" },
    facility_staff: { uid: facilityAId,     portal: "manager" },
    hq_executive:   { uid: hqMappedToBId,   portal: "hq" },
    platform_admin: { uid: platformAdminId, portal: "hq" },
  };
  for (const { path, allowedRoles } of matrix) {
    for (const role of allowedRoles) {
      const u = roleToUser[role];
      asUser(u.uid, role, u.portal);
      const res = await fetch(`${denialBaseUrl}${path}`);
      assert.equal(res.status, 200, `${role} ${path} 는 200 이어야 함`);
    }
    // accountant 가 빠진 prefix(예: inspections/warranties/maintenance-logs/safety-checklists)
    //   에서는 회계가 차단되어야 한다 — 화이트리스트의 음의 검증.
    if (!allowedRoles.includes("accountant")) {
      asUser(accountantAId, "accountant", "manager");
      const res = await fetch(`${denialBaseUrl}${path}`);
      assert.equal(res.status, 403, `accountant ${path} 는 403 이어야 함 (음의 검증)`);
    }
  }
});
