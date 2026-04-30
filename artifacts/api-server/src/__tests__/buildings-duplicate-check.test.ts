// [Task #642] 1주소 1매니저 중복 검사 헬퍼 회귀 테스트.
//
// 핵심 회귀:
//   A. 본인이 이미 같은 building 에 동일 role 로 묶여 있으면 PUT 갱신은 차단되지 않는다
//      (selfAlreadyMember=true → exists=false). 같은 건물에 활성 매니저가 2명 묶여
//      있어도 본인 PUT 은 통과한다 — 두 매니저가 동시에 영구 차단되던 회귀 차단.
//   B. 동일 지번에 다른 building 행이 있더라도 그 행에 묶인 활성 사용자가 0명인 "고아"
//      행이라면 충돌 후보에서 제외된다(고아 행이 신규 가입자를 영구 차단하는 회귀 차단).
//   C. 진짜로 다른 활성 매니저가 점유 중일 때는 그대로 차단되며, 응답에 충돌 건물명
//      (부분 마스킹) 과 충돌 role 이 함께 포함된다.
//   D. POST /buildings 재진입 방어: 매니저가 이미 자기 buildingId 를 가진 채 POST 를
//      또 보내면 새 building 행이 만들어지지 않고 기존 행이 그대로 반환된다.
//
// 인증: 라우터에 requireRole(...) 만 있으므로 JWT 발급 없이 미들웨어로 req.user 주입.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-buildings-dup-check";

const { db, usersTable, buildingsTable, pool } = await import("@workspace/db");
const { eq, inArray } = await import("drizzle-orm");
const { default: buildingsRouter } = await import("../routes/buildings");
const { findExistingActiveUserForAddress } = await import("../routes/buildings/duplicates");

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

function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@dup-test.local`;
}

function uniqueJibun(): string {
  return `테스트도 테스트시 테스트동 ${crypto.randomUUID().slice(0, 8)}번지`;
}

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}/api`;
});

