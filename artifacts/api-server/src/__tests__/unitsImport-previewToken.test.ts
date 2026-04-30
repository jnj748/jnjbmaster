// [Task #698] POST /buildings/units/import-from-register 미리보기/확정 분리 회귀 테스트.
//
//   검증 시나리오:
//     A. dryRun=true → 200 + previewToken 발급, 외부 API 1회만 호출, items 정상 분류.
//     B. dryRun=false + previewToken (방금 받은 토큰) → 외부 API 호출 없이 200, items 동일.
//     C. dryRun=false + previewToken (만료/없음) → 410 + code:"PREVIEW_EXPIRED".
//     D. 외부 API throw → 503 + code:"REGISTER_FETCH_FAILED" (502 가 아닌 것을 보장).
//     E. 캐시 히트 적용 후 같은 토큰 재사용 → consume 됐으므로 410.
//
//   외부 공공 API 호출은 globalThis.fetch 를 가짜로 교체해 시나리오별로 응답을 주입한다.
import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import http from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

function postJson(url: string, payload: unknown): Promise<{ status: number; body: string }> {
  const u = new URL(url);
  const data = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: "POST",
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(data) },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-units-import-previewToken";

const { db, buildingsTable, unitsTable, usersTable, pool } = await import("@workspace/db");
const { eq, inArray } = await import("drizzle-orm");
const { default: unitsImportRouter } = await import("../routes/buildings/units-import");
const { _resetPreviewCacheForTest } = await import("../routes/buildings/units-import-cache");

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
app.use(unitsImportRouter);

let server: Server;
let baseUrl: string;
const createdBuildingIds: number[] = [];
const createdUserIds: number[] = [];

function uniqueName(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

before(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  if (createdBuildingIds.length > 0) {
    await db.delete(unitsTable).where(inArray(unitsTable.buildingId, createdBuildingIds));
    await db.delete(buildingsTable).where(inArray(buildingsTable.id, createdBuildingIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await pool.end();
});

let restoreFetch: () => void = () => {};
let externalCallCount = 0;
beforeEach(() => {
  process.env.BUILDING_REGISTER_API_KEY = "test-key-for-previewToken";
  externalCallCount = 0;
  _resetPreviewCacheForTest();
});
afterEach(() => {
  restoreFetch();
  restoreFetch = () => {};
  delete process.env.BUILDING_REGISTER_API_KEY;
});

function installFakeFetch(handler: (url: string) => Response | Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("apis.data.go.kr")) {
      externalCallCount++;
      return handler(url);
    }
    return original(input);
  }) as typeof fetch;
  restoreFetch = () => {
    globalThis.fetch = original;
  };
}

async function seedBuildingAndManager() {
  const name = uniqueName("preview-token-test");
  const [b] = await db
    .insert(buildingsTable)
    .values({
      name,
      addressFull: "테스트 주소 1",
      addressJibun: "테스트 주소 1번지",
      normalizedAddress: `pt-${name}`,
      buildingRegisterPk: "1148010600100740000",
      registerDongPks: [],
      registerData: {
        title: {
          sigunguCd: "11480",
          bjdongCd: "10600",
          bun: "0074",
          ji: "0000",
          regstrGbCdNm: "집합",
        },
      },
    })
    .returning({ id: buildingsTable.id });
  createdBuildingIds.push(b.id);

  const [u] = await db
    .insert(usersTable)
    .values({
      username: uniqueName("mgr"),
      name: "테스트 관리자",
      role: "manager",
      buildingId: b.id,
      portalType: "building",
      approvalStatus: "active",
    })
    .returning({ id: usersTable.id });
  createdUserIds.push(u.id);

  return { buildingId: b.id, userId: u.id };
}

