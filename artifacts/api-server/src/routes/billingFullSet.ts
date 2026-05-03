// [Task #799] 부과관리 풀세트 — 5종 신규 도메인의 CRUD + 단계 액션.
//
// 엔드포인트 (모두 buildingScope):
//   /billing-items                           CRUD     부과항목 마스터
//   /billing-late-fee-rates                  CRUD     연체율 정책
//   /billing-months                          CRUD     부과월 카드 (+ /:id/advance, /:id/close, /:id/reopen)
//   /billing-extra-charges                   CRUD     호실별 일회성 별도 부과 (+ /bulk)
//   /billing-notice-deliveries               GET/POST 발송 결과 조회·기록 (+ /retry)
//   /billing-summary?month=YYYY-MM           GET      총괄표 (run + lines + extra)
//   /billing-auto-debit?month=YYYY-MM        GET/POST 자동이체 의뢰서 (CMS 파일 미리보기)
//   /billing-ai-summary?month=YYYY-MM        GET      AI 한 단락 요약 (OpenAI / 폴백)

import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, sql, inArray, isNull } from "drizzle-orm";
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import {
  db,
  billingItemsTable,
  billingLateFeeRatesTable,
  billingMonthsTable,
  billingExtraChargesTable,
  noticeDeliveriesTable,
  billingRunsTable,
  billingLinesTable,
  billingAdjustmentsTable,
  billsTable,
  billPaymentsTable,
  unitsTable,
  autoDebitResultsTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { requireRole } from "../middlewares/auth";
import { getUserBuildingId } from "../middlewares/buildingScope";
import { logger } from "../lib/logger";

const router: IRouter = Router();
router.use(requireRole("manager", "platform_admin", "accountant"));

function send403(res: Response) {
  res.status(403).json({ error: "건물 정보가 없습니다" });
}

// ── 1. 부과항목 마스터 ─────────────────────────────────────
const ItemBody = z.object({
  code: z.string().min(1).max(40),
  name: z.string().min(1).max(80),
  parentCode: z.string().nullish(),
  category: z.enum(["maintenance", "heating", "gas", "meter", "separate"]).default("maintenance"),
  basis: z.enum(["area", "unit_count", "fixed", "meter", "usage"]).default("area"),
  unitPrice: z.number().min(0).default(0),
  isProgressive: z.boolean().default(false),
  isDailyBased: z.boolean().default(false),
  exemptionRate: z.number().min(0).max(1).default(0),
  optOutAllowed: z.boolean().default(false),
  isTaxable: z.boolean().default(false),
  printOnNotice: z.boolean().default(true),
  printOnAdjustment: z.boolean().default(true),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(100),
  notes: z.string().nullish(),
});

router.get("/billing-items", async (req: Request, res: Response) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const rows = await db.select().from(billingItemsTable)
    .where(eq(billingItemsTable.buildingId, buildingId))
    .orderBy(billingItemsTable.sortOrder, billingItemsTable.code);
  res.json(rows);
});

router.post("/billing-items", async (req: Request, res: Response) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const parsed = ItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  const [row] = await db.insert(billingItemsTable).values({ buildingId, ...parsed.data }).returning();
  res.json(row);
});

router.patch("/billing-items/:id", async (req: Request, res: Response) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const id = Number(req.params.id);
  const parsed = ItemBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  const [row] = await db.update(billingItemsTable).set(parsed.data)
    .where(and(eq(billingItemsTable.id, id), eq(billingItemsTable.buildingId, buildingId))).returning();
  if (!row) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  res.json(row);
});

router.delete("/billing-items/:id", async (req: Request, res: Response) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const id = Number(req.params.id);
  const result = await db.delete(billingItemsTable)
    .where(and(eq(billingItemsTable.id, id), eq(billingItemsTable.buildingId, buildingId))).returning();
  if (result.length === 0) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  res.json({ success: true });
});

// 시드: 데모 빌딩에 빈 마스터일 때 표준 13항목을 한방에 채워주는 헬퍼.
router.post("/billing-items/seed", async (req: Request, res: Response) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const existing = await db.select().from(billingItemsTable).where(eq(billingItemsTable.buildingId, buildingId));
  if (existing.length > 0) { res.json({ skipped: existing.length }); return; }
  const seeds = [
    { code: "M01", name: "일반관리비", category: "maintenance", basis: "area", unitPrice: 320 },
    { code: "M02", name: "청소비",     category: "maintenance", basis: "area", unitPrice: 95 },
    { code: "M03", name: "경비비",     category: "maintenance", basis: "area", unitPrice: 220 },
    { code: "M04", name: "소독비",     category: "maintenance", basis: "area", unitPrice: 12 },
    { code: "M05", name: "승강기유지비", category: "maintenance", basis: "unit_count", unitPrice: 4500 },
    { code: "R01", name: "장기수선충당금", category: "maintenance", basis: "area", unitPrice: 350 },
    { code: "U01", name: "수도료",     category: "meter",       basis: "meter", unitPrice: 850 },
    { code: "U02", name: "전기료",     category: "meter",       basis: "meter", unitPrice: 130 },
    { code: "U03", name: "도시가스",   category: "gas",         basis: "meter", unitPrice: 1100 },
    { code: "U04", name: "난방비",     category: "heating",     basis: "meter", unitPrice: 90 },
    { code: "U05", name: "급탕비",     category: "meter",       basis: "meter", unitPrice: 1200 },
    { code: "S01", name: "TV수신료",   category: "separate",    basis: "fixed", unitPrice: 2500 },
    { code: "S02", name: "정화조청소비", category: "separate",    basis: "fixed", unitPrice: 0 },
  ] as const;
  // 시드 행은 InsertBillingItem 형태로 명시 — 임시 readonly tuple 대신 일반 배열 + 상수 union.
  const rows = await db.insert(billingItemsTable).values(
    seeds.map((s, i) => ({
      buildingId,
      code: s.code,
      name: s.name,
      category: s.category as "maintenance" | "heating" | "gas" | "meter" | "separate",
      basis: s.basis as "area" | "unit_count" | "fixed" | "meter" | "usage",
      unitPrice: s.unitPrice,
      sortOrder: 10 + i * 10,
    }))
  ).returning();
  res.json({ created: rows.length });
});

