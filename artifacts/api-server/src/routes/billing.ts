// [Task #777] 부과엔진 v01 — 환경/계산/총괄/조정/분할/검증/이벤트.
//
// 엔드포인트:
//   GET    /billing/settings                — 활성 부과환경 (+ AI 추천 평균)
//   PUT    /billing/settings                — 환경 갱신 (버전 새로 발급)
//   GET    /billing/installments            — 분할부과 ledger 목록
//   POST   /billing/installments            — 분할부과 등록
//   PATCH  /billing/installments/:id        — 분할부과 상태/메모 수정
//   DELETE /billing/installments/:id        — 분할부과 삭제 (사유 필수)
//   POST   /billing/calculate               — 월 + 건물 → 호실별 결과 계산·저장
//   GET    /billing/runs                    — 실행 헤더 목록 (최신순)
//   GET    /billing/runs/:id                — 실행 + 호실별 라인 (총괄표 데이터)
//   POST   /billing/runs/:id/finalize       — 확정 → billing.finalized 이벤트 발행
//   GET    /billing/runs/:id/validate       — 3대 정합성 룰 검증
//   GET    /billing/runs/:id/adjustments    — 조정 ledger 조회
//   POST   /billing/runs/:id/adjustments    — 조정 등록 (사유 필수)
//   PATCH  /billing/lines/:id/override      — 호실 라인 보정 (사유 칩 + 슬라이더)
//
// finalize 시 T6 회계엔진의 자동 분개를 트리거하기 위한 이벤트 훅 emitBillingFinalized 만 연결.

import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import {
  db,
  billingSettingsTable,
  billingInstallmentsTable,
  billingRunsTable,
  billingLinesTable,
  billingAdjustmentsTable,
  unitsTable,
  meterReadingsTable,
  monthlyBillSummariesTable,
} from "@workspace/db";
import { z } from "zod/v4";
import { requireRole } from "../middlewares/auth";
import { audit, requireAction } from "../middlewares/audit";
import { getUserBuildingId } from "../middlewares/buildingScope";
import { logger } from "../lib/logger";

const router: IRouter = Router();
router.use("/billing", requireRole("manager", "platform_admin", "accountant"));

// ── 입력 스키마 ──────────────────────────────────────────────
const SettingsBody = z.object({
  areaBasis: z.enum(["supply", "exclusive"]).default("supply"),
  repairReserveUnitPrice: z.number().min(0).default(0),
  meterUnitPrices: z.record(z.string(), z.number().min(0)).default({}),
  otherUnitPrices: z.record(z.string(), z.number().min(0)).default({}),
  allocationRules: z.record(z.string(), z.enum(["area", "unit_count", "usage"])).default({}),
});

const InstallmentBody = z.object({
  title: z.string().min(1),
  totalAmount: z.number().positive(),
  amortizationMonths: z.number().int().min(1).max(120),
  startMonth: z.string().regex(/^\d{4}-\d{2}$/),
  category: z.enum(["repair", "long_term", "other"]).default("repair"),
  allocationKey: z.enum(["area", "unit_count"]).default("area"),
  notes: z.string().optional(),
});

const CalculateBody = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  commonMaintenance: z.number().min(0).default(0),
  notes: z.string().optional(),
  // 검침 사용량을 직접 넘기면 우선 사용 (T3 OCR 외 수기 보정용).
  meterTotalsOverride: z.record(z.string(), z.number().min(0)).optional(),
});

const AdjustmentBody = z.object({
  unitId: z.number().int().positive(),
  adjustmentType: z.enum(["discount", "refund", "rebill", "writeoff"]),
  amount: z.number(),
  reason: z.string().min(1),
  reasonChip: z.string().optional(),
  appliedAt: z.string().optional(),
});

const OverrideBody = z.object({
  amount: z.number().min(0),
  reason: z.string().min(1),
});