after(async () => {
  if (createdUserIds.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  if (createdBuildingIds.length > 0) {
    await db.delete(buildingsTable).where(inArray(buildingsTable.id, createdBuildingIds));
  }
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await pool.end();
});

async function createManager(opts: { buildingId?: number | null; status?: "active" | "rejected" } = {}): Promise<number> {
  const [u] = await db
    .insert(usersTable)
    .values({
      email: uniqueEmail("mgr"),
      passwordHash: "x",
      role: "manager",
      name: "중복 검사 테스트 매니저",
      portalType: "building",
      approvalStatus: opts.status ?? "active",
      roleSelected: true,
      buildingId: opts.buildingId ?? null,
    } as typeof usersTable.$inferInsert)
    .returning();
  createdUserIds.push(u.id);
  return u.id;
}

async function createBuilding(name: string, addressJibun: string | null): Promise<number> {
  const [b] = await db
    .insert(buildingsTable)
    .values({ name, addressJibun, addressFull: addressJibun } as typeof buildingsTable.$inferInsert)
    .returning();
  createdBuildingIds.push(b.id);
  return b.id;
}

test("[Task #642-A] 본인이 이미 같은 building 에 동일 role 로 묶여 있으면 차단되지 않는다 (selfAlreadyMember)", async () => {
  const jibun = uniqueJibun();
  const buildingId = await createBuilding("자기건물A", jibun);
  const userId = await createManager({ buildingId });

  const r = await findExistingActiveUserForAddress({
    role: "manager",
    addressJibun: jibun,
    buildingId,
    excludeUserId: userId,
  });
  assert.equal(r.exists, false, "본인 갱신은 차단되지 않아야 한다");
  assert.equal(r.selfAlreadyMember, true, "selfAlreadyMember=true 로 회신해야 한다");
});

test("[Task #642-A] 동일 building 에 본인 + 다른 활성 매니저 1명이 함께 묶여 있어도 본인 PUT 은 통과한다", async () => {
  const jibun = uniqueJibun();
  const buildingId = await createBuilding("같이묶인건물", jibun);
  const meId = await createManager({ buildingId });
  await createManager({ buildingId }); // 다른 활성 매니저
  const r = await findExistingActiveUserForAddress({
    role: "manager",
    addressJibun: jibun,
    buildingId,
    excludeUserId: meId,
  });
  assert.equal(r.exists, false, "본인이 그 건물의 매니저이면 다른 활성 매니저가 있어도 차단되지 않는다 (별도 경고 로그로 처리)");
  assert.equal(r.selfAlreadyMember, true);
});

test("[Task #642-B] 동일 지번에 다른 building 행이 있더라도 사용자 0명인 고아 행이면 차단하지 않는다", async () => {
  const jibun = uniqueJibun();
  const orphanBuildingId = await createBuilding("고아빌딩", jibun);
  // 고아 행에는 어떤 사용자도 묶지 않는다.
  void orphanBuildingId;

  const newcomerId = await createManager({ buildingId: null });

  const r = await findExistingActiveUserForAddress({
    role: "manager",
    addressJibun: jibun,
    buildingId: null,
    excludeUserId: newcomerId,
  });
  assert.equal(r.exists, false, "사용자가 0명인 고아 building 행은 충돌 후보에서 제외되어야 한다");
});

test("[Task #642-C] 진짜로 다른 매니저가 동일 지번을 점유 중이면 차단되고, 응답에 충돌 컨텍스트가 포함된다", async () => {
  const jibun = uniqueJibun();
  const ownerBuildingId = await createBuilding("점유빌딩", jibun);
  await createManager({ buildingId: ownerBuildingId }); // 진짜 점유자

  const newcomerId = await createManager({ buildingId: null });

  const r = await findExistingActiveUserForAddress({
    role: "manager",
    addressJibun: jibun,
    buildingId: null,
    excludeUserId: newcomerId,
  });
  assert.equal(r.exists, true);
  assert.equal(r.conflictRole, "manager");
  assert.equal(r.conflictBuildingId, ownerBuildingId);
  assert.ok(typeof r.conflictBuildingName === "string" && r.conflictBuildingName.length > 0,
    "충돌 건물명(부분 마스킹) 이 포함되어야 한다");
  // 부분 마스킹: 4자 → "점***" 패턴(첫 1자 + 별표 n-2 + 마지막 1자).
  assert.equal(r.conflictBuildingName, "점**딩");
});

test("[Task #642-D] POST /buildings 재진입 방어: 이미 buildingId 가 있는 매니저가 POST 를 또 보내면 기존 행을 반환한다", async () => {
  const jibun = uniqueJibun();
  const buildingId = await createBuilding("재진입빌딩", jibun);
  const userId = await createManager({ buildingId });
  currentUser = { userId, role: "manager" };

  const res = await fetch(`${baseUrl}/buildings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "다른이름이지만 무시되어야 함", addressJibun: jibun, addressFull: jibun }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { building: { id: number; name: string }; reused?: boolean };
  assert.equal(body.building.id, buildingId, "기존 buildingId 를 그대로 회신해야 한다");
  assert.equal(body.building.name, "재진입빌딩", "기존 행의 name 을 보존해야 한다 (새 입력 무시)");
  assert.equal(body.reused, true, "응답에 reused 플래그가 포함되어야 한다");

  // 동일 addressJibun 으로 새로운 building 행이 만들어지지 않았는지 검증 (다른 파일의 DB 정리와 독립적인 검사).
  const matches = await db
    .select({ id: buildingsTable.id })
    .from(buildingsTable)
    .where(eq(buildingsTable.addressJibun, jibun));
  assert.equal(matches.length, 1, `동일 addressJibun 으로 새 building 행이 추가되면 안 됨 (rows=${JSON.stringify(matches)})`);
  assert.equal(matches[0].id, buildingId);
});

test("[Task #642-C] PUT /buildings/:id: 진짜로 다른 매니저가 점유한 주소로 옮기려 하면 409 + conflictBuildingName 이 함께 응답된다", async () => {
  const otherJibun = uniqueJibun();
  const otherBuildingId = await createBuilding("타사빌딩", otherJibun);
  await createManager({ buildingId: otherBuildingId }); // 점유자

  // 본인은 다른 주소의 건물을 갖고 있다.
  const myJibun = uniqueJibun();
  const myBuildingId = await createBuilding("내빌딩", myJibun);
  const myUserId = await createManager({ buildingId: myBuildingId });
  currentUser = { userId: myUserId, role: "manager" };

  const res = await fetch(`${baseUrl}/buildings/${myBuildingId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ addressJibun: otherJibun }),
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { error: string; conflictBuildingName: string | null; conflictRole: string | null };
  assert.match(body.error, /이미 해당 건물의 가입자가 존재합니다/);
  assert.equal(body.conflictRole, "manager");
  assert.equal(body.conflictBuildingName, "타**딩");
});

test("[Task #642-A] PUT /buildings/:id: 본인이 이미 매니저인 건물에 다른 활성 매니저가 함께 있어도 본인 갱신은 200 으로 통과한다", async () => {
  const jibun = uniqueJibun();
  const buildingId = await createBuilding("동시매니저빌딩", jibun);
  const meId = await createManager({ buildingId });
  await createManager({ buildingId }); // 동일 건물의 또다른 활성 매니저

  currentUser = { userId: meId, role: "manager" };

  const res = await fetch(`${baseUrl}/buildings/${buildingId}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "동시매니저빌딩 갱신" }),
  });
  assert.equal(res.status, 200, `PUT 본인 갱신은 통과해야 한다 (status=${res.status})`);
});
