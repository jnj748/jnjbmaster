/**
 * Task #770 — 거절 케이스 자동 회귀 (잔액 부족 / 프리미엄 슬롯 한도 / 미열람 환불).
 *
 * 본 스크립트는 부작용이 큰 부정 케이스 3종을 격리된 시드 위에서 자동 단언한다.
 *   N1) 파트너 wallet 0원 → POST /quotes 가 402 로 거절되는지
 *   N2) premium_slot_limit 초과 → POST /quotes 가 409 로 거절되는지
 *   N3) 미열람 환불 — 백데이트된 견적 + consumption 원장 위에서 환불 잡이 ledger 1행
 *       을 적재하고 quote.noViewRefundedAt 를 설정하며, 같은 잡을 다시 호출해도
 *       ledger 행이 더 늘지 않음(멱등) 을 단언한다.
 *
 * 격리 원칙
 *   - 본 스크립트가 만든 vendor / RFQ / quote / ledger 행 위에서만 검증한다.
 *   - 종료 시 만든 행을 `RUN_ID` 태깅으로 정확히 삭제하며, platform_settings 등
 *     공용 정책은 절대 변경하지 않는다.
 *   - premium_slot_limit 은 글로벌 설정 대신 RFQ 행의 `premiumSlotLimit` 컬럼을 1 로
 *     강제하여 다른 데이터에 영향이 없도록 한다.
 *
 * 실행
 *   pnpm --filter @workspace/scripts run cash-flow-regression
 *   API_BASE 환경변수로 API 베이스 경로를 덮어쓸 수 있다 (기본 http://localhost:80/api).
 */
import { eq, and, sql, inArray, isNull } from "drizzle-orm";
import {
  db,
  vendorsTable,
  vendorCreditWalletsTable,
  creditLedgerTable,
  creditCategoryPricingTable,
  rfqsTable,
  quotesTable,
  usersTable,
  platformSettingsTable,
  documentsTable,
  notificationsTable,
} from "@workspace/db";

// 본 회귀가 만든 vendor 만 추적 — cleanup/재정합 시 다른 vendor 에 절대 손대지 않는다.
const ownedVendorIds: Set<number> = new Set();

const API = process.env.API_BASE ?? "http://localhost:80/api";
const PASS = process.env.REGRESSION_PASS ?? "test1234!";
const RUN_ID = `cfn-${Date.now().toString(36)}`;

interface CaseResult {
  id: string;
  title: string;
  status: "pass" | "fail";
  notes: string[];
  defects: string[];
}
const results: CaseResult[] = [];
const cleanups: Array<() => Promise<void>> = [];

function rec(id: string, title: string): CaseResult {
  const r: CaseResult = { id, title, status: "pass", notes: [], defects: [] };
  results.push(r);
  return r;
}
function fail(r: CaseResult, msg: string) {
  r.status = "fail";
  r.defects.push(msg);
}
function note(r: CaseResult, msg: string) { r.notes.push(msg); }

async function login(identifier: string): Promise<{ token: string; userId: number; vendorId: number | null; buildingId: number | null; role: string }> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier, password: PASS }),
  });
  if (!res.ok) throw new Error(`로그인 실패 ${identifier}: ${res.status} ${await res.text()}`);
  const j = (await res.json()) as { token: string; user: { id: number; vendorId: number | null; role: string } };
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, j.user.id));
  return {
    token: j.token,
    userId: j.user.id,
    vendorId: j.user.vendorId,
    buildingId: u?.buildingId ?? null,
    role: j.user.role,
  };
}
function authHeader(token: string) { return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }; }

