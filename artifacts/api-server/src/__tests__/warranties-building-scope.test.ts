// [Task #558] 하자보수(warranties) 라우터의 건물 스코프 회귀 테스트.
//
// 시나리오:
//   1) 매니저 A → GET /warranties/building/:B → 404 (다른 건물).
//   2) 매니저 A → GET /warranties/building/:A → 200.
//   3) 매니저 A → POST /warranties/building/:B (생성) → 404.
//   4) 매니저 A → PATCH /warranties/:warrantyB (B 소속) → 404.
//   5) facility_staff 도 동일 스코프.
//   6) buildingId 없는 매니저는 본인 건물도 못 보고 404.
//   7) platform_admin / hq_executive 는 모든 건물 가시.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-warranties-scope-tests";

// pg 드라이버는 date(OID 1082) 컬럼을 JS Date 로 변환하지만 라우터의 Zod
// 응답 스키마(zod.string().date())는 'YYYY-MM-DD' 문자열을 기대한다. rfqs
// 라우터처럼 별도 직렬화 헬퍼를 두지 않은 라우터들은 테스트 시 응답 검증이
// 실패하므로, 본 테스트에서만 원문(text) 그대로 받도록 type parser 를 등록한다.
const { pg, db, usersTable, buildingsTable, buildingWarrantiesTable, pool } = await import("@workspace/db");
pg.types.setTypeParser(1082, (val: string) => val); // date → 'YYYY-MM-DD' 문자열
pg.types.setTypeParser(1114, (val: string) => new Date(val).toISOString()); // timestamp → ISO
pg.types.setTypeParser(1184, (val: string) => new Date(val).toISOString()); // timestamptz → ISO
const { inArray } = await import("drizzle-orm");
const { default: warrantiesRouter } = await import("../routes/warranties");

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
app.use("/api", warrantiesRouter);

let server: Server;
let baseUrl: string;
const createdBuildingIds: number[] = [];
const createdUserIds: number[] = [];
const createdWarrantyIds: number[] = [];

let buildingAId: number;
let buildingBId: number;
let managerAId: number;
let managerBId: number;
let facilityAId: number;
let orphanManagerId: number;
let platformAdminId: number;
let hqExecutiveId: number;
let warrantyAId: number;
let warrantyBId: number;

function uniqueEmail(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}@warranties-scope-test.local`;
}

async function createBuilding(name: string): Promise<number> {
  const [b] = await db
    .insert(buildingsTable)
    .values({ name, addressFull: "서울특별시 강남구 테헤란로 1", sido: "서울특별시", sigungu: "강남구" } as typeof buildingsTable.$inferInsert)
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

async function createWarranty(buildingId: number): Promise<number> {
  const today = new Date();
  const start = today.toISOString().split("T")[0];
  const expiry = new Date(today.getFullYear() + 2, today.getMonth(), today.getDate()).toISOString().split("T")[0];
  const [r] = await db
    .insert(buildingWarrantiesTable)
    .values({
      buildingId,
      tradeCategory: "electrical",
      tradeName: `테스트 하자 b${buildingId} ${crypto.randomUUID().slice(0, 6)}`,
      warrantyYears: 2,
      startDate: start,
      expiryDate: expiry,
      status: "active",
    } as typeof buildingWarrantiesTable.$inferInsert)
    .returning();
  createdWarrantyIds.push(r.id);
  return r.id;
}

function asUser(userId: number, role: string) {
  currentUser = {
    userId,
    role,
    email: `${role}-${userId}@warranties-scope-test.local`,
    portalType: role === "platform_admin" ? "platform" : role === "hq_executive" ? "hq" : "building",
  };
}

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}/api`;

  buildingAId = await createBuilding(`테스트빌딩A-${crypto.randomUUID().slice(0, 6)}`);
  buildingBId = await createBuilding(`테스트빌딩B-${crypto.randomUUID().slice(0, 6)}`);

  managerAId = await createUser("manager", buildingAId);
  managerBId = await createUser("manager", buildingBId);
  facilityAId = await createUser("facility_staff", buildingAId);
  orphanManagerId = await createUser("manager", null);
  platformAdminId = await createUser("platform_admin", null, "platform");
  hqExecutiveId = await createUser("hq_executive", null, "hq");

  warrantyAId = await createWarranty(buildingAId);
  warrantyBId = await createWarranty(buildingBId);
});

