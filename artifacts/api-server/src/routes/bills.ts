// [Task #779] T8 고지·수납엔진 v01 — bills/payments/bank reconciliation/delinquency.
//
// 라우팅 개요:
//   POST  /bills/generate                — 확정된 billing_run 으로부터 호실별 고지서 생성.
//   GET   /bills                         — 월별/상태별 고지서 목록.
//   GET   /bills/:id                     — 단건(라인+수납이력+연체단계 포함).
//   POST  /bills/:id/payments            — 수납 기록(전액/부분/가수금).
//   POST  /bills/:id/payments/:pid/reverse — 수납 취소(역분개).
//   POST  /bills/:id/void                — 고지서 무효 처리.
//   POST  /bank-tx/import                — 통장 내역 업로드(JSON 배열).
//   GET   /bank-tx                       — 매칭 큐(미매칭/가수금) 조회.
//   POST  /bank-tx/:id/match             — 통장 내역 ↔ 고지서 수동 매칭.
//   POST  /bank-tx/:id/suspense          — 가수금 처리.
//   POST  /bank-tx/auto-match            — 가상계좌/금액·날짜 룰 기반 자동 매칭.
//   GET   /bills/arrears                 — 호실별 미수금 + 30/60/90+ 에이징.
//   POST  /bills/:id/delinquency-stage   — 1차/2차/소장면담 단계 설정 + 발송.
//   GET   /public/bills/:token           — 비인증: 입주민 납부 링크 진입.
//
// T6 훅: 본 라우터에서 'payment.received' / 'payment.partial' 이벤트를 발행한다.
//   현재 회계엔진(T6)은 미완성이라 listener 미등록이지만 인터페이스만 확정.
// T9 훅: bill.status='closed' 인 호실은 결제 입력을 차단해 마감 잠금을 보장한다.
// T10 훅: delinquency.dispatch.send 는 외부 발송엔진(SMS/카카오) 호출 자리 — 현재는 로그만.

import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, gte, lte, asc, isNull, isNotNull, sql, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import crypto from "node:crypto";
import {
  db,
  billsTable,
  billItemsTable,
  billPaymentsTable,
  bankTransactionsTable,
  delinquencyStagesTable,
  billingRunsTable,
  billingLinesTable,
  unitsTable,
  tenantsTable,
} from "@workspace/db";
import { audit, requireAction } from "../middlewares/audit";
import { requireRole } from "../middlewares/auth";
import { getUserBuildingId } from "../middlewares/buildingScope";
import { logger } from "../lib/logger";

// ── Payment 이벤트 (T6 회계엔진 훅) ─────────────────────────
export interface PaymentEvent {
  event: "payment.received" | "payment.partial" | "payment.reversed";
  version: 1;
  paymentId: number;
  billId: number | null;
  buildingId: number;
  unitId: number | null;
  amount: number;
  channel: string;
  paidAt: string;
  remainingAmount: number; // 부분이면 잔액
}
export const PAYMENT_EVENT_LISTENERS: Array<(e: PaymentEvent) => void | Promise<void>> = [];
function emitPaymentEvent(e: PaymentEvent): void {
  logger.info(e, `[T8→T6] ${e.event}`);
  for (const fn of PAYMENT_EVENT_LISTENERS) {
    try { void Promise.resolve(fn(e)).catch(err => logger.error({ err }, "payment listener failed")); }
    catch (err) { logger.error({ err }, "payment listener threw"); }
  }
}

// ── 토큰 / 가상계좌 헬퍼 ─────────────────────────────────────
function newPublicToken(): string {
  return crypto.randomBytes(20).toString("base64url");
}
// 가상계좌 발급 placeholder — 실 PG 연동 전까지 결정적 더미 발급.
//   bank: 농협, account: 301-{building3}{unit4}{ym4} 형식.
function issueVirtualAccount(buildingId: number, unitId: number, billingMonth: string, holderName: string) {
  const ym = billingMonth.replace("-", "");
  const account = `301-${String(buildingId).padStart(3, "0")}${String(unitId).padStart(4, "0")}-${ym}`;
  return { bank: "농협", account, holder: holderName };
}

// ── 1. 고지서 생성 ───────────────────────────────────────────
const GenerateBody = z.object({
  runId: z.number().int().positive(),
  dueDay: z.number().int().min(1).max(31).default(25),
});

const router: IRouter = Router();

// [회계 데이터 가시성 가드] facility_staff/custodian 등 buildingRouter 통과 역할이라도
//   bills/payments/통장내역/연체 데이터에는 접근하지 못하도록 라우터 레벨에서 차단.
router.use(["/bills", "/bank-tx"], requireRole("manager", "accountant", "platform_admin"));

