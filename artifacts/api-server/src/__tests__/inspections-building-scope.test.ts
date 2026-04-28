// [Task #558] 점검(inspections) 라우터의 건물 스코프 회귀 테스트.
//
// 시나리오:
//   1) 매니저 A 의 GET /inspections 는 본인 건물(A) 점검만 반환(B 누설 X).
//   2) 매니저 A 가 다른 건물(B) 점검 ID 로 GET /inspections/:id/logs 호출 →
//      404 (존재 자체 누설 방지).
//   3) 매니저 A 가 다른 건물 점검 ID 로 PATCH/DELETE 호출 → 404.
//   4) facility_staff / accountant 도 동일하게 본인 건물만.
//   5) buildingId 가 비어 있는 매니저는 빈 목록.
//   6) platform_admin / hq_executive 는 두 건물 모두 가시.
//   7) GET /inspections/upcoming 도 동일 스코프.
//
// 인증: inspections 라우터는 requireRole 가드를 자체적으로 가지므로 테스트
//   미들웨어로 req.user 를 직접 주입한다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-inspections-scope-tests";

// pg 드라이버는 date(OID 1082) 컬럼을 JS Date 로 변환하지만 라우터의 Zod
// 응답 스키마(zod.string().date())는 'YYYY-MM-DD' 문자열을 기대한다. rfqs
// 라우터처럼 별도 직렬화 헬퍼를 두지 않은 라우터들은 테스트 시 응답 검증이
// 실패하므로, 본 테스트에서만 원문(text) 그대로 받도록 type parser 를 등록한다.
const { pg, db, usersTable, buildingsTable, inspectionsTable, pool } = await import("@workspace/db");
pg.types.setTypeParser(1082, (val: string) => val); // date → 'YYYY-MM-DD' 문자열
pg.types.setTypeParser(1114, (val: string) => new Date(val).toISOString()); // timestamp → ISO
pg.types.setTypeParser(1184, (val: string) => new Date(val).toISOString()); // timestamptz → ISO
const { inArray } = await import("drizzle-orm");
const { default: inspectionsRouter } = await import("../routes/inspections");

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
app.use("/api", inspectionsRouter);

let server: Server;
let baseUrl: string;
const createdBuildingIds: number[] = [];
const createdUserIds: number[] = [];
const createdInspectionIds: number[] = [];

let buildingAId: number;
let buildingBId: number;
let managerAId: number;
let managerBId: number;
let accountantAId: number;
let facilityAId: number;
let orphanManagerId: number;
let platformAdminId: number;
let hqExecutiveId: number;
let inspA1Id: number;
let inspA2Id: number;
let inspB1Id: number;

function uniqueEmail(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}@inspections-scope-test.local`;
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

async function createInspection(buildingId: number): Promise<number> {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const [r] = await db
    .insert(inspectionsTable)
    .values({
      buildingId,
      name: `테스트점검 b${buildingId} ${crypto.randomUUID().slice(0, 6)}`,
      category: "elevator",
      inspectionType: "legal",
      frequencyPerYear: 12,
      legalCycleMonths: 1,
      nextDueDate: tomorrow,
      advanceAlertDays: 30,
    } as typeof inspectionsTable.$inferInsert)
    .returning();
  createdInspectionIds.push(r.id);
  return r.id;
}

function asUser(userId: number, role: string) {
  currentUser = {
    userId,
    role,
    email: `${role}-${userId}@inspections-scope-test.local`,
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
  accountantAId = await createUser("accountant", buildingAId);
  facilityAId = await createUser("facility_staff", buildingAId);
  orphanManagerId = await createUser("manager", null);
  platformAdminId = await createUser("platform_admin", null, "platform");
  hqExecutiveId = await createUser("hq_executive", null, "hq");

  inspA1Id = await createInspection(buildingAId);
  inspA2Id = await createInspection(buildingAId);
  inspB1Id = await createInspection(buildingBId);
});

after(async () => {
  if (createdInspectionIds.length > 0) {
    await db.delete(inspectionsTable).where(inArray(inspectionsTable.id, createdInspectionIds));
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

test("[Task #558] 매니저 A 의 GET /inspections 는 본인 건물(A) 점검만 반환", async () => {
  asUser(managerAId, "manager");
  const res = await fetch(`${baseUrl}/inspections`);
  assert.equal(res.status, 200);
  const list = (await res.json()) as Array<{ id: number }>;
  const ids = new Set(list.map((r) => r.id));
  assert.ok(ids.has(inspA1Id), "건물 A 의 점검 1 은 보여야 함");
  assert.ok(ids.has(inspA2Id), "건물 A 의 점검 2 는 보여야 함");
  assert.ok(!ids.has(inspB1Id), "건물 B 의 점검은 노출되면 안 됨");
});

test("[Task #558] 매니저 A → 타 건물 점검 ID GET /inspections/:id/logs 는 404", async () => {
  asUser(managerAId, "manager");
  const res = await fetch(`${baseUrl}/inspections/${inspB1Id}/logs`);
  assert.equal(res.status, 404);
});

test("[Task #558] 매니저 A → 타 건물 점검 PATCH 는 404", async () => {
  asUser(managerAId, "manager");
  const res = await fetch(`${baseUrl}/inspections/${inspB1Id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes: "공격자 메모" }),
  });
  assert.equal(res.status, 404);
});

test("[Task #558] 매니저 A → 타 건물 점검 DELETE 는 404", async () => {
  asUser(managerAId, "manager");
  const res = await fetch(`${baseUrl}/inspections/${inspB1Id}`, { method: "DELETE" });
  assert.equal(res.status, 404);
});