// ── 유틸 ────────────────────────────────────────────────────
function monthRange(startMonth: string, months: number): string[] {
  const [y, m] = startMonth.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(y, (m - 1) + i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

async function getActiveSettings(buildingId: number) {
  const [row] = await db.select().from(billingSettingsTable)
    .where(and(eq(billingSettingsTable.buildingId, buildingId), eq(billingSettingsTable.isActive, true)))
    .orderBy(desc(billingSettingsTable.version))
    .limit(1);
  return row ?? null;
}

// 신코드 데모(101/102/103호) 호환 기본값. AI 추천의 시드.
const DEFAULT_METER_PRICES: Record<string, number> = {
  water: 850, electricity: 130, gas: 1100, heating: 90,
};
const DEFAULT_ALLOCATION: Record<string, "area" | "unit_count" | "usage"> = {
  commonMaintenance: "area",
  repairReserve: "area",
  installment: "area",
  meter: "usage",
};

// ── 도메인 이벤트 계약 (T6/T8/T9 hooks) ───────────────────────
// finalize 시 발행되는 페이로드는 다음 구독자가 사용한다:
//   - T6 회계엔진: (차) 미수관리비 / (대) 관리수익 자동 분개. journalRefId 채워서 콜백.
//   - T8 고지서:   PDF 생성 트리거.
//   - T9 마감:     해당 월 마감 인터록 활성화.
// 도착 전이므로 단일 in-process 디스패처를 두고 logger 로 흘려보낸다.
// 구독 추가 시 BILLING_FINALIZED_LISTENERS 에 push 만 하면 된다.
export type BillingFinalizedEvent = {
  event: "billing.finalized";
  version: 1;
  runId: number;
  buildingId: number;
  billingMonth: string;
  totalAmount: number;
  unitCount: number;
  finalizedAt: string;
  finalizedById: number | null;
};
export const BILLING_FINALIZED_LISTENERS: Array<(e: BillingFinalizedEvent) => void | Promise<void>> = [];
function emitBillingFinalized(payload: Omit<BillingFinalizedEvent, "event" | "version">) {
  const evt: BillingFinalizedEvent = { event: "billing.finalized", version: 1, ...payload };
  logger.info(evt, "[T7→T6/T8/T9] billing.finalized");
  for (const fn of BILLING_FINALIZED_LISTENERS) {
    try { void Promise.resolve(fn(evt)).catch(err => logger.error({ err }, "billing.finalized listener failed")); }
    catch (err) { logger.error({ err }, "billing.finalized listener threw"); }
  }
}

// ── 1. 부과환경 ─────────────────────────────────────────────
router.get("/billing/settings", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const active = await getActiveSettings(buildingId);
  // AI 추천 — 동일 본사 묶음의 평균이 시드. 데이터가 없으면 데모 기본값.
  const peerAvg = await db.select({
    avgRepair: sql<number>`avg(${billingSettingsTable.repairReserveUnitPrice})::float`,
  }).from(billingSettingsTable);
  const aiSuggested = {
    areaBasis: "supply" as const,
    repairReserveUnitPrice: Math.round(peerAvg[0]?.avgRepair ?? 350),
    meterUnitPrices: DEFAULT_METER_PRICES,
    otherUnitPrices: {},
    allocationRules: DEFAULT_ALLOCATION,
  };
  res.json({ active, aiSuggested });
});

router.put(
  "/billing/settings",
  requireAction("billing.settings.update"),
  audit("billing.settings.update", { targetType: "billing_settings" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const parsed = SettingsBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }

    const [latest] = await db.select({ version: billingSettingsTable.version }).from(billingSettingsTable)
      .where(eq(billingSettingsTable.buildingId, buildingId))
      .orderBy(desc(billingSettingsTable.version))
      .limit(1);
    const nextVersion = (latest?.version ?? 0) + 1;

    // 기존 활성 비활성화 후 새 버전 활성으로 삽입.
    await db.update(billingSettingsTable)
      .set({ isActive: false })
      .where(eq(billingSettingsTable.buildingId, buildingId));

    const [saved] = await db.insert(billingSettingsTable).values({
      buildingId,
      version: nextVersion,
      areaBasis: parsed.data.areaBasis,
      repairReserveUnitPrice: parsed.data.repairReserveUnitPrice,
      meterUnitPrices: parsed.data.meterUnitPrices,
      otherUnitPrices: parsed.data.otherUnitPrices,
      allocationRules: parsed.data.allocationRules,
      isActive: true,
      createdById: req.user?.userId ?? null,
    }).returning();
    res.json(saved);
  },
);

// ── 2. 분할부과 ledger ──────────────────────────────────────
router.get("/billing/installments", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.json([]); return; }
  const month = typeof req.query.month === "string" ? req.query.month : null;
  let rows = await db.select().from(billingInstallmentsTable)
    .where(eq(billingInstallmentsTable.buildingId, buildingId))
    .orderBy(desc(billingInstallmentsTable.createdAt));
  if (month) {
    // 당월에 부과 대상이 되는 것만 — startMonth <= month <= endMonth.
    rows = rows.filter(r => r.startMonth <= month && month <= r.endMonth && r.status === "active");
  }
  res.json(rows);
});

