import { eq, sum, and, isNull, sql } from "drizzle-orm";
import {
  db,
  creditLedgerTable,
  creditLedgerKinds,
  creditLedgerSources,
  vendorCreditWalletsTable,
  creditCategoryPricingTable,
  platformSettingsTable,
  quotesTable,
  type CreditLedger,
  type VendorCreditWallet,
} from "@workspace/db";

export const PREMIUM_AMOUNT_THRESHOLD_DEFAULT = 5_000_000;
export const PREMIUM_CREDIT_COST_DEFAULT = 10;
export const PREMIUM_SLOT_LIMIT_DEFAULT = 5;
export const LARGE_BUILDING_AREA_THRESHOLD_DEFAULT = 15000;
export const LARGE_BUILDING_MULTIPLIER_DEFAULT = 1.5;
export const REBATE_RATIO_DEFAULT = 0.1;
// [Task #226] 관리소장이 7일간 견적을 열람하지 않으면 차감의 60%를 환불한다.
export const NO_VIEW_REFUND_DAYS_DEFAULT = 7;
export const NO_VIEW_REFUND_RATIO_DEFAULT = 0.6;

// Back-compat exports (readers should prefer the async getters below)
export const PREMIUM_AMOUNT_THRESHOLD = PREMIUM_AMOUNT_THRESHOLD_DEFAULT;
export const PREMIUM_SLOT_LIMIT = PREMIUM_SLOT_LIMIT_DEFAULT;
export const REBATE_RATIO = REBATE_RATIO_DEFAULT;

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, key));
  return row?.value ?? null;
}

async function getNumberSetting(key: string, fallback: number): Promise<number> {
  const v = await getSetting(key);
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function getPremiumAmountThreshold(): Promise<number> {
  return getNumberSetting("premium_amount_threshold", PREMIUM_AMOUNT_THRESHOLD_DEFAULT);
}
export async function getPremiumCreditCost(): Promise<number> {
  return getNumberSetting("premium_credit_cost", PREMIUM_CREDIT_COST_DEFAULT);
}
export async function getPremiumSlotLimit(): Promise<number> {
  return getNumberSetting("premium_slot_limit", PREMIUM_SLOT_LIMIT_DEFAULT);
}
export async function getLargeBuildingAreaThreshold(): Promise<number> {
  return getNumberSetting("large_building_area_threshold", LARGE_BUILDING_AREA_THRESHOLD_DEFAULT);
}
export async function getLargeBuildingMultiplier(): Promise<number> {
  return getNumberSetting("large_building_multiplier", LARGE_BUILDING_MULTIPLIER_DEFAULT);
}
export async function getRebateRatio(): Promise<number> {
  return getNumberSetting("rebate_ratio", REBATE_RATIO_DEFAULT);
}
export async function getNoViewRefundDays(): Promise<number> {
  return getNumberSetting("no_view_refund_days", NO_VIEW_REFUND_DAYS_DEFAULT);
}
export async function getNoViewRefundRatio(): Promise<number> {
  return getNumberSetting("no_view_refund_ratio", NO_VIEW_REFUND_RATIO_DEFAULT);
}

export async function setSetting(key: string, value: string, description?: string | null): Promise<void> {
  const existing = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, key));
  if (existing.length > 0) {
    await db.update(platformSettingsTable).set({ value, description: description ?? existing[0].description }).where(eq(platformSettingsTable.key, key));
  } else {
    await db.insert(platformSettingsTable).values({ key, value, description: description ?? null });
  }
}

export async function isCreditsEnabled(): Promise<boolean> {
  const v = await getSetting("credits_enabled");
  return v !== "false";
}

export async function isAutoCommissionEnabled(): Promise<boolean> {
  const v = await getSetting("auto_commission_enabled");
  return v === "true";
}

