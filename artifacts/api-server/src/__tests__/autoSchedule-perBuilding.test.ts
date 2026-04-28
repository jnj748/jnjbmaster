// [Task #502] auto-schedule-inspections 통합 회귀.
//   같은 항목명·같은 cycle 이라도, 사용승인일(approvalDate) 이 서로 다른 두 건물에
//   대해서는 nextDueDate 가 달라야 한다. 이 회귀 테스트가 깨졌다는 것은 사용승인일이
//   더 이상 일정 산정에 반영되지 않는다(=화면 카피와 실제 동작 불일치)는 신호다.
//
// 테스트 설계:
//  - 매니저 + 빌딩 2개를 직접 생성(approvalDate 만 다르게).
//  - useFallbackCompletionDate=true 로 동일한 inspectionDates payload 를 보낸다.
//  - DB 에 저장된 inspections 행의 nextDueDate 가 항목별로 두 건물 간 다른지 확인.
//  - notes 필드가 [임시] 사용승인일 기준 ... 으로 통일됐는지도 함께 검증.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-auto-schedule-tests";

const { db, usersTable, buildingsTable, inspectionsTable, pool } = await import("@workspace/db");
const { eq, inArray } = await import("drizzle-orm");
const { default: buildingsRouter } = await import("../routes/buildings");

let currentUser: { userId: number; role: string } | null = null;
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
app.use("/api", buildingsRouter);

let server: Server;
let baseUrl: string;
const createdBuildingIds: number[] = [];
const createdUserIds: number[] = [];

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}/api`;
});

after(async () => {
  if (createdBuildingIds.length > 0) {
    await db.delete(inspectionsTable).where(inArray(inspectionsTable.buildingId, createdBuildingIds));
    await db.delete(buildingsTable).where(inArray(buildingsTable.id, createdBuildingIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await pool.end();
});

async function createTestManager(): Promise<number> {
  const [u] = await db
    .insert(usersTable)
    .values({
      email: `mgr-${crypto.randomUUID()}@auto-schedule-test.local`,
      passwordHash: "x",
      role: "manager",
      name: "자동산정 테스트 매니저",
      portalType: "building",
      approvalStatus: "active",
      roleSelected: true,
    } as typeof usersTable.$inferInsert)
    .returning();
  createdUserIds.push(u.id);
  return u.id;
}

async function createTestBuilding(name: string, approvalDate: string): Promise<number> {
  const [b] = await db
    .insert(buildingsTable)
    .values({
      name,
      addressFull: "서울특별시 강남구 테헤란로 1",
      approvalDate,
      totalArea: "5000",
    } as typeof buildingsTable.$inferInsert)
    .returning();
  createdBuildingIds.push(b.id);
  return b.id;
}

test("[Task #502] 사용승인일이 다른 두 빌딩은 같은 항목명에서 서로 다른 nextDueDate 를 받는다", async () => {
  const userId = await createTestManager();
  const idA = await createTestBuilding("승인일테스트A", "2018-03-15");
  const idB = await createTestBuilding("승인일테스트B", "2019-08-22");

  // 매니저는 본인 건물에만 자동 산정 가능 — 빌딩 단위로 currentUser.buildingId 를 갱신해 호출.
  async function callAutoSchedule(buildingId: number) {
    await db.update(usersTable).set({ buildingId }).where(eq(usersTable.id, userId));
    currentUser = { userId, role: "manager" };
    const res = await fetch(`${baseUrl}/buildings/auto-schedule-inspections`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        buildingId,
        useFallbackCompletionDate: true,
        // 짧은 주기(소방 자체점검=1mo) + 긴 주기(전기안전 법정점검=36mo) 두 항목으로 비교.
        inspectionDates: {
          fire_safety: { "소방 자체점검": "" },
          electrical: { "전기안전 법정점검": "" },
        },
      }),
    });
    if (res.status !== 200) {
      assert.fail(`auto-schedule failed for ${buildingId}: ${res.status} ${await res.text().catch(() => "")}`);
    }
    return (await res.json()) as { count: number; created: Array<Record<string, unknown>> };
  }

  await callAutoSchedule(idA);
  await callAutoSchedule(idB);

  const rowsA = await db
    .select()
    .from(inspectionsTable)
    .where(eq(inspectionsTable.buildingId, idA));
  const rowsB = await db
    .select()
    .from(inspectionsTable)
    .where(eq(inspectionsTable.buildingId, idB));

  function findRow(rows: typeof rowsA, name: string) {
    const r = rows.find((x) => x.name === name);
    if (!r) assert.fail(`missing inspection row: ${name}`);
    return r;
  }

  const aFire = findRow(rowsA, "소방 자체점검");
  const bFire = findRow(rowsB, "소방 자체점검");
  const aElec = findRow(rowsA, "전기안전 법정점검");
  const bElec = findRow(rowsB, "전기안전 법정점검");

  // 핵심 검증: 사용승인일이 다르면 같은 항목의 nextDueDate 가 달라야 한다.
  assert.notEqual(
    String(aFire.nextDueDate),
    String(bFire.nextDueDate),
    "월 단위 짧은 주기에서도 사용승인일이 다르면 nextDueDate 가 달라야 한다",
  );
  assert.notEqual(
    String(aElec.nextDueDate),
    String(bElec.nextDueDate),
    "긴 주기(전기 36개월) 에서도 사용승인일이 다르면 nextDueDate 가 달라야 한다",
  );

  // baseline 의 day-of-month 가 보존되었는지(=approvalDate 가 실제로 baseline 으로 쓰였는지).
  assert.equal(String(aFire.nextDueDate).slice(-2), "15", "A 의 day-of-month 는 사용승인일(2018-03-15) 의 15");
  assert.equal(String(bFire.nextDueDate).slice(-2), "22", "B 의 day-of-month 는 사용승인일(2019-08-22) 의 22");

  // notes 워터마크 문구가 사용승인일 기준으로 통일됐는지.
  assert.match(
    String(aFire.notes ?? ""),
    /사용승인일 기준/,
    "임시 워터마크 notes 에 ‘사용승인일 기준’ 문구가 들어가야 한다",
  );
  assert.doesNotMatch(
    String(aFire.notes ?? ""),
    /준공일 기준/,
    "더 이상 ‘준공일 기준’ 워터마크는 사용하지 않는다",
  );
});