router.post(
  "/bills/generate",
  requireAction("bill.generate"),
  audit("bill.generate", { targetType: "billing_run", resolveTargetId: (req) => Number((req.body as { runId?: number })?.runId ?? null) }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const parsed = GenerateBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    const { runId, dueDay } = parsed.data;

    const [run] = await db.select().from(billingRunsTable)
      .where(and(eq(billingRunsTable.id, runId), eq(billingRunsTable.buildingId, buildingId)));
    if (!run) { res.status(404).json({ error: "부과 실행을 찾을 수 없습니다" }); return; }
    if (run.status !== "finalized") {
      res.status(409).json({ error: "확정된 부과만 고지서로 발행할 수 있습니다" });
      return;
    }
    // [Task #780] T9 마감잠금 가드.
    {
      const { isMonthLocked } = await import("../lib/closingEngine");
      if (await isMonthLocked(buildingId, run.billingMonth)) {
        res.status(409).json({ error: "closing_locked", message: `${run.billingMonth} 월이 마감되어 고지서를 발행할 수 없습니다.` });
        return;
      }
    }

    const lines = await db.select().from(billingLinesTable).where(eq(billingLinesTable.runId, runId));
    if (lines.length === 0) { res.status(400).json({ error: "부과 라인이 없습니다" }); return; }

    // 호실 ID 수집 → 입주자 이름 조회(예금주 표기용).
    const unitIds = Array.from(new Set(lines.map(l => l.unitId)));
    const tenants = unitIds.length
      ? await db.select().from(tenantsTable).where(inArray(tenantsTable.unitId, unitIds))
      : [];
    const tenantByUnit = new Map<number, string>();
    for (const t of tenants) {
      if (t.unitId && !tenantByUnit.has(t.unitId)) tenantByUnit.set(t.unitId, t.tenantName);
    }

    // 납기일: 다음 달 dueDay.
    const [yy, mm] = run.billingMonth.split("-").map(Number);
    const dueMonth = mm === 12 ? `${yy + 1}-01` : `${yy}-${String(mm + 1).padStart(2, "0")}`;
    const dueDate = `${dueMonth}-${String(dueDay).padStart(2, "0")}`;

    let createdCount = 0;
    let skippedCount = 0;
    const billIds: number[] = [];

    for (const line of lines) {
      // 멱등: 이미 발행된 호실은 skip.
      const [existing] = await db.select().from(billsTable)
        .where(and(eq(billsTable.unitId, line.unitId), eq(billsTable.billingMonth, run.billingMonth)));
      if (existing) {
        skippedCount++;
        billIds.push(existing.id);
        continue;
      }

      const holder = tenantByUnit.get(line.unitId) ?? `${line.unitNumber}호`;
      const [bill] = await db.insert(billsTable).values({
        buildingId,
        unitId: line.unitId,
        unitNumber: line.unitNumber,
        billingMonth: run.billingMonth,
        runId,
        totalAmount: line.totalAmount,
        paidAmount: 0,
        dueDate,
        status: "issued",
        publicToken: newPublicToken(),
        virtualAccount: issueVirtualAccount(buildingId, line.unitId, run.billingMonth, holder),
      }).returning();

      // 항목 라인 — common/repair/installment + meterCharges/otherCharges 분해.
      const items: Array<typeof billItemsTable.$inferInsert> = [];
      if (line.commonCharge > 0) items.push({ billId: bill.id, category: "common", label: "공용관리비", amount: line.commonCharge, meta: {} });
      if (line.repairReserve > 0) items.push({ billId: bill.id, category: "repair", label: "수선적립금", amount: line.repairReserve, meta: {} });
      if (line.installmentCharge > 0) items.push({ billId: bill.id, category: "installment", label: "분할부과", amount: line.installmentCharge, meta: {} });
      const meterCharges = (line.meterCharges ?? {}) as Record<string, { usage: number; rate: number; amount: number }>;
      for (const [mt, mc] of Object.entries(meterCharges)) {
        if (mc?.amount) items.push({ billId: bill.id, category: "meter", label: mt, amount: mc.amount, meta: { usage: mc.usage, rate: mc.rate } });
      }
      const otherCharges = (line.otherCharges ?? {}) as Record<string, number>;
      for (const [k, amt] of Object.entries(otherCharges)) {
        if (amt) items.push({ billId: bill.id, category: "other", label: k, amount: amt, meta: {} });
      }
      if (items.length) await db.insert(billItemsTable).values(items);

      // 연체단계 행 — 초기 stage=0.
      await db.insert(delinquencyStagesTable).values({
        buildingId, billId: bill.id, unitId: line.unitId, unitNumber: line.unitNumber,
        stage: 0, overdueDays: 0, overdueAmount: 0, lateFeeAmount: 0,
      }).onConflictDoNothing();

      createdCount++;
      billIds.push(bill.id);
    }

    res.json({
      runId,
      billingMonth: run.billingMonth,
      dueDate,
      created: createdCount,
      skipped: skippedCount,
      billIds,
    });
  },
);

// ── 2. 고지서 목록 / 단건 ─────────────────────────────────────
router.get("/bills", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.json([]); return; }
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const conds = [eq(billsTable.buildingId, buildingId)];
  if (month) conds.push(eq(billsTable.billingMonth, month));
  if (status) conds.push(eq(billsTable.status, status as "issued"));
  const rows = await db.select().from(billsTable)
    .where(and(...conds))
    .orderBy(desc(billsTable.billingMonth), asc(billsTable.unitNumber));
  res.json(rows);
});