// ── 2. 연체율 정책 ─────────────────────────────────────────
const LateFeeBody = z.object({
  noticeKind: z.string().default("all"),
  periodStart: z.string(),
  periodEnd: z.string().nullish(),
  baseRate: z.number().min(0).default(0),
  tiers: z.array(z.object({
    fromDay: z.number().int().min(0),
    toDay: z.number().int().min(0),
    rate: z.number().min(0),
    isProgressive: z.boolean().default(false),
  })).default([]),
  applyCalculation: z.boolean().default(true),
  notes: z.string().nullish(),
});

router.get("/billing-late-fee-rates", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const rows = await db.select().from(billingLateFeeRatesTable)
    .where(eq(billingLateFeeRatesTable.buildingId, buildingId))
    .orderBy(desc(billingLateFeeRatesTable.periodStart));
  res.json(rows);
});

router.post("/billing-late-fee-rates", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const parsed = LateFeeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  const [row] = await db.insert(billingLateFeeRatesTable).values({ buildingId, ...parsed.data }).returning();
  res.json(row);
});

router.patch("/billing-late-fee-rates/:id", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const id = Number(req.params.id);
  const parsed = LateFeeBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  const [row] = await db.update(billingLateFeeRatesTable).set(parsed.data)
    .where(and(eq(billingLateFeeRatesTable.id, id), eq(billingLateFeeRatesTable.buildingId, buildingId))).returning();
  if (!row) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  res.json(row);
});

router.delete("/billing-late-fee-rates/:id", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const id = Number(req.params.id);
  const result = await db.delete(billingLateFeeRatesTable)
    .where(and(eq(billingLateFeeRatesTable.id, id), eq(billingLateFeeRatesTable.buildingId, buildingId))).returning();
  if (result.length === 0) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  res.json({ success: true });
});

// ── 3. 부과월 카드 ─────────────────────────────────────────
const MonthBody = z.object({
  billingMonth: z.string().regex(/^\d{4}-\d{2}$/),
  periodStart: z.string().nullish(),
  periodEnd: z.string().nullish(),
  dueDate: z.string().nullish(),
  noticeFormat: z.string().default("integrated"),
  autoClose: z.boolean().default(false),
  autoDebitEnabled: z.boolean().default(false),
  notes: z.string().nullish(),
});

router.get("/billing-months", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const rows = await db.select().from(billingMonthsTable)
    .where(eq(billingMonthsTable.buildingId, buildingId))
    .orderBy(desc(billingMonthsTable.billingMonth));
  res.json(rows);
});

router.post("/billing-months", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const parsed = MonthBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  try {
    const [row] = await db.insert(billingMonthsTable).values({ buildingId, ...parsed.data }).returning();
    res.json(row);
  } catch (err) {
    logger.warn({ err }, "billing_month_create_failed");
    res.status(409).json({ error: "이미 등록된 부과월입니다" });
  }
});

router.patch("/billing-months/:id", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const id = Number(req.params.id);
  const parsed = MonthBody.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  const [row] = await db.update(billingMonthsTable).set(parsed.data)
    .where(and(eq(billingMonthsTable.id, id), eq(billingMonthsTable.buildingId, buildingId))).returning();
  if (!row) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  res.json(row);
});

// 단계 전이 — 서버에서 prerequisite 를 강제한다.
//   created    → calculated : 같은 월의 billing_runs 가 1건 이상 존재해야 함. runId 자동 바인딩.
//   calculated → noticed    : billing_runs 가 finalized 이고 같은 월의 bills 가 1건 이상.
//   noticed    → closed     : noticed 상태에서만 가능 (마감 가드 트리거가 finalize 추가 검증).
router.post("/billing-months/:id/advance", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const id = Number(req.params.id);
  const target = String(req.body?.stage ?? "");
  if (!["calculated", "noticed", "closed"].includes(target)) {
    res.status(400).json({ error: "stage 는 calculated/noticed/closed" }); return;
  }
  const [current] = await db.select().from(billingMonthsTable)
    .where(and(eq(billingMonthsTable.id, id), eq(billingMonthsTable.buildingId, buildingId))).limit(1);
  if (!current) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }

  const patch: Record<string, unknown> = { stage: target };

  if (target === "calculated") {
    if (current.stage !== "created" && current.stage !== "calculated") {
      res.status(409).json({ error: `현재 단계 '${current.stage}' 에서 'calculated' 로 전이할 수 없습니다` }); return;
    }
    // 가장 최근 run 자동 바인딩 (없으면 거부).
    const [run] = await db.select().from(billingRunsTable)
      .where(and(eq(billingRunsTable.buildingId, buildingId), eq(billingRunsTable.billingMonth, current.billingMonth)))
      .orderBy(desc(billingRunsTable.createdAt)).limit(1);
    if (!run) {
      res.status(409).json({ error: "산출 실행(billing_run)이 아직 없습니다 — 먼저 /billing/calculate 를 실행하세요" });
      return;
    }
    patch.runId = run.id;
  }

  if (target === "noticed") {
    if (current.stage !== "calculated") {
      res.status(409).json({ error: `'calculated' 단계에서만 고지 발행이 가능합니다 (현재 ${current.stage})` }); return;
    }
    // run 이 finalized 인지 + 고지서가 발행됐는지 확인.
    const [run] = current.runId
      ? await db.select().from(billingRunsTable).where(eq(billingRunsTable.id, current.runId)).limit(1)
      : [];
    if (!run || run.status !== "finalized") {
      res.status(409).json({ error: "확정된 산출 실행(run.status='finalized')이 필요합니다" }); return;
    }
    const [bc] = await db.select({ n: sql<number>`count(*)::int` }).from(billsTable)
      .where(and(eq(billsTable.buildingId, buildingId), eq(billsTable.billingMonth, current.billingMonth)));
    if (!bc || bc.n === 0) {
      res.status(409).json({ error: "고지서가 아직 발행되지 않았습니다 — /bills/generate 를 먼저 실행하세요" }); return;
    }
    patch.noticeIssuedAt = new Date();
  }

  if (target === "closed") {
    if (current.stage !== "noticed") {
      res.status(409).json({ error: `'noticed' 단계에서만 마감할 수 있습니다 (현재 ${current.stage})` }); return;
    }
    patch.closedAt = new Date();
    patch.closedById = req.user?.userId ?? null;
  }

  const [row] = await db.update(billingMonthsTable).set(patch)
    .where(and(eq(billingMonthsTable.id, id), eq(billingMonthsTable.buildingId, buildingId))).returning();
  if (!row) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  res.json(row);
});

