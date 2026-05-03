// [Task #800] 수납·미납 관리 풀세트 — REST 라우트.
//
//   GET   /receivables/overdue                — 미납대장 (오늘자 또는 ?asOf=YYYY-MM-DD).
//   POST  /receivables/overdue/snapshot       — 스냅샷 캡처 (호실별 1행 upsert).
//   GET   /receivables/overdue/notices        — 미납분 고지서 출력 큐(미납인 bill 목록).
//   POST  /receivables/overdue/notices/print  — 출력 의뢰(상태 표시용 — 실 PDF 생성은 클라이언트).
//   GET   /receivables/dunning                — 독촉장 대장.
//   POST  /receivables/dunning/batch          — 차수별 일괄 생성(대상 호실 자동 추출).
//   POST  /receivables/dunning/:id/send       — 발송(상태 sent + dispatch_jobs 큐 자리).
//   POST  /receivables/dunning/:id/cancel     — 취소.
//   GET   /receivables/payments               — 수납 처리 화면(미납 호실 + 최근 수납).
//   POST  /receivables/receipts               — 영수증 발행(payment_id 기반).
//   GET   /receivables/reconciliation         — 통장 비교(이의/차이) 대장.
//   POST  /receivables/reconciliation         — 이의/차이 1건 등록.
//   PATCH /receivables/reconciliation/:id     — 처리 상태 업데이트.
//   GET   /receivables/auto-debit-results     — 자동이체 결과 대장.
//   POST  /receivables/auto-debit-results     — 결과 1건 추가(외부 PG 응답 적재 자리).
//   POST  /receivables/auto-debit-results/:id/retry — 실패 건 재시도 행 생성.

import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, asc, inArray, sql, gte, isNull } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  billsTable,
  billPaymentsTable,
  bankTransactionsTable,
  unitsTable,
  tenantsTable,
  receivableOverdueSnapshotsTable,
  dunningLettersTable,
  paymentReceiptsTable,
  bankReconciliationsTable,
  autoDebitResultsTable,
} from "@workspace/db";
import { audit, requireAction } from "../middlewares/audit";
import { requireRole } from "../middlewares/auth";
import { getUserBuildingId } from "../middlewares/buildingScope";

const router: IRouter = Router();

// 회계 가시성 가드 — facility/custodian 차단.
router.use("/receivables", requireRole("manager", "accountant", "platform_admin"));

const KRW = (n: number) => Math.round(Number(n || 0));

function bucket(days: number): "d0_30" | "d31_60" | "d61_90" | "d91_plus" {
  if (days <= 30) return "d0_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d91_plus";
}

// ── 1. 미납대장 ─────────────────────────────────────────────
router.get("/receivables/overdue", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.json({ rows: [], aging: { d0_30: 0, d31_60: 0, d61_90: 0, d91_plus: 0 }, total: 0, asOf: null }); return; }
  const asOf = typeof req.query.asOf === "string" ? req.query.asOf : new Date().toISOString().slice(0, 10);

  const rows = await db.select().from(billsTable)
    .where(and(
      eq(billsTable.buildingId, buildingId),
      inArray(billsTable.status, ["issued", "partial", "overdue"]),
      sql`${billsTable.totalAmount} > ${billsTable.paidAmount}`,
    ))
    .orderBy(asc(billsTable.dueDate));

  const aging = { d0_30: 0, d31_60: 0, d61_90: 0, d91_plus: 0 };
  const out = rows.map(b => {
    const remaining = Math.max(0, b.totalAmount - b.paidAmount);
    const overdueDays = b.dueDate < asOf
      ? Math.floor((Date.parse(asOf) - Date.parse(b.dueDate)) / 86400000) : 0;
    const ab = bucket(overdueDays);
    aging[ab] += remaining;
    return { ...b, remaining, overdueDays, agingBucket: ab };
  });

  res.json({ rows: out, aging, total: aging.d0_30 + aging.d31_60 + aging.d61_90 + aging.d91_plus, asOf });
});

