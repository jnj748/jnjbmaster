import { eq, sum, and } from "drizzle-orm";
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
}

export interface CreditCostBreakdown {
  baseCost: number;
  tier: number;
  largeBuildingMultiplier: number;
  isPremium: boolean;
  totalCost: number;
  reason: string[];
}

export async function computeCreditCost(input: CalcCreditCostInput): Promise<CreditCostBreakdown> {
  const reason: string[] = [];
  const [pricing] = await db.select().from(creditCategoryPricingTable).where(eq(creditCategoryPricingTable.category, input.category));
  const baseCost = pricing?.creditCost ?? 1;
  const tier = pricing?.tier ?? 1;
  reason.push(`카테고리(${input.category}) Tier ${tier} = ${baseCost} 크레딧`);

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