async function createTestVendor(suffix: string): Promise<number> {
  const [v] = await db
    .insert(vendorsTable)
    .values({
      name: `[${RUN_ID}] ${suffix}`,
      category: "기타",
      contactName: "회귀검증",
      phone: "010-0000-0000",
    } as typeof vendorsTable.$inferInsert)
    .returning({ id: vendorsTable.id });
  ownedVendorIds.add(v.id);
  cleanups.push(async () => {
    // 본 vendor 가 만든 quote 의 파생 행(documents/notifications) 도 함께 정리.
    const quoteIds = (await db.select({ id: quotesTable.id }).from(quotesTable).where(eq(quotesTable.vendorId, v.id))).map(q => q.id);
    if (quoteIds.length > 0) {
      await db.delete(documentsTable).where(and(eq(documentsTable.sourceTable, "quotes"), inArray(documentsTable.sourceId, quoteIds)));
      await db.delete(notificationsTable).where(and(eq(notificationsTable.relatedEntityType, "quote"), inArray(notificationsTable.relatedEntityId, quoteIds)));
    }
    await db.delete(creditLedgerTable).where(eq(creditLedgerTable.vendorId, v.id));
    await db.delete(vendorCreditWalletsTable).where(eq(vendorCreditWalletsTable.vendorId, v.id));
    await db.delete(quotesTable).where(eq(quotesTable.vendorId, v.id));
    await db.delete(vendorsTable).where(eq(vendorsTable.id, v.id));
  });
  return v.id;
}

// `refundUnviewedQuotes` 의 정책 결정과 동일한 규칙으로 카테고리 오버라이드를 반영해
// 기대 환불 비율을 계산한다 (sido/sigungu 모두 NULL 인 공통 오버라이드 조회).
async function resolveRefundRatio(category: string, fallback: number): Promise<number> {
  const overrides = await db
    .select({ ratioPercent: creditCategoryPricingTable.noViewRefundRatioPercent })
    .from(creditCategoryPricingTable)
    .where(and(
      eq(creditCategoryPricingTable.category, category),
      isNull(creditCategoryPricingTable.sido),
      isNull(creditCategoryPricingTable.sigungu),
    ));
  const ov = overrides.find(o => o.ratioPercent != null);
  return ov?.ratioPercent != null ? ov.ratioPercent / 100 : fallback;
}
async function resolveRefundDays(category: string, fallback: number): Promise<number> {
  const overrides = await db
    .select({ days: creditCategoryPricingTable.noViewRefundDays })
    .from(creditCategoryPricingTable)
    .where(and(
      eq(creditCategoryPricingTable.category, category),
      isNull(creditCategoryPricingTable.sido),
      isNull(creditCategoryPricingTable.sigungu),
    ));
  const ov = overrides.find(o => o.days != null);
  return ov?.days != null ? ov.days : fallback;
}

async function createTestRfq(opts: {
  buildingId: number;
  requesterId: number;
  isPremium: boolean;
  premiumSlotLimit: number | null;
  estimatedAmount: number;
  suffix: string;
}): Promise<number> {
  const [rfq] = await db.insert(rfqsTable).values({
    title: `[${RUN_ID}] ${opts.suffix}`,
    category: "기타",
    description: "회귀검증",
    buildingId: opts.buildingId,
    buildingName: `[${RUN_ID}] building`,
    deadline: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    requesterId: opts.requesterId,
    requesterName: "manager",
    estimatedAmount: opts.estimatedAmount,
    status: "open",
    isPremium: opts.isPremium,
    ...(opts.premiumSlotLimit != null ? { premiumSlotLimit: opts.premiumSlotLimit } : {}),
  } as typeof rfqsTable.$inferInsert).returning();
  cleanups.push(async () => {
    // 본 RFQ 에 적재된 quote 의 파생 행(documents/notifications) 도 함께 정리.
    const quoteIds = (await db.select({ id: quotesTable.id }).from(quotesTable).where(eq(quotesTable.rfqId, rfq.id))).map(q => q.id);
    if (quoteIds.length > 0) {
      await db.delete(documentsTable).where(and(eq(documentsTable.sourceTable, "quotes"), inArray(documentsTable.sourceId, quoteIds)));
      await db.delete(notificationsTable).where(and(eq(notificationsTable.relatedEntityType, "quote"), inArray(notificationsTable.relatedEntityId, quoteIds)));
    }
    // RFQ 자체로부터 파생된 documents (sourceTable='rfqs') 도 정리.
    await db.delete(documentsTable).where(and(eq(documentsTable.sourceTable, "rfqs"), eq(documentsTable.sourceId, rfq.id)));
    await db.delete(creditLedgerTable).where(eq(creditLedgerTable.rfqId, rfq.id));
    await db.delete(quotesTable).where(eq(quotesTable.rfqId, rfq.id));
    await db.delete(rfqsTable).where(eq(rfqsTable.id, rfq.id));
  });
  return rfq.id;
}