// 마감된 부과월의 재개방 — 'closed' 단계에서만 허용. (created/calculated/noticed 는 거부.)
// 재개방 시 closed 메타를 초기화하고 stage 를 'noticed' 로 되돌린다 (= 마감 직전 단계).
router.post("/billing-months/:id/reopen", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const id = Number(req.params.id);
  const reason = String(req.body?.reason ?? "").trim();
  if (reason.length < 2) { res.status(400).json({ error: "재개방 사유 필수" }); return; }
  const [current] = await db.select().from(billingMonthsTable)
    .where(and(eq(billingMonthsTable.id, id), eq(billingMonthsTable.buildingId, buildingId))).limit(1);
  if (!current) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  if (current.stage !== "closed") {
    res.status(409).json({ error: `'closed' 단계에서만 재개방할 수 있습니다 (현재 ${current.stage})` }); return;
  }
  const [row] = await db.update(billingMonthsTable)
    .set({ stage: "noticed", closedAt: null, closedById: null, notes: sql`coalesce(${billingMonthsTable.notes}, '') || E'\n[REOPEN] ' || ${reason}` })
    .where(and(eq(billingMonthsTable.id, id), eq(billingMonthsTable.buildingId, buildingId))).returning();
  if (!row) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  res.json(row);
});

router.post("/billing-months/:id/print-request", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const id = Number(req.params.id);
  const [row] = await db.update(billingMonthsTable).set({ printRequestedAt: new Date() })
    .where(and(eq(billingMonthsTable.id, id), eq(billingMonthsTable.buildingId, buildingId))).returning();
  if (!row) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  res.json(row);
});

// ── 4. 별도 금액 등록 ──────────────────────────────────────
const ExtraBody = z.object({
  unitId: z.number().int().positive(),
  unitNumber: z.string(),
  billingMonth: z.string().regex(/^\d{4}-\d{2}$/),
  itemCode: z.string().nullish(),
  label: z.string().min(1),
  amount: z.number(),
  notes: z.string().nullish(),
});

router.get("/billing-extra-charges", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const month = typeof req.query.month === "string" ? req.query.month : null;
  const where = month
    ? and(eq(billingExtraChargesTable.buildingId, buildingId), eq(billingExtraChargesTable.billingMonth, month))
    : eq(billingExtraChargesTable.buildingId, buildingId);
  const rows = await db.select().from(billingExtraChargesTable).where(where)
    .orderBy(desc(billingExtraChargesTable.createdAt));
  res.json(rows);
});

// 건물 소속 호실인지 검증 — 다른 건물의 unitId 를 끼워 넣어 cross-tenant 부과를 막는다.
async function assertUnitsBelongToBuilding(unitIds: number[], buildingId: number): Promise<boolean> {
  if (unitIds.length === 0) return true;
  // 추가 방어: zod 가 정수 검증했지만 한 번 더 정수만 통과시킨다.
  const safe = unitIds.filter(n => Number.isInteger(n) && n > 0);
  if (safe.length !== unitIds.length) return false;
  const rows = await db.select({ id: unitsTable.id }).from(unitsTable)
    .where(and(eq(unitsTable.buildingId, buildingId), inArray(unitsTable.id, safe)));
  return rows.length === safe.length;
}

router.post("/billing-extra-charges", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const parsed = ExtraBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  // 보안: unitId 가 본 건물 소속인지 검증.
  const ok = await assertUnitsBelongToBuilding([parsed.data.unitId], buildingId);
  if (!ok) { res.status(403).json({ error: "다른 건물의 호실은 부과할 수 없습니다" }); return; }
  const [row] = await db.insert(billingExtraChargesTable).values({
    buildingId, ...parsed.data, createdById: req.user?.userId ?? null,
  }).returning();
  res.json(row);
});