// ── 7. 미수금/에이징 — 반드시 /bills/:id 보다 먼저 선언해야 함 ───
router.get("/bills/arrears", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.json({ rows: [], aging: { d0_30: 0, d31_60: 0, d61_90: 0, d91_plus: 0 }, total: 0 }); return; }
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.select().from(billsTable)
    .where(and(
      eq(billsTable.buildingId, buildingId),
      inArray(billsTable.status, ["issued", "partial", "overdue"]),
      sql`${billsTable.totalAmount} > ${billsTable.paidAmount}`,
    ))
    .orderBy(asc(billsTable.dueDate));

  let d0_30 = 0, d31_60 = 0, d61_90 = 0, d91_plus = 0;
  const out = rows.map(b => {
    const remaining = Math.max(0, b.totalAmount - b.paidAmount);
    const overdueDays = b.dueDate < today
      ? Math.floor((Date.parse(today) - Date.parse(b.dueDate)) / 86400000)
      : 0;
    if (overdueDays === 0) d0_30 += remaining;
    else if (overdueDays <= 30) d0_30 += remaining;
    else if (overdueDays <= 60) d31_60 += remaining;
    else if (overdueDays <= 90) d61_90 += remaining;
    else d91_plus += remaining;
    return { ...b, remaining, overdueDays };
  });

  res.json({
    rows: out,
    aging: { d0_30, d31_60, d61_90, d91_plus },
    total: d0_30 + d31_60 + d61_90 + d91_plus,
  });
});

router.get("/bills/:id", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const id = Number(req.params.id);
  const [bill] = await db.select().from(billsTable)
    .where(and(eq(billsTable.id, id), eq(billsTable.buildingId, buildingId)));
  if (!bill) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  const items = await db.select().from(billItemsTable).where(eq(billItemsTable.billId, id)).orderBy(asc(billItemsTable.id));
  const payments = await db.select().from(billPaymentsTable).where(eq(billPaymentsTable.billId, id)).orderBy(desc(billPaymentsTable.paidAt));
  const [delinquency] = await db.select().from(delinquencyStagesTable).where(eq(delinquencyStagesTable.billId, id));
  res.json({ bill, items, payments, delinquency: delinquency ?? null });
});

// ── 3. 수납 기록(부분/전액) ─────────────────────────────────
const RecordPaymentBody = z.object({
  amount: z.number().positive(),
  channel: z.enum(["virtual_account", "transfer", "card", "cash"]).default("transfer"),
  paidAt: z.string().datetime().optional(),
  memo: z.string().max(500).optional(),
  bankTxId: z.number().int().positive().optional(),
});

async function recalcBillStatus(billId: number): Promise<{ status: string; paidAmount: number; remaining: number }> {
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.id, billId));
  if (!bill) return { status: "void", paidAmount: 0, remaining: 0 };
  const sums = await db.select({
    paid: sql<number>`COALESCE(SUM(${billPaymentsTable.amount}), 0)`,
  }).from(billPaymentsTable)
    .where(and(eq(billPaymentsTable.billId, billId), isNull(billPaymentsTable.reversedAt)));
  const paid = Number(sums[0]?.paid ?? 0);
  let status: typeof bill.status = bill.status;
  if (paid <= 0) {
    const today = new Date().toISOString().slice(0, 10);
    status = today > bill.dueDate ? "overdue" : "issued";
  } else if (paid < bill.totalAmount) {
    status = "partial";
  } else {
    status = "paid";
  }
  const update: Partial<typeof billsTable.$inferInsert> = { paidAmount: paid, status };
  if (status === "paid") update.paidAt = new Date();
  await db.update(billsTable).set(update).where(eq(billsTable.id, billId));
  return { status, paidAmount: paid, remaining: Math.max(0, bill.totalAmount - paid) };
}

