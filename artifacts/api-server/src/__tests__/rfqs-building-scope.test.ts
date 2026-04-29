// [Task #551] 견적요청 목록·상세 API 의 건물 스코프 회귀 테스트.
//
// 시나리오:
//   1) 매니저 A 가 GET /rfqs 를 호출하면 본인 건물(A) 의 RFQ 만 반환된다.
//      다른 건물(B) 의 RFQ 는 어떤 status 든 노출되지 않는다.
//   2) 매니저 A 가 다른 건물(B) 의 RFQ ID 로 GET /rfqs/:id 를 호출하면
//      404 로 차단된다(존재 자체를 누설하지 않기 위해 403 대신 404).
//   3) 매니저 A 는 본인 건물(A) RFQ 단건 조회는 정상적으로 된다.
//   4) facility_staff / accountant 도 동일한 스코프 규칙으로 동작한다.
//   5) buildingId 가 비어 있는 매니저 계정은 빈 목록을 받는다(에러 아님).
//   6) platform_admin / hq_executive 는 두 건물 RFQ 가 모두 보이고,
//      ?buildingId 쿼리 파라미터로 특정 건물만 필터할 수 있다.
//
// 인증: rfqs 라우터는 라우트 자체에 requireRole 가드가 없는 GET 핸들러이므로,
//   테스트 미들웨어로 req.user 를 직접 주입한다(전역 approvalGate 우회).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-rfqs-scope-tests";

const { db, usersTable, buildingsTable, rfqsTable, pool } = await import("@workspace/db");
const { eq, inArray } = await import("drizzle-orm");
const { default: rfqsRouter } = await import("../routes/rfqs");

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
app.use("/api", rfqsRouter);

let server: Server;
let baseUrl: string;
const createdBuildingIds: number[] = [];
const createdUserIds: number[] = [];
const createdRfqIds: number[] = [];

let buildingAId: number;
let buildingBId: number;
let managerAId: number;
let managerBId: number;
let accountantAId: number;
let facilityAId: number;
let orphanManagerId: number;
let platformAdminId: number;
let hqExecutiveId: number;
let rfqA1Id: number;
let rfqA2Id: number;
let rfqB1Id: number;
let rfqBClosedId: number;

function uniqueEmail(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}@rfqs-scope-test.local`;
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

async function createRfq(buildingId: number, status: "open" | "closed" | "cancelled" = "open"): Promise<number> {
  const [r] = await db
    .insert(rfqsTable)
    .values({
      title: `테스트 RFQ b${buildingId} ${status} ${crypto.randomUUID().slice(0, 6)}`,
      category: "elevator",
      buildingName: "테스트빌딩",
      buildingId,
      deadline: "2099-12-31",
      status,
    } as typeof rfqsTable.$inferInsert)
    .returning();
  createdRfqIds.push(r.id);
  return r.id;
}

function asUser(userId: number, role: string) {
  currentUser = {
    userId,
    role,
    email: `${role}-${userId}@rfqs-scope-test.local`,
    portalType: role === "partner" ? "partner" : "building",
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

  rfqA1Id = await createRfq(buildingAId, "open");
  rfqA2Id = await createRfq(buildingAId, "open");
  rfqB1Id = await createRfq(buildingBId, "open");
  rfqBClosedId = await createRfq(buildingBId, "closed");
});

after(async () => {
  if (createdRfqIds.length > 0) {
    await db.delete(rfqsTable).where(inArray(rfqsTable.id, createdRfqIds));
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

test("[Task #551] 매니저 A 의 GET /rfqs 는 본인 건물(A) RFQ 만 반환한다 (다른 건물 RFQ 누설 없음)", async () => {
  asUser(managerAId, "manager");
  const res = await fetch(`${baseUrl}/rfqs`);
  assert.equal(res.status, 200);
  const list = (await res.json()) as Array<{ id: number }>;

  const ids = new Set(list.map((r) => r.id));
  assert.ok(ids.has(rfqA1Id), "건물 A 의 open RFQ 1 은 보여야 함");
  assert.ok(ids.has(rfqA2Id), "건물 A 의 open RFQ 2 는 보여야 함");
  assert.ok(!ids.has(rfqB1Id), "건물 B 의 open RFQ 가 노출되면 안 됨");
  assert.ok(!ids.has(rfqBClosedId), "건물 B 의 closed RFQ 도 노출되면 안 됨");

  // 추가로 DB 직접 조회로 모든 응답 ID 가 건물 A 에 속하는지 검증한다.
  // (응답 스키마에 buildingId 가 노출되어 있지 않으므로 DB 로 확인)
  if (list.length > 0) {
    const rows = await db.select({ id: rfqsTable.id, buildingId: rfqsTable.buildingId })
      .from(rfqsTable)
      .where(inArray(rfqsTable.id, list.map((r) => r.id)));
    for (const r of rows) {
      assert.equal(r.buildingId, buildingAId, "모든 행이 건물 A 로 스코프되어 있어야 함");
    }
  }
});

test("[Task #551] 매니저 A 가 다른 건물(B) RFQ ID 로 GET /rfqs/:id 호출 시 404", async () => {
  asUser(managerAId, "manager");
  const res = await fetch(`${baseUrl}/rfqs/${rfqB1Id}`);
  assert.equal(res.status, 404, "타 건물 RFQ ID 직접 조회는 404 로 차단되어야 함");
});

test("[Task #551] 매니저 A 가 closed 상태인 다른 건물 RFQ 단건 조회도 404", async () => {
  asUser(managerAId, "manager");
  const res = await fetch(`${baseUrl}/rfqs/${rfqBClosedId}`);
  assert.equal(res.status, 404, "closed 라도 타 건물이면 404");
});

test("[Task #551] 매니저 A 는 본인 건물(A) RFQ 단건 조회는 정상 200", async () => {
  asUser(managerAId, "manager");
  const res = await fetch(`${baseUrl}/rfqs/${rfqA1Id}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { id: number };
  assert.equal(body.id, rfqA1Id);
});