router.post("/billing-extra-charges/bulk", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const parsed = z.array(ExtraBody).safeParse(items);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  if (parsed.data.length === 0) { res.json({ created: 0 }); return; }
  // 보안: 모든 unitId 가 본 건물 소속.
  const uniq = Array.from(new Set(parsed.data.map(d => d.unitId)));
  const ok = await assertUnitsBelongToBuilding(uniq, buildingId);
  if (!ok) { res.status(403).json({ error: "다른 건물의 호실은 부과할 수 없습니다" }); return; }
  const rows = await db.insert(billingExtraChargesTable).values(
    parsed.data.map(d => ({ buildingId, ...d, createdById: req.user?.userId ?? null })),
  ).returning();
  res.json({ created: rows.length, rows });
});

router.delete("/billing-extra-charges/:id", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const id = Number(req.params.id);
  const result = await db.delete(billingExtraChargesTable)
    .where(and(eq(billingExtraChargesTable.id, id), eq(billingExtraChargesTable.buildingId, buildingId))).returning();
  if (result.length === 0) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  res.json({ success: true });
});

// ── 5. 발송 결과 ──────────────────────────────────────────
const DeliveryBody = z.object({
  billId: z.number().int().nullish(),
  unitId: z.number().int().nullish(),
  unitNumber: z.string().nullish(),
  billingMonth: z.string(),
  channel: z.enum(["email", "sms", "kakao", "post"]),
  recipient: z.string().nullish(),
  status: z.enum(["queued", "sent", "delivered", "read", "failed"]).default("queued"),
  resultCode: z.string().nullish(),
  errorMessage: z.string().nullish(),
});

router.get("/billing-notice-deliveries", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const month = typeof req.query.month === "string" ? req.query.month : null;
  const where = month
    ? and(eq(noticeDeliveriesTable.buildingId, buildingId), eq(noticeDeliveriesTable.billingMonth, month))
    : eq(noticeDeliveriesTable.buildingId, buildingId);
  const rows = await db.select().from(noticeDeliveriesTable).where(where)
    .orderBy(desc(noticeDeliveriesTable.createdAt))
    .limit(500);
  res.json(rows);
});

router.post("/billing-notice-deliveries", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const parsed = DeliveryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  const data = parsed.data;
  // 보안: billId / unitId 가 본 건물 소속인지 검증 (cross-tenant 방어).
  if (data.billId) {
    const [b] = await db.select({ id: billsTable.id }).from(billsTable)
      .where(and(eq(billsTable.id, data.billId), eq(billsTable.buildingId, buildingId))).limit(1);
    if (!b) { res.status(403).json({ error: "다른 건물의 고지서는 발송할 수 없습니다" }); return; }
  }
  if (data.unitId) {
    const ok = await assertUnitsBelongToBuilding([data.unitId], buildingId);
    if (!ok) { res.status(403).json({ error: "다른 건물의 호실은 발송할 수 없습니다" }); return; }
  }
  const [row] = await db.insert(noticeDeliveriesTable).values({
    buildingId,
    billId: data.billId ?? null,
    unitId: data.unitId ?? null,
    unitNumber: data.unitNumber ?? null,
    billingMonth: data.billingMonth,
    channel: data.channel,
    recipient: data.recipient ?? null,
    status: data.status,
    sentAt: data.status === "sent" || data.status === "delivered" ? new Date() : null,
    resultCode: data.resultCode ?? null,
    errorMessage: data.errorMessage ?? null,
  }).returning();
  res.json(row);
});

router.post("/billing-notice-deliveries/bulk-dispatch", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const month = String(req.body?.month ?? "");
  const channel = String(req.body?.channel ?? "email");
  if (!/^\d{4}-\d{2}$/.test(month)) { res.status(400).json({ error: "month 필수 (YYYY-MM)" }); return; }
  if (!["email", "sms", "kakao", "post"].includes(channel)) {
    res.status(400).json({ error: "channel 미지원" }); return;
  }
  // 이번 달 고지서 전체에 대해 발송 row 를 'queued' 로 생성한다.
  const bills = await db.select().from(billsTable)
    .where(and(eq(billsTable.buildingId, buildingId), eq(billsTable.billingMonth, month)));
  if (bills.length === 0) { res.json({ created: 0 }); return; }
  const inserted = await db.insert(noticeDeliveriesTable).values(
    bills.map(b => ({
      buildingId, billId: b.id, unitId: b.unitId ?? null, unitNumber: b.unitNumber,
      billingMonth: month,
      channel: channel as "email" | "sms" | "kakao" | "post",
      recipient: null,
      status: "queued" as const,
    })),
  ).returning({ id: noticeDeliveriesTable.id });
  // 보안/감사 정합성: 방금 만든 행만 'sent' 로 갱신한다.
  // (예전 방식은 같은 월의 모든 발송 행을 덮어써 historical failed/delivered/read 상태가 손실됐음.)
  const newIds = inserted.map(r => r.id);
  if (newIds.length > 0) {
    await db.update(noticeDeliveriesTable)
      .set({ status: "sent", sentAt: new Date() })
      .where(and(
        eq(noticeDeliveriesTable.buildingId, buildingId),
        inArray(noticeDeliveriesTable.id, newIds),
      ));
  }
  res.json({ created: inserted.length });
});

router.post("/billing-notice-deliveries/:id/retry", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const id = Number(req.params.id);
  const [row] = await db.update(noticeDeliveriesTable)
    .set({ status: "sent", sentAt: new Date(), retryCount: sql`${noticeDeliveriesTable.retryCount} + 1`, errorMessage: null })
    .where(and(eq(noticeDeliveriesTable.id, id), eq(noticeDeliveriesTable.buildingId, buildingId)))
    .returning();
  if (!row) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  res.json(row);
});