router.post(
  "/receivables/overdue/snapshot",
  requireAction("receivable.snapshot"),
  audit("receivable.snapshot", { targetType: "receivable_overdue_snapshot" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const asOf = typeof (req.body as { asOf?: string })?.asOf === "string"
      ? (req.body as { asOf: string }).asOf : new Date().toISOString().slice(0, 10);

    const bills = await db.select().from(billsTable).where(and(
      eq(billsTable.buildingId, buildingId),
      inArray(billsTable.status, ["issued", "partial", "overdue"]),
      sql`${billsTable.totalAmount} > ${billsTable.paidAmount}`,
    ));

    let inserted = 0;
    for (const b of bills) {
      const remaining = Math.max(0, b.totalAmount - b.paidAmount);
      const days = b.dueDate < asOf
        ? Math.floor((Date.parse(asOf) - Date.parse(b.dueDate)) / 86400000) : 0;
      const lateFee = days > 0 ? Math.round(remaining * 0.015 * (days / 30)) : 0;
      try {
        await db.insert(receivableOverdueSnapshotsTable).values({
          buildingId,
          snapshotDate: asOf,
          billingMonth: b.billingMonth,
          unitId: b.unitId,
          unitNumber: b.unitNumber,
          billId: b.id,
          totalAmount: b.totalAmount,
          paidAmount: b.paidAmount,
          remainingAmount: remaining,
          overdueDays: days,
          agingBucket: bucket(days),
          lateFeeAmount: lateFee,
          aiSummary: days > 60 ? `${b.unitNumber}호 ${days}일 누적 ${KRW(remaining).toLocaleString()}원 — 소장면담 권장` : null,
          capturedById: req.user?.userId ?? null,
        }).onConflictDoNothing();
        inserted++;
      } catch { /* unique conflict ignored */ }
    }
    res.json({ asOf, captured: inserted, total: bills.length });
  },
);

// ── 2. 미납분 고지서 출력 ────────────────────────────────────
router.get("/receivables/overdue/notices", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.json([]); return; }
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db.select().from(billsTable)
    .where(and(
      eq(billsTable.buildingId, buildingId),
      inArray(billsTable.status, ["issued", "partial", "overdue"]),
      sql`${billsTable.totalAmount} > ${billsTable.paidAmount}`,
    ))
    .orderBy(asc(billsTable.dueDate));
  res.json(rows.map(b => ({
    ...b,
    remaining: Math.max(0, b.totalAmount - b.paidAmount),
    overdueDays: b.dueDate < today ? Math.floor((Date.parse(today) - Date.parse(b.dueDate)) / 86400000) : 0,
  })));
});

router.post(
  "/receivables/overdue/notices/print",
  requireAction("receivable.notice.print"),
  audit("receivable.notice.print", { targetType: "bill" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const ids = (req.body as { billIds?: number[] })?.billIds;
    if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "billIds 필요" }); return; }
    res.json({ printed: ids.length, billIds: ids, requestedAt: new Date().toISOString() });
  },
);

// ── 3. 독촉장 ───────────────────────────────────────────────
const DunningBatchBody = z.object({
  stage: z.number().int().min(1).max(3),
  channel: z.enum(["post", "sms", "kakao", "email"]).default("post"),
  minOverdueDays: z.number().int().min(0).default(30),
  bodyTemplate: z.string().min(10).optional(),
});
router.get("/receivables/dunning", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.json([]); return; }
  const stage = req.query.stage ? Number(req.query.stage) : null;
  const conds = [eq(dunningLettersTable.buildingId, buildingId)];
  if (stage) conds.push(eq(dunningLettersTable.stage, stage));
  const rows = await db.select().from(dunningLettersTable)
    .where(and(...conds))
    .orderBy(desc(dunningLettersTable.createdAt));
  res.json(rows);
});

