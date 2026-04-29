// [Task #611] /approvals/:id/submit-line — custodian 라우팅 회귀 테스트.
//
// 검증 시나리오:
//   1. 건물에 등록된 custodian 이 없으면 다른 건물의 custodian 으로 폴백되지
//      않는다 (cross-tenant 노출 방지). 정상 라인은 400 으로 거절된다.
//   2. 건물에 직접 등록된 custodian 이 있으면 해당 사용자가 결재자로 배정된다.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret-for-approval-line-custodian-scope";

const {
  db,
  usersTable,
  buildingsTable,
  approvalsTable,
  approvalStepsTable,
  expenseVouchersTable,
  paymentRequestsTable,
  hqApprovalThresholdsTable,
  hqBuildingAssignmentsTable,
  pool,
} = await import("@workspace/db");
const { eq, inArray } = await import("drizzle-orm");
const { default: pipelineRouter } = await import("../routes/approvalPipeline");
const { default: stepsRouter } = await import("../routes/approvalSteps");
const { default: approvalsRouter } = await import("../routes/approvals");

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
app.use("/api", pipelineRouter);
app.use("/api", stepsRouter);
app.use("/api", approvalsRouter);

let server: Server;
let baseUrl: string;
const createdUserIds: number[] = [];
const createdBuildingIds: number[] = [];
const createdApprovalIds: number[] = [];

let buildingWithoutCustodianId: number;
let buildingWithCustodianId: number;
let requesterAId: number; // 관리소장 — 건물 A (custodian 없음)
let requesterBId: number; // 관리소장 — 건물 B (custodian 있음)
let bCustodianId: number; // 건물 B 의 custodian
let unrelatedCustodianId: number; // 건물 X(별도) 의 custodian — 폴백 후보

async function createBuilding(name: string): Promise<number> {
  const [b] = await db
    .insert(buildingsTable)
    .values({ name, addressFull: "서울시 테스트구 테스트동 1", totalUnits: 10 })
    .returning();
  createdBuildingIds.push(b.id);
  return b.id;
}

async function createUser(role: string, buildingId: number | null): Promise<number> {
  const portalType =
    role === "platform_admin" ? "platform" : role === "hq_executive" ? "hq" : "building";
  const [u] = await db
    .insert(usersTable)
    .values({
      email: `${role}-${crypto.randomUUID()}@line-scope-test.local`,
      name: `${role}-사용자`,
      role,
      portalType,
      approvalStatus: "active",
      buildingId: buildingId ?? undefined,
    } as typeof usersTable.$inferInsert)
    .returning();
  createdUserIds.push(u.id);
  return u.id;
}

function asUser(userId: number, role: string) {
  currentUser = {
    userId,
    role,
    email: `${role}-${userId}@line-scope-test.local`,
    portalType: role === "platform_admin" ? "platform" : role === "hq_executive" ? "hq" : "building",
  };
}

async function createDraftApproval(requesterId: number, requesterName: string, buildingId: number | null): Promise<number> {
  const [row] = await db
    .insert(approvalsTable)
    .values({
      title: `회귀 테스트 기안 ${crypto.randomUUID().slice(0, 6)}`,
      description: "회귀 테스트",
      category: "other",
      requesterId,
      requesterName,
      buildingId,
      status: "draft",
      isDraft: true,
      totalSteps: 1,
      currentStep: 1,
      estimatedAmount: 50_000,
    } as typeof approvalsTable.$inferInsert)
    .returning();
  createdApprovalIds.push(row.id);
  return row.id;
}