function quoteBody(rfqId: number, vendorId: number, vendorName: string) {
  return {
    rfqId,
    vendorId,
    vendorName,
    totalAmount: 1_000_000,
    subtotal: 909_091,
    vatAmount: 90_909,
    scope: `[${RUN_ID}]`,
    itemBreakdown: "회귀 1식",
    estimatedDays: 5,
    availableDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    warrantyTerms: "1년",
    notes: `[${RUN_ID}]`,
    requiredDocsComplete: false,
    status: "pending",
    validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  };
}

// ──────────────────────────────────────────
// N1 — 잔액 부족 → 402
// ──────────────────────────────────────────
async function caseInsufficientBalance() {
  const r = rec("N1", "파트너 wallet 0원 → POST /quotes 402");

  const manager = await login("manager@test.com");
  const admin = await login("admin@test.com");
  if (!manager.buildingId) { fail(r, "manager.buildingId 없음 — 시드 불가"); return; }

  const poorVendor = await createTestVendor("insufficient-balance");
  // 지갑을 명시적으로 0 으로 보장.
  await db.insert(vendorCreditWalletsTable).values({ vendorId: poorVendor, balance: 0, pointsBalance: 0 } as typeof vendorCreditWalletsTable.$inferInsert).onConflictDoNothing();
  await db.update(vendorCreditWalletsTable).set({ balance: 0, pointsBalance: 0 }).where(eq(vendorCreditWalletsTable.vendorId, poorVendor));

  const rfqId = await createTestRfq({
    buildingId: manager.buildingId,
    requesterId: manager.userId,
    isPremium: false,
    premiumSlotLimit: null,
    estimatedAmount: 500_000,
    suffix: "잔액부족 RFQ",
  });

  // 본 스크립트가 만든 vendor 에는 partner 사용자가 매핑되어 있지 않아 partner 토큰의 vendorId 가드를 통과 못 한다.
  // → admin (platform_admin) 토큰으로 제출 (quote 라우터의 partner 가드는 role==='partner' 일 때만 적용).
  const res = await fetch(`${API}/quotes`, {
    method: "POST", headers: authHeader(admin.token),
    body: JSON.stringify(quoteBody(rfqId, poorVendor, `[${RUN_ID}] poor`)),
  });
  if (res.status !== 402) {
    fail(r, `기대 402, 실제 ${res.status} ${(await res.text()).slice(0, 200)}`);
    return;
  }
  const body = (await res.json()) as { error?: string; required?: number; balance?: number };
  if (typeof body.required !== "number" || typeof body.balance !== "number") {
    fail(r, `402 응답에 required/balance 누락: ${JSON.stringify(body).slice(0, 200)}`);
    return;
  }
  if (body.balance !== 0) fail(r, `wallet=0 시드인데 응답 balance=${body.balance}`);
  if (body.required <= 0) fail(r, `required=${body.required} 가 양수가 아님`);
  // 부작용 없음 단언: quote 행이 생기지 않았고 ledger 도 비어있어야 한다.
  const inserted = await db.select({ id: quotesTable.id }).from(quotesTable).where(and(eq(quotesTable.rfqId, rfqId), eq(quotesTable.vendorId, poorVendor)));
  if (inserted.length !== 0) fail(r, `(부작용) 402 거절인데 quote 행 ${inserted.length} 개 생성됨`);
  const led = await db.select({ id: creditLedgerTable.id }).from(creditLedgerTable).where(eq(creditLedgerTable.vendorId, poorVendor));
  if (led.length !== 0) fail(r, `(부작용) 402 거절인데 ledger ${led.length} 행 적재됨`);

  if (r.status === "pass") {
    note(r, `402 거절 OK required=${body.required} balance=${body.balance}, 부작용 없음`);
  }
}