test("[Task #558] 매니저 A → 본인 건물 점검 GET /inspections/:id/logs 는 200", async () => {
  asUser(managerAId, "manager");
  const res = await fetch(`${baseUrl}/inspections/${inspA1Id}/logs`);
  assert.equal(res.status, 200);
});

test("[Task #558] facility_staff 도 본인 건물만 보이고 타 건물은 차단", async () => {
  // [Task #558] inspections 라우터의 requireRole 은 accountant 를 허용하지
  //   않는다(manager / platform_admin / hq_executive / facility_staff 만 가능).
  //   accountant 는 다른 회계 관련 라우터에서 별도로 검증한다.
  for (const [uid, role] of [[facilityAId, "facility_staff"]] as const) {
    asUser(uid, role);
    const listRes = await fetch(`${baseUrl}/inspections`);
    assert.equal(listRes.status, 200);
    const list = (await listRes.json()) as Array<{ id: number }>;
    const ids = new Set(list.map((r) => r.id));
    assert.ok(ids.has(inspA1Id), `${role}: 본인 건물 점검 보여야 함`);
    assert.ok(!ids.has(inspB1Id), `${role}: 타 건물 점검 노출되면 안 됨`);

    const detailRes = await fetch(`${baseUrl}/inspections/${inspB1Id}/logs`);
    assert.equal(detailRes.status, 404, `${role}: 타 건물 단건 차단되어야 함`);
  }
});

test("[Task #558] buildingId 가 비어 있는 매니저는 빈 목록(에러 아님)", async () => {
  asUser(orphanManagerId, "manager");
  const res = await fetch(`${baseUrl}/inspections`);
  assert.equal(res.status, 200);
  const list = (await res.json()) as Array<unknown>;
  assert.equal(list.length, 0);
});

test("[Task #558] platform_admin / hq_executive 는 두 건물 점검 모두 가시", async () => {
  for (const [uid, role] of [[platformAdminId, "platform_admin"], [hqExecutiveId, "hq_executive"]] as const) {
    asUser(uid, role);
    const res = await fetch(`${baseUrl}/inspections`);
    assert.equal(res.status, 200);
    const list = (await res.json()) as Array<{ id: number }>;
    const ids = new Set(list.map((r) => r.id));
    assert.ok(ids.has(inspA1Id), `${role}: 건물 A 점검 봐야 함`);
    assert.ok(ids.has(inspB1Id), `${role}: 건물 B 점검 봐야 함`);

    const detailRes = await fetch(`${baseUrl}/inspections/${inspB1Id}/logs`);
    assert.equal(detailRes.status, 200, `${role}: 모든 건물 점검 단건 가능`);
  }
});

test("[Task #558] GET /inspections/upcoming 도 건물 단위 역할은 본인 건물만", async () => {
  asUser(managerAId, "manager");
  const res = await fetch(`${baseUrl}/inspections/upcoming`);
  assert.equal(res.status, 200);
  const list = (await res.json()) as Array<{ id: number }>;
  const ids = new Set(list.map((r) => r.id));
  assert.ok(!ids.has(inspB1Id), "다가오는 점검에서도 타 건물은 노출되면 안 됨");
});

test("[Task #558] POST /inspections/generate-alerts 는 platform_admin / hq_executive 만 호출 가능 (스케줄러 응답이 타 건물 점검을 노출하지 않도록 차단)", async () => {
  for (const [uid, role] of [[managerAId, "manager"], [facilityAId, "facility_staff"]] as const) {
    asUser(uid, role);
    const res = await fetch(`${baseUrl}/inspections/generate-alerts`, { method: "POST" });
    assert.equal(res.status, 403, `${role}: 매니저/시설직원은 차단되어야 함`);
  }
  for (const [uid, role] of [[platformAdminId, "platform_admin"], [hqExecutiveId, "hq_executive"]] as const) {
    asUser(uid, role);
    const res = await fetch(`${baseUrl}/inspections/generate-alerts`, { method: "POST" });
    assert.equal(res.status, 200, `${role}: 본부/관리자는 허용`);
  }
});

test("[Task #558] POST /inspections/ai-matching 도 platform_admin / hq_executive 만 호출 가능 (스케줄러 응답이 타 건물 점검/추천 업체를 노출하지 않도록 차단)", async () => {
  for (const [uid, role] of [[managerAId, "manager"], [facilityAId, "facility_staff"]] as const) {
    asUser(uid, role);
    const res = await fetch(`${baseUrl}/inspections/ai-matching`, { method: "POST" });
    assert.equal(res.status, 403, `${role}: 매니저/시설직원은 ai-matching 호출 불가`);
  }
  for (const [uid, role] of [[platformAdminId, "platform_admin"], [hqExecutiveId, "hq_executive"]] as const) {
    asUser(uid, role);
    const res = await fetch(`${baseUrl}/inspections/ai-matching`, { method: "POST" });
    assert.equal(res.status, 200, `${role}: 본부/관리자는 ai-matching 허용`);
  }
});

test("[Task #558] 매니저 B 는 본인 건물(B) 점검만 보이고 A 의 점검 단건 PATCH 는 404", async () => {
  asUser(managerBId, "manager");
  const listRes = await fetch(`${baseUrl}/inspections`);
  assert.equal(listRes.status, 200);
  const list = (await listRes.json()) as Array<{ id: number }>;
  const ids = new Set(list.map((r) => r.id));
  assert.ok(ids.has(inspB1Id));
  assert.ok(!ids.has(inspA1Id));

  const patchRes = await fetch(`${baseUrl}/inspections/${inspA1Id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes: "타 건물 매니저 메모" }),
  });
  assert.equal(patchRes.status, 404);
});
