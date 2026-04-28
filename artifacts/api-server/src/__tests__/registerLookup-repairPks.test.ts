// [Task #552] POST /buildings/repair-register-pks 통합 테스트.
//
// 검증 시나리오:
//  A. 손상된 building_register_pk(지수표기/짧은 자릿수/소수점) 행이 dryRun=true 호출에서
//     모두 후보로 잡히고, DB 변경 없이 보고서로만 돌아온다.
//  B. register_data.title 에 sigunguCd/bjdongCd/bun 가 비어 있는 행은 자동 복구 불가로
//     manualReviewNeeded 에 분류된다.
//  C. 권한이 platform_admin 이 아닌 사용자는 403.
//
// 인증: 라우터의 진입점(buildings/index)이 requireRole("manager","platform_admin",...) 으로
//       이미 1차 검사하므로, 본 테스트는 직접 register-lookup 라우터만 마운트해 진입점
//       미들웨어를 우회하고 라우트 자체 권한 검사(platform_admin 만)를 검증한다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-pk-repair-tests";

const { db, buildingsTable, pool } = await import("@workspace/db");
const { inArray } = await import("drizzle-orm");
const { default: registerLookupRouter } = await import("../routes/buildings/register-lookup");

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
app.use("/api", registerLookupRouter);

let server: Server;
let baseUrl: string;
const createdIds: number[] = [];

function uniqueName(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}/api`;
});

after(async () => {
  if (createdIds.length > 0) {
    await db.delete(buildingsTable).where(inArray(buildingsTable.id, createdIds));
  }
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await pool.end();
});

async function seedBuilding(opts: {
  name: string;
  pk: string;
  withRegisterData: boolean;
}) {
  const baseValues = {
    name: opts.name,
    addressFull: "테스트 주소 1",
    addressJibun: "테스트 주소 1번지",
    normalizedAddress: `테스트-${opts.name}`,
    buildingRegisterPk: opts.pk,
    registerDongPks: [],
    registerData: opts.withRegisterData
      ? {
          title: {
            sigunguCd: "11680",
            bjdongCd: "10600",
            bun: "0907",
            ji: "0012",
          },
        }
      : null,
  } as Partial<typeof buildingsTable.$inferInsert>;
  const [b] = await db
    .insert(buildingsTable)
    .values(baseValues as typeof buildingsTable.$inferInsert)
    .returning();
  createdIds.push(b.id);
  return b;
}

test("[#552-A] dryRun=true 는 손상 후보를 모두 잡고 DB 를 변경하지 않는다", async () => {
  currentUser = { userId: -1, role: "platform_admin" };
  const corrupted = await seedBuilding({
    name: uniqueName("아티스톤"),
    pk: "1.0000000000000004e+21",
    withRegisterData: true,
  });
  const tooShort = await seedBuilding({
    name: uniqueName("우함"),
    pk: "1116187674",
    withRegisterData: true,
  });
  const decimal = await seedBuilding({
    name: uniqueName("dot"),
    pk: "11680123456789.0",
    withRegisterData: true,
  });
  // 멀쩡한 PK 는 후보로 잡혀선 안 된다.
  const healthy = await seedBuilding({
    name: uniqueName("ok"),
    pk: "1168010600090700121",
    withRegisterData: true,
  });

  const r = await fetch(`${baseUrl}/buildings/repair-register-pks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dryRun: true, ids: [corrupted.id, tooShort.id, decimal.id, healthy.id] }),
  });
  assert.equal(r.status, 200);
  const body = await r.json() as {
    dryRun: boolean;
    scanned: number;
    previewCount: number;
    repairedCount: number;
    manualReviewCount: number;
    preview: Array<{ id: number; before: string; status: string }>;
    repaired: unknown[];
    manualReviewNeeded: unknown[];
  };

  assert.equal(body.dryRun, true);
  assert.equal(body.scanned, 3, "healthy 행은 후보에서 제외되어야 한다");
  assert.equal(body.repairedCount, 0, "dryRun 이므로 실제 복구 0건");
  assert.equal(body.manualReviewCount, 0, "register_data 가 채워진 행은 자동 복구 후보 (preview) 로 분류");
  assert.equal(body.previewCount, 3);
  const previewIds = body.preview.map((p) => p.id).sort();
  assert.deepEqual(previewIds, [corrupted.id, tooShort.id, decimal.id].sort());

  // DB 변경 여부 검증 — building_register_pk 는 그대로 남아 있어야 한다.
  const [stillCorrupted] = await db
    .select()
    .from(buildingsTable)
    .where(inArray(buildingsTable.id, [corrupted.id]));
  assert.equal(stillCorrupted.buildingRegisterPk, "1.0000000000000004e+21");
});