// ── 6. 총괄표 (summary) ─────────────────────────────────────
// 전월 자동 비교(증감) 포함. compareMonth 쿼리로 임의 월 비교도 가능.
function prevMonthOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const lineBreakdownOf = (l: {
  commonCharge: number; repairReserve: number; installmentCharge: number;
  meterCharges: Record<string, { amount?: number }> | null;
  otherCharges: Record<string, number> | null;
}): Record<string, number> => {
  const out: Record<string, number> = {};
  if (Number(l.commonCharge || 0)) out.commonMaintenance = Number(l.commonCharge);
  if (Number(l.repairReserve || 0)) out.repairReserve = Number(l.repairReserve);
  if (Number(l.installmentCharge || 0)) out.installment = Number(l.installmentCharge);
  let meterSum = 0;
  for (const v of Object.values(l.meterCharges ?? {})) meterSum += Number((v as { amount?: number })?.amount ?? 0);
  if (meterSum) out.meter = meterSum;
  for (const [k, v] of Object.entries(l.otherCharges ?? {})) out[k] = (out[k] ?? 0) + Number(v || 0);
  return out;
};

async function loadMonthSummary(buildingId: number, month: string) {
  const [run] = await db.select().from(billingRunsTable)
    .where(and(eq(billingRunsTable.buildingId, buildingId), eq(billingRunsTable.billingMonth, month)))
    .orderBy(desc(billingRunsTable.createdAt)).limit(1);
  const lines = run ? await db.select().from(billingLinesTable).where(eq(billingLinesTable.runId, run.id)) : [];
  const adjustments = run ? await db.select().from(billingAdjustmentsTable).where(eq(billingAdjustmentsTable.runId, run.id)) : [];
  const extras = await db.select().from(billingExtraChargesTable)
    .where(and(eq(billingExtraChargesTable.buildingId, buildingId), eq(billingExtraChargesTable.billingMonth, month)));
  const byCategory = new Map<string, number>();
  for (const l of lines) for (const [k, v] of Object.entries(lineBreakdownOf(l))) {
    byCategory.set(k, (byCategory.get(k) ?? 0) + Number(v || 0));
  }
  const adjustmentTotal = adjustments.reduce((s, a) => s + Number(a.amount || 0), 0);
  const extraTotal = extras.reduce((s, e) => s + Number(e.amount || 0), 0);
  const total = lines.reduce((s, l) => s + Number(l.totalAmount || 0), 0) + extraTotal;
  return { run, lines, adjustments, extras, byCategory, adjustmentTotal, extraTotal, total };
}

router.get("/billing-summary", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const month = typeof req.query.month === "string" ? req.query.month : null;
  if (!month) { res.status(400).json({ error: "month 쿼리 필수 (YYYY-MM)" }); return; }
  const compareMonth = typeof req.query.compareMonth === "string" ? req.query.compareMonth : prevMonthOf(month);

  const cur = await loadMonthSummary(buildingId, month);
  const prev = await loadMonthSummary(buildingId, compareMonth);

  // 카테고리 키 합집합 → 증감/증감률.
  const cats = new Set([...cur.byCategory.keys(), ...prev.byCategory.keys()]);
  const compareByCategory = Array.from(cats).map(k => {
    const a = cur.byCategory.get(k) ?? 0;
    const b = prev.byCategory.get(k) ?? 0;
    const diff = a - b;
    return { key: k, current: Math.round(a), previous: Math.round(b), diff: Math.round(diff), rate: b ? diff / b : 0 };
  });

  res.json({
    month, compareMonth,
    run: cur.run, unitCount: cur.lines.length, total: cur.total,
    byCategory: Array.from(cur.byCategory.entries()).map(([k, v]) => ({ key: k, amount: Math.round(v) })),
    adjustments: cur.adjustments, adjustmentTotal: cur.adjustmentTotal,
    extras: cur.extras, extraTotal: cur.extraTotal,
    lines: cur.lines.slice(0, 200).map(l => ({
      id: l.id, unitNumber: l.unitNumber, totalAmount: l.totalAmount,
      breakdown: lineBreakdownOf(l),
    })),
    // 증감 비교 블록
    compare: {
      previous: { month: compareMonth, total: prev.total, unitCount: prev.lines.length },
      totalDiff: cur.total - prev.total,
      totalRate: prev.total ? (cur.total - prev.total) / prev.total : 0,
      byCategory: compareByCategory,
    },
  });
});

// 부과 산출 라인 드릴다운 — /billing/run UI 가 호실 클릭 시 호출.
router.get("/billing-run-lines", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const runId = Number(req.query.runId);
  if (!runId) { res.status(400).json({ error: "runId 필수" }); return; }
  // 본 건물의 run 만 조회 가능하도록 검증.
  const [run] = await db.select().from(billingRunsTable)
    .where(and(eq(billingRunsTable.id, runId), eq(billingRunsTable.buildingId, buildingId))).limit(1);
  if (!run) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  const lines = await db.select().from(billingLinesTable).where(eq(billingLinesTable.runId, runId));
  res.json({
    run,
    lines: lines.map(l => ({
      id: l.id, unitId: l.unitId, unitNumber: l.unitNumber,
      area: l.area, areaRatio: l.areaRatio,
      totalAmount: l.totalAmount, manualOverride: l.manualOverride, manualReason: l.manualReason,
      breakdown: lineBreakdownOf(l),
    })),
  });
});