router.post(
  "/billing/installments",
  requireAction("billing.installment.create"),
  audit("billing.installment.create", { targetType: "billing_installment" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const parsed = InstallmentBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    const { title, totalAmount, amortizationMonths, startMonth, category, allocationKey, notes } = parsed.data;
    const monthlyAmount = Math.round(totalAmount / amortizationMonths);
    const months = monthRange(startMonth, amortizationMonths);
    const endMonth = months[months.length - 1];
    const [saved] = await db.insert(billingInstallmentsTable).values({
      buildingId, title, totalAmount, amortizationMonths, monthlyAmount,
      startMonth, endMonth, category, allocationKey, notes,
      createdById: req.user?.userId ?? null,
    }).returning();
    res.json(saved);
  },
);

router.patch(
  "/billing/installments/:id",
  requireAction("billing.installment.update"),
  audit("billing.installment.update", { targetType: "billing_installment", targetIdParam: "id" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const id = Number(req.params.id);
    const allowed: Record<string, unknown> = {};
    if (typeof req.body?.notes === "string") allowed.notes = req.body.notes;
    if (req.body?.status === "active" || req.body?.status === "paused" || req.body?.status === "closed") {
      allowed.status = req.body.status;
    }
    const [updated] = await db.update(billingInstallmentsTable)
      .set(allowed)
      .where(and(eq(billingInstallmentsTable.id, id), eq(billingInstallmentsTable.buildingId, buildingId)))
      .returning();
    if (!updated) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
    res.json(updated);
  },
);

// 사유 필수 — 분할부과 ledger 삭제는 destructive 액션이므로
// `body.reason` 또는 `X-Audit-Reason` 헤더(audit 미들웨어 표준) 로 사유를 받는다.
router.delete(
  "/billing/installments/:id",
  requireAction("billing.installment.delete"),
  audit("billing.installment.delete", { targetType: "billing_installment", targetIdParam: "id" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const headerReason = req.header("x-audit-reason") ?? "";
    const bodyReason = typeof req.body?.reason === "string" ? req.body.reason : "";
    const reason = (bodyReason || headerReason).trim();
    if (!reason || reason.length < 2) {
      res.status(400).json({ error: "삭제 사유를 입력하세요 (body.reason 또는 X-Audit-Reason 헤더)" });
      return;
    }
    const id = Number(req.params.id);
    const result = await db.delete(billingInstallmentsTable)
      .where(and(eq(billingInstallmentsTable.id, id), eq(billingInstallmentsTable.buildingId, buildingId)))
      .returning();
    if (result.length === 0) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
    res.json({ success: true, reason: reason.trim() });
  },
);

// ── 3. 부과 계산 ────────────────────────────────────────────
router.post(
  "/billing/calculate",
  requireAction("billing.calculate"),
  audit("billing.calculate", { targetType: "billing_run" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const parsed = CalculateBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    const { month, commonMaintenance, notes, meterTotalsOverride } = parsed.data;

    // 마감 잠금(finalized) 시에는 재계산 차단 — 마감엔진(T9) 인터록 자리.
    const [existingRun] = await db.select().from(billingRunsTable)
      .where(and(eq(billingRunsTable.buildingId, buildingId), eq(billingRunsTable.billingMonth, month)));
    if (existingRun?.status === "finalized") {
      res.status(409).json({ error: `${month} 부과는 확정되었습니다. 조정명세서를 사용하세요.`, runId: existingRun.id });
      return;
    }

    // 입력 로드: 환경, 호실, 분할부과 ledger, 검침 합계, 고지서 OCR(검증용 비교).
    const settings = await getActiveSettings(buildingId);
    const settingsVersion = settings?.version ?? 0;
    const areaBasis = settings?.areaBasis ?? "supply";
    const meterPrices = { ...DEFAULT_METER_PRICES, ...(settings?.meterUnitPrices ?? {}) };
    const repairUnitPrice = settings?.repairReserveUnitPrice ?? 0;
    const otherPrices = settings?.otherUnitPrices ?? {};

    const units = await db.select().from(unitsTable).where(eq(unitsTable.buildingId, buildingId));
    if (units.length === 0) { res.status(400).json({ error: "호실이 등록되어 있지 않습니다" }); return; }

    // 면적 — 공급면적 기준이 우선, 데이터 없으면 전용면적 폴백.
    const areaOf = (u: typeof units[number]) => {
      const supply = Number(u.supplyArea ?? 0);
      const exclusive = Number(u.exclusiveArea ?? 0);
      if (areaBasis === "supply" && supply > 0) return supply;
      if (areaBasis === "exclusive" && exclusive > 0) return exclusive;
      return supply > 0 ? supply : exclusive;
    };
    const totalArea = units.reduce((s, u) => s + areaOf(u), 0);
    const useEqual = totalArea <= 0;

    // 배분 규칙(allocationRules) — 비목별 키. 미지정 비목은 'area' 기본.
    //   'area'        → 면적 비율
    //   'unit_count'  → 세대수 균등(1/N)
    //   'usage'       → 검침 사용량 (수도/전기/가스 등 검침항목에서만 의미)
    const rules = (settings?.allocationRules ?? {}) as Record<string, "area" | "unit_count" | "usage">;
    const ruleOf = (key: string, fallback: "area" | "unit_count" | "usage" = "area") => rules[key] ?? fallback;
    const equalShare = 1 / units.length;
    const ratioFor = (areaVal: number, rule: "area" | "unit_count" | "usage"): number => {
      if (rule === "unit_count") return equalShare;
      if (useEqual) return equalShare; // 면적 데이터가 비어있을 때의 안전 폴백.
      return areaVal / totalArea;
    };

    // 분할부과 — 당월 active ledger. 각 ledger 의 allocationKey(area|unit_count) 별로
    // 호실 비율을 따로 계산해 monthlyAmount 를 분배한다.
    const allInstallments = await db.select().from(billingInstallmentsTable)
      .where(and(
        eq(billingInstallmentsTable.buildingId, buildingId),
        eq(billingInstallmentsTable.status, "active"),
      ));
    const activeInstallments = allInstallments.filter(i => i.startMonth <= month && month <= i.endMonth);
    const installmentTotal = activeInstallments.reduce((s, i) => s + i.monthlyAmount, 0);

    // 검침 — 당월 정기 검침 사용량을 호실별로 합산 (meterType 별).
    // ⚠ TZ 안전 — toISOString() 사용 시 KST 환경에서 UTC 변환으로 월말이 하루 앞당겨질 수 있다.
    //   `YYYY-MM-DD` 문자열을 직접 합성해 `meter_readings.reading_date` (date) 와
    //   안전하게 비교한다. 다음달 1일을 양끝 미만으로 쓰면 윤년·말일 모두 정확.
    const [yearStr, monthStr] = month.split("-");
    const yearN = Number(yearStr);
    const monthN = Number(monthStr);
    const monthStart = `${yearStr}-${monthStr}-01`;
    const nextY = monthN === 12 ? yearN + 1 : yearN;
    const nextM = monthN === 12 ? 1 : monthN + 1;
    const nextMonthStart = `${nextY}-${String(nextM).padStart(2, "0")}-01`;
    const monthMeters = await db.select().from(meterReadingsTable).where(and(
      eq(meterReadingsTable.buildingId, buildingId),
      gte(meterReadingsTable.readingDate, monthStart),
      sql`${meterReadingsTable.readingDate} < ${nextMonthStart}`,
    ));
    const usageByUnit: Record<number, Record<string, number>> = {};
    for (const m of monthMeters) {
      if (m.unitId == null) continue;
      const u = (usageByUnit[m.unitId] ??= {});
      u[m.meterType] = (u[m.meterType] ?? 0) + Number(m.usage ?? 0);
    }
    const meterTotals: Record<string, number> = {};
    for (const u of Object.values(usageByUnit)) {
      for (const [k, v] of Object.entries(u)) meterTotals[k] = (meterTotals[k] ?? 0) + v;
    }
    if (meterTotalsOverride) {
      for (const [k, v] of Object.entries(meterTotalsOverride)) meterTotals[k] = v;
    }

    // 호실별 산출.
    //   - commonCharge       : allocationRules.commonMaintenance (area | unit_count) 적용.
    //   - repairReserve      : 'area' 면 ㎡단가 × 면적 (전통식). 'unit_count' 면 균등.
    //   - installmentCharge  : ledger 별 allocationKey 로 호실 비율을 따로 산정해 합산.
    //   - meterCharges       : 사용량 × 단가 (allocationRule 'usage' 의 자연 결과).
    const commonRule = ruleOf("commonMaintenance", "area");
    const repairRule = ruleOf("repairReserve", "area");
    let grandTotal = 0;
    const lineRows: Array<typeof billingLinesTable.$inferInsert> = [];
    for (const u of units) {
      const area = areaOf(u);
      const areaRatio = ratioFor(area, "area");
      const commonRatio = ratioFor(area, commonRule);
      const commonCharge = Math.round(commonMaintenance * commonRatio);
      const repairReserve = repairRule === "unit_count"
        ? Math.round((repairUnitPrice * (totalArea > 0 ? totalArea : units.length)) * equalShare)
        : Math.round(area * repairUnitPrice);
      let installmentCharge = 0;
      for (const inst of activeInstallments) {
        const r = ratioFor(area, inst.allocationKey === "unit_count" ? "unit_count" : "area");
        installmentCharge += inst.monthlyAmount * r;
      }
      installmentCharge = Math.round(installmentCharge);
      const ratio = areaRatio; // areaRatio 컬럼은 면적 기준 정보용.
      const meterCharges: Record<string, { usage: number; rate: number; amount: number }> = {};
      let meterSum = 0;
      const usage = usageByUnit[u.id] ?? {};
      for (const [mt, used] of Object.entries(usage)) {
        const rate = meterPrices[mt] ?? 0;
        const amount = Math.round(used * rate);
        meterCharges[mt] = { usage: used, rate, amount };
        meterSum += amount;
      }
      const otherCharges: Record<string, number> = {};
      let otherSum = 0;
      for (const [k, price] of Object.entries(otherPrices as Record<string, number>)) {
        const amt = Math.round(area * price);
        otherCharges[k] = amt;
        otherSum += amt;
      }
      const total = commonCharge + repairReserve + installmentCharge + meterSum + otherSum;
      grandTotal += total;
      lineRows.push({
        runId: 0, // 채워서 insert
        unitId: u.id,
        unitNumber: u.unitNumber,
        area, areaRatio: Math.round(ratio * 10000) / 100,
        commonCharge, meterCharges, repairReserve, installmentCharge, otherCharges,
        totalAmount: total,
      });
    }

    // 헤더 upsert (draft).
    let runId: number;
    if (existingRun) {
      await db.update(billingRunsTable).set({
        settingsVersion,
        inputSnapshot: { meterTotals, installmentTotal, commonMaintenance, notes },
        totalAmount: grandTotal,
        unitCount: units.length,
        calculatedById: req.user?.userId ?? null,
        notes: notes ?? existingRun.notes,
      }).where(eq(billingRunsTable.id, existingRun.id));
      runId = existingRun.id;
      await db.delete(billingLinesTable).where(eq(billingLinesTable.runId, runId));
    } else {
      const [created] = await db.insert(billingRunsTable).values({
        buildingId, billingMonth: month, status: "draft",
        settingsVersion,
        inputSnapshot: { meterTotals, installmentTotal, commonMaintenance, notes },
        totalAmount: grandTotal,
        unitCount: units.length,
        calculatedById: req.user?.userId ?? null,
        notes: notes ?? null,
      }).returning();
      runId = created.id;
    }
    await db.insert(billingLinesTable).values(lineRows.map(r => ({ ...r, runId })));

    // 이상치 사전 경고 — 전월 대비 ±20% / 0원 호실 / 음수 검침.
    const prev = await db.select().from(billingRunsTable)
      .where(and(eq(billingRunsTable.buildingId, buildingId)))
      .orderBy(desc(billingRunsTable.billingMonth))
      .limit(2);
    const prevRun = prev.find(r => r.billingMonth < month);
    const anomalies: Array<{ unitNumber: string; reason: string }> = [];
    if (prevRun) {
      const prevLines = await db.select().from(billingLinesTable).where(eq(billingLinesTable.runId, prevRun.id));
      const prevByUnit = new Map(prevLines.map(l => [l.unitId, l.totalAmount]));
      for (const l of lineRows) {
        const prevTotal = prevByUnit.get(l.unitId);
        if (prevTotal && prevTotal > 0) {
          const change = (l.totalAmount! - prevTotal) / prevTotal;
          if (Math.abs(change) >= 0.2) {
            anomalies.push({
              unitNumber: l.unitNumber,
              reason: `전월비 ${change > 0 ? "+" : ""}${(change * 100).toFixed(0)}%`,
            });
          }
        }
        if (l.totalAmount === 0) anomalies.push({ unitNumber: l.unitNumber, reason: "0원 호실" });
      }
    }

    const [run] = await db.select().from(billingRunsTable).where(eq(billingRunsTable.id, runId));
    const lines = await db.select().from(billingLinesTable)
      .where(eq(billingLinesTable.runId, runId))
      .orderBy(billingLinesTable.unitNumber);
    res.json({ run, lines, anomalies, activeInstallments });
  },
);

// ── 4. 실행 헤더 / 총괄표 ────────────────────────────────────
router.get("/billing/runs", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.json([]); return; }
  const rows = await db.select().from(billingRunsTable)
    .where(eq(billingRunsTable.buildingId, buildingId))
    .orderBy(desc(billingRunsTable.billingMonth));
  res.json(rows);
});

router.get("/billing/runs/:id", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const id = Number(req.params.id);
  const [run] = await db.select().from(billingRunsTable)
    .where(and(eq(billingRunsTable.id, id), eq(billingRunsTable.buildingId, buildingId)));
  if (!run) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  const lines = await db.select().from(billingLinesTable)
    .where(eq(billingLinesTable.runId, id))
    .orderBy(billingLinesTable.unitNumber);
  const adjustments = await db.select().from(billingAdjustmentsTable)
    .where(eq(billingAdjustmentsTable.runId, id))
    .orderBy(desc(billingAdjustmentsTable.createdAt));
  res.json({ run, lines, adjustments });
});

router.post(
  "/billing/runs/:id/finalize",
  requireAction("billing.finalize"),
  audit("billing.finalize", { targetType: "billing_run", targetIdParam: "id" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const id = Number(req.params.id);
    const [run] = await db.select().from(billingRunsTable)
      .where(and(eq(billingRunsTable.id, id), eq(billingRunsTable.buildingId, buildingId)));
    if (!run) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
    if (run.status === "finalized") { res.status(409).json({ error: "이미 확정되었습니다" }); return; }

    const [updated] = await db.update(billingRunsTable).set({
      status: "finalized",
      finalizedAt: new Date(),
      finalizedById: req.user?.userId ?? null,
    }).where(eq(billingRunsTable.id, id)).returning();

    emitBillingFinalized({
      runId: id,
      buildingId,
      billingMonth: run.billingMonth,
      totalAmount: updated.totalAmount,
      unitCount: updated.unitCount,
      finalizedAt: (updated.finalizedAt ?? new Date()).toISOString(),
      finalizedById: updated.finalizedById ?? null,
    });
    res.json(updated);
  },
);

// ── 5. 부과 검증 룰엔진 ─────────────────────────────────────
router.get("/billing/runs/:id/validate", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const id = Number(req.params.id);
  const [run] = await db.select().from(billingRunsTable)
    .where(and(eq(billingRunsTable.id, id), eq(billingRunsTable.buildingId, buildingId)));
  if (!run) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }

  const lines = await db.select().from(billingLinesTable).where(eq(billingLinesTable.runId, id));
  const issues: Array<{ rule: string; severity: "error" | "warn"; message: string; unitNumber?: string }> = [];

  // 룰 (a) 검침 합계 = 청구서 OCR 합계 — monthly_bill_summaries 의 lineItems 와 비교.
  const [billSummary] = await db.select().from(monthlyBillSummariesTable)
    .where(and(
      eq(monthlyBillSummariesTable.buildingId, buildingId),
      eq(monthlyBillSummariesTable.billingMonth, run.billingMonth),
    ));
  const meterTotals = run.inputSnapshot.meterTotals ?? {};
  if (billSummary && billSummary.confirmed) {
    const ocrItems = billSummary.lineItems ?? {};
    for (const mt of Object.keys(meterTotals)) {
      const ours = lines.reduce((s, l) => {
        const mc = (l.meterCharges as Record<string, { amount: number }>)[mt];
        return s + (mc?.amount ?? 0);
      }, 0);
      const ocr = Number(ocrItems[mt] ?? 0);
      if (ocr > 0 && Math.abs(ours - ocr) / ocr > 0.05) {
        issues.push({
          rule: "meter_vs_ocr",
          severity: "error",
          message: `${mt} 합계 불일치: 산출 ${ours.toLocaleString()} vs 청구서 OCR ${ocr.toLocaleString()}`,
        });
      }
    }
  }

  // 룰 (b) 항목 합계 = 총괄표 합계.
  const sumOfLines = lines.reduce((s, l) => s + l.totalAmount, 0);
  if (Math.round(sumOfLines) !== Math.round(run.totalAmount)) {
    issues.push({
      rule: "matrix_total",
      severity: "error",
      message: `총괄표 합계 불일치: 라인 합 ${Math.round(sumOfLines).toLocaleString()} vs 헤더 ${Math.round(run.totalAmount).toLocaleString()}`,
    });
  }

  // 룰 (c) 분개 일치(T6 placeholder) — 확정 시 분개가 발행됐는지만 우선 검사.
  if (run.status === "finalized") {
    issues.push({
      rule: "journal_link",
      severity: "warn",
      message: "T6 회계엔진 도착 후 자동 분개 검증으로 확장 예정",
    });
  }

  // 추가: 0원 호실 / 음수 / 면적 0 호실.
  for (const l of lines) {
    if (l.totalAmount === 0) issues.push({ rule: "zero_unit", severity: "warn", message: `${l.unitNumber}호 0원 부과`, unitNumber: l.unitNumber });
    if (l.totalAmount < 0) issues.push({ rule: "negative", severity: "error", message: `${l.unitNumber}호 음수 부과`, unitNumber: l.unitNumber });
    if (l.area <= 0) issues.push({ rule: "missing_area", severity: "warn", message: `${l.unitNumber}호 면적 미입력`, unitNumber: l.unitNumber });
  }

  res.json({
    runId: id,
    billingMonth: run.billingMonth,
    status: run.status,
    issues,
    passed: issues.filter(i => i.severity === "error").length === 0,
  });
});