test("[#552-B] register_data 가 비어 있는 손상 행은 manualReviewNeeded 로 분류된다", async () => {
  currentUser = { userId: -1, role: "platform_admin" };
  const orphan = await seedBuilding({
    name: uniqueName("orphan"),
    pk: "1.5e+19",
    withRegisterData: false,
  });

  const r = await fetch(`${baseUrl}/buildings/repair-register-pks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dryRun: true, ids: [orphan.id] }),
  });
  assert.equal(r.status, 200);
  const body = await r.json() as {
    scanned: number;
    manualReviewCount: number;
    previewCount: number;
    manualReviewNeeded: Array<{ id: number; status: string; reason?: string }>;
  };

  assert.equal(body.scanned, 1);
  assert.equal(body.previewCount, 0);
  assert.equal(body.manualReviewCount, 1);
  assert.equal(body.manualReviewNeeded[0].id, orphan.id);
  assert.match(body.manualReviewNeeded[0].reason ?? "", /register_data\.title/);
});

test("[#552-C] platform_admin 이 아니면 403 으로 차단된다", async () => {
  currentUser = { userId: -1, role: "manager" };
  const r = await fetch(`${baseUrl}/buildings/repair-register-pks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dryRun: true }),
  });
  assert.equal(r.status, 403);
});

test("[#552-D] 인증이 없으면 403 (req.user 미주입)", async () => {
  currentUser = null;
  const r = await fetch(`${baseUrl}/buildings/repair-register-pks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ dryRun: true }),
  });
  assert.equal(r.status, 403);
});

test("[#552-E] dryRun=false 는 외부 API 응답으로 building_register_pk + register_dong_pks 를 갱신한다", async () => {
  // 외부 건축물대장 API (data.go.kr) 응답을 가짜로 주입한다. 22자리 정수 PK 가
  // number 가 아니라 문자열로 와 정밀도 보존 파서를 통과해야 하므로, JSON.stringify
  // 로 만든 텍스트가 아닌 수동 텍스트로 number-그대로 응답을 흘려 회귀를 막는다.
  process.env.BUILDING_REGISTER_API_KEY = "test-key";
  currentUser = { userId: -1, role: "platform_admin" };

  const corrupted = await seedBuilding({
    name: uniqueName("아티스톤"),
    pk: "1.0000000000000004e+21",
    withRegisterData: true,
  });

  // 응답 구조: getBrTitleInfo — totalCount=1, item 1개. mgmBldrgstPk 는 22자리 정수
  // 를 number 로 표기해 정밀도 보존 파서가 동작하는지까지 함께 검증.
  const expectedPk = "1234567890123456789012";
  const fakeResponseText = `{
    "response": {
      "header": { "resultCode": "00", "resultMsg": "NORMAL SERVICE." },
      "body": {
        "totalCount": 1,
        "items": {
          "item": {
            "mgmBldrgstPk": ${expectedPk},
            "bldNm": "아티스톤",
            "dongNm": "본관",
            "mainAtchGbCdNm": "주건축물"
          }
        }
      }
    }
  }`;

  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    // 외부 건축물대장 API 호출만 가짜 응답으로 가로채고, 테스트가 자신의 express
    // 서버로 보내는 요청은 그대로 통과시킨다.
    if (url.includes("apis.data.go.kr")) {
      capturedUrl = url;
      return new Response(fakeResponseText, {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    const r = await fetch(`${baseUrl}/buildings/repair-register-pks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dryRun: false, ids: [corrupted.id] }),
    });
    assert.equal(r.status, 200);
    const body = await r.json() as {
      dryRun: boolean;
      scanned: number;
      repairedCount: number;
      manualReviewCount: number;
      repaired: Array<{ id: number; before: string; after?: string; afterDongCount?: number }>;
    };

    assert.equal(body.dryRun, false);
    assert.equal(body.repairedCount, 1, "정상 응답이면 1건 복구");
    assert.equal(body.manualReviewCount, 0);
    assert.equal(body.repaired[0].id, corrupted.id);
    assert.equal(body.repaired[0].after, expectedPk);
    assert.equal(body.repaired[0].afterDongCount, 1);
    assert.match(capturedUrl, /getBrTitleInfo/, "외부 표제부 API 가 호출되었는지");

    // DB 가 실제로 갱신됐는지 다시 읽어 검증.
    const [after] = await db
      .select()
      .from(buildingsTable)
      .where(inArray(buildingsTable.id, [corrupted.id]));
    assert.equal(after.buildingRegisterPk, expectedPk);
    const dongs = (after.registerDongPks ?? []) as Array<{ mgmBldrgstPk: string; dongName: string }>;
    assert.equal(dongs.length, 1);
    assert.equal(dongs[0].mgmBldrgstPk, expectedPk);
    assert.equal(dongs[0].dongName, "본관");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.BUILDING_REGISTER_API_KEY;
  }
});