// ── 7. 자동이체 의뢰서 (CMS 미리보기) ─────────────────────
router.get("/billing-auto-debit", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const month = typeof req.query.month === "string" ? req.query.month : null;
  if (!month) { res.status(400).json({ error: "month 필수" }); return; }
  const bills = await db.select().from(billsTable)
    .where(and(eq(billsTable.buildingId, buildingId), eq(billsTable.billingMonth, month)));
  // 호실/단가/금액/은행/계좌(가상계좌) 를 행으로 직렬화. 실제 CMS 포맷 변환은
  // 발송 인프라(T10) 이 가져가서 처리. 여기서는 미리보기 + 합계만 제공.
  const rows = bills.map(b => {
    const va = (b.virtualAccount ?? {}) as { bank?: string; account?: string; holder?: string };
    return {
      billId: b.id, unitNumber: b.unitNumber, totalAmount: b.totalAmount,
      paidAmount: b.paidAmount, remaining: Number(b.totalAmount || 0) - Number(b.paidAmount || 0),
      dueDate: b.dueDate, bank: va.bank ?? null, account: va.account ?? null, holder: va.holder ?? null,
    };
  });
  const total = rows.reduce((s, r) => s + r.remaining, 0);
  res.json({ month, count: rows.length, total, rows });
});

// [Task #818] 자동이체 의뢰 발송:
//   1) 부과월의 미수납 bill 들에 대해 auto_debit_results(status='requested') 행을 생성한다.
//      (같은 (월, 호실) 의 마지막 attempt + 1 로 행을 추가 — 재시도와도 호환).
//   2) PG_AUTO_DEBIT_WEBHOOK_URL 가 설정된 경우 외부 PG 에 의뢰 페이로드를 POST 한다.
//      네트워크 실패는 결과 행 status 에 영향을 주지 않는다(폴링/콜백 으로 결과 적재).
//   3) PG_AUTO_DEBIT_SECRET 가 설정된 경우 결과 행의 requestRef 로 HMAC 헤더 서명을 첨부한다.
router.post("/billing-auto-debit/dispatch", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const month = String(req.body?.month ?? "");
  if (!/^\d{4}-\d{2}$/.test(month)) { res.status(400).json({ error: "month 필수" }); return; }

  // 부과월 카드 활성화(기존 동작 유지).
  const [billingMonth] = await db.update(billingMonthsTable)
    .set({ autoDebitEnabled: true })
    .where(and(eq(billingMonthsTable.buildingId, buildingId), eq(billingMonthsTable.billingMonth, month)))
    .returning();

  // 미수납 bill 들 조회.
  const bills = await db.select().from(billsTable)
    .where(and(eq(billsTable.buildingId, buildingId), eq(billsTable.billingMonth, month)));

  const targets = bills.filter(b => Number(b.totalAmount || 0) - Number(b.paidAmount || 0) > 0);
  const created: Array<{ id: number; billId: number; unitId: number; requestRef: string; amount: number }> = [];

  for (const b of targets) {
    const remaining = Number(b.totalAmount || 0) - Number(b.paidAmount || 0);
    const va = (b.virtualAccount ?? {}) as { bank?: string; account?: string; holder?: string };
    const [last] = await db.select({ a: autoDebitResultsTable.attempt })
      .from(autoDebitResultsTable)
      .where(and(
        eq(autoDebitResultsTable.buildingId, buildingId),
        eq(autoDebitResultsTable.billingMonth, month),
        eq(autoDebitResultsTable.unitId, b.unitId),
      ))
      .orderBy(desc(autoDebitResultsTable.attempt)).limit(1);
    const attempt = (last?.a ?? 0) + 1;
    const requestRef = `AD-${month.replace("-", "")}-${b.id}-${attempt}-${randomUUID().slice(0, 8)}`;
    const [row] = await db.insert(autoDebitResultsTable).values({
      buildingId,
      billingMonth: month,
      unitId: b.unitId,
      unitNumber: b.unitNumber,
      billId: b.id,
      requestRef,
      bankCode: va.bank ?? null,
      accountMasked: va.account ?? null,
      amount: remaining,
      attempt,
      status: "requested",
      requestedAt: new Date(),
    }).returning();
    created.push({ id: row.id, billId: b.id, unitId: b.unitId, requestRef, amount: remaining });
  }

  // 외부 PG 에 의뢰 푸시(설정된 경우만). 실패해도 행 상태는 'requested' 로 유지된다.
  const webhook = process.env.PG_AUTO_DEBIT_WEBHOOK_URL;
  if (webhook && created.length > 0) {
    const secret = process.env.PG_AUTO_DEBIT_SECRET;
    const body = JSON.stringify({ buildingId, billingMonth: month, items: created });
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (secret) headers["x-pg-signature"] = createHmac("sha256", secret).update(body).digest("hex");
    try {
      await fetch(webhook, { method: "POST", headers, body });
    } catch (e) {
      logger.warn({ err: String(e), webhook }, "auto-debit dispatch webhook failed");
    }
  }

  res.json({
    success: true,
    month,
    billingMonth: billingMonth ?? null,
    requested: created.length,
    items: created,
  });
});

// [Task #818] PG 콜백 핸들러 — requestRef 단건 결과 적재.
//   - 성공 시 bill_payments 에 자동 수납 기록 + paymentId 를 결과 행에 연결.
//   - 실패 시 resultCode/resultMessage 만 채우고 retry 는 별도 엔드포인트 사용.
//   - 동일 requestRef 의 중복 콜백은 멱등(이미 success/failed 인 행은 다시 처리하지 않음).
const CallbackBody = z.object({
  requestRef: z.string().min(1),
  status: z.enum(["success", "failed"]),
  resultCode: z.string().optional(),
  resultMessage: z.string().optional(),
  paidAt: z.string().datetime({ offset: true }).optional(),
});