// ──────────────────────────────────────────
// N2 — premium_slot_limit 초과 → 409
//   글로벌 설정을 변경하지 않고 RFQ.premiumSlotLimit=1 로 강제.
// ──────────────────────────────────────────
async function casePremiumSlotExceeded() {
  const r = rec("N2", "premium_slot_limit 초과 → POST /quotes 409");

  const manager = await login("manager@test.com");
  const admin = await login("admin@test.com");
  if (!manager.buildingId) { fail(r, "manager.buildingId 없음 — 시드 불가"); return; }

  const rfqId = await createTestRfq({
    buildingId: manager.buildingId,
    requesterId: manager.userId,
    isPremium: true,
    premiumSlotLimit: 1,
    estimatedAmount: 50_000_000,
    suffix: "프리미엄 슬롯 RFQ",
  });

  // 슬롯 1을 occupier vendor 의 quote 로 직접 INSERT 하여 채운다.
  const occupier = await createTestVendor("slot-occupier");
  await db.insert(quotesTable).values({
    rfqId,
    vendorId: occupier,
    vendorName: `[${RUN_ID}] occupier`,
    totalAmount: 50_000_000,
    subtotal: 45_454_545,
    vatAmount: 4_545_455,
    scope: "occupier",
    itemBreakdown: "slot 1식",
    estimatedDays: 7,
    availableDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    status: "pending",
    requiredDocsComplete: false,
    validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    notes: `[${RUN_ID}]`,
  } as typeof quotesTable.$inferInsert);

  // 다른 vendor 가 동일 RFQ 에 응찰 → 409 슬롯 마감. 잔액부족과 분리하기 위해 충분한 크레딧을 사전 충전.
  const challenger = await createTestVendor("slot-challenger");
  const adjRes = await fetch(`${API}/credits/adjust`, {
    method: "POST", headers: authHeader(admin.token),
    body: JSON.stringify({ vendorId: challenger, amount: 100_000, kind: "manual_credit", notes: `[${RUN_ID}] 슬롯 검증 충전` }),
  });
  if (!adjRes.ok) { fail(r, `사전 충전 실패 ${adjRes.status}`); return; }

  const res = await fetch(`${API}/quotes`, {
    method: "POST", headers: authHeader(admin.token),
    body: JSON.stringify(quoteBody(rfqId, challenger, `[${RUN_ID}] challenger`)),
  });
  if (res.status !== 409) {
    fail(r, `기대 409, 실제 ${res.status} ${(await res.text()).slice(0, 200)}`);
    return;
  }
  const body = (await res.json()) as { error?: string };
  if (!body.error || !/슬롯|마감|premium/i.test(body.error)) {
    fail(r, `409 응답이 슬롯 마감 메시지가 아님: ${JSON.stringify(body).slice(0, 200)}`);
  }
  // 부작용 없음: challenger 의 quote 행이 생기지 않고 ledger 적재도 없음(차감 전 슬롯 가드 통과 실패).
  const inserted = await db.select({ id: quotesTable.id }).from(quotesTable).where(and(eq(quotesTable.rfqId, rfqId), eq(quotesTable.vendorId, challenger)));
  if (inserted.length !== 0) fail(r, `(부작용) 409 거절인데 challenger quote 행 ${inserted.length} 개 생성됨`);
  const consumption = await db.select({ id: creditLedgerTable.id }).from(creditLedgerTable).where(and(
    eq(creditLedgerTable.vendorId, challenger),
    eq(creditLedgerTable.kind, "consumption"),
  ));
  if (consumption.length !== 0) fail(r, `(부작용) 409 거절인데 challenger consumption ledger ${consumption.length} 행`);

  if (r.status === "pass") {
    note(r, `409 슬롯 마감 거절 OK, challenger 잔액 미차감 + quote 미생성`);
  }
}

