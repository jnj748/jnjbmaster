// [Task #708 / 코드리뷰 3차] 회귀 테스트:
//   "사용자가 자동 매칭된 호실을 수동으로 빼고 저장한 뒤, 다이얼로그를 다시
//    열고 칩 picker 가 ready 가 되기 전에 즉시 저장"하는 시나리오에서
//   서버가 auto 매칭을 다시 끼워넣지 않아야 한다.
//
// 핵심 검증:
//  - PATCH 빈 본문 → 링크 보존
//  - PATCH memo unchanged + unitIdsMode 없음 → 링크 보존
//  - PATCH 권위적 모드 + unitIds=[] → 링크 비움
//  - PATCH memo 변경 + unitIds 미전달 → 새 메모 기준 auto 재계산
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-work-logs-patch-preserves-manual";

const {
  pg, db, usersTable, buildingsTable,
  workLogEntriesTable, workLogEntryUnitsTable, unitsTable, pool,
} = await import("@workspace/db");
pg.types.setTypeParser(1082, (val: string) => val);
pg.types.setTypeParser(1114, (val: string) => new Date(val).toISOString());
pg.types.setTypeParser(1184, (val: string) => new Date(val).toISOString());
const { eq, inArray } = await import("drizzle-orm");
const { default: workLogsRouter } = await import("../routes/workLogs");

let currentUser: { userId: number; role: string; email: string | null; portalType: string } | null = null;
const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  if (currentUser) (req as unknown as { user: typeof currentUser }).user = currentUser;
  (req as unknown as { log: { warn: () => void; error: () => void; info: () => void } }).log = {
    warn: () => {}, error: () => {}, info: () => {},
  };
  next();
});
app.use("/api", workLogsRouter);

let server: Server;
let baseUrl: string;
const createdBuildingIds: number[] = [];
const createdUserIds: number[] = [];
const createdUnitIds: number[] = [];
const createdEntryIds: number[] = [];
let buildingId: number;
let managerId: number;
let unit1001Id: number;
let unit1002Id: number;

function uniqueEmail(prefix: string) { return `${prefix}-${crypto.randomUUID()}@wl-patch-test.local`; }

async function loadLinks(entryId: number): Promise<number[]> {
  const rows = await db
    .select({ unitId: workLogEntryUnitsTable.unitId })
    .from(workLogEntryUnitsTable)
    .where(eq(workLogEntryUnitsTable.workLogEntryId, entryId));
  return rows.map((r) => r.unitId).sort((a, b) => a - b);
}

before(async () => {
  const [b] = await db
    .insert(buildingsTable)
    .values({ name: `테스트빌딩-${crypto.randomUUID()}`, addressFull: "서울특별시 강남구 테헤란로 1", sido: "서울특별시", sigungu: "강남구" } as typeof buildingsTable.$inferInsert)
    .returning();
  buildingId = b.id; createdBuildingIds.push(b.id);

  const [m] = await db
    .insert(usersTable)
    .values({
      email: uniqueEmail("manager"), passwordHash: "x", role: "manager",
      name: "테스트매니저",
      buildingId, portalType: "building",
    } as typeof usersTable.$inferInsert)
    .returning();
  managerId = m.id; createdUserIds.push(m.id);

  // 단위 호실 두 개: 1001, 1002 — 동(dong) 은 동일하게 둬서 호번만 다른 일반 케이스.
  const inserted = await db
    .insert(unitsTable)
    .values([
      { buildingId, dong: "테스트동", unitNumber: "1001", floor: "10" } as typeof unitsTable.$inferInsert,
      { buildingId, dong: "테스트동", unitNumber: "1002", floor: "10" } as typeof unitsTable.$inferInsert,
    ])
    .returning();
  unit1001Id = inserted[0].id; unit1002Id = inserted[1].id;
  createdUnitIds.push(unit1001Id, unit1002Id);

  currentUser = { userId: managerId, role: "manager", email: "test", portalType: "building" };

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

after(async () => {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  if (createdEntryIds.length) await db.delete(workLogEntriesTable).where(inArray(workLogEntriesTable.id, createdEntryIds));
  if (createdUnitIds.length) await db.delete(unitsTable).where(inArray(unitsTable.id, createdUnitIds));
  if (createdUserIds.length) await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  if (createdBuildingIds.length) await db.delete(buildingsTable).where(inArray(buildingsTable.id, createdBuildingIds));
  await pool.end();
});

async function postEntry(memo: string): Promise<{ id: number }> {
  const r = await fetch(`${baseUrl}/api/work-logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category: "facility", memo }),
  });
  return (await r.json()) as { id: number };
}

test("POST 시 메모에서 자동으로 호실 1001 매칭", async () => {
  const body = await postEntry("1001호 누수 점검");
  createdEntryIds.push(body.id);
  assert.deepEqual(await loadLinks(body.id), [unit1001Id]);
});

test("권위적 모드 + unitIds=[] → 자동 매칭 클리어 후 빈 본문 PATCH 로 다시 살아나면 안 됨", async () => {
  // 1) 자동 매칭이 들어간 entry 생성
  const entry = await postEntry("1001호 누수 점검");
  createdEntryIds.push(entry.id);
  assert.deepEqual(await loadLinks(entry.id), [unit1001Id]);

  // 2) 권위적 클리어 — 사용자가 자동 매칭 칩을 빼고 저장.
  await fetch(`${baseUrl}/api/work-logs/${entry.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memo: "1001호 누수 점검", unitIds: [], unitIdsMode: "authoritative" }),
  });
  assert.deepEqual(await loadLinks(entry.id), []);

  // 3) 다이얼로그 재오픈 직후 picker 가 아직 ready 가 아닐 때 사용자가 저장
  //    → 클라이언트는 빈 본문을 보낸다.
  await fetch(`${baseUrl}/api/work-logs/${entry.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.deepEqual(await loadLinks(entry.id), [], "빈 PATCH 는 링크 그대로 둬야 함");

  // 4) 서버 안전망 — 가령 버그가 있는 클라이언트가 변경되지 않은 memo 만 보내도
  //    서버가 변경 없음을 감지해 auto 재계산을 트리거하지 않아야 함.
  await fetch(`${baseUrl}/api/work-logs/${entry.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memo: "1001호 누수 점검" }),
  });
  assert.deepEqual(await loadLinks(entry.id), [], "memo 미변경 PATCH 는 링크 보존해야 함");

  // 5) 사용자가 실제로 메모를 바꾸면(unitIds 미전달) 새 메모 기준 auto 재계산.
  await fetch(`${baseUrl}/api/work-logs/${entry.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ memo: "옆집 1002호 환기" }),
  });
  assert.deepEqual(await loadLinks(entry.id), [unit1002Id], "memo 변경시엔 새 메모 기준 auto");
});