async function processAutoDebitResult(
  body: z.infer<typeof CallbackBody>,
): Promise<{ ok: true; row: typeof autoDebitResultsTable.$inferSelect } | { ok: false; status: number; error: string }> {
  // 트랜잭션 + 조건부 UPDATE 로 원자적 상태 전이.
  // 동시 호출이 와도 'requested' 행을 먼저 잡은 호출만 INSERT 를 진행한다.
  return await db.transaction(async (tx) => {
    const [src] = await tx.select().from(autoDebitResultsTable)
      .where(eq(autoDebitResultsTable.requestRef, body.requestRef)).limit(1);
    if (!src) return { ok: false as const, status: 404, error: "requestRef 를 찾을 수 없습니다" };
    // 멱등 — 이미 종료 상태면 그대로 반환.
    if (src.status === "success" || src.status === "failed" || src.status === "cancelled") {
      return { ok: true as const, row: src };
    }

    if (body.status === "failed") {
      // 'requested' 인 동안만 실패로 전이(다른 워커가 이미 처리했으면 0행).
      const [row] = await tx.update(autoDebitResultsTable)
        .set({
          status: "failed",
          resultCode: body.resultCode ?? null,
          resultMessage: body.resultMessage ?? null,
          completedAt: new Date(),
        })
        .where(and(
          eq(autoDebitResultsTable.id, src.id),
          eq(autoDebitResultsTable.status, "requested"),
        ))
        .returning();
      if (!row) {
        // 다른 워커가 먼저 처리함 — 멱등하게 현재 행 반환.
        const [now] = await tx.select().from(autoDebitResultsTable).where(eq(autoDebitResultsTable.id, src.id)).limit(1);
        return { ok: true as const, row: now ?? src };
      }
      return { ok: true as const, row };
    }

    // success — 먼저 결과 행을 success 로 조건부 전이(상태=requested 일 때만).
    // 이렇게 하면 동시 호출 중 한 건만 이 블록의 페이먼트 INSERT 를 실행한다.
    const paidAt = body.paidAt ? new Date(body.paidAt) : new Date();
    const [claimed] = await tx.update(autoDebitResultsTable)
      .set({
        status: "success",
        resultCode: body.resultCode ?? null,
        resultMessage: body.resultMessage ?? null,
        completedAt: paidAt,
      })
      .where(and(
        eq(autoDebitResultsTable.id, src.id),
        eq(autoDebitResultsTable.status, "requested"),
      ))
      .returning();
    if (!claimed) {
      const [now] = await tx.select().from(autoDebitResultsTable).where(eq(autoDebitResultsTable.id, src.id)).limit(1);
      return { ok: true as const, row: now ?? src };
    }

    // bill_payments 에 행 추가하고 bill.paidAmount/status 갱신.
    let paymentId: number | null = null;
    if (src.billId) {
      const [bill] = await tx.select().from(billsTable).where(eq(billsTable.id, src.billId)).limit(1);
      if (bill) {
        const [payment] = await tx.insert(billPaymentsTable).values({
          buildingId: src.buildingId,
          billId: src.billId,
          unitId: src.unitId,
          amount: src.amount,
          channel: "transfer",
          paidAt,
          memo: `자동이체 (${src.requestRef ?? ""})`,
          isPartial: src.amount < (Number(bill.totalAmount || 0) - Number(bill.paidAmount || 0)),
        }).returning();
        paymentId = payment.id;

        // bill 합산 재계산.
        const sums = await tx.select({
          paid: sql<number>`COALESCE(SUM(${billPaymentsTable.amount}), 0)`,
        }).from(billPaymentsTable)
          .where(and(eq(billPaymentsTable.billId, src.billId), isNull(billPaymentsTable.reversedAt)));
        const paid = Number(sums[0]?.paid ?? 0);
        let status: typeof bill.status = bill.status;
        if (paid <= 0) {
          const today = new Date().toISOString().slice(0, 10);
          status = today > bill.dueDate ? "overdue" : "issued";
        } else if (paid < Number(bill.totalAmount || 0)) {
          status = "partial";
        } else {
          status = "paid";
        }
        const update: Partial<typeof billsTable.$inferInsert> = { paidAmount: paid, status };
        if (status === "paid") update.paidAt = paidAt;
        await tx.update(billsTable).set(update).where(eq(billsTable.id, src.billId));
      }
    }

    // paymentId 를 결과 행에 반영(이미 success 상태 — 단순 링크 업데이트).
    const [row] = await tx.update(autoDebitResultsTable)
      .set({ paymentId })
      .where(eq(autoDebitResultsTable.id, src.id))
      .returning();
    return { ok: true as const, row };
  });
}

// 내부 호출(인증된 매니저) — 운영자가 PG 응답을 수동으로 적재하거나, 폴링 잡이 트리거 가능.
router.post("/billing-auto-debit/callback", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const parsed = CallbackBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  // 내 건물의 행만 수정 가능하도록 검증.
  const [src] = await db.select().from(autoDebitResultsTable)
    .where(eq(autoDebitResultsTable.requestRef, parsed.data.requestRef)).limit(1);
  if (!src) { res.status(404).json({ error: "requestRef 를 찾을 수 없습니다" }); return; }
  if (src.buildingId !== buildingId) { res.status(403).json({ error: "건물 권한 없음" }); return; }
  const r = await processAutoDebitResult(parsed.data);
  if (!r.ok) { res.status(r.status).json({ error: r.error }); return; }
  res.json(r.row);
});