// ──────────────────────────────────────────
// N3 — 미열람 환불 발생 + 멱등
//   백데이트된 견적 + consumption 원장 + (선택) firstViewedAt=null 위에서
//   /credits/admin/run-unviewed-refund 를 호출.
// ──────────────────────────────────────────
async function caseUnviewedRefund() {
  const r = rec("N3", "미열람 환불 — 환불 ledger 적재 + 멱등");

  const manager = await login("manager@test.com");
  const admin = await login("admin@test.com");
  if (!manager.buildingId) { fail(r, "manager.buildingId 없음 — 시드 불가"); return; }

  // 정책 일수/비율 — platform_settings 의 공통값 + RFQ 카테고리 오버라이드(creditCategoryPricing)
  // 를 동일한 우선순위로 반영해 `refundUnviewedQuotes` 의 결정 규칙과 정확히 일치시킨다.
  const RFQ_CATEGORY = "기타";
  const [daysRow] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "no_view_refund_days"));
  const [ratioRow] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, "no_view_refund_ratio"));
  const commonDays = daysRow ? Number(daysRow.value) : 7;
  const commonRatio = ratioRow ? Number(ratioRow.value) : 0.6;
  const refundDays = await resolveRefundDays(RFQ_CATEGORY, commonDays);
  const refundRatio = await resolveRefundRatio(RFQ_CATEGORY, commonRatio);
  note(r, `정책(category=${RFQ_CATEGORY}): refund_days=${refundDays}, ratio=${refundRatio} (common=${commonDays}/${commonRatio})`);

  const vendor = await createTestVendor("unviewed-refund");
  // 지갑 시드 — 환불 입금 후 wallet 정합성 확인을 위해 0 으로 시작.
  await db.insert(vendorCreditWalletsTable).values({ vendorId: vendor, balance: 0, pointsBalance: 0 } as typeof vendorCreditWalletsTable.$inferInsert).onConflictDoNothing();

  const rfqId = await createTestRfq({
    buildingId: manager.buildingId,
    requesterId: manager.userId,
    isPremium: false,
    premiumSlotLimit: null,
    estimatedAmount: 500_000,
    suffix: "미열람환불 RFQ",
  });

  // 백데이트 quote (firstViewedAt=null, noViewRefundedAt=null, createdAt = now - (days+3)일)
  const oldDate = new Date(Date.now() - (refundDays + 3) * 86400000);
  const consumeAmount = -100; // consumption 은 음수.
  const [quote] = await db.insert(quotesTable).values({
    rfqId,
    vendorId: vendor,
    vendorName: `[${RUN_ID}] unviewed`,
    totalAmount: 500_000,
    subtotal: 454_545,
    vatAmount: 45_455,
    scope: "회귀",
    itemBreakdown: "1식",
    estimatedDays: 3,
    availableDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
    status: "pending",
    requiredDocsComplete: false,
    validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    notes: `[${RUN_ID}]`,
    createdAt: oldDate,
    updatedAt: oldDate,
  } as typeof quotesTable.$inferInsert).returning();

  // 백데이트 consumption ledger 1행 + wallet 잔액 (-100) 일관성. wallet 은 환불 후 +ceil(100*ratio) 가 된다.
  const [led] = await db.insert(creditLedgerTable).values({
    vendorId: vendor,
    amount: consumeAmount,
    kind: "consumption",
    source: "consumption",
    rfqId,
    quoteId: quote.id,
    notes: `[${RUN_ID}] 회귀 미열람 환불용 consumption`,
    createdAt: oldDate,
  } as typeof creditLedgerTable.$inferInsert).returning();
  await db.update(vendorCreditWalletsTable).set({ balance: consumeAmount }).where(eq(vendorCreditWalletsTable.vendorId, vendor));

  const expectedRefund = Math.ceil(Math.abs(consumeAmount) * refundRatio);

  // 1차 호출: 환불 발생. 회귀가 만든 quote 만 후보로 한정 — 다른 데이터에 영향 없음.
  const run1 = await fetch(`${API}/credits/admin/run-unviewed-refund`, {
    method: "POST", headers: authHeader(admin.token),
    body: JSON.stringify({ quoteIds: [quote.id] }),
  });
  if (!run1.ok) {
    fail(r, `(1차) 환불 잡 호출 실패 ${run1.status} ${(await run1.text()).slice(0, 200)}`);
    return;
  }
  const result1 = (await run1.json()) as { refundedCount: number; refundedAmount: number };
  note(r, `(1차) 잡 결과 refundedCount=${result1.refundedCount} refundedAmount=${result1.refundedAmount}`);

  const refundsAfter1 = await db.select().from(creditLedgerTable).where(and(
    eq(creditLedgerTable.quoteId, quote.id),
    eq(creditLedgerTable.kind, "refund"),
  ));
  if (refundsAfter1.length !== 1) {
    fail(r, `1차 호출 후 환불 ledger ${refundsAfter1.length} 행 (기대 1)`);
    return;
  }
  const refundRow = refundsAfter1[0];
  if (refundRow.amount !== expectedRefund) fail(r, `환불 금액 ${refundRow.amount} ≠ 기대 ${expectedRefund} (=${Math.abs(consumeAmount)} × ${refundRatio} 올림)`);
  if (refundRow.relatedLedgerId !== led.id) fail(r, `환불행의 relatedLedgerId=${refundRow.relatedLedgerId} ≠ consumption #${led.id}`);
  // quote.noViewRefundedAt 설정 단언.
  const [qAfter] = await db.select().from(quotesTable).where(eq(quotesTable.id, quote.id));
  if (!qAfter.noViewRefundedAt) fail(r, "noViewRefundedAt 미설정");
  // wallet 정합성: 환불 후 잔액 = consumption(-100) + refund(+expected).
  const [wAfter] = await db.select().from(vendorCreditWalletsTable).where(eq(vendorCreditWalletsTable.vendorId, vendor));
  const expectedWalletAfter = consumeAmount + expectedRefund;
  if (wAfter.balance !== expectedWalletAfter) fail(r, `wallet ${wAfter.balance} ≠ 기대 ${expectedWalletAfter}`);
  if (r.status === "pass") note(r, `(1차) 환불 ledger +${refundRow.amount}, quote.noViewRefundedAt 설정, wallet=${wAfter.balance}`);

  // 2차 호출: 멱등 — 추가 ledger 없음. 동일하게 quoteId 한정.
  const run2 = await fetch(`${API}/credits/admin/run-unviewed-refund`, {
    method: "POST", headers: authHeader(admin.token),
    body: JSON.stringify({ quoteIds: [quote.id] }),
  });
  if (!run2.ok) {
    fail(r, `(2차) 환불 잡 호출 실패 ${run2.status}`);
    return;
  }
  const refundsAfter2 = await db.select().from(creditLedgerTable).where(and(
    eq(creditLedgerTable.quoteId, quote.id),
    eq(creditLedgerTable.kind, "refund"),
  ));
  if (refundsAfter2.length !== 1) fail(r, `2차 호출 후 환불 ledger ${refundsAfter2.length} 행 (멱등 깨짐, 기대 1)`);
  else note(r, "(2차) 환불 ledger 추가 적재 없음 — 멱등 OK");
}