router.post(
  "/receivables/dunning/batch",
  requireAction("receivable.dunning.batch"),
  audit("receivable.dunning.batch", { targetType: "dunning_letter" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const parsed = DunningBatchBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    const { stage, channel, minOverdueDays, bodyTemplate } = parsed.data;

    const today = new Date().toISOString().slice(0, 10);
    const bills = await db.select().from(billsTable).where(and(
      eq(billsTable.buildingId, buildingId),
      inArray(billsTable.status, ["issued", "partial", "overdue"]),
      sql`${billsTable.totalAmount} > ${billsTable.paidAmount}`,
    ));
    const eligible = bills.filter(b => {
      const days = b.dueDate < today ? Math.floor((Date.parse(today) - Date.parse(b.dueDate)) / 86400000) : 0;
      return days >= minOverdueDays;
    });
    if (eligible.length === 0) { res.json({ batchId: null, created: 0 }); return; }

    const unitIds = Array.from(new Set(eligible.map(b => b.unitId)));
    const tenants = await db.select().from(tenantsTable).where(inArray(tenantsTable.unitId, unitIds));
    const tenantByUnit = new Map<number, { name: string; contact: string | null }>();
    for (const t of tenants) {
      if (t.unitId && !tenantByUnit.has(t.unitId)) tenantByUnit.set(t.unitId, { name: t.tenantName, contact: t.phone ?? null });
    }

    const stageLabel = stage === 1 ? "1차 안내" : stage === 2 ? "2차 독촉" : "최종 통보";
    const batchId = `dun-${Date.now()}-s${stage}`;
    const rows: Array<typeof dunningLettersTable.$inferInsert> = eligible.map(b => {
      const remaining = Math.max(0, b.totalAmount - b.paidAmount);
      const days = b.dueDate < today ? Math.floor((Date.parse(today) - Date.parse(b.dueDate)) / 86400000) : 0;
      const lateFee = days > 0 ? Math.round(remaining * 0.015 * (days / 30)) : 0;
      const tn = tenantByUnit.get(b.unitId);
      const body = (bodyTemplate ?? `[관리비 ${stageLabel}] {unit}호 — 미납액 {amount}원, 연체 {days}일.\n납기 후 미납 상태로, 신속한 납부를 요청드립니다.`)
        .replace("{unit}", b.unitNumber)
        .replace("{amount}", KRW(remaining + lateFee).toLocaleString())
        .replace("{days}", String(days));
      return {
        buildingId,
        unitId: b.unitId,
        unitNumber: b.unitNumber,
        billId: b.id,
        batchId,
        stage,
        overdueAmount: remaining,
        lateFeeAmount: lateFee,
        recipientName: tn?.name ?? null,
        recipientContact: tn?.contact ?? null,
        channel,
        bodyText: body,
        status: "draft" as const,
        createdById: req.user?.userId ?? null,
      };
    });
    const inserted = await db.insert(dunningLettersTable).values(rows).returning();
    res.json({ batchId, created: inserted.length, ids: inserted.map(r => r.id) });
  },
);

router.post(
  "/receivables/dunning/:id/send",
  requireAction("receivable.dunning.send"),
  audit("receivable.dunning.send", { targetType: "dunning_letter", targetIdParam: "id" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const id = Number(req.params.id);
    const [updated] = await db.update(dunningLettersTable)
      .set({ status: "sent", sentAt: new Date() })
      .where(and(eq(dunningLettersTable.id, id), eq(dunningLettersTable.buildingId, buildingId)))
      .returning();
    if (!updated) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
    res.json(updated);
  },
);

router.post(
  "/receivables/dunning/:id/cancel",
  requireAction("receivable.dunning.cancel"),
  audit("receivable.dunning.cancel", { targetType: "dunning_letter", targetIdParam: "id" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const id = Number(req.params.id);
    const [updated] = await db.update(dunningLettersTable)
      .set({ status: "cancelled" })
      .where(and(eq(dunningLettersTable.id, id), eq(dunningLettersTable.buildingId, buildingId)))
      .returning();
    if (!updated) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
    res.json(updated);
  },
);

// ── 4. 수납 처리 (요약 + 영수증) ────────────────────────────
router.get("/receivables/payments", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.json({ unpaid: [], recent: [] }); return; }
  const today = new Date().toISOString().slice(0, 10);
  const unpaid = await db.select().from(billsTable).where(and(
    eq(billsTable.buildingId, buildingId),
    inArray(billsTable.status, ["issued", "partial", "overdue"]),
    sql`${billsTable.totalAmount} > ${billsTable.paidAmount}`,
  )).orderBy(asc(billsTable.dueDate));
  const recent = await db.select().from(billPaymentsTable)
    .where(and(eq(billPaymentsTable.buildingId, buildingId), isNull(billPaymentsTable.reversedAt)))
    .orderBy(desc(billPaymentsTable.paidAt))
    .limit(50);
  res.json({
    unpaid: unpaid.map(b => ({
      ...b,
      remaining: Math.max(0, b.totalAmount - b.paidAmount),
      overdueDays: b.dueDate < today ? Math.floor((Date.parse(today) - Date.parse(b.dueDate)) / 86400000) : 0,
    })),
    recent,
  });
});

const ReceiptBody = z.object({
  paymentId: z.number().int().positive(),
  channel: z.enum(["print", "sms", "kakao", "email"]).default("print"),
  recipient: z.string().max(200).optional(),
});
router.post(
  "/receivables/receipts",
  requireAction("receivable.receipt.issue"),
  audit("receivable.receipt.issue", { targetType: "payment_receipt" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const parsed = ReceiptBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    const { paymentId, channel, recipient } = parsed.data;
    const [pay] = await db.select().from(billPaymentsTable)
      .where(and(eq(billPaymentsTable.id, paymentId), eq(billPaymentsTable.buildingId, buildingId)));
    if (!pay) { res.status(404).json({ error: "수납을 찾을 수 없습니다" }); return; }
    const receiptNo = `R${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${pay.id}`;
    const [row] = await db.insert(paymentReceiptsTable).values({
      buildingId,
      paymentId: pay.id,
      billId: pay.billId,
      unitId: pay.unitId,
      receiptNo,
      amount: pay.amount,
      channel,
      recipient: recipient ?? null,
      status: channel === "print" ? "issued" : "delivered",
      issuedById: req.user?.userId ?? null,
    }).returning();
    res.json(row);
  },
);

// ── 5. 통장 비교 (이의/차이) ─────────────────────────────────
const ReconBody = z.object({
  bankTxId: z.number().int().positive().optional(),
  billId: z.number().int().positive().optional(),
  unitId: z.number().int().positive().optional(),
  category: z.enum(["overpaid", "underpaid", "duplicate", "refund_due", "wrong_account", "dispute", "other"]),
  amount: z.number(),
  reason: z.string().max(500).optional(),
});
router.get("/receivables/reconciliation", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.json([]); return; }
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const conds = [eq(bankReconciliationsTable.buildingId, buildingId)];
  if (status) conds.push(eq(bankReconciliationsTable.status, status as "open"));
  const rows = await db.select().from(bankReconciliationsTable)
    .where(and(...conds))
    .orderBy(desc(bankReconciliationsTable.createdAt));
  res.json(rows);
});