type DbClient = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function getOrCreateWallet(vendorId: number, client: DbClient = db): Promise<VendorCreditWallet> {
  const [existing] = await client.select().from(vendorCreditWalletsTable).where(eq(vendorCreditWalletsTable.vendorId, vendorId));
  if (existing) return existing;
  const [created] = await client.insert(vendorCreditWalletsTable).values({ vendorId, balance: 0, pointsBalance: 0 }).returning();
  return created;
}

export interface CalcCreditCostInput {
  category: string;
  estimatedAmount?: number | null;
  buildingTotalArea?: number | null;
  buildingFireGrade?: number | null;
  isPremiumOverride?: boolean;
  // [Task #226] 지역(시도/시군구) 정보. 단가 fallback: 시군구→시도→기본.
  sido?: string | null;
  sigungu?: string | null;
}

export interface CreditCostBreakdown {
  baseCost: number;
  tier: number;
  largeBuildingMultiplier: number;
  isPremium: boolean;
  totalCost: number;
  reason: string[];
  // [Task #226] 적용된 단가 행 ID/스코프 (ledger memo용)
  pricingId?: number | null;
  pricingScope?: "sigungu" | "sido" | "default" | "fallback";
}

// [Task #226] (category, sido, sigungu) 조합으로 단가를 조회하되,
// 시군구 → 시도 → 기본(NULL/NULL) 순으로 fallback한다.
export async function lookupCategoryPricing(category: string, sido?: string | null, sigungu?: string | null) {
  if (sido && sigungu) {
    const [row] = await db
      .select()
      .from(creditCategoryPricingTable)
      .where(and(
        eq(creditCategoryPricingTable.category, category),
        eq(creditCategoryPricingTable.sido, sido),
        eq(creditCategoryPricingTable.sigungu, sigungu),
      ));
    if (row) return { row, scope: "sigungu" as const };
  }
  if (sido) {
    const [row] = await db
      .select()
      .from(creditCategoryPricingTable)
      .where(and(
        eq(creditCategoryPricingTable.category, category),
        eq(creditCategoryPricingTable.sido, sido),
        isNull(creditCategoryPricingTable.sigungu),
      ));
    if (row) return { row, scope: "sido" as const };
  }
  const [row] = await db
    .select()
    .from(creditCategoryPricingTable)
    .where(and(
      eq(creditCategoryPricingTable.category, category),
      isNull(creditCategoryPricingTable.sido),
      isNull(creditCategoryPricingTable.sigungu),
    ));
  if (row) return { row, scope: "default" as const };
  return { row: null, scope: "fallback" as const };
}

export async function computeCreditCost(input: CalcCreditCostInput): Promise<CreditCostBreakdown> {
  const reason: string[] = [];
  const lookup = await lookupCategoryPricing(input.category, input.sido, input.sigungu);
  const pricing = lookup.row;
  const baseCost = pricing?.creditCost ?? 1;
  const tier = pricing?.tier ?? 1;
  const scopeLabel =
    lookup.scope === "sigungu" ? `${input.sido} ${input.sigungu}` :
    lookup.scope === "sido" ? `${input.sido}` :
    lookup.scope === "default" ? "기본" : "기본(미설정)";
  reason.push(`카테고리(${input.category}) · ${scopeLabel} 기준 Tier ${tier} = ${baseCost} 크레딧`);

  const premiumThreshold = await getPremiumAmountThreshold();
  const premiumCost = await getPremiumCreditCost();
  const isPremium = Boolean(input.isPremiumOverride) || (input.estimatedAmount != null && input.estimatedAmount >= premiumThreshold);
  if (isPremium) {
    reason.push(`Premium 공고 = ${premiumCost} 크레딧 고정`);
    return {
      baseCost,
      tier,
      largeBuildingMultiplier: 1,
      isPremium: true,
      totalCost: premiumCost,
      reason,
      pricingId: pricing?.id ?? null,
      pricingScope: lookup.scope,
    };
  }

  const areaThreshold = await getLargeBuildingAreaThreshold();
  const largeMultiplier = await getLargeBuildingMultiplier();
  let multiplier = 1;
  const isLargeByArea = input.buildingTotalArea != null && input.buildingTotalArea >= areaThreshold;
  const isFireGrade1 = input.buildingFireGrade === 1;
  if (isLargeByArea || isFireGrade1) {
    multiplier = largeMultiplier;
    reason.push(
      isFireGrade1
        ? `1급 소방대상물 가중치 × ${largeMultiplier}`
        : `대규모 건물 가중치 × ${largeMultiplier}`,
    );
  }

  const totalCost = Math.ceil(baseCost * multiplier);
  return {
    baseCost,
    tier,
    largeBuildingMultiplier: multiplier,
    isPremium: false,
    totalCost,
    reason,
    pricingId: pricing?.id ?? null,
    pricingScope: lookup.scope,
  };
}