// ──────────────────────────────────────────
// N4 — 중복 응찰 → 409
//   동일 (rfqId, vendorId) 재제출은 quotes_rfq_vendor_unique 인덱스 + 라우트 가드
//   양쪽에서 차단되어야 한다. 1차는 성공적으로 차감 후 INSERT, 2차는 409 거절.
// ──────────────────────────────────────────
async function caseDuplicateBid() {
  const r = rec("N4", "중복 응찰 → POST /quotes 409");

  const manager = await login("manager@test.com");
  const admin = await login("admin@test.com");
  if (!manager.buildingId) { fail(r, "manager.buildingId 없음 — 시드 불가"); return; }

  const vendor = await createTestVendor("duplicate-bid");
  const rfqId = await createTestRfq({
    buildingId: manager.buildingId,
    requesterId: manager.userId,
    isPremium: false,
    premiumSlotLimit: null,
    estimatedAmount: 500_000,
    suffix: "중복응찰 RFQ",
  });

  // 1차는 부작용을 최소화하기 위해 직접 INSERT 로 시드한다 (documents/notifications 미생성).
  // 본 케이스의 검증 지점은 "동일 (rfqId, vendorId) 재제출이 409 로 거절되는가" 이며,
  // 차감 라우트의 정상 경로 검증은 N1/N2 와 별개의 정상 회귀(Task #768)에서 다룬다.
  await db.insert(quotesTable).values({
    rfqId,
    vendorId: vendor,
    vendorName: `[${RUN_ID}] dup-seed`,
    totalAmount: 1_000_000,
    subtotal: 909_091,
    vatAmount: 90_909,
    scope: "회귀",
    itemBreakdown: "1식",
    estimatedDays: 5,
    availableDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    status: "pending",
    requiredDocsComplete: false,
    validUntil: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    notes: `[${RUN_ID}]`,
  } as typeof quotesTable.$inferInsert);
  // 충분한 잔액 시드 — 잔액 부족(N1) 과 분리하여 슬롯/중복 가드만이 거절 사유가 되도록 한다.
  await db.insert(vendorCreditWalletsTable).values({ vendorId: vendor, balance: 100_000, pointsBalance: 0 } as typeof vendorCreditWalletsTable.$inferInsert).onConflictDoNothing();
  await db.update(vendorCreditWalletsTable).set({ balance: 100_000, pointsBalance: 0 }).where(eq(vendorCreditWalletsTable.vendorId, vendor));

  // 2차 응찰 — 동일 (rfq, vendor) → 409.
  const dup = await fetch(`${API}/quotes`, {
    method: "POST", headers: authHeader(admin.token),
    body: JSON.stringify(quoteBody(rfqId, vendor, `[${RUN_ID}] dup-second`)),
  });
  if (dup.status !== 409) {
    fail(r, `중복 응찰 기대 409, 실제 ${dup.status} ${(await dup.text()).slice(0, 200)}`);
    return;
  }
  // 부작용 없음: quote 행은 시드된 1건 그대로, consumption ledger 도 0건이어야 한다.
  const rows = await db.select({ id: quotesTable.id }).from(quotesTable).where(and(eq(quotesTable.rfqId, rfqId), eq(quotesTable.vendorId, vendor)));
  if (rows.length !== 1) fail(r, `(부작용) 중복 응찰 거절인데 quote 행 ${rows.length} 개 (기대 1)`);
  const consumptions = await db.select({ id: creditLedgerTable.id }).from(creditLedgerTable).where(and(
    eq(creditLedgerTable.rfqId, rfqId),
    eq(creditLedgerTable.vendorId, vendor),
    eq(creditLedgerTable.kind, "consumption"),
  ));
  if (consumptions.length !== 0) fail(r, `(부작용) 거절된 2차 응찰인데 consumption ledger ${consumptions.length} 행 (기대 0)`);
  if (r.status === "pass") note(r, "409 중복 응찰 거절 OK, quote 시드 1건/추가 차감 0건 유지");
}