router.post(
  "/bills/:id/payments",
  requireAction("bill.payment.record"),
  audit("bill.payment.record", { targetType: "bill", targetIdParam: "id" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const id = Number(req.params.id);
    const parsed = RecordPaymentBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    const { amount, channel, paidAt, memo, bankTxId } = parsed.data;

    const [bill] = await db.select().from(billsTable)
      .where(and(eq(billsTable.id, id), eq(billsTable.buildingId, buildingId)));
    if (!bill) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
    // [T9 hook] 마감된 월 — closed status 면 입력 차단.
    if (bill.status === "closed") {
      res.status(409).json({ error: "마감된 고지서는 수납 기록을 변경할 수 없습니다" });
      return;
    }
    // [Task #780] T9 마감잠금 가드 — 해당 월이 마감되었으면 차단.
    {
      const { isMonthLocked } = await import("../lib/closingEngine");
      if (await isMonthLocked(buildingId, bill.billingMonth)) {
        res.status(409).json({ error: "closing_locked", message: `${bill.billingMonth} 월이 마감되어 수납을 기록할 수 없습니다.` });
        return;
      }
    }
    if (bill.status === "void") {
      res.status(409).json({ error: "무효 처리된 고지서입니다" });
      return;
    }

    const remainingBefore = Math.max(0, bill.totalAmount - bill.paidAmount);
    const isPartial = amount < remainingBefore;

    const [payment] = await db.insert(billPaymentsTable).values({
      buildingId,
      billId: id,
      unitId: bill.unitId,
      amount,
      channel,
      paidAt: paidAt ? new Date(paidAt) : new Date(),
      bankTxId: bankTxId ?? null,
      isPartial,
      memo: memo ?? null,
      recordedById: req.user?.userId ?? null,
    }).returning();

    if (bankTxId) {
      await db.update(bankTransactionsTable).set({
        matchStatus: "manual", matchedBillId: id, matchedPaymentId: payment.id,
      }).where(and(eq(bankTransactionsTable.id, bankTxId), eq(bankTransactionsTable.buildingId, buildingId)));
    }

    const recalc = await recalcBillStatus(id);

    emitPaymentEvent({
      event: recalc.remaining === 0 ? "payment.received" : "payment.partial",
      version: 1,
      paymentId: payment.id,
      billId: id,
      buildingId,
      unitId: bill.unitId,
      amount,
      channel,
      paidAt: payment.paidAt.toISOString(),
      remainingAmount: recalc.remaining,
    });

    res.json({ payment, bill: recalc });
  },
);

// ── 4. 수납 취소 ────────────────────────────────────────────
router.post(
  "/bills/:id/payments/:pid/reverse",
  requireAction("bill.payment.reverse"),
  audit("bill.payment.reverse", { targetType: "bill_payment", targetIdParam: "pid" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const billId = Number(req.params.id);
    const pid = Number(req.params.pid);
    const reason = typeof (req.body as { reason?: string })?.reason === "string"
      ? (req.body as { reason: string }).reason : "수납 취소";

    const [pay] = await db.select().from(billPaymentsTable)
      .where(and(eq(billPaymentsTable.id, pid), eq(billPaymentsTable.buildingId, buildingId)));
    if (!pay || pay.billId !== billId) { res.status(404).json({ error: "수납 기록을 찾을 수 없습니다" }); return; }
    if (pay.reversedAt) { res.status(409).json({ error: "이미 취소된 수납입니다" }); return; }
    // [Task #780] T9 마감잠금 가드 — 잠긴 월의 수납 취소 차단.
    {
      const [billRow] = await db.select({ billingMonth: billsTable.billingMonth }).from(billsTable).where(eq(billsTable.id, billId));
      if (billRow) {
        const { isMonthLocked } = await import("../lib/closingEngine");
        if (await isMonthLocked(buildingId, billRow.billingMonth)) {
          res.status(409).json({ error: "closing_locked", message: `${billRow.billingMonth} 월이 마감되어 수납을 취소할 수 없습니다.` });
          return;
        }
      }
    }

    await db.update(billPaymentsTable).set({
      reversedAt: new Date(), reversalReason: reason,
    }).where(eq(billPaymentsTable.id, pid));

    const recalc = await recalcBillStatus(billId);
    emitPaymentEvent({
      event: "payment.reversed",
      version: 1,
      paymentId: pid,
      billId,
      buildingId,
      unitId: pay.unitId,
      amount: -pay.amount,
      channel: pay.channel,
      paidAt: new Date().toISOString(),
      remainingAmount: recalc.remaining,
    });
    res.json({ ok: true, bill: recalc });
  },
);

// ── 5. 고지서 무효 ──────────────────────────────────────────
router.post(
  "/bills/:id/void",
  requireAction("bill.void"),
  audit("bill.void", { targetType: "bill", targetIdParam: "id" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const id = Number(req.params.id);
    const [bill] = await db.select().from(billsTable)
      .where(and(eq(billsTable.id, id), eq(billsTable.buildingId, buildingId)));
    if (!bill) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
    if (bill.paidAmount > 0) { res.status(409).json({ error: "수납 이력이 있는 고지서는 무효 처리할 수 없습니다" }); return; }
    // [Task #780] T9 마감잠금 가드.
    {
      const { isMonthLocked } = await import("../lib/closingEngine");
      if (await isMonthLocked(buildingId, bill.billingMonth)) {
        res.status(409).json({ error: "closing_locked", message: `${bill.billingMonth} 월이 마감되어 무효 처리할 수 없습니다.` });
        return;
      }
    }
    const [updated] = await db.update(billsTable).set({ status: "void", closedAt: new Date() })
      .where(eq(billsTable.id, id)).returning();
    res.json(updated);
  },
);

// ── 6. 통장 내역 업로드 / 매칭 ───────────────────────────────
const ImportBankTxBody = z.object({
  rows: z.array(z.object({
    txDate: z.string(), // YYYY-MM-DD
    amount: z.number(),
    counterpart: z.string().optional().nullable(),
    memo: z.string().optional().nullable(),
    virtualAccountKey: z.string().optional().nullable(),
    rawData: z.record(z.string(), z.unknown()).optional(),
  })).min(1).max(2000),
});

router.post(
  "/bank-tx/import",
  requireAction("bank_tx.import"),
  audit("bank_tx.import", { targetType: "bank_transaction" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const parsed = ImportBankTxBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    // [Task #780] T9 마감잠금 가드 — 거래일이 잠긴 월에 속하면 import 차단.
    {
      const { isMonthLocked } = await import("../lib/closingEngine");
      const months = Array.from(new Set(parsed.data.rows.map(r => String(r.txDate).slice(0, 7))));
      for (const m of months) {
        if (await isMonthLocked(buildingId, m)) {
          res.status(409).json({ error: "closing_locked", message: `${m} 월이 마감되어 통장거래를 import 할 수 없습니다.` });
          return;
        }
      }
    }
    const inserted = await db.insert(bankTransactionsTable).values(
      parsed.data.rows.map(r => ({
        buildingId,
        txDate: r.txDate,
        amount: r.amount,
        counterpart: r.counterpart ?? null,
        memo: r.memo ?? null,
        virtualAccountKey: r.virtualAccountKey ?? null,
        rawData: r.rawData ?? {},
        matchStatus: "unmatched" as const,
      })),
    ).returning();

    // [Task #817] 업로드 직후 자동매칭 → 잔여 행을 bank_reconciliations 로 자동 분류.
    //   업로드한 행 ID 만 대상으로 좁혀서 부수효과 범위를 제한한다.
    const insertedIds = inserted.map((t) => t.id);
    let autoMatched = 0;
    let recon = { scanned: 0, opened: 0, byCategory: { overpaid: 0, underpaid: 0, duplicate: 0, wrong_account: 0 } };
    try {
      const am = await runAutoMatch(buildingId, req.user?.userId ?? null, insertedIds);
      autoMatched = am.matched;
      const { autoOpenReconciliations } = await import("../lib/bankReconClassify");
      recon = await autoOpenReconciliations(buildingId, { txIds: insertedIds });
    } catch (err) {
      logger.error({ err, buildingId }, "post-import auto-match/reconcile failed");
    }
    res.json({ count: inserted.length, autoMatched, reconciliations: recon });
  },
);

router.get("/bank-tx", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.json([]); return; }
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const conds = [eq(bankTransactionsTable.buildingId, buildingId)];
  if (status) conds.push(eq(bankTransactionsTable.matchStatus, status as "unmatched"));
  const rows = await db.select().from(bankTransactionsTable)
    .where(and(...conds))
    .orderBy(desc(bankTransactionsTable.txDate), desc(bankTransactionsTable.id));
  res.json(rows);
});

// [Task #817] 자동매칭 코어 — /bank-tx/auto-match 와 /bank-tx/import 모두에서 호출.
//   txIds 가 주어지면 그 행만 대상으로 좁혀 매칭한다(부수효과 범위 제한).
async function runAutoMatch(
  buildingId: number,
  userId: number | null,
  txIds?: number[],
): Promise<{ scanned: number; matched: number }> {
  const { isMonthLocked } = await import("../lib/closingEngine");
  const conds = [
    eq(bankTransactionsTable.buildingId, buildingId),
    eq(bankTransactionsTable.matchStatus, "unmatched"),
  ];
  if (txIds && txIds.length > 0) conds.push(inArray(bankTransactionsTable.id, txIds));
  const txs = await db.select().from(bankTransactionsTable).where(and(...conds));
  let matched = 0;
  for (const tx of txs) {
    // 룰 1) 가상계좌 키 일치(고유) — 가장 강한 매칭.
    let candidate: typeof billsTable.$inferSelect | undefined;
    if (tx.virtualAccountKey) {
      const cand = await db.select().from(billsTable)
        .where(and(
          eq(billsTable.buildingId, buildingId),
          sql`${billsTable.virtualAccount}->>'account' = ${tx.virtualAccountKey}`,
        ));
      candidate = cand[0];
    }
    // 룰 2) 입금액 == 미수액 인 미수 고지서 단 1건.
    if (!candidate) {
      const cands = await db.select().from(billsTable)
        .where(and(
          eq(billsTable.buildingId, buildingId),
          inArray(billsTable.status, ["issued", "partial", "overdue"]),
          sql`(${billsTable.totalAmount} - ${billsTable.paidAmount}) = ${tx.amount}`,
        ));
      if (cands.length === 1) candidate = cands[0];
    }
    if (!candidate) continue;
    // [Task #780] 매칭 후보의 billingMonth 가 잠겨있으면 자동매칭 스킵 — 잠긴 월 데이터 변경 금지.
    if (await isMonthLocked(buildingId, candidate.billingMonth)) continue;
    // 가상계좌 매칭이라도 입금액과 미수액이 다르면 자동수납 보류 — 차액은 분류기로 넘긴다.
    const remaining = Math.max(0, candidate.totalAmount - candidate.paidAmount);
    if (tx.virtualAccountKey && tx.amount !== remaining) continue;

    const [pay] = await db.insert(billPaymentsTable).values({
      buildingId,
      billId: candidate.id,
      unitId: candidate.unitId,
      amount: tx.amount,
      channel: tx.virtualAccountKey ? "virtual_account" : "transfer",
      paidAt: new Date(`${tx.txDate}T00:00:00Z`),
      bankTxId: tx.id,
      isPartial: tx.amount < remaining,
      memo: tx.memo ?? tx.counterpart ?? null,
      recordedById: userId,
    }).returning();
    await db.update(bankTransactionsTable).set({
      matchStatus: "auto", matchedBillId: candidate.id, matchedPaymentId: pay.id,
    }).where(eq(bankTransactionsTable.id, tx.id));
    const recalc = await recalcBillStatus(candidate.id);
    emitPaymentEvent({
      event: recalc.remaining === 0 ? "payment.received" : "payment.partial",
      version: 1, paymentId: pay.id, billId: candidate.id, buildingId,
      unitId: candidate.unitId, amount: tx.amount,
      channel: tx.virtualAccountKey ? "virtual_account" : "transfer",
      paidAt: pay.paidAt.toISOString(), remainingAmount: recalc.remaining,
    });
    matched++;
  }
  return { scanned: txs.length, matched };
}

router.post(
  "/bank-tx/auto-match",
  requireAction("bank_tx.match"),
  audit("bank_tx.match", { targetType: "bank_transaction" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const { scanned, matched } = await runAutoMatch(buildingId, req.user?.userId ?? null);
    // [Task #817] 자동매칭 종료 후 잔여 unmatched 행을 bank_reconciliations(open) 로 분류.
    let recon = { scanned: 0, opened: 0, byCategory: { overpaid: 0, underpaid: 0, duplicate: 0, wrong_account: 0 } };
    try {
      const { autoOpenReconciliations } = await import("../lib/bankReconClassify");
      recon = await autoOpenReconciliations(buildingId);
    } catch (err) {
      logger.error({ err, buildingId }, "post-auto-match reconcile failed");
    }
    res.json({ scanned, matched, reconciliations: recon });
  },
);

const ManualMatchBody = z.object({
  billId: z.number().int().positive(),
});
router.post(
  "/bank-tx/:id/match",
  requireAction("bank_tx.match"),
  audit("bank_tx.match", { targetType: "bank_transaction", targetIdParam: "id" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const id = Number(req.params.id);
    const parsed = ManualMatchBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    const [tx] = await db.select().from(bankTransactionsTable)
      .where(and(eq(bankTransactionsTable.id, id), eq(bankTransactionsTable.buildingId, buildingId)));
    if (!tx) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
    if (tx.matchStatus !== "unmatched" && tx.matchStatus !== "suspense") {
      res.status(409).json({ error: "이미 매칭된 내역입니다" }); return;
    }
    const [bill] = await db.select().from(billsTable)
      .where(and(eq(billsTable.id, parsed.data.billId), eq(billsTable.buildingId, buildingId)));
    if (!bill) { res.status(404).json({ error: "고지서를 찾을 수 없습니다" }); return; }
    // [Task #780] T9 마감잠금 가드.
    {
      const { isMonthLocked } = await import("../lib/closingEngine");
      if (await isMonthLocked(buildingId, bill.billingMonth)) {
        res.status(409).json({ error: "closing_locked", message: `${bill.billingMonth} 월이 마감되어 수동매칭할 수 없습니다.` });
        return;
      }
    }

    const [pay] = await db.insert(billPaymentsTable).values({
      buildingId,
      billId: bill.id,
      unitId: bill.unitId,
      amount: tx.amount,
      channel: "transfer",
      paidAt: new Date(`${tx.txDate}T00:00:00Z`),
      bankTxId: tx.id,
      isPartial: tx.amount < (bill.totalAmount - bill.paidAmount),
      memo: tx.memo ?? tx.counterpart ?? null,
      recordedById: req.user?.userId ?? null,
    }).returning();
    await db.update(bankTransactionsTable).set({
      matchStatus: "manual", matchedBillId: bill.id, matchedPaymentId: pay.id,
    }).where(eq(bankTransactionsTable.id, id));
    const recalc = await recalcBillStatus(bill.id);
    emitPaymentEvent({
      event: recalc.remaining === 0 ? "payment.received" : "payment.partial",
      version: 1, paymentId: pay.id, billId: bill.id, buildingId,
      unitId: bill.unitId, amount: tx.amount, channel: "transfer",
      paidAt: pay.paidAt.toISOString(), remainingAmount: recalc.remaining,
    });
    res.json({ ok: true, payment: pay, bill: recalc });
  },
);

router.post(
  "/bank-tx/:id/suspense",
  requireAction("bank_tx.match"),
  audit("bank_tx.match", { targetType: "bank_transaction", targetIdParam: "id" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const id = Number(req.params.id);
    const [tx] = await db.select().from(bankTransactionsTable)
      .where(and(eq(bankTransactionsTable.id, id), eq(bankTransactionsTable.buildingId, buildingId)));
    if (!tx) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
    // [Task #780] 가수금 처리는 bill_payments 행을 새로 만들고 bank_transactions
    //   상태를 바꾸는 변경계 — tx.txDate 의 월이 마감되었으면 차단.
    {
      const txMonth = (tx.txDate ?? "").slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(txMonth)) {
        const { isMonthLocked } = await import("../lib/closingEngine");
        if (await isMonthLocked(buildingId, txMonth)) {
          res.status(409).json({ error: "closing_locked", message: `${txMonth} 월이 마감되어 가수금 처리할 수 없습니다` });
          return;
        }
      }
    }
    // 이미 매칭된 내역(auto/manual/suspense/ignored)은 가수금 처리 차단 — 중복 결제행 방지.
    if (tx.matchStatus !== "unmatched") {
      res.status(409).json({ error: `이미 ${tx.matchStatus} 상태인 내역은 가수금 처리할 수 없습니다` });
      return;
    }
    // 가수금: bill_payments 에 bill_id NULL 로 기록.
    const [pay] = await db.insert(billPaymentsTable).values({
      buildingId,
      billId: null,
      unitId: null,
      amount: tx.amount,
      channel: "suspense",
      paidAt: new Date(`${tx.txDate}T00:00:00Z`),
      bankTxId: tx.id,
      isPartial: false,
      memo: tx.memo ?? tx.counterpart ?? null,
      recordedById: req.user?.userId ?? null,
    }).returning();
    await db.update(bankTransactionsTable).set({
      matchStatus: "suspense", matchedPaymentId: pay.id,
    }).where(eq(bankTransactionsTable.id, id));
    res.json({ ok: true, suspensePaymentId: pay.id });
  },
);

// ── 7. 미수금 / 에이징 ───────────────────────────────────────
// (arrears 핸들러는 /bills/:id 보다 먼저 등록되어야 라우터에 가려지지 않음 — 위쪽으로 이동)

// ── 8. 연체 단계 설정 + 발송 ─────────────────────────────────
const SetStageBody = z.object({
  stage: z.number().int().min(0).max(3),
  dispatch: z.boolean().default(false),
  channel: z.enum(["sms", "kakao", "email"]).default("sms"),
});
router.post(
  "/bills/:id/delinquency-stage",
  requireAction("delinquency.stage.set"),
  audit("delinquency.stage.set", { targetType: "delinquency_stage", targetIdParam: "id" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const id = Number(req.params.id);
    const parsed = SetStageBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    const { stage, dispatch, channel } = parsed.data;

    const [bill] = await db.select().from(billsTable)
      .where(and(eq(billsTable.id, id), eq(billsTable.buildingId, buildingId)));
    if (!bill) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
    // [Task #780] T9·T10 인터록 — 외부 발송(dispatch=true) 은 해당 부과월이
    //   마감(locked) 된 후에만 허용. 마감 전 발송은 데이터 변경과 동시에 외부에
    //   고지하는 위험이 있어 차단.
    if (dispatch) {
      const { isMonthLocked } = await import("../lib/closingEngine");
      const locked = await isMonthLocked(buildingId, bill.billingMonth);
      if (!locked) {
        res.status(409).json({
          error: "closing_required",
          message: `${bill.billingMonth} 월이 마감되지 않아 독촉 발송할 수 없습니다(T9 마감 후 dispatch 가능).`,
        });
        return;
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const overdueDays = bill.dueDate < today
      ? Math.floor((Date.parse(today) - Date.parse(bill.dueDate)) / 86400000)
      : 0;
    const overdueAmount = Math.max(0, bill.totalAmount - bill.paidAmount);
    // 기본 연체이자: 월 1.5% × (overdueDays/30).
    const lateFee = Math.round(overdueAmount * 0.015 * (overdueDays / 30));

    // [Task #781] T10 — dispatch=true 시 외부 발송 엔진(enqueueDispatch) 으로 큐잉.
    //   채널 매핑: kakao→popbill_kakao, sms→popbill_sms. 호실 연락처 미존재 시 skip.
    let dispatchInfo: { ok: boolean; jobId?: number; reason?: string } | null = null;
    if (dispatch) {
      try {
        const { enqueueDispatch } = await import("../lib/external/adapter");
        const { popbillSettingsTable, tenantsTable, ownersTable } = await import("@workspace/db");
        const [settings] = await db.select().from(popbillSettingsTable).where(eq(popbillSettingsTable.buildingId, buildingId));
        const tns = await db.select().from(tenantsTable).where(eq(tenantsTable.unitId, bill.unitId));
        const activeTn = tns.find((x) => x.status === "active");
        const ows = await db.select().from(ownersTable).where(eq(ownersTable.unitId, bill.unitId));
        const phone = (activeTn?.phone || ows[0]?.phone || "").replace(/[^\d]/g, "");
        if (!/^\d{9,12}$/.test(phone)) {
          dispatchInfo = { ok: false, reason: "no_phone" };
        } else {
          const ch = channel === "kakao" ? "popbill_kakao" : "popbill_sms";
          const stageLabel = stage === 1 ? "1차" : stage === 2 ? "2차" : stage >= 3 ? "소장면담" : "해제";
          const message = `[관리비 연체 ${stageLabel}] ${bill.billingMonth} ${bill.unitNumber}호 미납 ${overdueAmount.toLocaleString()}원(연체 ${overdueDays}일, 가산금 ${lateFee.toLocaleString()}원). 빠른 납부 부탁드립니다.`;
          const tplKey = stage >= 3 ? "delinquent_final" : "delinquent_reminder";
          const job = await enqueueDispatch({
            buildingId,
            channel: ch,
            target: phone,
            payload: {
              templateCode: settings?.kakaoTemplates?.[tplKey] ?? "",
              senderNumber: settings?.senderNumber ?? "",
              senderProfileId: settings?.senderProfileId ?? "",
              message,
              altMessage: message,
              receiverName: activeTn?.tenantName ?? ows[0]?.ownerName ?? "",
            },
            relatedMonth: bill.billingMonth,
            relatedEntityType: "bill",
            relatedEntityId: bill.id,
            triggerSource: "delinquency.stage.set",
            createdBy: req.user?.userId ?? null,
          });
          dispatchInfo = { ok: true, jobId: job.id };
        }
      } catch (e) {
        dispatchInfo = { ok: false, reason: (e as Error)?.message ?? "enqueue_failed" };
      }
    }

    const [existing] = await db.select().from(delinquencyStagesTable).where(eq(delinquencyStagesTable.billId, id));
    let saved: typeof delinquencyStagesTable.$inferSelect;
    if (existing) {
      const log = existing.dispatchLog ?? [];
      if (dispatch) {
        log.push({ at: new Date().toISOString(), stage, channel, ok: dispatchInfo?.ok ?? false, jobId: dispatchInfo?.jobId, reason: dispatchInfo?.reason });
      }
      const [u] = await db.update(delinquencyStagesTable).set({
        stage, overdueDays, overdueAmount, lateFeeAmount: lateFee,
        dispatchLog: log,
        lastDispatchAt: dispatch && dispatchInfo?.ok ? new Date() : existing.lastDispatchAt,
        resolvedAt: stage === 0 ? new Date() : null,
      }).where(eq(delinquencyStagesTable.id, existing.id)).returning();
      saved = u;
    } else {
      const log = dispatch ? [{ at: new Date().toISOString(), stage, channel, ok: dispatchInfo?.ok ?? false, jobId: dispatchInfo?.jobId, reason: dispatchInfo?.reason }] : [];
      const [c] = await db.insert(delinquencyStagesTable).values({
        buildingId, billId: id, unitId: bill.unitId, unitNumber: bill.unitNumber,
        stage, overdueDays, overdueAmount, lateFeeAmount: lateFee,
        dispatchLog: log, lastDispatchAt: dispatch && dispatchInfo?.ok ? new Date() : null,
      }).returning();
      saved = c;
    }
    res.json({ ...saved, dispatch: dispatchInfo });
  },
);

// ── 9. 비인증 입주민 납부 링크 ───────────────────────────────
// 이 한 라우트는 authMiddleware 위에 마운트해야 한다 (별도 마운트).
export const publicBillsRouter: IRouter = Router();
publicBillsRouter.get("/public/bills/:token", async (req: Request, res: Response): Promise<void> => {
  const token = String(req.params.token);
  const [bill] = await db.select().from(billsTable).where(eq(billsTable.publicToken, token));
  if (!bill) { res.status(404).json({ error: "유효하지 않은 링크입니다" }); return; }
  if (bill.status === "void") { res.status(410).json({ error: "무효 처리된 고지서입니다" }); return; }
  const items = await db.select().from(billItemsTable).where(eq(billItemsTable.billId, bill.id));
  res.json({
    unitNumber: bill.unitNumber,
    billingMonth: bill.billingMonth,
    totalAmount: bill.totalAmount,
    paidAmount: bill.paidAmount,
    remaining: Math.max(0, bill.totalAmount - bill.paidAmount),
    dueDate: bill.dueDate,
    status: bill.status,
    virtualAccount: bill.virtualAccount,
    items,
  });
});

// ── 10. 영수증(텍스트 형식) — PDF 변환은 클라이언트 print 사용 ─
router.get("/bills/:id/receipt", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const id = Number(req.params.id);
  const [bill] = await db.select().from(billsTable)
    .where(and(eq(billsTable.id, id), eq(billsTable.buildingId, buildingId)));
  if (!bill) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  const items = await db.select().from(billItemsTable).where(eq(billItemsTable.billId, id));
  const payments = await db.select().from(billPaymentsTable).where(eq(billPaymentsTable.billId, id));
  res.json({
    receipt: {
      title: `${bill.billingMonth} ${bill.unitNumber}호 관리비 영수증`,
      issuedAt: new Date().toISOString(),
      bill, items,
      payments: payments.filter(p => !p.reversedAt),
      total: bill.totalAmount,
      paid: bill.paidAmount,
      remaining: Math.max(0, bill.totalAmount - bill.paidAmount),
    },
  });
});

// ── 11. T7 → T8 자동 발행 리스너 등록 ────────────────────────
import { BILLING_FINALIZED_LISTENERS } from "./billing";
BILLING_FINALIZED_LISTENERS.push(async (e) => {
  // 자동 발행은 끄고, 매뉴얼(POST /bills/generate) 만 사용.
  // 이벤트는 감사 로그/외부 알림 후크용으로 보존.
  logger.info({ runId: e.runId }, "[T7→T8] billing.finalized observed (manual generate only)");
});

export default router;
