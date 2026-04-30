// [Task #668] 견적요청 목록 회복력 + 매칭 파트너 알림 fan-out 회귀 테스트.
//
// 시나리오:
//   1) DB 에 자유 입력 시절의 레거시 enum 행(category="방수/도장",
//      serviceType="옥상 방수")이 섞여 있어도 GET /api/rfqs 는 200 으로
//      응답하고 해당 행도 정규화된 값(other / null)으로 반환된다.
//   2) 매니저가 POST /api/rfqs 로 RFQ 를 만든 직후 본인의 GET /api/rfqs 응답에
//      그 행이 즉시 보인다 (자기 가시성 회귀 — 매니저 자신이 만든 요청을
//      매니저 목록에서 못 보는 사고가 있었음).
//   3) 동일 시도/시군구·카테고리에 등록된 파트너 vendor 가 있으면 매칭이 자동으로
//      걸려 vendor:<id> 알림이 1건 적재된다.
//   4) 그 파트너 계정으로 GET /api/rfqs 호출 시 새 RFQ 가 보인다 (forVendorId
//      자동 주입 경로).
//
// 인증: rfqs 라우터는 GET 에 라우터 단 가드가 없고 POST 에 managerOnly 가
//   걸려 있으므로, 테스트 미들웨어로 req.user 를 직접 주입한다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-rfqs-list-resilience";
// 메일 어댑터가 켜지지 않도록 환경 변수가 비어있음을 보장 (최소 한 개라도 unset).
delete process.env.SMTP_HOST;

const { db, usersTable, buildingsTable, rfqsTable, vendorsTable, notificationsTable, pool } =
  await import("@workspace/db");
const { eq, inArray, and } = await import("drizzle-orm");
const { default: rfqsRouter } = await import("../routes/rfqs");

let currentUser:
  | { userId: number; role: string; email: string | null; portalType: string; vendorId?: number | null }
  | null = null;

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
const createdVendorIds: number[] = [];
const createdNotificationIds: number[] = [];

let buildingId: number;
let managerId: number;
let partnerVendorId: number;
let partnerUserId: number;
let otherPartnerVendorId: number;
let otherPartnerUserId: number;
let legacyRfqId: number;

const TEST_SIDO = "서울특별시";
const TEST_SIGUNGU = "강남구";
const RUN_TAG = crypto.randomUUID().slice(0, 8);

function uniqueEmail(prefix: string) {
  return `${prefix}-${RUN_TAG}-${crypto.randomUUID()}@rfqs-resilience.local`;
}