// ──────────────────────────────────────────
// 메인
// ──────────────────────────────────────────
async function main() {
  console.log(`API=${API} RUN_ID=${RUN_ID}`);
  const cases: Array<[string, () => Promise<void>]> = [
    ["N1", caseInsufficientBalance],
    ["N2", casePremiumSlotExceeded],
    ["N3", caseUnviewedRefund],
    ["N4", caseDuplicateBid],
  ];
  for (const [id, fn] of cases) {
    try {
      await fn();
    } catch (e) {
      const r = results.find(x => x.id === id) ?? rec(id, id);
      fail(r, `예외: ${(e as Error).message}`);
    }
  }

  // cleanup (역순)
  for (const c of cleanups.reverse()) {
    try { await c(); } catch (e) { console.warn("cleanup 실패:", (e as Error).message); }
  }
  // RUN_ID 태깅된 잔여 ledger 삭제 — 본 회귀가 만든 vendor 한정.
  // (공유 vendor 의 manual_credit 등은 본 스크립트가 만들지 않으므로 절대 건드리지 않는다.)
  try {
    if (ownedVendorIds.size > 0) {
      await db.delete(creditLedgerTable).where(and(
        inArray(creditLedgerTable.vendorId, [...ownedVendorIds]),
        sql`notes LIKE ${'%' + RUN_ID + '%'}`,
      ));
    }
  } catch (e) {
    console.warn("RUN_ID ledger 삭제 실패:", (e as Error).message);
  }
  // 본 회귀가 만든 vendor 의 wallet 만 ledger SUM 으로 재정합. 다른 vendor 행은 절대 손대지 않는다.
  try {
    if (ownedVendorIds.size > 0) {
      for (const vid of ownedVendorIds) {
        const [agg] = await db
          .select({
            sumCredits: sql<string>`coalesce(sum(amount), 0)`,
            sumPoints: sql<string>`coalesce(sum(points_amount), 0)`,
          })
          .from(creditLedgerTable)
          .where(eq(creditLedgerTable.vendorId, vid));
        const sumCredits = Number(agg?.sumCredits ?? 0);
        const sumPoints = Number(agg?.sumPoints ?? 0);
        await db
          .update(vendorCreditWalletsTable)
          .set({ balance: sumCredits, pointsBalance: sumPoints })
          .where(eq(vendorCreditWalletsTable.vendorId, vid));
      }
    }
  } catch (e) {
    console.warn("wallet 재정합 실패:", (e as Error).message);
  }

  // 사후 invariant: 본 회귀가 만든 시드의 잔존 0 단언 (RUN_ID 태깅 기준).
  try {
    const r = rec("CLEANUP", "잔존 0 — RUN_ID 태깅 행이 모두 정리되었는지");
    const vendors = await db.select({ id: vendorsTable.id }).from(vendorsTable).where(sql`name LIKE ${'[' + RUN_ID + ']%'}`);
    if (vendors.length !== 0) fail(r, `vendors 잔존 ${vendors.length} 행`);
    const rfqs = await db.select({ id: rfqsTable.id }).from(rfqsTable).where(sql`title LIKE ${'[' + RUN_ID + ']%'}`);
    if (rfqs.length !== 0) fail(r, `rfqs 잔존 ${rfqs.length} 행`);
    const ledger = await db.select({ id: creditLedgerTable.id }).from(creditLedgerTable).where(sql`notes LIKE ${'%' + RUN_ID + '%'}`);
    if (ledger.length !== 0) fail(r, `credit_ledger(RUN_ID 태깅) 잔존 ${ledger.length} 행`);
    if (ownedVendorIds.size > 0) {
      const wallets = await db.select({ id: vendorCreditWalletsTable.vendorId }).from(vendorCreditWalletsTable).where(inArray(vendorCreditWalletsTable.vendorId, [...ownedVendorIds]));
      if (wallets.length !== 0) fail(r, `wallets(owned) 잔존 ${wallets.length} 행`);
    }
    if (r.status === "pass") note(r, "vendors/rfqs/ledger/wallets 잔존 0 — 다른 데이터 영향 없음");
  } catch (e) {
    const r = rec("CLEANUP", "잔존 0 — RUN_ID 태깅 행이 모두 정리되었는지");
    fail(r, `잔존 검사 예외: ${(e as Error).message}`);
  }

  // 리포트
  const passed = results.filter(r => r.status === "pass").length;
  const failed = results.filter(r => r.status === "fail").length;
  console.log("");
  console.log("=== 캐시 플로우 거절 케이스 회귀 결과 ===");
  for (const r of results) {
    const marker = r.status === "pass" ? "✅" : "❌";
    console.log(`${marker} ${r.id} — ${r.title}`);
    for (const n of r.notes) console.log(`     · ${n}`);
    for (const d of r.defects) console.log(`     ✗ ${d}`);
  }
  console.log("");
  console.log(`Result: ${passed} pass / ${failed} fail / 총 ${results.length}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(2);
});