export async function recalcWalletBalance(vendorId: number, client: DbClient = db): Promise<void> {
  const [creditSum] = await client
    .select({ value: sum(creditLedgerTable.amount) })
    .from(creditLedgerTable)
    .where(eq(creditLedgerTable.vendorId, vendorId));
  const [pointsSum] = await client
    .select({ value: sum(creditLedgerTable.pointsAmount) })
    .from(creditLedgerTable)
    .where(eq(creditLedgerTable.vendorId, vendorId));
  const balance = Number(creditSum?.value ?? 0);
  const pointsBalance = Number(pointsSum?.value ?? 0);

  await getOrCreateWallet(vendorId, client);
  await client
    .update(vendorCreditWalletsTable)
    .set({ balance, pointsBalance })
    .where(eq(vendorCreditWalletsTable.vendorId, vendorId));
}

export interface PostLedgerInput {
  vendorId: number;
  amount: number;
  kind: typeof creditLedgerKinds[number];
  source?: typeof creditLedgerSources[number];
  pointsAmount?: number;
  rfqId?: number | null;
  quoteId?: number | null;
  relatedLedgerId?: number | null;
  notes?: string | null;
  actorId?: number | null;
  actorName?: string | null;
}

export async function postLedger(input: PostLedgerInput, client: DbClient = db): Promise<CreditLedger> {
  const [row] = await client
    .insert(creditLedgerTable)
    .values({
      vendorId: input.vendorId,
      amount: input.amount,
      kind: input.kind,
      source: input.source ?? "system",
      pointsAmount: input.pointsAmount ?? 0,
      rfqId: input.rfqId ?? null,
      quoteId: input.quoteId ?? null,
      relatedLedgerId: input.relatedLedgerId ?? null,
      notes: input.notes ?? null,
      actorId: input.actorId ?? null,
      actorName: input.actorName ?? null,
    })
    .returning();
  await recalcWalletBalance(input.vendorId, client);
  return row;
}

export async function countActivePremiumQuotes(rfqId: number): Promise<number> {
  const rows = await db
    .select({ id: quotesTable.id })
    .from(quotesTable)
    .where(eq(quotesTable.rfqId, rfqId));
  return rows.filter((r) => r !== null).length;
}