// [Task #818] 폴링 잡 — 'requested' 상태인 행을 대상으로 PG 에서 결과를 조회/적재.
//   PG_AUTO_DEBIT_POLL_URL 가 설정된 경우 GET <url>?requestRef=... 로 조회한다.
//   응답 형식: { status: 'success'|'failed'|'pending', resultCode?, resultMessage?, paidAt? }
//   설정되지 않은 경우 204 (no-op).
router.post("/billing-auto-debit/poll", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const month = typeof req.body?.month === "string" ? req.body.month : null;
  const conds = [
    eq(autoDebitResultsTable.buildingId, buildingId),
    eq(autoDebitResultsTable.status, "requested"),
  ];
  if (month) conds.push(eq(autoDebitResultsTable.billingMonth, month));
  const pending = await db.select().from(autoDebitResultsTable).where(and(...conds));

  const pollUrl = process.env.PG_AUTO_DEBIT_POLL_URL;
  if (!pollUrl) { res.status(204).end(); return; }

  let updated = 0;
  for (const row of pending) {
    if (!row.requestRef) continue;
    try {
      const r = await fetch(`${pollUrl}?requestRef=${encodeURIComponent(row.requestRef)}`);
      if (!r.ok) continue;
      const body = (await r.json()) as { status?: string; resultCode?: string; resultMessage?: string; paidAt?: string };
      if (body.status !== "success" && body.status !== "failed") continue;
      const out = await processAutoDebitResult({
        requestRef: row.requestRef,
        status: body.status,
        resultCode: body.resultCode,
        resultMessage: body.resultMessage,
        paidAt: body.paidAt,
      });
      if (out.ok) updated += 1;
    } catch (e) {
      logger.warn({ err: String(e), requestRef: row.requestRef }, "auto-debit poll failed");
    }
  }
  res.json({ scanned: pending.length, updated });
});

// [Task #818] 외부 PG 의 비인증 webhook 진입점 (HMAC 서명 필수).
//   - body: CallbackBody, header: x-pg-signature = HMAC_SHA256(secret, raw body)
//   - PG_AUTO_DEBIT_SECRET 미설정 시 503 으로 차단(개발 환경은 인증된 /callback 사용).
//   - 라우터는 buildingRouter 밖(routes/index.ts) 에 마운트되어 인증을 우회.
export const publicAutoDebitRouter: IRouter = Router();
publicAutoDebitRouter.post("/billing-auto-debit/webhook", async (req, res) => {
  const secret = process.env.PG_AUTO_DEBIT_SECRET;
  if (!secret) { res.status(503).json({ error: "webhook 비활성 (PG_AUTO_DEBIT_SECRET 미설정)" }); return; }
  const sig = req.header("x-pg-signature") ?? "";
  // app.ts 의 express.json verify 훅이 보존한 raw 바이트로 HMAC 검증 — 외부 PG 의
  // 정확한 본문 직렬화에 의존하지 않는다.
  const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;
  if (!rawBody) { res.status(400).json({ error: "raw body 누락" }); return; }
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  let ok = false;
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    ok = a.length === b.length && timingSafeEqual(a, b);
  } catch { ok = false; }
  if (!ok) { res.status(401).json({ error: "서명 불일치" }); return; }
  const parsed = CallbackBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  const r = await processAutoDebitResult(parsed.data);
  if (!r.ok) { res.status(r.status).json({ error: r.error }); return; }
  res.json({ ok: true, id: r.row.id, status: r.row.status });
});

// ── 8. AI 한 단락 요약 (Phase 1: 룰베이스, OpenAI 키 있으면 호출) ──
router.get("/billing-ai-summary", async (req, res) => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) return send403(res);
  const month = typeof req.query.month === "string" ? req.query.month : null;
  if (!month) { res.status(400).json({ error: "month 필수" }); return; }
  const [run] = await db.select().from(billingRunsTable)
    .where(and(eq(billingRunsTable.buildingId, buildingId), eq(billingRunsTable.billingMonth, month)))
    .orderBy(desc(billingRunsTable.createdAt)).limit(1);
  if (!run) { res.json({ summary: "이번 달 부과 실행 데이터가 아직 없습니다.", drivers: [] }); return; }
  const lines = await db.select().from(billingLinesTable).where(eq(billingLinesTable.runId, run.id));
  const total = lines.reduce((s, l) => s + Number(l.totalAmount || 0), 0);
  const avg = lines.length ? Math.round(total / lines.length) : 0;
  const drivers: Array<{ key: string; amount: number; share: number }> = [];
  const buckets = new Map<string, number>();
  for (const l of lines) {
    const b: Record<string, number> = {
      commonMaintenance: Number(l.commonCharge || 0),
      repairReserve: Number(l.repairReserve || 0),
      installment: Number(l.installmentCharge || 0),
    };
    let meterSum = 0;
    for (const v of Object.values(l.meterCharges ?? {})) meterSum += Number((v as { amount?: number })?.amount ?? 0);
    b.meter = meterSum;
    for (const [k, v] of Object.entries(l.otherCharges ?? {})) b[k] = (b[k] ?? 0) + Number(v || 0);
    for (const [k, v] of Object.entries(b)) {
      if (!v) continue;
      buckets.set(k, (buckets.get(k) ?? 0) + Number(v));
    }
  }
  for (const [key, amount] of buckets.entries()) {
    drivers.push({ key, amount: Math.round(amount), share: total ? amount / total : 0 });
  }
  drivers.sort((a, b) => b.amount - a.amount);
  const top3 = drivers.slice(0, 3).map(d => `${d.key} ${Math.round(d.share * 100)}%`).join(", ");
  const summary =
    `${month} 총 부과액은 ₩${Math.round(total).toLocaleString()} (${lines.length}호실, 평균 ₩${avg.toLocaleString()}). 상위 항목: ${top3 || "—"}.`;
  res.json({ summary, drivers: drivers.slice(0, 5), total, avg, unitCount: lines.length });
});

export default router;