test("[#552-F] dryRun=false: 외부 API 가 손상 응답(지수표기)을 돌려주면 manual_review_needed 로 분류한다", async () => {
  // 정밀도 보존 파서가 응답 number 를 문자열로 감싼 뒤에도, 그 문자열이 손상 패턴이면
  // (예: 외부 시스템이 이미 잘못된 값을 저장해 둔 경우) 절대로 DB 에 다시 써넣지 않는다.
  process.env.BUILDING_REGISTER_API_KEY = "test-key";
  currentUser = { userId: -1, role: "platform_admin" };

  const corrupted = await seedBuilding({
    name: uniqueName("badResp"),
    pk: "1.5e+21",
    withRegisterData: true,
  });

  const fakeResponseText = `{
    "response": {
      "header": { "resultCode": "00" },
      "body": {
        "totalCount": 1,
        "items": {
          "item": { "mgmBldrgstPk": "1.0000000000000004e+21", "bldNm": "x", "mainAtchGbCdNm": "주건축물" }
        }
      }
    }
  }`;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("apis.data.go.kr")) {
      return new Response(fakeResponseText, { status: 200, headers: { "content-type": "application/json" } });
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  try {
    const r = await fetch(`${baseUrl}/buildings/repair-register-pks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ dryRun: false, ids: [corrupted.id] }),
    });
    const body = await r.json() as {
      repairedCount: number;
      manualReviewCount: number;
      manualReviewNeeded: Array<{ id: number; reason?: string }>;
    };
    assert.equal(body.repairedCount, 0);
    assert.equal(body.manualReviewCount, 1);
    assert.equal(body.manualReviewNeeded[0].id, corrupted.id);

    // DB 는 손상 PK 그대로여야 한다 — 손상 응답을 다시 저장하지 않는다.
    const [after] = await db
      .select()
      .from(buildingsTable)
      .where(inArray(buildingsTable.id, [corrupted.id]));
    assert.equal(after.buildingRegisterPk, "1.5e+21");
  } finally {
    globalThis.fetch = originalFetch;
    delete process.env.BUILDING_REGISTER_API_KEY;
  }
});