function fakeAreaInfoResponse(units: Array<{ dong?: string; floor: string; ho: string; expos: number; pub: number; purpose?: string }>): Response {
  return new Response(
    JSON.stringify({
      response: {
        body: {
          totalCount: units.length,
          items: {
            item: units.map((u) => ({
              dongNm: u.dong ?? "본관",
              flrNoNm: u.floor,
              hoNm: u.ho,
              area: u.expos,
              cmmnPuprpsArea: u.pub,
              mainPurpsCdNm: u.purpose ?? "오피스텔",
              exposPubuseGbCd: "1",
            })),
          },
        },
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

test("[#698] dryRun=true → previewToken 이 발급되고, 외부 API 는 1회만 호출된다", async () => {
  installFakeFetch(() => fakeAreaInfoResponse([
    { floor: "5", ho: "501", expos: 60.12, pub: 0 },
    { floor: "5", ho: "502", expos: 70.34, pub: 0 },
  ]));
  const { userId } = await seedBuildingAndManager();
  currentUser = { userId, role: "manager" };

  const r = await postJson(`${baseUrl}/buildings/units/import-from-register`, { dryRun: true });
  assert.equal(r.status, 200);
  const body = JSON.parse(r.body);
  assert.equal(body.dryRun, true);
  assert.ok(typeof body.previewToken === "string" && body.previewToken.length > 0, "previewToken 이 응답에 있어야 한다");
  assert.equal(body.created, 2);
  assert.equal(body.items.length, 2);
  // 외부 API 호출 횟수: 토지 식별자 기반 1회 호출(페이징 없음 — totalCount=2).
  assert.equal(externalCallCount, 1, "미리보기 단계에서만 외부 API 가 호출된다");
});

test("[#698] dryRun=false + previewToken → 외부 API 호출 없이 적용된다", async () => {
  installFakeFetch(() => fakeAreaInfoResponse([
    { floor: "5", ho: "501", expos: 60.12, pub: 0 },
    { floor: "5", ho: "502", expos: 70.34, pub: 0 },
    { floor: "6", ho: "601", expos: 80.55, pub: 0 },
  ]));
  const { buildingId, userId } = await seedBuildingAndManager();
  currentUser = { userId, role: "manager" };

  // 1) 미리보기.
  const r1 = await postJson(`${baseUrl}/buildings/units/import-from-register`, { dryRun: true });
  assert.equal(r1.status, 200);
  const preview = JSON.parse(r1.body);
  assert.equal(externalCallCount, 1);
  assert.equal(preview.created, 3);

  // 2) 확정 — 외부 호출 카운터 그대로 유지되어야 한다.
  const r2 = await postJson(`${baseUrl}/buildings/units/import-from-register`, {
    dryRun: false,
    previewToken: preview.previewToken,
  });
  assert.equal(r2.status, 200, `expected 200, got ${r2.status}: ${r2.body}`);
  const apply = JSON.parse(r2.body);
  assert.equal(apply.dryRun, false);
  assert.equal(apply.created, 3);
  assert.equal(apply.items.length, 3);
  assert.ok(apply.lastSyncedAt, "lastSyncedAt 이 채워져야 한다");
  assert.equal(externalCallCount, 1, "확정 단계에서는 외부 API 를 다시 호출하지 않아야 한다");

  // DB 상태 검증.
  const persisted = await db.select().from(unitsTable).where(eq(unitsTable.buildingId, buildingId));
  assert.equal(persisted.length, 3);
});

test("[#698] dryRun=false + previewToken 두 번째 사용 → 410 PREVIEW_EXPIRED", async () => {
  installFakeFetch(() => fakeAreaInfoResponse([
    { floor: "5", ho: "501", expos: 60.12, pub: 0 },
  ]));
  const { userId } = await seedBuildingAndManager();
  currentUser = { userId, role: "manager" };

  const r1 = await postJson(`${baseUrl}/buildings/units/import-from-register`, { dryRun: true });
  const preview = JSON.parse(r1.body);
  const ok = await postJson(`${baseUrl}/buildings/units/import-from-register`, {
    dryRun: false,
    previewToken: preview.previewToken,
  });
  assert.equal(ok.status, 200);
  const expired = await postJson(`${baseUrl}/buildings/units/import-from-register`, {
    dryRun: false,
    previewToken: preview.previewToken,
  });
  assert.equal(expired.status, 410);
  const body = JSON.parse(expired.body);
  assert.equal(body.code, "PREVIEW_EXPIRED");
});

test("[#698] dryRun=false + 잘못된 previewToken → 410 PREVIEW_EXPIRED", async () => {
  installFakeFetch(() => fakeAreaInfoResponse([
    { floor: "5", ho: "501", expos: 60.12, pub: 0 },
  ]));
  const { userId } = await seedBuildingAndManager();
  currentUser = { userId, role: "manager" };
  // 미리보기 한 번 받아 캐시는 만들되, 다른 토큰을 보낸다.
  await postJson(`${baseUrl}/buildings/units/import-from-register`, { dryRun: true });
  const r = await postJson(`${baseUrl}/buildings/units/import-from-register`, {
    dryRun: false,
    previewToken: "deadbeefdeadbeefdeadbeefdeadbeef",
  });
  assert.equal(r.status, 410);
  const body = JSON.parse(r.body);
  assert.equal(body.code, "PREVIEW_EXPIRED");
});

test("[#698] 외부 건축물대장 API 가 throw 하면 502 가 아닌 503 + REGISTER_FETCH_FAILED 로 응답한다", async () => {
  // [Task #698] fetchRegisterJsonOrThrow 가 진짜 fetch 실패를 RegisterFetchError 로
  //   surface 하고, units-import.ts 의 503 catch 가 이를 잡아 머신 판별 가능한
  //   에러 코드로 응답하는지 검증한다 — 사용자가 보는 502 가 더 이상 발생하지 않아야 한다.
  installFakeFetch(() => {
    throw new Error("simulated upstream outage (ECONNRESET)");
  });
  const { userId } = await seedBuildingAndManager();
  currentUser = { userId, role: "manager" };

  const r = await postJson(`${baseUrl}/buildings/units/import-from-register`, { dryRun: true });
  assert.notEqual(r.status, 502, "절대 502 로 응답하면 안 된다");
  assert.equal(r.status, 503, `expected 503, got ${r.status}: ${r.body}`);
  const body = JSON.parse(r.body);
  assert.equal(body.code, "REGISTER_FETCH_FAILED");
  assert.match(body.error, /건축물대장 조회/);
});

test("[#698] 외부 API 가 HTTP 503 으로 응답해도 게이트웨이 단의 502 가 아니라 503 + REGISTER_FETCH_FAILED 로 응답한다", async () => {
  installFakeFetch(() => new Response("upstream maintenance", { status: 503 }));
  const { userId } = await seedBuildingAndManager();
  currentUser = { userId, role: "manager" };

  const r = await postJson(`${baseUrl}/buildings/units/import-from-register`, { dryRun: true });
  assert.notEqual(r.status, 502);
  assert.equal(r.status, 503);
  const body = JSON.parse(r.body);
  assert.equal(body.code, "REGISTER_FETCH_FAILED");
});

test("[#698] BUILDING_REGISTER_API_KEY 미설정 시 500 + REGISTER_API_KEY_MISSING (502 아님)", async () => {
  delete process.env.BUILDING_REGISTER_API_KEY;
  installFakeFetch(() => fakeAreaInfoResponse([]));
  const { userId } = await seedBuildingAndManager();
  currentUser = { userId, role: "manager" };

  const r = await postJson(`${baseUrl}/buildings/units/import-from-register`, { dryRun: true });
  assert.notEqual(r.status, 502, "절대 502 로 응답하면 안 된다");
  assert.equal(r.status, 500);
  const body = JSON.parse(r.body);
  assert.equal(body.code, "REGISTER_API_KEY_MISSING");
});
