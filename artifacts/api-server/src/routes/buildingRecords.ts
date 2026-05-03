import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, gte, lte, sql, desc } from "drizzle-orm";
import {
  db,
  usersTable,
  unitsTable,
  buildingsTable,
  meterReadingsTable,
  monthlyBillSummariesTable,
  monthlyPaymentsTable,
  delinquencyActionsTable,
  settlementsTable,
  contractsTable,
  contractDocumentsTable,
  buildingMonthlyRecordsTable,
  buildingMonthlyRecordAuditsTable,
  type EnergySection,
  type EnergyEntry,
  type DiscountSection,
  type OneTimeChargeSection,
  type CollectionSection,
  type TransparencySection,
  type PartnerPayoutEntry,
  type EvidenceLinks,
  type EvidenceLink,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";
// [Task #773] 응대자료 저장은 매트릭스 기반 가드 + 감사로그.
import { audit, requireAction } from "../middlewares/audit";
import { canAccessBuilding as scopeCanAccessBuilding } from "../middlewares/buildingScope";

const router: IRouter = Router();
const READ_ROLES = ["manager", "platform_admin", "accountant", "hq_executive"] as const;
const WRITE_ROLES = ["manager", "platform_admin", "accountant"] as const;

router.use("/building-records", requireRole(...READ_ROLES));

// [Task #773] PUT /building-records 는 매트릭스의 building_record.upsert 액션이다.
//   기존 인라인 WRITE_ROLES 체크는 그대로 두고, 게이트와 감사 한 줄을 추가로 부착해
//   회귀 위험 없이 점진 마이그레이션한다.
router.put(
  "/building-records",
  requireAction("building_record.upsert"),
  audit("building_record.upsert", { targetType: "building_monthly_record" }),
);

async function getUserContext(req: Request): Promise<{ userId: number; role: string; buildingId: number | null } | null> {
  const userId = req.user?.userId;
  if (!userId) return null;
  const u = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  if (!u) return null;
  return { userId: u.id, role: u.role, buildingId: u.buildingId ?? null };
}

function isValidMonth(m: unknown): m is string {
  return typeof m === "string" && /^\d{4}-\d{2}$/.test(m);
}

function shiftMonth(month: string, deltaMonths: number): string {
  const [y, mo] = month.split("-").map(n => parseInt(n, 10));
  const d = new Date(Date.UTC(y, mo - 1 + deltaMonths, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthRange(month: string): { start: string; end: string } {
  const [y, mo] = month.split("-").map(n => parseInt(n, 10));
  const start = `${y}-${String(mo).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(y, mo, 0));
  const end = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, "0")}-${String(endDate.getUTCDate()).padStart(2, "0")}`;
  return { start, end };
}

const METER_UNITS: Record<string, string> = { electricity: "kWh", water: "㎥", heating: "Gcal", gas: "㎥" };
const TV_FEE_PER_HOUSEHOLD = 2500; // KBS 수신료 표준액. 50kWh 미만 가구는 면제 대상.
const TV_EXEMPT_THRESHOLD_KWH = 50;

async function aggregateEnergy(buildingId: number, month: string): Promise<EnergySection> {
  const { start, end } = monthRange(month);
  const rows = await db
    .select({
      type: meterReadingsTable.meterType,
      total: sql<number>`COALESCE(SUM(${meterReadingsTable.usage}::numeric), 0)`,
      unitCnt: sql<number>`COUNT(DISTINCT ${meterReadingsTable.unitId})`,
    })
    .from(meterReadingsTable)
    .where(and(
      eq(meterReadingsTable.buildingId, buildingId),
      gte(meterReadingsTable.readingDate, start),
      lte(meterReadingsTable.readingDate, end),
    ))
    .groupBy(meterReadingsTable.meterType);
  // 청구금액(고지서 OCR 합계)에서 항목별 금액 추출
  const summary = await db
    .select()
    .from(monthlyBillSummariesTable)
    .where(and(
      eq(monthlyBillSummariesTable.buildingId, buildingId),
      eq(monthlyBillSummariesTable.billingMonth, month),
    ))
    .then(r => r[0]);
  const items = (summary?.lineItems as Record<string, number> | undefined) ?? {};
  const make = (type: "electricity" | "water" | "heating" | "gas", row?: { total: number; unitCnt: number }): EnergyEntry | null => {
    const usage = row ? Number(row.total) || 0 : 0;
    const cnt = row ? Number(row.unitCnt) || 0 : 0;
    const amount = Math.round(items[type] ?? 0);
    if (usage === 0 && amount === 0) return null;
    return {
      usage,
      unit: METER_UNITS[type],
      amount,
      avgPerUnit: cnt > 0 ? Math.round((usage / cnt) * 100) / 100 : 0,
      basicCharge: items[`${type}_basic`] !== undefined ? Math.round(items[`${type}_basic`]) : undefined,
      usageCharge: items[`${type}_usage`] !== undefined ? Math.round(items[`${type}_usage`]) : undefined,
    };
  };
  const byType = new Map(rows.map(r => [r.type, { total: Number(r.total) || 0, unitCnt: Number(r.unitCnt) || 0 }]));
  return {
    electricity: make("electricity", byType.get("electricity")),
    water: make("water", byType.get("water")),
    heating: make("heating", byType.get("heating")),
    gas: make("gas", byType.get("gas")),
  };
}

async function aggregateAutoDiscounts(buildingId: number, month: string): Promise<DiscountSection> {
  // TV 수신료 면제 자동 추정: 가구별 전기 사용량 50kWh 미만 = 면제 대상.
  const { start, end } = monthRange(month);
  const rows = await db
    .select({
      unitId: meterReadingsTable.unitId,
      usage: sql<number>`COALESCE(SUM(${meterReadingsTable.usage}::numeric), 0)`,
    })
    .from(meterReadingsTable)
    .where(and(
      eq(meterReadingsTable.buildingId, buildingId),
      eq(meterReadingsTable.meterType, "electricity"),
      gte(meterReadingsTable.readingDate, start),
      lte(meterReadingsTable.readingDate, end),
    ))
    .groupBy(meterReadingsTable.unitId);
  let exemptCount = 0;
  for (const r of rows) {
    if (r.unitId !== null && Number(r.usage) < TV_EXEMPT_THRESHOLD_KWH) exemptCount += 1;
  }
  return {
    energyVoucher: null, // 외부(한전 명단) 연동 전까지 manualOverride.discounts 로 채움
    tvFeeExemption: exemptCount > 0 ? { count: exemptCount, amount: exemptCount * TV_FEE_PER_HOUSEHOLD } : null,
    socialDiscount: null,
    notes: null,
  };
}

async function aggregateOneTime(buildingId: number, month: string): Promise<OneTimeChargeSection> {
  // 일시·특수 부과 자동: monthlyBillSummaries 의 lineItems 에서 elevator 항목 등 가용한 값 흡수.
  const summary = await db
    .select()
    .from(monthlyBillSummariesTable)
    .where(and(
      eq(monthlyBillSummariesTable.buildingId, buildingId),
      eq(monthlyBillSummariesTable.billingMonth, month),
    ))
    .then(r => r[0]);
  const items = (summary?.lineItems as Record<string, number> | undefined) ?? {};
  const elevator = Math.round(items.elevator ?? 0);
  return {
    elevatorUsage: elevator > 0 ? { count: 0, amount: elevator } : null, // 건수는 수기 보정
    moveInOut: null,
    foodWaste: null,
    notes: null,
  };
}

async function aggregateCollection(buildingId: number, month: string): Promise<CollectionSection> {
  const unitIds = await db
    .select({ id: unitsTable.id })
    .from(unitsTable)
    .where(eq(unitsTable.buildingId, buildingId))
    .then(rows => rows.map(r => r.id));
  if (unitIds.length === 0) {
    return {
      billedAmount: 0, collectedAmount: 0, collectionRate: 0,
      overdueAmount: 0, overdueCount: 0,
      bankMatched: 0, bankUnmatched: 0,
      autoTransferCount: 0, autoTransferAmount: 0, lateFeeAmount: 0,
      matchExactCount: 0, matchExactAmount: 0,
      matchShortageCount: 0, matchShortageAmount: 0,
      matchOverCount: 0, matchOverAmount: 0,
      externalDepositMemo: null,
    };
  }
  const pays = await db
    .select()
    .from(monthlyPaymentsTable)
    .where(and(
      eq(monthlyPaymentsTable.billingMonth, month),
      sql`${monthlyPaymentsTable.unitId} IN (${sql.join(unitIds.map(id => sql`${id}`), sql`, `)})`,
    ));
  const today = new Date().toISOString().slice(0, 10);
  let billed = 0, collected = 0, overdueAmount = 0, overdueCount = 0;
  let autoCount = 0, autoAmount = 0;
  let mxC = 0, mxA = 0, msC = 0, msA = 0, moC = 0, moA = 0;
  for (const p of pays) {
    billed += p.totalAmount;
    collected += p.paidAmount;
    if (p.paidAt) { autoCount += 1; autoAmount += p.paidAmount; }
    if (!p.isPaid && p.dueDate && p.dueDate < today) {
      overdueAmount += (p.totalAmount - p.paidAmount);
      overdueCount += 1;
    }
    // 은행 매칭 일치/부족/초과 분리 (입금이 발생한 건만 분류)
    if (p.paidAmount > 0) {
      const diff = p.paidAmount - p.totalAmount;
      if (diff === 0) { mxC += 1; mxA += p.paidAmount; }
      else if (diff < 0) { msC += 1; msA += -diff; }
      else { moC += 1; moA += diff; }
    }
  }
  // 연체 가산금: delinquency_actions 중 actionDate 가 해당 월에 속하는 건의 totalOverdueAmount 의 1% (관리비 표준).
  const { start, end } = monthRange(month);
  const lateRows = await db
    .select({ amount: delinquencyActionsTable.totalOverdueAmount })
    .from(delinquencyActionsTable)
    .where(and(
      sql`${delinquencyActionsTable.unitId} IN (${sql.join(unitIds.map(id => sql`${id}`), sql`, `)})`,
      gte(delinquencyActionsTable.actionDate, new Date(start)),
      lte(delinquencyActionsTable.actionDate, new Date(end + "T23:59:59Z")),
    ));
  const lateFee = Math.round(lateRows.reduce((s, r) => s + (r.amount ?? 0) * 0.01, 0));

  const rate = billed > 0 ? Math.round((collected / billed) * 1000) / 10 : 0;
  return {
    billedAmount: Math.round(billed),
    collectedAmount: Math.round(collected),
    collectionRate: rate,
    overdueAmount: Math.round(overdueAmount),
    overdueCount,
    bankMatched: Math.round(autoAmount), // paidAt 보유 = 은행 자동이체 매칭으로 간주
    bankUnmatched: Math.round(collected - autoAmount),
    autoTransferCount: autoCount,
    autoTransferAmount: Math.round(autoAmount),
    lateFeeAmount: lateFee,
    matchExactCount: mxC, matchExactAmount: Math.round(mxA),
    matchShortageCount: msC, matchShortageAmount: Math.round(msA),
    matchOverCount: moC, matchOverAmount: Math.round(moA),
    externalDepositMemo: null,
  };
}

async function aggregateTransparency(buildingId: number, month: string): Promise<TransparencySection> {
  const summary = await db
    .select()
    .from(monthlyBillSummariesTable)
    .where(and(
      eq(monthlyBillSummariesTable.buildingId, buildingId),
      eq(monthlyBillSummariesTable.billingMonth, month),
    ))
    .then(r => r[0]);
  const items = (summary?.lineItems as Record<string, number> | undefined) ?? {};

  // 협력업체 정산 (settlements joined with contracts) — paidAt in month, contracts.buildingId match
  const { start, end } = monthRange(month);
  const payoutRows = await db
    .select({
      vendorName: settlementsTable.vendorName,
      amount: settlementsTable.paymentAmount,
    })
    .from(settlementsTable)
    .leftJoin(contractsTable, eq(contractsTable.id, settlementsTable.contractId))
    .where(and(
      eq(contractsTable.buildingId, buildingId),
      gte(settlementsTable.paidAt, start),
      lte(settlementsTable.paidAt, end),
    ));
  const grouped = new Map<string, number>();
  for (const r of payoutRows) {
    grouped.set(r.vendorName, (grouped.get(r.vendorName) ?? 0) + (r.amount ?? 0));
  }
  const partnerPayouts: PartnerPayoutEntry[] = Array.from(grouped.entries())
    .map(([vendorName, amount]) => ({ vendorName, amount: Math.round(amount) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 20);
  const partnerPayoutTotal = partnerPayouts.reduce((s, p) => s + p.amount, 0);

  // 협력업체 전자세금계산서 수신 건수 (해당 월 createdAt)
  const taxRows = await db
    .select({ id: contractDocumentsTable.id })
    .from(contractDocumentsTable)
    .leftJoin(contractsTable, eq(contractsTable.id, contractDocumentsTable.contractId))
    .where(and(
      eq(contractsTable.buildingId, buildingId),
      eq(contractDocumentsTable.docType, "tax_invoice"),
      gte(contractDocumentsTable.createdAt, new Date(start)),
      lte(contractDocumentsTable.createdAt, new Date(end + "T23:59:59Z")),
    ));

  return {
    cleaning: Math.round(items.cleaning ?? 0),
    disinfection: Math.round(items.disinfection ?? 0),
    maintenance: Math.round((items.elevator ?? 0) + (items.other ?? 0)),
    longTermRepairFund: Math.round(items.longTermRepairFund ?? 0),
    partnerPayoutTotal,
    partnerPayoutCount: partnerPayouts.length,
    partnerPayouts,
    taxInvoiceCount: taxRows.length,
    notes: null,
  };
}

type Snapshot = {
  energy: EnergySection;
  collection: CollectionSection;
  transparency: TransparencySection;
  discounts: DiscountSection;
  oneTimeCharges: OneTimeChargeSection;
};

async function computeAuto(buildingId: number, month: string): Promise<Snapshot> {
  const [energy, collection, transparency, discounts, oneTimeCharges] = await Promise.all([
    aggregateEnergy(buildingId, month),
    aggregateCollection(buildingId, month),
    aggregateTransparency(buildingId, month),
    aggregateAutoDiscounts(buildingId, month),
    aggregateOneTime(buildingId, month),
  ]);
  return { energy, collection, transparency, discounts, oneTimeCharges };
}

function mergeOverrides<T>(auto: T, override: Partial<T> | null | undefined): T {
  if (!override || typeof override !== "object") return auto;
  return { ...(auto as Record<string, unknown>), ...(override as Record<string, unknown>) } as T;
}

/**
 * 수기 보정 화이트리스트.
 * 자동 집계되는 수치 필드를 영구적으로 덮어쓰지 않도록, 운영자가 직접 입력해야 하는
 * 리프 필드만 허용한다. 그 외의 키는 무시한다.
 */
type ManualOverrides = {
  discounts?: {
    energyVoucher?: { count: number; amount: number } | null;
    tvFeeExemption?: { count: number; amount: number } | null;
    socialDiscount?: { count: number; amount: number } | null;
    notes?: string | null;
  };
  oneTimeCharges?: {
    elevatorUsage?: { count: number; amount: number } | null;
    moveInOut?: { count: number; amount: number } | null;
    foodWaste?: { weightKg: number; amount: number } | null;
    notes?: string | null;
  };
  collection?: { externalDepositMemo?: string | null };
  transparency?: { notes?: string | null };
};

function sanitizeOverrides(input: unknown): ManualOverrides {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const i = input as Record<string, unknown>;
  const out: ManualOverrides = {};
  const pickEntry = (v: unknown, keys: string[]): Record<string, unknown> | null | undefined => {
    if (v === null) return null;
    if (v === undefined) return undefined;
    if (typeof v !== "object" || Array.isArray(v)) return undefined;
    const r: Record<string, unknown> = {};
    for (const k of keys) if (typeof (v as Record<string, unknown>)[k] === "number") r[k] = (v as Record<string, unknown>)[k];
    return r;
  };
  if (i.discounts && typeof i.discounts === "object") {
    const d = i.discounts as Record<string, unknown>;
    out.discounts = {
      energyVoucher: pickEntry(d.energyVoucher, ["count", "amount"]) as { count: number; amount: number } | null | undefined,
      tvFeeExemption: pickEntry(d.tvFeeExemption, ["count", "amount"]) as { count: number; amount: number } | null | undefined,
      socialDiscount: pickEntry(d.socialDiscount, ["count", "amount"]) as { count: number; amount: number } | null | undefined,
      notes: typeof d.notes === "string" ? d.notes : d.notes === null ? null : undefined,
    };
  }
  if (i.oneTimeCharges && typeof i.oneTimeCharges === "object") {
    const o = i.oneTimeCharges as Record<string, unknown>;
    out.oneTimeCharges = {
      elevatorUsage: pickEntry(o.elevatorUsage, ["count", "amount"]) as { count: number; amount: number } | null | undefined,
      moveInOut: pickEntry(o.moveInOut, ["count", "amount"]) as { count: number; amount: number } | null | undefined,
      foodWaste: pickEntry(o.foodWaste, ["weightKg", "amount"]) as { weightKg: number; amount: number } | null | undefined,
      notes: typeof o.notes === "string" ? o.notes : o.notes === null ? null : undefined,
    };
  }
  if (i.collection && typeof i.collection === "object") {
    const c = i.collection as Record<string, unknown>;
    out.collection = {
      externalDepositMemo: typeof c.externalDepositMemo === "string" ? c.externalDepositMemo : c.externalDepositMemo === null ? null : undefined,
    };
  }
  if (i.transparency && typeof i.transparency === "object") {
    const t = i.transparency as Record<string, unknown>;
    out.transparency = {
      notes: typeof t.notes === "string" ? t.notes : t.notes === null ? null : undefined,
    };
  }
  return out;
}

function applyOverrides(auto: Snapshot, overrides: ManualOverrides): Snapshot {
  // 자동 수치는 그대로 두고, 화이트리스트 리프 필드만 덮어쓴다.
  const discounts: DiscountSection = { ...auto.discounts };
  if (overrides.discounts) {
    if (overrides.discounts.energyVoucher !== undefined) discounts.energyVoucher = overrides.discounts.energyVoucher;
    if (overrides.discounts.tvFeeExemption !== undefined) discounts.tvFeeExemption = overrides.discounts.tvFeeExemption;
    if (overrides.discounts.socialDiscount !== undefined) discounts.socialDiscount = overrides.discounts.socialDiscount;
    if (overrides.discounts.notes !== undefined) discounts.notes = overrides.discounts.notes;
  }
  const oneTimeCharges: OneTimeChargeSection = { ...auto.oneTimeCharges };
  if (overrides.oneTimeCharges) {
    if (overrides.oneTimeCharges.elevatorUsage !== undefined) oneTimeCharges.elevatorUsage = overrides.oneTimeCharges.elevatorUsage;
    if (overrides.oneTimeCharges.moveInOut !== undefined) oneTimeCharges.moveInOut = overrides.oneTimeCharges.moveInOut;
    if (overrides.oneTimeCharges.foodWaste !== undefined) oneTimeCharges.foodWaste = overrides.oneTimeCharges.foodWaste;
    if (overrides.oneTimeCharges.notes !== undefined) oneTimeCharges.notes = overrides.oneTimeCharges.notes;
  }
  const collection: CollectionSection = {
    ...auto.collection,
    externalDepositMemo: overrides.collection?.externalDepositMemo !== undefined
      ? overrides.collection.externalDepositMemo
      : auto.collection.externalDepositMemo,
  };
  const transparency: TransparencySection = {
    ...auto.transparency,
    notes: overrides.transparency?.notes !== undefined ? overrides.transparency.notes : auto.transparency.notes,
  };
  return { energy: auto.energy, discounts, oneTimeCharges, collection, transparency };
}

function maskForRole(role: string, snap: Snapshot): Snapshot {
  // hq_executive: 협력업체 정산 상세는 합계만 노출, 거래처별 명세는 마스킹.
  // 은행 자동이체/매칭 등 수납 디테일도 마스킹 처리.
  if (role !== "hq_executive") return snap;
  return {
    ...snap,
    collection: {
      ...snap.collection,
      bankMatched: 0,
      bankUnmatched: 0,
      autoTransferCount: 0,
      autoTransferAmount: 0,
    },
    transparency: {
      ...snap.transparency,
      partnerPayouts: [],
    },
  };
}

function buildSummary(
  building: { name: string | null },
  month: string,
  current: Snapshot,
  prevMoM: Snapshot | null,
  prevYoY: Snapshot | null,
): string {
  const lines: string[] = [];
  lines.push(`[${building.name ?? "본 건물"} · ${month} 관리비 안내 응대 자료]`);
  lines.push("");
  if (current.energy.electricity || current.energy.water || current.energy.heating) {
    const parts: string[] = [];
    if (current.energy.electricity) parts.push(`전기 ${Math.round(current.energy.electricity.usage).toLocaleString()}${current.energy.electricity.unit}`);
    if (current.energy.water) parts.push(`수도 ${Math.round(current.energy.water.usage).toLocaleString()}${current.energy.water.unit}`);
    if (current.energy.heating) parts.push(`난방 ${Math.round(current.energy.heating.usage).toLocaleString()}${current.energy.heating.unit}`);
    lines.push(`1) 사용량: ${parts.join(" · ")}`);
    if (prevMoM) {
      const deltaParts: string[] = [];
      const e1 = current.energy.electricity?.usage ?? 0; const e0 = prevMoM.energy.electricity?.usage ?? 0;
      if (e0) deltaParts.push(`전기 전월대비 ${Math.round(((e1 - e0) / e0) * 100)}%`);
      const w1 = current.energy.water?.usage ?? 0; const w0 = prevMoM.energy.water?.usage ?? 0;
      if (w0) deltaParts.push(`수도 ${Math.round(((w1 - w0) / w0) * 100)}%`);
      if (deltaParts.length) lines.push(`   · ${deltaParts.join(", ")}`);
    }
  }
  const d = current.discounts;
  if (d.energyVoucher || d.tvFeeExemption || d.socialDiscount) {
    const dp: string[] = [];
    if (d.energyVoucher) dp.push(`에너지바우처 ${d.energyVoucher.count}건/${d.energyVoucher.amount.toLocaleString()}원`);
    if (d.tvFeeExemption) dp.push(`TV수신료 면제 ${d.tvFeeExemption.count}건/${d.tvFeeExemption.amount.toLocaleString()}원`);
    if (d.socialDiscount) dp.push(`사회적 할인 ${d.socialDiscount.count}건/${d.socialDiscount.amount.toLocaleString()}원`);
    lines.push(`2) 감면·바우처: ${dp.join(" · ")}`);
  }
  const o = current.oneTimeCharges;
  if (o.elevatorUsage || o.moveInOut || o.foodWaste) {
    const op: string[] = [];
    if (o.elevatorUsage) op.push(`승강기 사용료 ${o.elevatorUsage.count}건/${o.elevatorUsage.amount.toLocaleString()}원`);
    if (o.moveInOut) op.push(`이사 정산 ${o.moveInOut.count}건/${o.moveInOut.amount.toLocaleString()}원`);
    if (o.foodWaste) op.push(`음식물 ${o.foodWaste.weightKg}kg/${o.foodWaste.amount.toLocaleString()}원`);
    lines.push(`3) 일시·특수 부과: ${op.join(" · ")}`);
  }
  const c = current.collection;
  lines.push(`4) 부과/수납: 부과 ${c.billedAmount.toLocaleString()}원 · 수납 ${c.collectedAmount.toLocaleString()}원 (수납률 ${c.collectionRate}%) · 자동이체 ${c.autoTransferCount}건 · 미납 ${c.overdueCount}건/${c.overdueAmount.toLocaleString()}원 · 연체 가산 ${c.lateFeeAmount.toLocaleString()}원`);
  lines.push(`   · 은행 매칭 일치 ${c.matchExactCount}건/${c.matchExactAmount.toLocaleString()}원, 부족 ${c.matchShortageCount}건/${c.matchShortageAmount.toLocaleString()}원, 초과 ${c.matchOverCount}건/${c.matchOverAmount.toLocaleString()}원`);
  if (c.externalDepositMemo) lines.push(`   · 외부 입금 메모: ${c.externalDepositMemo}`);
  const t = current.transparency;
  lines.push(`5) 공용관리비 사용처: 청소 ${t.cleaning.toLocaleString()}원 · 소독 ${t.disinfection.toLocaleString()}원 · 유지보수 ${t.maintenance.toLocaleString()}원 · 장기수선충당금 ${t.longTermRepairFund.toLocaleString()}원 · 협력업체 ${t.partnerPayoutCount}곳/${t.partnerPayoutTotal.toLocaleString()}원 · 전자세금계산서 ${t.taxInvoiceCount}건`);
  if (prevYoY) {
    const billedYoy = prevYoY.collection.billedAmount;
    if (billedYoy > 0) {
      const diff = Math.round(((c.billedAmount - billedYoy) / billedYoy) * 100);
      lines.push("");
      lines.push(`※ 전년 동월 대비 부과 총액 ${diff > 0 ? "+" : ""}${diff}%`);
    }
  }
  return lines.join("\n");
}

async function logAudit(
  recordId: number,
  buildingId: number,
  month: string,
  userId: number,
  role: string,
  action: "view" | "update" | "summary",
  changes: Record<string, unknown> | null,
): Promise<void> {
  try {
    await db.insert(buildingMonthlyRecordAuditsTable).values({
      recordId, buildingId, billingMonth: month, userId, userRole: role, action, changes,
    });
  } catch {
    // best-effort audit; do not block request
  }
}

async function loadOrCreate(buildingId: number, month: string) {
  const existing = await db
    .select()
    .from(buildingMonthlyRecordsTable)
    .where(and(
      eq(buildingMonthlyRecordsTable.buildingId, buildingId),
      eq(buildingMonthlyRecordsTable.billingMonth, month),
    ))
    .then(r => r[0]);
  if (existing) return existing;
  const inserted = await db
    .insert(buildingMonthlyRecordsTable)
    .values({ buildingId, billingMonth: month, manualOverrides: {} })
    .returning();
  return inserted[0];
}

/**
 * 월 단위로 최종 스냅샷(자동 + 수기 보정 적용)을 가져온다.
 * - 항상 최신 자동 집계를 다시 계산해 record 의 5개 컬럼을 갱신한다.
 * - manualOverrides 가 있으면 우선 적용해 비교/요약에 일관되게 반영된다.
 */
async function buildEvidenceLinks(buildingId: number, month: string): Promise<EvidenceLinks> {
  const summary = await db
    .select()
    .from(monthlyBillSummariesTable)
    .where(and(
      eq(monthlyBillSummariesTable.buildingId, buildingId),
      eq(monthlyBillSummariesTable.billingMonth, month),
    ))
    .then(r => r[0]);
  const energy: EvidenceLink[] = [];
  const transparency: EvidenceLink[] = [];
  if (summary?.sourceFileUrl) {
    energy.push({ label: `${month} 고지서(원본)`, href: summary.sourceFileUrl });
    transparency.push({ label: `${month} 고지서 사용처 내역`, href: summary.sourceFileUrl });
  }
  return {
    energy,
    transparency,
    collection: [{ label: "수납·미납 상세", href: `/erp/billing/payments?month=${month}` }],
    discounts: [{ label: "감면·바우처 가구별 상세", href: `/erp/billing/discounts?month=${month}` }],
    oneTimeCharges: [{ label: "일시·특수 부과 원장", href: `/erp/billing/one-time?month=${month}` }],
  };
}

async function getOrPersistSnapshot(buildingId: number, month: string): Promise<{ snapshot: Snapshot; recordId: number; evidenceLinks: EvidenceLinks }> {
  const record = await loadOrCreate(buildingId, month);
  const [auto, evidenceLinks] = await Promise.all([
    computeAuto(buildingId, month),
    buildEvidenceLinks(buildingId, month),
  ]);
  const overrides = sanitizeOverrides(record.manualOverrides ?? {});
  const merged = applyOverrides(auto, overrides);
  await db
    .update(buildingMonthlyRecordsTable)
    .set({
      energy: merged.energy,
      discounts: merged.discounts,
      oneTimeCharges: merged.oneTimeCharges,
      collection: merged.collection,
      transparency: merged.transparency,
      evidenceLinks,
    })
    .where(eq(buildingMonthlyRecordsTable.id, record.id));
  return { snapshot: merged, recordId: record.id, evidenceLinks };
}

/** 비교용: 저장된 스냅샷이 있으면 그것을 우선 사용하고, 없으면 신규 자동 집계. */
async function getComparisonSnapshot(buildingId: number, month: string): Promise<Snapshot> {
  const existing = await db
    .select()
    .from(buildingMonthlyRecordsTable)
    .where(and(
      eq(buildingMonthlyRecordsTable.buildingId, buildingId),
      eq(buildingMonthlyRecordsTable.billingMonth, month),
    ))
    .then(r => r[0]);
  if (existing && existing.energy && existing.collection && existing.transparency && existing.discounts && existing.oneTimeCharges) {
    return {
      energy: existing.energy,
      collection: existing.collection,
      transparency: existing.transparency,
      discounts: existing.discounts,
      oneTimeCharges: existing.oneTimeCharges,
    };
  }
  const auto = await computeAuto(buildingId, month);
  const overrides = sanitizeOverrides(existing?.manualOverrides ?? {});
  return applyOverrides(auto, overrides);
}

router.get("/building-records", async (req: Request, res: Response) => {
  const ctx = await getUserContext(req);
  if (!ctx) { res.status(401).json({ error: "Unauthorized" }); return; }
  const month = (req.query.month as string | undefined) ?? new Date().toISOString().slice(0, 7);
  if (!isValidMonth(month)) { res.status(400).json({ error: "month 형식 오류 (YYYY-MM)" }); return; }

  // [Task #596] platform_admin / hq_executive 는 ?buildingId 로 임의 건물 조회 가능
  //   (HQ 는 매핑된 건물 한도). 매니저/회계는 본인 ctx.buildingId 만.
  const queryBid = req.query.buildingId ? Number(req.query.buildingId) : null;
  let buildingId: number;
  if (ctx.role === "platform_admin" || ctx.role === "hq_executive") {
    if (queryBid == null) {
      res.status(400).json({ error: "buildingId 쿼리 파라미터가 필요합니다" }); return;
    }
    if (!(await scopeCanAccessBuilding(req, queryBid))) {
      res.status(403).json({ error: "해당 건물 접근 권한이 없습니다" }); return;
    }
    buildingId = queryBid;
  } else {
    if (!ctx.buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    buildingId = ctx.buildingId;
  }

  const building = await db.select().from(buildingsTable).where(eq(buildingsTable.id, buildingId)).then(r => r[0]);
  if (!building) { res.status(404).json({ error: "건물을 찾을 수 없습니다" }); return; }

  const { snapshot, recordId, evidenceLinks } = await getOrPersistSnapshot(buildingId, month);
  const prevMoMMonth = shiftMonth(month, -1);
  const prevYoYMonth = shiftMonth(month, -12);
  const [prevMoM, prevYoY] = await Promise.all([
    getComparisonSnapshot(buildingId, prevMoMMonth),
    getComparisonSnapshot(buildingId, prevYoYMonth),
  ]);

  const masked = maskForRole(ctx.role, snapshot);
  const maskedPrevMoM = maskForRole(ctx.role, prevMoM);
  const maskedPrevYoY = maskForRole(ctx.role, prevYoY);

  // 응대 요약 초안: 매 조회 시 최신 스냅샷·비교를 반영해 재생성.
  // - DB에는 운영자(manager) 기준 전체 초안을 저장(작성자 추적/감사용).
  // - 응답에는 항상 요청자 권한에 맞는 마스킹된 초안을 내려보낸다(권한 우회 방지).
  const fullDraft = buildSummary({ name: building.name }, month, snapshot, prevMoM, prevYoY);
  await db.update(buildingMonthlyRecordsTable).set({ summaryDraft: fullDraft }).where(eq(buildingMonthlyRecordsTable.id, recordId));
  const record = await db.select().from(buildingMonthlyRecordsTable).where(eq(buildingMonthlyRecordsTable.id, recordId)).then(r => r[0]);
  const maskedDraft = buildSummary({ name: building.name }, month, masked, maskedPrevMoM, maskedPrevYoY);

  await logAudit(recordId, buildingId, month, ctx.userId, ctx.role, "view", null);

  res.json({
    buildingId,
    buildingName: building.name,
    month,
    record: {
      id: recordId,
      summaryDraft: maskedDraft,
      lastEditedAt: record.lastEditedAt,
    },
    current: masked,
    previousMonth: { month: prevMoMMonth, snapshot: maskedPrevMoM },
    previousYear: { month: prevYoYMonth, snapshot: maskedPrevYoY },
    evidenceLinks,
    role: ctx.role,
    canEdit: (WRITE_ROLES as readonly string[]).includes(ctx.role),
  });
});

router.put("/building-records", async (req: Request, res: Response) => {
  const ctx = await getUserContext(req);
  if (!ctx?.buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  if (!(WRITE_ROLES as readonly string[]).includes(ctx.role)) {
    res.status(403).json({ error: "수정 권한이 없습니다" }); return;
  }
  const month = (req.query.month as string | undefined) ?? (req.body?.month as string | undefined);
  if (!isValidMonth(month)) { res.status(400).json({ error: "month 형식 오류 (YYYY-MM)" }); return; }
  const sanitized = sanitizeOverrides(req.body?.overrides);
  const record = await loadOrCreate(ctx.buildingId, month);
  // deep-merge per section so existing overrides for other sections are preserved.
  const prev = sanitizeOverrides(record.manualOverrides ?? {});
  const next: ManualOverrides = {
    discounts: { ...(prev.discounts ?? {}), ...(sanitized.discounts ?? {}) },
    oneTimeCharges: { ...(prev.oneTimeCharges ?? {}), ...(sanitized.oneTimeCharges ?? {}) },
    collection: { ...(prev.collection ?? {}), ...(sanitized.collection ?? {}) },
    transparency: { ...(prev.transparency ?? {}), ...(sanitized.transparency ?? {}) },
  };
  await db
    .update(buildingMonthlyRecordsTable)
    .set({
      manualOverrides: next,
      lastEditedById: ctx.userId,
      lastEditedAt: new Date(),
    })
    .where(eq(buildingMonthlyRecordsTable.id, record.id));

  // 보정 즉시 스냅샷 컬럼도 갱신해 다음 비교/요약이 일관되게 반영되도록 한다.
  await getOrPersistSnapshot(ctx.buildingId, month);

  await logAudit(record.id, ctx.buildingId, month, ctx.userId, ctx.role, "update", { keys: Object.keys(sanitized) });

  res.json({ ok: true });
});

router.post("/building-records/summary", async (req: Request, res: Response) => {
  const ctx = await getUserContext(req);
  if (!ctx?.buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  if (!(WRITE_ROLES as readonly string[]).includes(ctx.role)) {
    res.status(403).json({ error: "응대문 작성 권한이 없습니다" }); return;
  }
  const month = (req.query.month as string | undefined) ?? (req.body?.month as string | undefined);
  if (!isValidMonth(month)) { res.status(400).json({ error: "month 형식 오류 (YYYY-MM)" }); return; }

  const building = await db.select().from(buildingsTable).where(eq(buildingsTable.id, ctx.buildingId)).then(r => r[0]);
  if (!building) { res.status(404).json({ error: "건물을 찾을 수 없습니다" }); return; }

  const { snapshot, recordId } = await getOrPersistSnapshot(ctx.buildingId, month);
  const prevMoM = await getComparisonSnapshot(ctx.buildingId, shiftMonth(month, -1));
  const prevYoY = await getComparisonSnapshot(ctx.buildingId, shiftMonth(month, -12));
  // 작성자 본인 권한 기준 마스킹 적용한 스냅샷으로 초안을 생성·저장한다.
  const masked = maskForRole(ctx.role, snapshot);
  const maskedMoM = maskForRole(ctx.role, prevMoM);
  const maskedYoY = maskForRole(ctx.role, prevYoY);
  // DB에는 전체 초안 저장(작성 이력), 응답에는 마스킹된 초안.
  const fullSummary = buildSummary({ name: building.name }, month, snapshot, prevMoM, prevYoY);
  const responseSummary = buildSummary({ name: building.name }, month, masked, maskedMoM, maskedYoY);

  await db
    .update(buildingMonthlyRecordsTable)
    .set({ summaryDraft: fullSummary, lastEditedById: ctx.userId, lastEditedAt: new Date() })
    .where(eq(buildingMonthlyRecordsTable.id, recordId));

  await logAudit(recordId, ctx.buildingId, month, ctx.userId, ctx.role, "summary", null);

  res.json({ ok: true, summaryDraft: responseSummary });
});

router.get("/building-records/audits", async (req: Request, res: Response) => {
  const ctx = await getUserContext(req);
  if (!ctx?.buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const month = (req.query.month as string | undefined);
  const where = month && isValidMonth(month)
    ? and(eq(buildingMonthlyRecordAuditsTable.buildingId, ctx.buildingId), eq(buildingMonthlyRecordAuditsTable.billingMonth, month))
    : eq(buildingMonthlyRecordAuditsTable.buildingId, ctx.buildingId);
  const audits = await db
    .select()
    .from(buildingMonthlyRecordAuditsTable)
    .where(where)
    .orderBy(desc(buildingMonthlyRecordAuditsTable.createdAt))
    .limit(100);
  res.json(audits);
});

export default router;