after(async () => {
  if (createdWarrantyIds.length > 0) {
    await db.delete(buildingWarrantiesTable).where(inArray(buildingWarrantiesTable.id, createdWarrantyIds));
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

test("[Task #558] 매니저 A → GET /warranties/building/:B 는 404", async () => {
  asUser(managerAId, "manager");
  const res = await fetch(`${baseUrl}/warranties/building/${buildingBId}`);
  assert.equal(res.status, 404);
});

test("[Task #558] 매니저 A → GET /warranties/building/:A 는 200", async () => {
  asUser(managerAId, "manager");
  const res = await fetch(`${baseUrl}/warranties/building/${buildingAId}`);
  assert.equal(res.status, 200);
  const list = (await res.json()) as Array<{ id: number }>;
  const ids = new Set(list.map((r) => r.id));
  assert.ok(ids.has(warrantyAId));
});

test("[Task #558] 매니저 A → POST /warranties/building/:B 생성 시도 404", async () => {
  asUser(managerAId, "manager");
  const today = new Date().toISOString().split("T")[0];
  const res = await fetch(`${baseUrl}/warranties/building/${buildingBId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tradeCategory: "plumbing",
      tradeName: "공격자 생성 시도",
      warrantyYears: 1,
      startDate: today,
      expiryDate: today,
    }),
  });
  assert.equal(res.status, 404);
});

test("[Task #558] 매니저 A → PATCH /warranties/:B 소속 하자 → 404", async () => {
  asUser(managerAId, "manager");
  const res = await fetch(`${baseUrl}/warranties/${warrantyBId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "expired" }),
  });
  assert.equal(res.status, 404);
});

test("[Task #558] 매니저 A → PATCH /warranties/:A 본인 건물 → 200", async () => {
  asUser(managerAId, "manager");
  const res = await fetch(`${baseUrl}/warranties/${warrantyAId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes: "정상 갱신" }),
  });
  assert.equal(res.status, 200);
});

test("[Task #558] facility_staff 도 다른 건물은 404", async () => {
  asUser(facilityAId, "facility_staff");
  const res = await fetch(`${baseUrl}/warranties/building/${buildingBId}`);
  assert.equal(res.status, 404);
  const own = await fetch(`${baseUrl}/warranties/building/${buildingAId}`);
  assert.equal(own.status, 200);
});

test("[Task #558] buildingId 없는 매니저는 본인 건물 매칭 자체가 없으므로 404", async () => {
  asUser(orphanManagerId, "manager");
  const res = await fetch(`${baseUrl}/warranties/building/${buildingAId}`);
  assert.equal(res.status, 404);
});

test("[Task #558] platform_admin / hq_executive 는 두 건물 모두 가시", async () => {
  for (const [uid, role] of [[platformAdminId, "platform_admin"], [hqExecutiveId, "hq_executive"]] as const) {
    asUser(uid, role);
    const a = await fetch(`${baseUrl}/warranties/building/${buildingAId}`);
    assert.equal(a.status, 200, `${role}: 건물 A`);
    const b = await fetch(`${baseUrl}/warranties/building/${buildingBId}`);
    assert.equal(b.status, 200, `${role}: 건물 B`);
    const patch = await fetch(`${baseUrl}/warranties/${warrantyBId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "expired" }),
    });
    assert.equal(patch.status, 200, `${role}: 단건 PATCH 도 통과`);
  }
});

test("[Task #558] 매니저 B → A 의 하자 PATCH 차단", async () => {
  asUser(managerBId, "manager");
  const res = await fetch(`${baseUrl}/warranties/${warrantyAId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "expired" }),
  });
  assert.equal(res.status, 404);
});

test("[Task #558] POST /warranties/check-alerts 는 platform_admin / hq_executive 만 호출 가능 (스케줄러 응답이 타 건물 하자담보를 노출하지 않도록 차단)", async () => {
  for (const [uid, role] of [[managerAId, "manager"], [facilityAId, "facility_staff"]] as const) {
    asUser(uid, role);
    const res = await fetch(`${baseUrl}/warranties/check-alerts`, { method: "POST" });
    assert.equal(res.status, 403, `${role}: 매니저/시설직원은 차단되어야 함`);
  }
  for (const [uid, role] of [[platformAdminId, "platform_admin"], [hqExecutiveId, "hq_executive"]] as const) {
    asUser(uid, role);
    const res = await fetch(`${baseUrl}/warranties/check-alerts`, { method: "POST" });
    assert.equal(res.status, 200, `${role}: 본부/관리자는 허용`);
  }
});