before(async () => {
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  const addr = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${addr.port}/api`;

  buildingWithoutCustodianId = await createBuilding(`A-no-custodian-${crypto.randomUUID().slice(0, 6)}`);
  buildingWithCustodianId = await createBuilding(`B-has-custodian-${crypto.randomUUID().slice(0, 6)}`);
  const buildingX = await createBuilding(`X-stranger-${crypto.randomUUID().slice(0, 6)}`);

  requesterAId = await createUser("manager", buildingWithoutCustodianId);
  requesterBId = await createUser("manager", buildingWithCustodianId);
  bCustodianId = await createUser("custodian", buildingWithCustodianId);
  // 다른 건물(X) 에 등록된 custodian 만 존재. 폴백되면 안 된다.
  unrelatedCustodianId = await createUser("custodian", buildingX);
});

after(async () => {
  if (createdApprovalIds.length > 0) {
    await db.delete(expenseVouchersTable).where(inArray(expenseVouchersTable.approvalId, createdApprovalIds));
    await db.delete(paymentRequestsTable).where(inArray(paymentRequestsTable.approvalId, createdApprovalIds));
    await db.delete(approvalStepsTable).where(inArray(approvalStepsTable.approvalId, createdApprovalIds));
    await db.delete(approvalsTable).where(inArray(approvalsTable.id, createdApprovalIds));
  }
  if (createdUserIds.length > 0) {
    await db.delete(hqApprovalThresholdsTable).where(inArray(hqApprovalThresholdsTable.hqUserId, createdUserIds));
    await db.delete(hqBuildingAssignmentsTable).where(inArray(hqBuildingAssignmentsTable.hqUserId, createdUserIds));
    await db.delete(usersTable).where(inArray(usersTable.id, createdUserIds));
  }
  if (createdBuildingIds.length > 0) {
    await db.delete(buildingsTable).where(inArray(buildingsTable.id, createdBuildingIds));
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await pool.end();
  void unrelatedCustodianId;
});

test("[Task #611] 건물에 등록된 custodian 이 없어도 (1) 다른 건물 custodian 으로 폴백하지 않고 (2) 라인은 offline placeholder 단계로 만들어진다", async () => {
  asUser(requesterAId, "manager");
  const approvalId = await createDraftApproval(requesterAId, "관리소장 A", buildingWithoutCustodianId);

  const res = await fetch(`${baseUrl}/approvals/${approvalId}/submit-line`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ urgentExecution: false }),
  });

  // [round-7] 미등록 관리인이어도 상신은 성공해야 한다 (200).
  assert.equal(res.status, 200, "미등록 관리인이어도 상신은 200");

  const steps = await db
    .select()
    .from(approvalStepsTable)
    .where(eq(approvalStepsTable.approvalId, approvalId));

  // 정확히 custodian 단계 1개가 만들어지고, 다른 건물 custodian 으로 폴백되지 않는다.
  assert.equal(steps.length, 1, "단계 1개 (custodian placeholder)");
  const cs = steps[0];
  assert.equal(cs.approverRole, "custodian");
  assert.equal(cs.path, "offline", "미등록 관리인은 offline 강제");
  assert.equal(cs.signedCopyMissing, true, "서명본 미보관 표시");
  assert.equal(cs.approverName, "관리인 (미등록)");
  assert.notEqual(cs.approverId, unrelatedCustodianId, "다른 건물(X) custodian 으로 폴백되지 않음");
  assert.equal(cs.approverId, requesterAId, "approverId 는 상신자(관리소장) placeholder");
});

test("[Task #611] 건물에 등록된 custodian 이 있으면 해당 사용자가 결재자로 배정된다", async () => {
  asUser(requesterBId, "manager");
  const approvalId = await createDraftApproval(requesterBId, "관리소장 B", buildingWithCustodianId);

  const res = await fetch(`${baseUrl}/approvals/${approvalId}/submit-line`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ urgentExecution: false }),
  });
  assert.equal(res.status, 200, "정상 상신은 200");

  const steps = await db
    .select()
    .from(approvalStepsTable)
    .where(eq(approvalStepsTable.approvalId, approvalId));
  assert.equal(steps.length, 1, "본부장 미배정·custodian 만 있을 때 단계 1개");
  assert.equal(steps[0].approverId, bCustodianId, "결재자 = 건물 B custodian");
  assert.equal(steps[0].approverRole, "custodian");
  assert.equal(steps[0].path, "offline", "기본 path = offline");
});

test("[Task #611] 오프라인 단계는 generic /process 로 마감할 수 없고 /process-offline + 서명본 첨부가 필요하다", async () => {
  // 새 결재 → 정상 상신해 offline custodian 단계 1개 확보.
  asUser(requesterBId, "manager");
  const approvalId = await createDraftApproval(requesterBId, "관리소장 B (offline 가드)", buildingWithCustodianId);
  const submitRes = await fetch(`${baseUrl}/approvals/${approvalId}/submit-line`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ urgentExecution: false }),
  });
  assert.equal(submitRes.status, 200, "상신 성공");
  const [step] = await db
    .select()
    .from(approvalStepsTable)
    .where(eq(approvalStepsTable.approvalId, approvalId));
  assert.equal(step.path, "offline");

  // 결재자(custodian) 가 generic /process 로 직접 승인 시도 → 400 으로 차단되어야 한다.
  asUser(bCustodianId, "custodian");
  const processRes = await fetch(`${baseUrl}/approvals/${approvalId}/steps/${step.id}/process`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "approve", comment: "서명본 없이 통과 시도" }),
  });
  assert.equal(processRes.status, 400, "오프라인 단계는 /process 로 닫지 못한다");
  const body = (await processRes.json()) as { error?: string };
  assert.match(String(body.error ?? ""), /오프라인/, "에러 메시지가 오프라인 가드를 안내");

  // 단계 상태가 그대로 pending 인지 확인.
  const [stepAfter] = await db
    .select()
    .from(approvalStepsTable)
    .where(eq(approvalStepsTable.id, step.id));
  assert.equal(stepAfter.status, "pending", "차단 후에도 단계는 pending 유지");

  // 서명본이 한 장도 없을 때 /process-offline 도 거절되는지 확인 (이중 가드).
  asUser(requesterBId, "manager");
  const offlineNoCopyRes = await fetch(`${baseUrl}/approvals/${approvalId}/steps/${step.id}/process-offline`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "approve" }),
  });
  assert.equal(offlineNoCopyRes.status, 400, "서명본 없이 /process-offline 도 거절");
});

test("[Task #611] GET /approvals — 다른 건물 결재가 manager 응답에 노출되지 않는다", async () => {
  // 건물 A(custodian 없음) 의 manager 가 상신한 일반 결재 1건 (drafts 가 아닌 in_progress 상태로 만들기 위해 강제 update).
  asUser(requesterAId, "manager");
  const aApprovalId = await createDraftApproval(requesterAId, "관리소장 A — 빌딩 격리 테스트", buildingWithoutCustodianId);
  await db
    .update(approvalsTable)
    .set({ isDraft: false, status: "pending" })
    .where(eq(approvalsTable.id, aApprovalId));

  // 건물 B 의 manager 입장에서 GET /approvals 호출.
  asUser(requesterBId, "manager");
  const listRes = await fetch(`${baseUrl}/approvals`);
  assert.equal(listRes.status, 200);
  const list = (await listRes.json()) as { id: number; buildingId: number | null }[];
  const leakedRow = list.find((r) => r.id === aApprovalId);
  assert.equal(leakedRow, undefined, "다른 건물(A) 결재가 건물 B manager 응답에 새지 않음");

  // GET /approvals/:id 직접 호출도 403 으로 차단.
  const detailRes = await fetch(`${baseUrl}/approvals/${aApprovalId}`);
  assert.equal(detailRes.status, 403, "스코프 밖 결재 상세는 403");
});

test("[Task #611] facility_staff 는 같은 빌딩이라도 지출결의서/입금요청서 단건을 조회할 수 없다", async () => {
  // 같은 빌딩(B) 의 결재를 1건 만들고, 거기에 직접 voucher + payment_request 를 1건씩 적재.
  asUser(requesterBId, "manager");
  const approvalId = await createDraftApproval(requesterBId, "관리소장 B — 자금문서 RBAC 테스트", buildingWithCustodianId);
  await db
    .update(approvalsTable)
    .set({ isDraft: false, status: "approved" })
    .where(eq(approvalsTable.id, approvalId));

  const [voucher] = await db
    .insert(expenseVouchersTable)
    .values({
      approvalId,
      buildingId: buildingWithCustodianId,
      title: "회귀 voucher",
      amount: 50_000,
      vendorName: "테스트벤더",
      status: "pending",
    } as typeof expenseVouchersTable.$inferInsert)
    .returning();

  const [paymentReq] = await db
    .insert(paymentRequestsTable)
    .values({
      approvalId,
      buildingId: buildingWithCustodianId,
      title: "회귀 payment-request",
      amount: 50_000,
      payeeName: "테스트수취인",
      payeeAccount: "0000-00-0000",
      status: "pending",
    } as typeof paymentRequestsTable.$inferInsert)
    .returning();

  // 같은 빌딩 B 의 facility_staff 사용자.
  const facilityStaffId = await createUser("facility_staff", buildingWithCustodianId);
  asUser(facilityStaffId, "facility_staff");

  const voucherRes = await fetch(`${baseUrl}/expense-vouchers/${voucher.id}`);
  assert.equal(voucherRes.status, 403, "facility_staff 는 voucher 단건 조회 불가");

  const payReqRes = await fetch(`${baseUrl}/payment-requests/${paymentReq.id}`);
  assert.equal(payReqRes.status, 403, "facility_staff 는 입금요청서 단건 조회 불가");

  // 청소 — 결재 cleanup 에서 voucher/payment-request 가 일괄 삭제되도록 approvalId 기반 cascade 사용 중.
});

test("[Task #611 round-7] custodian 은 결재안(draft) 생성·수정·상신 엔드포인트를 호출할 수 없다", async () => {
  // 건물 B 에 등록된 custodian 으로 호출.
  asUser(bCustodianId, "custodian");

  // 1) draft 생성.
  const createRes = await fetch(`${baseUrl}/approvals/draft`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "관리인이 만든 결재안 (차단되어야 함)",
      description: "테스트",
      category: "other",
      estimatedAmount: 10_000,
    }),
  });
  assert.equal(createRes.status, 403, "custodian 은 draft 생성 불가");

  // 2) draft 수정 — 어떤 id 를 호출해도 가드에서 잘려야 한다.
  const updateRes = await fetch(`${baseUrl}/approvals/draft/999999`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "수정 시도" }),
  });
  assert.equal(updateRes.status, 403, "custodian 은 draft 수정 불가");

  // 3) draft 상신.
  const submitRes = await fetch(`${baseUrl}/approvals/draft/999999/submit`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(submitRes.status, 403, "custodian 은 draft 상신 불가");
});

test("[Task #611 round-8] 다른 건물 manager 는 GET /approvals/:id/steps · /recipients 도 403 으로 차단된다", async () => {
  // 건물 A 의 결재 1건을 만들고 in_progress 로 강제.
  asUser(requesterAId, "manager");
  const aApprovalId = await createDraftApproval(requesterAId, "관리소장 A — 단계/수신자 격리 테스트", buildingWithoutCustodianId);
  await db
    .update(approvalsTable)
    .set({ isDraft: false, status: "in_progress" })
    .where(eq(approvalsTable.id, aApprovalId));

  // 건물 B 의 manager 로 호출.
  asUser(requesterBId, "manager");
  const stepsRes = await fetch(`${baseUrl}/approvals/${aApprovalId}/steps`);
  assert.equal(stepsRes.status, 403, "스코프 밖 결재의 /steps 는 403");
  const recipientsRes = await fetch(`${baseUrl}/approvals/${aApprovalId}/recipients`);
  assert.equal(recipientsRes.status, 403, "스코프 밖 결재의 /recipients 는 403");

  // sanity check: 건물 A manager 본인은 200.
  asUser(requesterAId, "manager");
  const okStepsRes = await fetch(`${baseUrl}/approvals/${aApprovalId}/steps`);
  assert.equal(okStepsRes.status, 200, "본인 건물 manager 는 통과");
});

test("[Task #611 round-8] 다른 건물에 미배정된 hq_executive 도 GET /approvals/:id/steps · /recipients 가 403 으로 차단된다", async () => {
  // 건물 A 의 결재 1건.
  asUser(requesterAId, "manager");
  const aApprovalId = await createDraftApproval(requesterAId, "관리소장 A — hq 격리 테스트", buildingWithoutCustodianId);
  await db
    .update(approvalsTable)
    .set({ isDraft: false, status: "in_progress" })
    .where(eq(approvalsTable.id, aApprovalId));

  // hq_executive 사용자 — 어느 건물에도 배정하지 않는다 (hq_building_assignments 비어 있음).
  const hqUserId = await createUser("hq_executive", null);
  asUser(hqUserId, "hq_executive");

  const stepsRes = await fetch(`${baseUrl}/approvals/${aApprovalId}/steps`);
  assert.equal(stepsRes.status, 403, "미배정 hq_executive 는 /steps 403");
  const recipientsRes = await fetch(`${baseUrl}/approvals/${aApprovalId}/recipients`);
  assert.equal(recipientsRes.status, 403, "미배정 hq_executive 는 /recipients 403");

  // 단건 결재 조회도 같은 정책으로 막혀야 한다 (이미 round-5 에서 도입됨, 회귀 방지).
  const detailRes = await fetch(`${baseUrl}/approvals/${aApprovalId}`);
  assert.equal(detailRes.status, 403, "미배정 hq_executive 는 /:id 도 403");
});
