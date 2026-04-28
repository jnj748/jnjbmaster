// [Task #558] 완료보고서(work-reports) 라우터의 건물 스코프 회귀 테스트.
//
// 시나리오:
//   1) 매니저 A 의 GET /work-reports 는 본인 건물(A) 보고서만 반환.
//   2) 매니저 A → 다른 건물(B) 보고서 GET/PATCH → 404.
//   3) 매니저 A → 본인 건물 단건 GET 200.
//   4) buildingId 없는 매니저는 빈 목록.
//   5) platform_admin 은 두 건물 모두 가시.
//
// 라우터는 manager / platform_admin 만 허용하므로 accountant/facility_staff
// 케이스는 본 라우터 정책상 의미가 없어 생략한다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-work-reports-scope-tests";

// pg 드라이버는 date(OID 1082) 컬럼을 JS Date 로 변환하지만 라우터의 Zod
// 응답 스키마(zod.string().date())는 'YYYY-MM-DD' 문자열을 기대한다. rfqs
// 라우터처럼 별도 직렬화 헬퍼를 두지 않은 라우터들은 테스트 시 응답 검증이
// 실패하므로, 본 테스트에서만 원문(text) 그대로 받도록 type parser 를 등록한다.
const { pg, db, usersTable, buildingsTable, workReportsTable, pool } = await import("@workspace/db");
pg.types.setTypeParser(1082, (val: string) => val); // date → 'YYYY-MM-DD' 문자열
pg.types.setTypeParser(1114, (val: string) => new Date(val).toISOString()); // timestamp → ISO
pg.types.setTypeParser(1184, (val: string) => new Date(val).toISOString()); // timestamptz → ISO
const { inArray } = await import("drizzle-orm");
const { default: workReportsRouter } = await import("../routes/workReports");

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
app.use("/api", workReportsRouter);

let server: Server;
let baseUrl: string;
const createdBuildingIds: number[] = [];
const createdUserIds: number[] = [];
const createdReportIds: number[] = [];

let buildingAId: number;
let buildingBId: number;
let managerAId: number;
let managerBId: number;
let orphanManagerId: number;
let platformAdminId: number;
let reportAId: number;
let reportBId: number;

function uniqueEmail(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}@work-reports-scope-test.local`;
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

async function createReport(buildingId: number): Promise<number> {
  const today = new Date().toISOString().split("T")[0];
  const [r] = await db
    .insert(workReportsTable)
    .values({
      rfqId: 999000 + buildingId,
      quoteId: 999000 + buildingId,
      vendorId: 999000 + buildingId,
      vendorName: `벤더-${buildingId}`,
      buildingId,
      title: `완료보고서 b${buildingId} ${crypto.randomUUID().slice(0, 6)}`,
      completionDate: today,
      status: "submitted",
    } as typeof workReportsTable.$inferInsert)
    .returning();
  createdReportIds.push(r.id);
  return r.id;
}

function asUser(userId: number, role: string) {
  currentUser = {
    userId,
    role,
    email: `${role}-${userId}@work-reports-scope-test.local`,
    portalType: role === "platform_admin" ? "platform" : "building",
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
  orphanManagerId = await createUser("manager", null);
  platformAdminId = await createUser("platform_admin", null, "platform");

  reportAId = await createReport(buildingAId);
  reportBId = await createReport(buildingBId);
});

after(async () => {
  if (createdReportIds.length > 0) {
    await db.delete(workReportsTable).where(inArray(workReportsTable.id, createdReportIds));
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

test("[Task #558] 매니저 A 의 GET /work-reports 는 본인 건물(A) 보고서만", async () => {
  asUser(managerAId, "manager");
  const res = await fetch(`${baseUrl}/work-reports`);
  assert.equal(res.status, 200);
  const list = (await res.json()) as Array<{ id: number }>;
  const ids = new Set(list.map((r) => r.id));
  assert.ok(ids.has(reportAId));
  assert.ok(!ids.has(reportBId), "건물 B 의 완료보고서 누설 금지");
});

test("[Task #558] 매니저 A → 타 건물 보고서 GET/PATCH 모두 404", async () => {
  asUser(managerAId, "manager");
  const get = await fetch(`${baseUrl}/work-reports/${reportBId}`);
  assert.equal(get.status, 404);
  const patch = await fetch(`${baseUrl}/work-reports/${reportBId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "approved" }),
  });
  assert.equal(patch.status, 404);
});

test("[Task #558] 매니저 A → 본인 건물 보고서 단건 GET 200", async () => {
  asUser(managerAId, "manager");
  const res = await fetch(`${baseUrl}/work-reports/${reportAId}`);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { id: number };
  assert.equal(body.id, reportAId);
});

test("[Task #558] buildingId 비어 있는 매니저는 빈 목록", async () => {
  asUser(orphanManagerId, "manager");
  const res = await fetch(`${baseUrl}/work-reports`);
  assert.equal(res.status, 200);
  const list = (await res.json()) as Array<unknown>;
  assert.equal(list.length, 0);
});

test("[Task #558] platform_admin 은 두 건물 보고서 모두 가시 + 단건 조회 가능", async () => {
  asUser(platformAdminId, "platform_admin");
  const res = await fetch(`${baseUrl}/work-reports`);
  assert.equal(res.status, 200);
  const list = (await res.json()) as Array<{ id: number }>;
  const ids = new Set(list.map((r) => r.id));
  assert.ok(ids.has(reportAId));
  assert.ok(ids.has(reportBId));

  const detailRes = await fetch(`${baseUrl}/work-reports/${reportBId}`);
  assert.equal(detailRes.status, 200);
});

test("[Task #558] 매니저 B → 매니저 A 의 보고서 단건 차단", async () => {
  asUser(managerBId, "manager");
  const res = await fetch(`${baseUrl}/work-reports/${reportAId}`);
  assert.equal(res.status, 404);
});