before(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}/api`;

  // 건물 1동 + 매니저 1명.
  const [b] = await db
    .insert(buildingsTable)
    .values({
      name: `회복력테스트-${RUN_TAG}`,
      addressFull: "서울특별시 강남구 테헤란로 1",
      sido: TEST_SIDO,
      sigungu: TEST_SIGUNGU,
    } as typeof buildingsTable.$inferInsert)
    .returning();
  buildingId = b.id;
  createdBuildingIds.push(buildingId);

  const [m] = await db
    .insert(usersTable)
    .values({
      email: uniqueEmail("manager"),
      passwordHash: "x",
      role: "manager",
      name: "회복력매니저",
      portalType: "building",
      buildingId,
      approvalStatus: "active",
      roleSelected: true,
    } as typeof usersTable.$inferInsert)
    .returning();
  managerId = m.id;
  createdUserIds.push(managerId);

  // 파트너 vendor (geo 매칭 대상): waterproofing / 서울 / 강남구 / platform.
  const [v] = await db
    .insert(vendorsTable)
    .values({
      name: `회복력파트너-${RUN_TAG}`,
      type: "platform",
      category: "waterproofing",
      sido: TEST_SIDO,
      sigungu: TEST_SIGUNGU,
    } as typeof vendorsTable.$inferInsert)
    .returning();
  partnerVendorId = v.id;
  createdVendorIds.push(partnerVendorId);

  const [pu] = await db
    .insert(usersTable)
    .values({
      email: uniqueEmail("partner"),
      passwordHash: "x",
      role: "partner",
      name: "회복력파트너유저",
      portalType: "partner",
      vendorId: partnerVendorId,
      approvalStatus: "active",
      roleSelected: true,
    } as typeof usersTable.$inferInsert)
    .returning();
  partnerUserId = pu.id;
  createdUserIds.push(partnerUserId);

  // [Task #668] 미매칭 대조군 파트너 — 다른 카테고리(elevator) / 다른 시군구(서초구).
  //   같은 sido("서울특별시") 라도 카테고리/시군구가 어긋나면 매칭 안 되어야 함.
  const [v2] = await db
    .insert(vendorsTable)
    .values({
      name: `미매칭파트너-${RUN_TAG}`,
      type: "platform",
      category: "elevator",
      sido: TEST_SIDO,
      sigungu: "서초구",
    } as typeof vendorsTable.$inferInsert)
    .returning();
  otherPartnerVendorId = v2.id;
  createdVendorIds.push(otherPartnerVendorId);

  const [pu2] = await db
    .insert(usersTable)
    .values({
      email: uniqueEmail("partner-other"),
      passwordHash: "x",
      role: "partner",
      name: "미매칭파트너유저",
      portalType: "partner",
      vendorId: otherPartnerVendorId,
      approvalStatus: "active",
      roleSelected: true,
    } as typeof usersTable.$inferInsert)
    .returning();
  otherPartnerUserId = pu2.id;
  createdUserIds.push(otherPartnerUserId);

  // 레거시 enum 행을 직접 삽입 (drizzle 타입 가드를 우회하기 위해 SQL 사용).
  // category="방수/도장", service_type="옥상 방수" 는 zod 응답 스키마의 strict
  // enum 시절이라면 한 행만으로 GET /api/rfqs 를 통째로 깨뜨리던 행이다.
  const inserted: Array<{ id: number }> = await db.execute(
    `INSERT INTO rfqs (title, category, service_type, building_name, building_id, deadline, status)
     VALUES ('레거시-${RUN_TAG}', '방수/도장', '옥상 방수', '레거시빌딩', ${buildingId}, '2099-12-31', 'open')
     RETURNING id` as unknown as never,
  ) as unknown as Array<{ id: number }>;
  // drizzle execute 의 반환 형태가 환경별로 약간 달라 안전하게 풀어낸다.
  const rows: Array<{ id: number }> = Array.isArray(inserted)
    ? inserted
    : ((inserted as unknown as { rows?: Array<{ id: number }> }).rows ?? []);
  legacyRfqId = rows[0]?.id;
  if (!legacyRfqId) throw new Error("legacy RFQ insert did not return an id");
  createdRfqIds.push(legacyRfqId);
});

after(async () => {
  if (createdNotificationIds.length > 0) {
    await db.delete(notificationsTable).where(inArray(notificationsTable.id, createdNotificationIds));
  }
  if (createdRfqIds.length > 0) {
    await db.delete(rfqsTable).where(inArray(rfqsTable.id, createdRfqIds));
  }
  // 테스트가 만든 모든 vendor:* 알림 청소 (POST /rfqs fan-out 으로 적재됨).
  await db.delete(notificationsTable).where(eq(notificationsTable.recipientType, `vendor:${partnerVendorId}`));
  await db.delete(notificationsTable).where(eq(notificationsTable.recipientType, `vendor:${otherPartnerVendorId}`));
  if (createdUserIds.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  if (createdVendorIds.length > 0) {
    await db.delete(vendorsTable).where(inArray(vendorsTable.id, createdVendorIds));
  }
  if (createdBuildingIds.length > 0) {
    await db.delete(buildingsTable).where(inArray(buildingsTable.id, createdBuildingIds));
  }
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  await pool.end();
});

function asUser(opts: { userId: number; role: string; vendorId?: number | null }) {
  currentUser = {
    userId: opts.userId,
    role: opts.role,
    email: `${opts.role}-${opts.userId}@rfqs-resilience.local`,
    portalType: opts.role === "partner" ? "partner" : "building",
    vendorId: opts.vendorId ?? null,
  };
}

test("[Task #668] 레거시 enum 행이 섞여도 GET /rfqs 는 500 이 아닌 200 으로 응답한다", async () => {
  asUser({ userId: managerId, role: "manager" });
  const res = await fetch(`${baseUrl}/rfqs`);
  assert.equal(res.status, 200, "응답 zod 검증을 깨지 않고 200 이어야 함");
  const list = (await res.json()) as Array<{ id: number; category: string; serviceType: string | null }>;
  const legacy = list.find((r) => r.id === legacyRfqId);
  assert.ok(legacy, "레거시 RFQ 가 매니저 본인 건물 목록에 포함되어야 함");
  // 정규화 가드: enum 밖 값은 표준값으로 매핑되어 클라이언트에 노출된다.
  assert.equal(legacy!.category, "other", "레거시 category '방수/도장' → 'other' 로 정규화");
  assert.equal(legacy!.serviceType, null, "레거시 serviceType '옥상 방수' → null 로 정규화");
});

test("[Task #668] 매니저가 만든 RFQ 는 곧바로 본인 목록에 보이고, 매칭 파트너에게 알림이 적재된다", async () => {
  asUser({ userId: managerId, role: "manager" });
  const createRes = await fetch(`${baseUrl}/rfqs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: `회복력테스트RFQ-${RUN_TAG}`,
      category: "waterproofing",
      serviceType: "inspection",
      buildingName: "회복력빌딩",
      deadline: "2099-12-31",
      sido: TEST_SIDO,
      sigungu: TEST_SIGUNGU,
      // 사진 필드는 실제 URL 검증을 하지 않으므로 마커로도 충분.
      closeUpPhotoUrl: "https://example.com/close.jpg",
      widePhotoUrl: "https://example.com/wide.jpg",
    }),
  });
  assert.equal(createRes.status, 201, "정상 RFQ 생성은 201 이어야 함");
  const created = (await createRes.json()) as { id: number; vendorIds?: string | null };
  createdRfqIds.push(created.id);
  assert.ok(created.id, "생성된 RFQ id 가 있어야 함");
  // geo 매칭으로 partnerVendorId 가 vendorIds 에 포함되어 있어야 한다.
  const matchedIds = (created.vendorIds ?? "").split(",").filter(Boolean);
  assert.ok(
    matchedIds.includes(String(partnerVendorId)),
    `geo 매칭으로 partner vendor(${partnerVendorId}) 가 vendorIds 에 포함되어야 함 (실제: ${created.vendorIds ?? "<empty>"})`,
  );

  // 매니저 본인 가시성: 방금 만든 RFQ 가 매니저 목록에 즉시 보인다.
  const listRes = await fetch(`${baseUrl}/rfqs`);
  assert.equal(listRes.status, 200);
  const list = (await listRes.json()) as Array<{ id: number }>;
  assert.ok(
    list.some((r) => r.id === created.id),
    "매니저가 방금 만든 RFQ 가 본인 목록에 곧바로 보여야 함",
  );

  // 알림 fan-out: vendor:<partnerVendorId> 행이 1건 이상 새로 적재되었는지.
  const notes = await db
    .select({ id: notificationsTable.id, type: notificationsTable.notificationType })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.recipientType, `vendor:${partnerVendorId}`),
        eq(notificationsTable.relatedEntityType, "rfq"),
        eq(notificationsTable.relatedEntityId, created.id),
      ),
    );
  assert.ok(notes.length >= 1, "매칭 파트너에게 vendor:<id> 알림이 적재되어야 함");
  assert.equal(notes[0].type, "rfq_new", "알림 타입은 rfq_new");
  for (const n of notes) createdNotificationIds.push(n.id);

  // [Task #668] 미매칭 대조군: 카테고리/시군구가 어긋나는 파트너에게는 알림이 가지 않고,
  //   파트너 시점 GET /rfqs 에도 새 RFQ 가 노출되지 않아야 한다.
  assert.ok(
    !matchedIds.includes(String(otherPartnerVendorId)),
    `미매칭 파트너(${otherPartnerVendorId}) 는 vendorIds 에 들어가면 안 됨`,
  );
  const otherNotes = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.recipientType, `vendor:${otherPartnerVendorId}`),
        eq(notificationsTable.relatedEntityType, "rfq"),
        eq(notificationsTable.relatedEntityId, created.id),
      ),
    );
  assert.equal(otherNotes.length, 0, "미매칭 파트너에게는 알림이 적재되면 안 됨");

  asUser({ userId: otherPartnerUserId, role: "partner", vendorId: otherPartnerVendorId });
  const otherListRes = await fetch(`${baseUrl}/rfqs`);
  assert.equal(otherListRes.status, 200);
  const otherList = (await otherListRes.json()) as Array<{ id: number }>;
  assert.ok(
    !otherList.some((r) => r.id === created.id),
    "미매칭 파트너의 목록에는 새 RFQ 가 노출되면 안 됨",
  );

  // 파트너 시점 가시성: 같은 RFQ 가 파트너 목록에도 보인다 (forVendorId 자동 주입).
  asUser({ userId: partnerUserId, role: "partner", vendorId: partnerVendorId });
  const partnerListRes = await fetch(`${baseUrl}/rfqs`);
  assert.equal(partnerListRes.status, 200, "파트너 목록도 200");
  const partnerList = (await partnerListRes.json()) as Array<{ id: number }>;
  assert.ok(
    partnerList.some((r) => r.id === created.id),
    "매칭된 파트너의 목록에 새 RFQ 가 노출되어야 함",
  );
});