// [Task #226] 미열람 견적에 대한 부분 환불을 일괄 수행한다 (스케줄러용).
// 7일(설정값) 동안 관리소장이 견적을 열람하지 않으면, 견적 제출 시 차감된
// 크레딧의 60%(설정값)를 자동 환불한다. 이미 환불된 quote는 멱등 스킵.
export async function refundUnviewedQuotes(now: Date = new Date()): Promise<{ refundedCount: number; refundedAmount: number }> {
  // 베이스 스키마(quotes, platform_settings)가 마이그레이트되지 않은 환경에서는 no-op.
  const { rows } = (await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'quotes' AND column_name = 'first_viewed_at'
    ) AS exists
  `)) as unknown as { rows: Array<{ exists: boolean }> };
  if (!rows?.[0]?.exists) return { refundedCount: 0, refundedAmount: 0 };

  const days = await getNoViewRefundDays();
  const ratio = await getNoViewRefundRatio();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // [Task #226] 정책: "7일 이내 1회라도 열람"되면 환불 제외.
  // → firstViewedAt 가 null 인 견적뿐 아니라, 정책 기간이 지난 뒤에 처음 열람된
  //   견적도 환불 대상이다 (createdAt + days 일 이전에 열람됐는지로 판단).
  // 노출되는 후보를 좁히기 위해 noViewRefundedAt 만 SQL 단계에서 필터링하고,
  // 시점 비교는 자바스크립트에서 수행한다 (대규모 테이블이 되면 인덱스 + SQL 비교로 옮긴다).
  const candidates = await db
    .select()
    .from(quotesTable)
    .where(isNull(quotesTable.noViewRefundedAt));

  let refundedCount = 0;
  let refundedAmount = 0;

  for (const q of candidates) {
    if (!q.createdAt || q.createdAt > cutoff) continue;
    // 정책 기간 내에 한 번이라도 열람했다면 환불 제외.
    const policyWindowEnd = new Date(q.createdAt.getTime() + days * 24 * 60 * 60 * 1000);
    if (q.firstViewedAt && q.firstViewedAt <= policyWindowEnd) continue;
    const consumptions = await db
      .select()
      .from(creditLedgerTable)
      .where(and(
        eq(creditLedgerTable.quoteId, q.id),
        eq(creditLedgerTable.kind, "consumption"),
      ));
    let postedForThisQuote = 0;
    for (const row of consumptions) {
      const already = await db
        .select()
        .from(creditLedgerTable)
        .where(and(
          eq(creditLedgerTable.relatedLedgerId, row.id),
          eq(creditLedgerTable.kind, "refund"),
        ));
      if (already.length > 0) continue;
      const refundAbs = Math.ceil(Math.abs(row.amount) * ratio);
      if (refundAbs <= 0) continue;
      await postLedger({
        vendorId: row.vendorId,
        amount: refundAbs,
        kind: "refund",
        source: "refund",
        rfqId: row.rfqId,
        quoteId: row.quoteId,
        relatedLedgerId: row.id,
        notes: `미열람 환불 ${Math.round(ratio * 100)}% (${days}일 미열람) | consumptionLedgerId=${row.id}`,
        actorName: "system",
      });
      refundedAmount += refundAbs;
      postedForThisQuote += 1;
    }
    // 실제 환불 원장이 한 줄이라도 만들어진 경우에만 견적을 "환불됨"으로 표시한다.
    // 그렇지 않으면 UI 의 "미열람 환불" 배지가 환불이 없는데도 표시되어 파트너에게 혼란을 준다.
    if (postedForThisQuote > 0) {
      await db
        .update(quotesTable)
        .set({ noViewRefundedAt: now })
        .where(eq(quotesTable.id, q.id));
      refundedCount += 1;
    }
  }

  return { refundedCount, refundedAmount };
}

export async function refundRfqConsumption(rfqId: number, actorName: string, reason: string): Promise<void> {
  const consumptions = await db
    .select()
    .from(creditLedgerTable)
    .where(and(eq(creditLedgerTable.rfqId, rfqId), eq(creditLedgerTable.kind, "consumption")));

  for (const row of consumptions) {
    const already = await db
      .select()
      .from(creditLedgerTable)
      .where(and(eq(creditLedgerTable.relatedLedgerId, row.id), eq(creditLedgerTable.kind, "refund")));
    if (already.length > 0) continue;
    await postLedger({
      vendorId: row.vendorId,
      amount: -row.amount,
      kind: "refund",
      source: "refund",
      rfqId: row.rfqId,
      quoteId: row.quoteId,
      relatedLedgerId: row.id,
      notes: `환급: ${reason}`,
      actorName,
    });
  }
}