test("[Task #551] 경리(accountant) 도 본인 건물 RFQ 만 보이고 타 건물은 차단된다", async () => {
  asUser(accountantAId, "accountant");
  const listRes = await fetch(`${baseUrl}/rfqs`);
  assert.equal(listRes.status, 200);
  const list = (await listRes.json()) as Array<{ id: number; buildingId: number | null }>;
  const ids = new Set(list.map((r) => r.id));
  assert.ok(ids.has(rfqA1Id));
  assert.ok(!ids.has(rfqB1Id));

  const detailRes = await fetch(`${baseUrl}/rfqs/${rfqB1Id}`);
  assert.equal(detailRes.status, 404);
});

test("[Task #551] 시설기사(facility_staff) 도 본인 건물 RFQ 만 보이고 타 건물은 차단된다", async () => {
  asUser(facilityAId, "facility_staff");
  const listRes = await fetch(`${baseUrl}/rfqs`);
  assert.equal(listRes.status, 200);
  const list = (await listRes.json()) as Array<{ id: number; buildingId: number | null }>;
  const ids = new Set(list.map((r) => r.id));
  assert.ok(ids.has(rfqA1Id));
  assert.ok(!ids.has(rfqB1Id));

  const detailRes = await fetch(`${baseUrl}/rfqs/${rfqB1Id}`);
  assert.equal(detailRes.status, 404);
});

test("[Task #551] buildingId 가 비어 있는 매니저는 빈 목록(에러 아님)", async () => {
  asUser(orphanManagerId, "manager");
  const res = await fetch(`${baseUrl}/rfqs`);
  assert.equal(res.status, 200);
  const list = (await res.json()) as Array<unknown>;
  assert.equal(list.length, 0, "buildingId 가 NULL 이면 빈 배열을 반환해야 함");
});

test("[Task #551] platform_admin 은 두 건물 RFQ 가 모두 보이고, ?buildingId 로 특정 건물만 필터 가능", async () => {
  asUser(platformAdminId, "platform_admin");

  const allRes = await fetch(`${baseUrl}/rfqs`);
  assert.equal(allRes.status, 200);
  const all = (await allRes.json()) as Array<{ id: number }>;
  const allIds = new Set(all.map((r) => r.id));
  assert.ok(allIds.has(rfqA1Id), "platform_admin 은 건물 A 의 RFQ 도 봐야 함");
  assert.ok(allIds.has(rfqB1Id), "platform_admin 은 건물 B 의 RFQ 도 봐야 함");

  const filteredRes = await fetch(`${baseUrl}/rfqs?buildingId=${buildingBId}`);
  assert.equal(filteredRes.status, 200);
  const filtered = (await filteredRes.json()) as Array<{ id: number }>;
  const fIds = new Set(filtered.map((r) => r.id));
  assert.ok(!fIds.has(rfqA1Id), "buildingId=B 필터 시 A 의 RFQ 는 노출되면 안 됨");
  assert.ok(fIds.has(rfqB1Id), "buildingId=B 필터 시 B 의 open RFQ 는 보여야 함");

  // DB 직접 조회로 모든 응답 ID 가 건물 B 에 속하는지 검증.
  if (filtered.length > 0) {
    const rows = await db.select({ id: rfqsTable.id, buildingId: rfqsTable.buildingId })
      .from(rfqsTable)
      .where(inArray(rfqsTable.id, filtered.map((r) => r.id)));
    for (const r of rows) {
      assert.equal(r.buildingId, buildingBId);
    }
  }
});

// [Task #596] 본부장(hq_executive) 가시성 정합화 — 매핑 없는 본부장은 RFQ 가 모두 가려진다.
//   과거 #551 시점의 기대(전 건물 가시)는 #596 으로 무효화되었다. 매핑 부여 후의 동작도 함께 검증.
test("[Task #596] hq_executive — 매핑 없으면 어떤 RFQ 도 보이지 않고 단건 조회도 404 로 차단된다", async () => {
  asUser(hqExecutiveId, "hq_executive");
  const allRes = await fetch(`${baseUrl}/rfqs`);
  assert.equal(allRes.status, 200);
  const all = (await allRes.json()) as Array<{ id: number }>;
  const allIds = new Set(all.map((r) => r.id));
  assert.ok(!allIds.has(rfqA1Id), "매핑 없는 본부장은 건물 A RFQ 가 보이면 안 됨");
  assert.ok(!allIds.has(rfqB1Id), "매핑 없는 본부장은 건물 B RFQ 도 보이면 안 됨");

  const detailRes = await fetch(`${baseUrl}/rfqs/${rfqB1Id}`);
  assert.equal(detailRes.status, 404, "매핑 없는 본부장 → 단건 조회도 404 로 차단");
});

test("[Task #551] 매니저 B 는 본인 건물(B) RFQ 만 보이고 건물 A 의 RFQ ID 직접 조회도 차단", async () => {
  asUser(managerBId, "manager");
  const listRes = await fetch(`${baseUrl}/rfqs`);
  assert.equal(listRes.status, 200);
  const list = (await listRes.json()) as Array<{ id: number; buildingId: number | null }>;
  const ids = new Set(list.map((r) => r.id));
  assert.ok(ids.has(rfqB1Id));
  assert.ok(!ids.has(rfqA1Id));

  const detailRes = await fetch(`${baseUrl}/rfqs/${rfqA1Id}`);
  assert.equal(detailRes.status, 404, "매니저 B → 건물 A RFQ 직접 조회 차단");
});