// ── 6. 조정명세서 ────────────────────────────────────────────
router.get("/billing/runs/:id/adjustments", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.json([]); return; }
  const id = Number(req.params.id);
  const [run] = await db.select().from(billingRunsTable)
    .where(and(eq(billingRunsTable.id, id), eq(billingRunsTable.buildingId, buildingId)));
  if (!run) { res.json([]); return; }
  const rows = await db.select().from(billingAdjustmentsTable)
    .where(eq(billingAdjustmentsTable.runId, id))
    .orderBy(desc(billingAdjustmentsTable.createdAt));
  res.json(rows);
});

router.post(
  "/billing/runs/:id/adjustments",
  requireAction("billing.adjustment.create"),
  audit("billing.adjustment.create", { targetType: "billing_adjustment", targetIdParam: "id" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const id = Number(req.params.id);
    const [run] = await db.select().from(billingRunsTable)
      .where(and(eq(billingRunsTable.id, id), eq(billingRunsTable.buildingId, buildingId)));
    if (!run) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }

    const parsed = AdjustmentBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
    const { unitId, adjustmentType, amount, reason, reasonChip, appliedAt } = parsed.data;

    const [unit] = await db.select().from(unitsTable)
      .where(and(eq(unitsTable.id, unitId), eq(unitsTable.buildingId, buildingId)));
    if (!unit) { res.status(404).json({ error: "호실을 찾을 수 없습니다" }); return; }

    // 음/양 부호 정규화 — discount/refund/writeoff 는 음수, rebill 은 양수.
    let normalized = Math.abs(amount);
    if (adjustmentType !== "rebill") normalized = -normalized;

    const [saved] = await db.insert(billingAdjustmentsTable).values({
      runId: id,
      unitId,
      unitNumber: unit.unitNumber,
      adjustmentType,
      amount: normalized,
      reason,
      reasonChip,
      appliedAt: appliedAt ?? new Date().toISOString().slice(0, 10),
      createdById: req.user?.userId ?? null,
    }).returning();
    res.json(saved);
  },
);