router.post(
  "/receivables/reconciliation",
  requireAction("receivable.recon.open"),
  audit("receivable.recon.open", { targetType: "bank_reconciliation" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const parsed = ReconBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    const aiSuggestion = parsed.data.category === "overpaid"
      ? "초과 입금 — 차월 이월 또는 환불 처리 권장"
      : parsed.data.category === "duplicate"
      ? "중복 입금 — 1건은 환불 처리 필요"
      : parsed.data.category === "wrong_account"
      ? "타 호실 가상계좌 — 입금 호실 확인 후 재배분"
      : null;
    const [row] = await db.insert(bankReconciliationsTable).values({
      buildingId,
      bankTxId: parsed.data.bankTxId ?? null,
      billId: parsed.data.billId ?? null,
      unitId: parsed.data.unitId ?? null,
      category: parsed.data.category,
      amount: parsed.data.amount,
      reason: parsed.data.reason ?? null,
      aiSuggestion,
      openedById: req.user?.userId ?? null,
    }).returning();
    res.json(row);
  },
);

const ReconPatchBody = z.object({
  status: z.enum(["open", "investigating", "resolved", "wontfix"]),
  resolution: z.string().max(500).optional(),
});
router.patch(
  "/receivables/reconciliation/:id",
  requireAction("receivable.recon.update"),
  audit("receivable.recon.update", { targetType: "bank_reconciliation", targetIdParam: "id" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const id = Number(req.params.id);
    const parsed = ReconPatchBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    const update: Partial<typeof bankReconciliationsTable.$inferInsert> = {
      status: parsed.data.status,
      resolution: parsed.data.resolution ?? null,
    };
    if (parsed.data.status === "resolved") {
      update.resolvedAt = new Date();
      update.resolvedById = req.user?.userId ?? null;
    }
    const [row] = await db.update(bankReconciliationsTable)
      .set(update)
      .where(and(eq(bankReconciliationsTable.id, id), eq(bankReconciliationsTable.buildingId, buildingId)))
      .returning();
    if (!row) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
    res.json(row);
  },
);

// ── 6. 자동이체 결과 ─────────────────────────────────────────
router.get("/receivables/auto-debit-results", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.json([]); return; }
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  const conds = [eq(autoDebitResultsTable.buildingId, buildingId)];
  if (month) conds.push(eq(autoDebitResultsTable.billingMonth, month));
  const rows = await db.select().from(autoDebitResultsTable)
    .where(and(...conds))
    .orderBy(desc(autoDebitResultsTable.createdAt));
  res.json(rows);
});

