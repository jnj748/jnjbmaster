// [Task #689] POST /buildings/units/import-from-register 의 noUnitData 응답 계약 회귀 테스트.
//
//   라우트 동작:
//     - 인증된 사용자(role=manager|platform_admin)의 me.buildingId 가 대상 건물이 된다.
//     - body.dryRun=true 면 미리보기, false 면 실제 적용.
//
//   검증 시나리오:
//     A. 일반건축물(regstrGbCdNm = "일반") + 외부 API 빈 응답
//        → 200 OK + noUnitData.kind = "general", 안내 메시지 포함, items=[].
//     B. 집합건축물 + 외부 API 가 0건을 돌려주는 경우
//        → 200 OK + noUnitData.kind = "empty".
//     C. 정상 호실 자료가 있을 때는 noUnitData 가 응답에 포함되지 않는다(=undefined).
//
//   외부 공공 API 호출은 globalThis.fetch 를 가짜로 교체해 시나리오별로 응답을 주입한다.
import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import http from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

// node:test 환경에서 globalThis.fetch 가 가짜 fetch 로 교체될 수 있으므로,
//   서버에 보내는 라우트 호출은 항상 native http 모듈로 직접 한다.
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

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-units-import-noUnitData";

const { db, buildingsTable, unitsTable, usersTable, pool } = await import("@workspace/db");
const { eq, inArray } = await import("drizzle-orm");
const { default: unitsImportRouter } = await import("../routes/buildings/units-import");

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
beforeEach(() => {
  process.env.BUILDING_REGISTER_API_KEY = "test-key-for-noUnitData";
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
    if (url.includes("apis.data.go.kr")) return handler(url);
    return original(input);
  }) as typeof fetch;
  restoreFetch = () => {
    globalThis.fetch = original;
  };
}

async function seedBuildingAndManager(opts: { regstrGbCdNm: "일반" | "집합" }) {
  const name = uniqueName("noUnitData-test");
  const [b] = await db
    .insert(buildingsTable)
    .values({
      name,
      addressFull: "테스트 주소 1",
      addressJibun: "테스트 주소 1번지",
      normalizedAddress: `노유닛-${name}`,
      buildingRegisterPk: "1148010600100740000",
      registerDongPks: [],
      registerData: {
        title: {
          sigunguCd: "11480",
          bjdongCd: "10600",
          bun: "0074",
          ji: "0000",
          regstrGbCdNm: opts.regstrGbCdNm,
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

test("[#689] 일반건축물 + 외부 API 빈 응답 → 200 + noUnitData.kind='general'", async () => {
  installFakeFetch(() => new Response(
    JSON.stringify({ response: { body: { totalCount: 0 } } }),
    { status: 200, headers: { "content-type": "application/json" } },
  ));
  const { buildingId, userId } = await seedBuildingAndManager({ regstrGbCdNm: "일반" });
  currentUser = { userId, role: "manager" };

  const r = await postJson(`${baseUrl}/buildings/units/import-from-register`, { dryRun: true });
  const raw = r.body;
  if (r.status !== 200) console.error("Unexpected response (general):", r.status, raw);
  assert.equal(r.status, 200);
  const body = JSON.parse(raw);
  assert.equal(body.created, 0);
  assert.equal(body.updated, 0);
  assert.equal(body.skipped, 0);
  assert.equal(body.items.length, 0);
  assert.ok(body.noUnitData, "일반건축물에서는 noUnitData 가 항상 채워져야 한다");
  assert.equal(body.noUnitData.kind, "general");
  assert.match(body.noUnitData.message, /직접 등록.*엑셀 업로드/);
  // dryRun=true 이므로 실제로 호실은 만들어지지 않는다.
  const persisted = await db.select().from(unitsTable).where(eq(unitsTable.buildingId, buildingId));
  assert.equal(persisted.length, 0);
});

test("[#689] 집합건축물 + 외부 API 0건 → 200 + noUnitData.kind='empty'", async () => {
  installFakeFetch(() => new Response(
    JSON.stringify({ response: { body: { totalCount: 0, items: { item: [] } } } }),
    { status: 200, headers: { "content-type": "application/json" } },
  ));
  const { userId } = await seedBuildingAndManager({ regstrGbCdNm: "집합" });
  currentUser = { userId, role: "manager" };

  const r = await postJson(`${baseUrl}/buildings/units/import-from-register`, { dryRun: true });
  if (r.status !== 200) console.error("Unexpected response (empty):", r.status, r.body);
  assert.equal(r.status, 200);
  const body = JSON.parse(r.body);
  assert.equal(body.items.length, 0);
  assert.ok(body.noUnitData);
  assert.equal(body.noUnitData.kind, "empty");
});

test("[#689] 정상 호실 자료가 있으면 noUnitData 는 포함되지 않는다", async () => {
  installFakeFetch(() => new Response(
    JSON.stringify({
      response: {
        body: {
          totalCount: 2,
          items: {
            item: [
              { dongNm: "본관", flrNoNm: "5", hoNm: "501", area: 60.12, cmmnPuprpsArea: 10.5, mainPurpsCdNm: "오피스텔" },
              { dongNm: "본관", flrNoNm: "5", hoNm: "502", area: 70.34, cmmnPuprpsArea: 11.2, mainPurpsCdNm: "오피스텔" },
            ],
          },
        },
      },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  ));
  const { userId } = await seedBuildingAndManager({ regstrGbCdNm: "집합" });
  currentUser = { userId, role: "manager" };

  const r = await postJson(`${baseUrl}/buildings/units/import-from-register`, { dryRun: true });
  if (r.status !== 200) console.error("Unexpected response (normal):", r.status, r.body);
  assert.equal(r.status, 200);
  const body = JSON.parse(r.body);
  assert.equal(body.items.length, 2);
  assert.equal(body.noUnitData, undefined, "정상 자료가 있을 때는 noUnitData 가 비어 있어야 한다");
  assert.equal(body.created, 2);
});