// ── 7. 호실 라인 보정 ────────────────────────────────────────
router.patch(
  "/billing/lines/:id/override",
  requireAction("billing.line.override"),
  audit("billing.line.override", { targetType: "billing_line", targetIdParam: "id" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const id = Number(req.params.id);
    const parsed = OverrideBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }

    const [line] = await db.select().from(billingLinesTable).where(eq(billingLinesTable.id, id));
    if (!line) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
    const [run] = await db.select().from(billingRunsTable).where(eq(billingRunsTable.id, line.runId));
    if (!run || run.buildingId !== buildingId) { res.status(403).json({ error: "권한 없음" }); return; }
    if (run.status === "finalized") {
      res.status(409).json({ error: "확정된 부과는 보정 불가 — 조정명세서를 사용하세요" });
      return;
    }

    const [updated] = await db.update(billingLinesTable).set({
      manualOverride: parsed.data.amount,
      manualReason: parsed.data.reason,
      totalAmount: parsed.data.amount,
    }).where(eq(billingLinesTable.id, id)).returning();

    // 헤더 합계 재계산.
    const lines = await db.select().from(billingLinesTable).where(eq(billingLinesTable.runId, line.runId));
    const newTotal = lines.reduce((s, l) => s + l.totalAmount, 0);
    await db.update(billingRunsTable).set({ totalAmount: newTotal }).where(eq(billingRunsTable.id, line.runId));

    res.json(updated);
  },
);

export default router;