const AutoDebitInsertBody = z.object({
  billingMonth: z.string().regex(/^\d{4}-\d{2}$/),
  unitId: z.number().int().positive(),
  unitNumber: z.string(),
  billId: z.number().int().positive().optional(),
  bankCode: z.string().optional(),
  accountMasked: z.string().optional(),
  amount: z.number(),
  status: z.enum(["queued", "requested", "success", "failed", "cancelled"]).default("queued"),
  resultCode: z.string().optional(),
  resultMessage: z.string().optional(),
});
router.post(
  "/receivables/auto-debit-results",
  requireAction("receivable.auto_debit.record"),
  audit("receivable.auto_debit.record", { targetType: "auto_debit_result" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const parsed = AutoDebitInsertBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    const [last] = await db.select({ a: autoDebitResultsTable.attempt })
      .from(autoDebitResultsTable)
      .where(and(
        eq(autoDebitResultsTable.buildingId, buildingId),
        eq(autoDebitResultsTable.billingMonth, parsed.data.billingMonth),
        eq(autoDebitResultsTable.unitId, parsed.data.unitId),
      ))
      .orderBy(desc(autoDebitResultsTable.attempt)).limit(1);
    const attempt = (last?.a ?? 0) + 1;
    const [row] = await db.insert(autoDebitResultsTable).values({
      buildingId,
      billingMonth: parsed.data.billingMonth,
      unitId: parsed.data.unitId,
      unitNumber: parsed.data.unitNumber,
      billId: parsed.data.billId ?? null,
      bankCode: parsed.data.bankCode ?? null,
      accountMasked: parsed.data.accountMasked ?? null,
      amount: parsed.data.amount,
      attempt,
      status: parsed.data.status,
      resultCode: parsed.data.resultCode ?? null,
      resultMessage: parsed.data.resultMessage ?? null,
      requestedAt: parsed.data.status === "requested" || parsed.data.status === "success" ? new Date() : null,
      completedAt: parsed.data.status === "success" || parsed.data.status === "failed" ? new Date() : null,
    }).returning();
    res.json(row);
  },
);

router.post(
  "/receivables/auto-debit-results/:id/retry",
  requireAction("receivable.auto_debit.retry"),
  audit("receivable.auto_debit.retry", { targetType: "auto_debit_result", targetIdParam: "id" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const id = Number(req.params.id);
    const [src] = await db.select().from(autoDebitResultsTable)
      .where(and(eq(autoDebitResultsTable.id, id), eq(autoDebitResultsTable.buildingId, buildingId)));
    if (!src) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
    const [row] = await db.insert(autoDebitResultsTable).values({
      buildingId,
      billingMonth: src.billingMonth,
      unitId: src.unitId,
      unitNumber: src.unitNumber,
      billId: src.billId,
      bankCode: src.bankCode,
      accountMasked: src.accountMasked,
      amount: src.amount,
      attempt: src.attempt + 1,
      status: "queued",
    }).returning();
    res.json(row);
  },
);

export default router;
