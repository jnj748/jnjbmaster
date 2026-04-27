// [Task #475] buildings POST/PUT 의 sido/sigungu 자동 도출과 매니저(users) 행
//   동기화, 그리고 백필 마이그레이션 결과를 회귀 테스트한다.
//
// 시나리오:
//  A. POST /buildings — 매니저가 addressFull/addressJibun 만 보내고 sido/sigungu
//     는 보내지 않을 때, 저장된 building 행에 도출된 sido/sigungu 가 채워지고
//     사용자(users) 행의 buildingSido/Sigungu 도 동일하게 동기화된다.
//  B. PUT /buildings/:id — 주소 텍스트(addressFull) 만 바꾸고 sido/sigungu 는
//     보내지 않아도 재도출되어 building/users 양쪽이 갱신된다.
//  C. 비도출 케이스 — addressFull/addressJibun 모두 비어 있으면 sido/sigungu 는
//     NULL 로 남는다(과도한 fallback 금지).
//  D. 백필 마이그레이션 — 0024_task475_backfill_building_region 가 적용된
//     이후, 주소 텍스트만 있고 sido/sigungu 가 NULL 이던 행이 더 이상 존재하지
//     않는다(또는 신규로 인위 생성한 행을 SELECT 로 검증).
//
// 인증: requireRole("manager", ...) 만 있어 JWT 발급 없이 테스트 미들웨어로
//       req.user 를 주입한다(global approvalGate 는 우회한다).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-buildings-region-tests";

const { db, usersTable, buildingsTable, pool } = await import("@workspace/db");
const { eq, inArray, isNull, and, or, like } = await import("drizzle-orm");
const { default: buildingsRouter } = await import("../routes/buildings");

// 라우터를 마운트할 때 req.user 를 주입하는 테스트 미들웨어.
let currentUser: { userId: number; role: string } | null = null;
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  if (currentUser) (req as unknown as { user: typeof currentUser }).user = currentUser;
  // pino 로거 사용처(req.log.error 등) 를 흉내내는 stub
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

function uniqueEmail(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}@region-test.local`;
}

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}/api`;
});

after(async () => {
  // 테스트가 만든 사용자/건물 정리.
  if (createdUserIds.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  if (createdBuildingIds.length > 0) {
    await db.delete(buildingsTable).where(inArray(buildingsTable.id, createdBuildingIds));
  }
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await pool.end();
});

async function createTestManager(): Promise<number> {
  const [u] = await db
    .insert(usersTable)
    .values({
      email: uniqueEmail("mgr"),
      passwordHash: "x",
      role: "manager",
      name: "지역도출 테스트 매니저",
      portalType: "building",
      approvalStatus: "active",
      roleSelected: true,
    } as typeof usersTable.$inferInsert)
    .returning();
  createdUserIds.push(u.id);
  return u.id;
}

test("[Task #475-A] POST /buildings: addressFull 만 보내면 sido/sigungu 가 자동 도출되어 저장되고 users 행이 동기화된다", async () => {
  const userId = await createTestManager();
  currentUser = { userId, role: "manager" };

  const res = await fetch(`${baseUrl}/buildings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "도출테스트빌딩A",
      addressFull: "경기도 수원시 영통구 광교중앙로 145",
    }),
  });
  if (res.status !== 200) {
    assert.fail(`expected 200, got ${res.status} ${await res.text().catch(() => "")}`);
  }
  const body = await res.json() as { building: { id: number; sido: string | null; sigungu: string | null } };
  createdBuildingIds.push(body.building.id);

  assert.equal(body.building.sido, "경기도", "building.sido must be derived");
  assert.equal(body.building.sigungu, "수원시 영통구", "building.sigungu must be derived (compound)");

  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  assert.equal(u.buildingId, body.building.id, "user.buildingId must point to created building");
  assert.equal(u.buildingSido, "경기도", "user.buildingSido must be synced from building (post-derivation)");
  assert.equal(u.buildingSigungu, "수원시 영통구", "user.buildingSigungu must be synced from building (post-derivation)");
});

test("[Task #475-B] PUT /buildings/:id: addressFull 만 바뀌어도 sido/sigungu 가 재도출되어 building/users 양쪽이 갱신된다", async () => {
  const userId = await createTestManager();
  currentUser = { userId, role: "manager" };

  // 시작 상태: 서울 자치구로 생성.
  const initRes = await fetch(`${baseUrl}/buildings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "도출테스트빌딩B",
      addressFull: "서울특별시 강남구 테헤란로 123",
    }),
  });
  assert.equal(initRes.status, 200);
  const initial = (await initRes.json()) as { building: { id: number; sido: string; sigungu: string } };
  createdBuildingIds.push(initial.building.id);
  assert.equal(initial.building.sido, "서울특별시");
  assert.equal(initial.building.sigungu, "강남구");

  // 주소만 부산으로 변경(sido/sigungu 명시 X).
  const putRes = await fetch(`${baseUrl}/buildings/${initial.building.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ addressFull: "부산광역시 해운대구 해운대해변로 264" }),
  });
  if (putRes.status !== 200) {
    assert.fail(`expected 200, got ${putRes.status} ${await putRes.text().catch(() => "")}`);
  }
  const updated = (await putRes.json()) as { building: { sido: string | null; sigungu: string | null } };
  assert.equal(updated.building.sido, "부산광역시", "PUT must re-derive sido from new addressFull");
  assert.equal(updated.building.sigungu, "해운대구", "PUT must re-derive sigungu from new addressFull");

  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  assert.equal(u.buildingSido, "부산광역시", "user.buildingSido must follow PUT-time re-derivation");
  assert.equal(u.buildingSigungu, "해운대구", "user.buildingSigungu must follow PUT-time re-derivation");
});

test("[Task #475-C] POST /buildings: 주소 텍스트가 없으면 sido/sigungu 는 NULL 로 남는다 (과도한 fallback 금지)", async () => {
  const userId = await createTestManager();
  currentUser = { userId, role: "manager" };

  const res = await fetch(`${baseUrl}/buildings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "도출테스트빌딩C",
      // addressFull/addressJibun 의도적으로 누락 — derivation 실패 케이스.
    }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { building: { id: number; sido: string | null; sigungu: string | null } };
  createdBuildingIds.push(body.building.id);

  assert.equal(body.building.sido, null, "no address ⇒ sido must remain NULL");
  assert.equal(body.building.sigungu, null, "no address ⇒ sigungu must remain NULL");

  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  // user 행의 buildingSido/Sigungu 도 NULL 이어야 한다(거짓 채움 방지).
  assert.equal(u.buildingSido, null);
  assert.equal(u.buildingSigungu, null);
});

