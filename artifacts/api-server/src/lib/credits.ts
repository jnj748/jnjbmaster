import { eq, sum, and, isNull, sql, inArray } from "drizzle-orm";
import {
  db,
  creditLedgerTable,
  creditLedgerKinds,
  creditLedgerSources,
  vendorCreditWalletsTable,
  creditCategoryPricingTable,
  platformSettingsTable,
  quotesTable,
  rfqsTable,
  usersTable,
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
// [Task #298] 프리미엄 할증율 기본값 — 카테고리 기본 단가 × (1 + 0.5) = 1.5배.
export const PREMIUM_SURCHARGE_RATIO_DEFAULT = 0.5;

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
// [Task #298] 공통 프리미엄 할증율(0~). 저장 단위는 ratio(0.5 = +50%) — 카테고리 단가 × (1 + ratio).
export async function getPremiumSurchargeRatio(): Promise<number> {
  return getNumberSetting("premium_surcharge_ratio", PREMIUM_SURCHARGE_RATIO_DEFAULT);
}

// [Task #298] 카테고리 기본 단가 행(sido/sigungu IS NULL)을 읽어 정책 오버라이드를 가져온다.
//   환불 일수/비율, 프리미엄 할증율은 카테고리 단위로만 오버라이드 가능 — 지역별 행은 단가만 갖는다.
export async function getCategoryPolicyOverride(category: string): Promise<{
  noViewRefundDays: number | null;
  noViewRefundRatio: number | null;
  premiumSurchargeRatio: number | null;
} | null> {
  const [row] = await db
    .select()
    .from(creditCategoryPricingTable)
    .where(and(
      eq(creditCategoryPricingTable.category, category),
      isNull(creditCategoryPricingTable.sido),
      isNull(creditCategoryPricingTable.sigungu),
    ));
  if (!row) return null;
  return {
    noViewRefundDays: row.noViewRefundDays ?? null,
    noViewRefundRatio: row.noViewRefundRatioPercent != null ? row.noViewRefundRatioPercent / 100 : null,
    premiumSurchargeRatio: row.premiumSurchargePercent != null ? row.premiumSurchargePercent / 100 : null,
  };
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
  const isPremium = Boolean(input.isPremiumOverride) || (input.estimatedAmount != null && input.estimatedAmount >= premiumThreshold);
  if (isPremium) {
    // [Task #298] 프리미엄 비용 = 카테고리 "기본(default)" 단가 × (1 + 할증율).
    //   요구사항 상 프리미엄은 지역별 단가의 영향을 받지 않고 카테고리 기본 단가를 기준으로 계산한다.
    //   카테고리 오버라이드(premiumSurchargePercent)가 있으면 우선, 없으면 공통 premium_surcharge_ratio.
    //   카테고리 기본 단가 행 자체가 없는 경우만 기존 고정 premium_credit_cost 로 fallback.
    const override = await getCategoryPolicyOverride(input.category);
    const surchargeRatio = override?.premiumSurchargeRatio ?? (await getPremiumSurchargeRatio());
    const defaultLookup = await lookupCategoryPricing(input.category, null, null);
    const defaultRow = defaultLookup.row;
    let totalCost: number;
    if (defaultRow) {
      const defaultBase = defaultRow.creditCost;
      totalCost = Math.ceil(defaultBase * (1 + surchargeRatio));
      reason.push(`Premium 공고 = 카테고리 기본 단가(${defaultBase}C) × (1 + ${Math.round(surchargeRatio * 100)}%) = ${totalCost} 크레딧`);
      return {
        baseCost: defaultBase,
        tier: defaultRow.tier,
        largeBuildingMultiplier: 1,
        isPremium: true,
        totalCost,
        reason,
        pricingId: defaultRow.id,
        pricingScope: "default",
      };
    }
    // 카테고리 기본 단가 행이 없으면 fallback (호환성 유지).
    const premiumCost = await getPremiumCreditCost();
    totalCost = premiumCost;
    reason.push(`Premium 공고 = ${premiumCost} 크레딧 고정 (카테고리 단가 미설정 fallback)`);
    return {
      baseCost,
      tier,
      largeBuildingMultiplier: 1,
      isPremium: true,
      totalCost,
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
export async function refundUnviewedQuotes(
  now: Date = new Date(),
  options: { quoteIds?: number[] } = {},
): Promise<{ refundedCount: number; refundedAmount: number }> {
  // 베이스 스키마(quotes, platform_settings)가 마이그레이트되지 않은 환경에서는 no-op.
  const { rows } = (await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'quotes' AND column_name = 'first_viewed_at'
    ) AS exists
  `)) as unknown as { rows: Array<{ exists: boolean }> };
  if (!rows?.[0]?.exists) return { refundedCount: 0, refundedAmount: 0 };

  const commonDays = await getNoViewRefundDays();
  const commonRatio = await getNoViewRefundRatio();
  // [Task #298] 카테고리 오버라이드까지 고려해 가장 긴 정책 기간을 cutoff 로 사용한다.
  //   (실제 일수는 quote별로 다시 계산)
  const overrideRows = await db
    .select({
      category: creditCategoryPricingTable.category,
      days: creditCategoryPricingTable.noViewRefundDays,
      ratioPercent: creditCategoryPricingTable.noViewRefundRatioPercent,
    })
    .from(creditCategoryPricingTable)
    .where(and(
      isNull(creditCategoryPricingTable.sido),
      isNull(creditCategoryPricingTable.sigungu),
    ));
  const overrideMap = new Map<string, { days: number | null; ratio: number | null }>();
  // [Task #298] 후보를 좁히는 prefilter 는 "가장 짧은 정책 기간" 으로 한다.
  //   가장 긴 기간을 쓰면, 짧은 정책에 해당하는 quote 가 가장 긴 기간이 지날 때까지
  //   환불에서 누락되어 정책이 깨진다. 실제 일수/비율 적용은 quote 별로 다시 계산.
  let minDays = commonDays;
  for (const row of overrideRows) {
    overrideMap.set(row.category, {
      days: row.days,
      ratio: row.ratioPercent != null ? row.ratioPercent / 100 : null,
    });
    if (row.days != null && row.days < minDays) minDays = row.days;
  }
  const cutoff = new Date(now.getTime() - minDays * 24 * 60 * 60 * 1000);

  // [Task #226] 정책: "7일 이내 1회라도 열람"되면 환불 제외.
  // → firstViewedAt 가 null 인 견적뿐 아니라, 정책 기간이 지난 뒤에 처음 열람된
  //   견적도 환불 대상이다 (createdAt + days 일 이전에 열람됐는지로 판단).
  // 노출되는 후보를 좁히기 위해 noViewRefundedAt 만 SQL 단계에서 필터링하고,
  // 시점 비교는 자바스크립트에서 수행한다 (대규모 테이블이 되면 인덱스 + SQL 비교로 옮긴다).
  // [scope] options.quoteIds 가 제공되면 해당 quote 만 후보로 한정 (회귀/테스트용).
  //   미제공 시 전체 스캔(스케줄러 기존 동작).
  const scopedIds = options.quoteIds;
  if (scopedIds && scopedIds.length === 0) return { refundedCount: 0, refundedAmount: 0 };
  const candidates = await db
    .select()
    .from(quotesTable)
    .where(
      scopedIds
        ? and(isNull(quotesTable.noViewRefundedAt), inArray(quotesTable.id, scopedIds))
        : isNull(quotesTable.noViewRefundedAt),
    );

  let refundedCount = 0;
  let refundedAmount = 0;

  for (const q of candidates) {
    if (!q.createdAt || q.createdAt > cutoff) continue;
    // [Task #298] quote 의 RFQ 카테고리에 오버라이드가 있으면 해당 일수/비율 사용, 없으면 공통값.
    let days = commonDays;
    let ratio = commonRatio;
    if (q.rfqId) {
      const [rfq] = await db.select({ category: rfqsTable.category }).from(rfqsTable).where(eq(rfqsTable.id, q.rfqId));
      if (rfq?.category) {
        const ov = overrideMap.get(rfq.category);
        if (ov?.days != null) days = ov.days;
        if (ov?.ratio != null) ratio = ov.ratio;
      }
    }
    // 카테고리별 정책 기간이 아직 지나지 않은 quote 는 본 라운드에서 제외.
    const quoteCutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    if (q.createdAt > quoteCutoff) continue;
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

// [Task #734] 가입 기본 크레딧/포인트 — platform_settings 의 두 키로 관리.
//   값이 미설정이면 0 으로 간주(=지급하지 않음).
export async function getSignupBonusCredits(): Promise<number> {
  return getNumberSetting("signup_bonus_credits", 0);
}
export async function getSignupBonusPoints(): Promise<number> {
  return getNumberSetting("signup_bonus_points", 0);
}

// [Task #734] 가입(=온보딩 완료, 본 코드베이스의 사실상 승인 시점) 자동 지급.
//   멱등성 보장 3중:
//     1) 응용 단계 — SELECT EXISTS 확인 후 INSERT 시도
//     2) DB 단계   — partial UNIQUE INDEX(credit_ledger_signup_bonus_unique_vendor)
//                    가 동일 vendor 의 두 번째 signup_bonus 행을 거부한다 (race-safe)
//     3) try/catch — DB 단계가 거부하면 unique violation(23505) 을 잡아 already=true 로 정리
//   호출자(트랜잭션 내부)는 client 를 넘겨 단일 트랜잭션 보장 가능.
export async function grantSignupBonusIfEligible(
  vendorId: number,
  actor: { actorId?: number | null; actorName?: string | null } = {},
  client: DbClient = db,
): Promise<{ granted: boolean; credits: number; points: number; alreadyGranted?: boolean }> {
  const credits = await getSignupBonusCredits();
  const points = await getSignupBonusPoints();
  if (credits <= 0 && points <= 0) {
    return { granted: false, credits: 0, points: 0 };
  }
  const existing = await client
    .select({ id: creditLedgerTable.id })
    .from(creditLedgerTable)
    .where(and(eq(creditLedgerTable.vendorId, vendorId), eq(creditLedgerTable.kind, "signup_bonus")));
  if (existing.length > 0) {
    return { granted: false, credits, points, alreadyGranted: true };
  }
  // 파트너 + 승인 활성인 user 가 연결된 vendor 만 지급. 다른 경우는 no-op.
  const linked = await client
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(
      eq(usersTable.vendorId, vendorId),
      eq(usersTable.role, "partner"),
      eq(usersTable.approvalStatus, "active"),
    ))
    .limit(1);
  if (linked.length === 0) {
    return { granted: false, credits, points };
  }
  await getOrCreateWallet(vendorId, client);
  try {
    await client.insert(creditLedgerTable).values({
      vendorId,
      amount: Math.max(0, Math.trunc(credits)),
      kind: "signup_bonus",
      source: "system",
      pointsAmount: Math.max(0, Math.trunc(points)),
      notes: `가입 기본 지급 (${credits}C${points > 0 ? ` + ${points}P` : ""})`,
      actorId: actor.actorId ?? null,
      actorName: actor.actorName ?? "system",
    });
  } catch (e: unknown) {
    // Postgres unique_violation = 23505. Drizzle 가 원본 pg 에러를 cause 로 감싸기도 하므로 양쪽 확인.
    const err = e as { code?: string; cause?: { code?: string } } | null;
    const code = err?.code ?? err?.cause?.code;
    if (code === "23505") {
      return { granted: false, credits, points, alreadyGranted: true };
    }
    throw e;
  }
  await recalcWalletBalance(vendorId, client);
  return { granted: true, credits, points };
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