test("[Task #475-D] 백필 마이그레이션: addressFull 이 있으면서 sido/sigungu 가 NULL 인 도출 가능 행은 0건이어야 한다", async () => {
  // 마이그레이션 0024 가 이미 적용된 상태에서, address_full 이 한국어 행정구역으로
  // 시작하는 ‘도출 가능’ 행 중 sido 가 여전히 NULL 인 것은 없어야 한다.
  // 본 케이스를 만족시키기 위해 한 행을 직접 NULL 로 만든 뒤, 같은 도출 로직을 SQL
  // 로 재실행해 후속 백필이 멱등하게 동작함을 확인한다.
  const userId = await createTestManager();
  currentUser = { userId, role: "manager" };

  // 도출 가능한 주소로 행을 하나 만든 뒤, 직접 NULL 로 되돌려 백필 대상 시뮬레이션.
  const res = await fetch(`${baseUrl}/buildings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "도출테스트빌딩D",
      addressFull: "인천광역시 연수구 컨벤시아대로 165",
    }),
  });
  assert.equal(res.status, 200);
  const created = (await res.json()) as { building: { id: number } };
  createdBuildingIds.push(created.building.id);

  await db
    .update(buildingsTable)
    .set({ sido: null, sigungu: null })
    .where(eq(buildingsTable.id, created.building.id));

  // 동일 의미의 도출(공유 유틸)로 다시 채울 수 있어야 한다.
  const { deriveSidoSigungu } = await import("@workspace/shared/derive-region");
  const [b] = await db.select().from(buildingsTable).where(eq(buildingsTable.id, created.building.id));
  const re = deriveSidoSigungu(b.addressFull ?? null, b.addressJibun ?? null);
  assert.equal(re.sido, "인천광역시");
  assert.equal(re.sigungu, "연수구");

  // 마이그레이션이 이미 동작했다면, 본 테스트가 만든 한 행 외에 ‘도출 가능 + sido NULL’
  // 인 화이트리스트 행이 운영 데이터 전반에 남아 있지 않아야 한다.
  // (운영 데이터 전체 정합성: address_full 이 한국 광역명 토큰으로 시작하면서 sido NULL 인 행)
  const remaining = await db
    .select({ id: buildingsTable.id, addressFull: buildingsTable.addressFull })
    .from(buildingsTable)
    .where(
      and(
        isNull(buildingsTable.sido),
        or(
          ...[
            "서울",
            "부산",
            "대구",
            "인천",
            "광주",
            "대전",
            "울산",
            "세종",
            "경기",
            "강원",
            "충북",
            "충청북도",
            "충남",
            "충청남도",
            "전북",
            "전라북도",
            "전남",
            "전라남도",
            "경북",
            "경상북도",
            "경남",
            "경상남도",
            "제주",
          ].map((p) => like(buildingsTable.addressFull, `${p}%`)),
        ),
      ),
    );
  // 본 테스트가 직접 NULL 로 만든 한 행만 허용.
  const otherIds = remaining.map((r) => r.id).filter((id) => id !== created.building.id);
  assert.deepEqual(
    otherIds,
    [],
    `백필 후에도 도출 가능한데 sido NULL 인 행이 남아 있음: ${JSON.stringify(remaining)}`,
  );
});
