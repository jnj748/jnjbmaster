import { Router, type IRouter } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  vendorCreditWalletsTable,
  creditLedgerTable,
  creditCategoryPricingTable,
  vendorsTable,
  rfqsTable,
  buildingsTable,
  usersTable,
  quotesTable,
  platformSettingsTable,
  creditTopupPackagesTable,
  creditTopupOrdersTable,
  creditTopupOrderStatuses,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import {
  getOrCreateWallet,
  computeCreditCost,
  postLedger,
  isCreditsEnabled,
  getPremiumAmountThreshold,
  getPremiumSlotLimit,
  recalcWalletBalance,
} from "../lib/credits";

const router: IRouter = Router();
const hqOnly = requireRole("platform_admin", "hq_executive");
const partnerOrHq = requireRole("partner", "platform_admin", "hq_executive");
// [Task #298] 견적 유형(카테고리 × 프리미엄)별 크레딧 정책은 플랫폼 전용.
const platformAdminOnly = requireRole("platform_admin");

async function resolveVendorIdForUser(req: any): Promise<number | null> {
  if (req.user?.role === "partner") {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.userId));
    return u?.vendorId ?? null;
  }
  return null;
}

router.get("/credits/wallet", partnerOrHq, async (req, res): Promise<void> => {
  const vendorIdQuery = req.query.vendorId ? Number(req.query.vendorId) : null;
  const isPartner = req.user?.role === "partner";
  const partnerVendorId = isPartner ? await resolveVendorIdForUser(req) : null;
  const targetVendorId = isPartner ? partnerVendorId : vendorIdQuery;
  if (!targetVendorId) {
    res.status(400).json({ error: "vendorId가 필요합니다" });
    return;
  }
  if (isPartner && vendorIdQuery && vendorIdQuery !== partnerVendorId) {
    res.status(403).json({ error: "접근 권한이 없습니다" });
    return;
  }
  const wallet = await getOrCreateWallet(targetVendorId);
  const enabled = await isCreditsEnabled();
  res.json({ ...wallet, creditsEnabled: enabled });
});

router.get("/credits/ledger", partnerOrHq, async (req, res): Promise<void> => {
  const vendorIdQuery = req.query.vendorId ? Number(req.query.vendorId) : null;
  const isPartner = req.user?.role === "partner";
  const partnerVendorId = isPartner ? await resolveVendorIdForUser(req) : null;
  const targetVendorId = isPartner ? partnerVendorId : vendorIdQuery;
  if (!targetVendorId) {
    res.status(400).json({ error: "vendorId가 필요합니다" });
    return;
  }
  if (isPartner && vendorIdQuery && vendorIdQuery !== partnerVendorId) {
    res.status(403).json({ error: "접근 권한이 없습니다" });
    return;
  }
  const rows = await db
    .select()
    .from(creditLedgerTable)
    .where(eq(creditLedgerTable.vendorId, targetVendorId))
    .orderBy(desc(creditLedgerTable.createdAt))
    .limit(200);
  res.json(rows);
});

router.get("/credits/preview", partnerOrHq, async (req, res): Promise<void> => {
  const rfqId = req.query.rfqId ? Number(req.query.rfqId) : null;
  if (!rfqId) {
    res.status(400).json({ error: "rfqId가 필요합니다" });
    return;
  }
  const [rfq] = await db.select().from(rfqsTable).where(eq(rfqsTable.id, rfqId));
  if (!rfq) {
    res.status(404).json({ error: "RFQ를 찾을 수 없습니다" });
    return;
  }
  let totalArea: number | null = null;
  let fireGrade: number | null = null;
  if (rfq.buildingId) {
    const [b] = await db.select().from(buildingsTable).where(eq(buildingsTable.id, rfq.buildingId));
    totalArea = b?.totalArea ? Number(b.totalArea) : null;
    fireGrade = b?.fireGrade ?? null;
  }
  // [Task #226] 단가는 RFQ→건물의 시도/시군구 순으로 결정 (POST /quotes 와 동일).
  // 건물이 없는 RFQ 도 RFQ 자체의 시도/시군구를 사용해 미리보기와 실제 차감이
  // 일치하도록 한다.
  let regionSido: string | null = rfq.sido ?? null;
  let regionSigungu: string | null = rfq.sigungu ?? null;
  if ((!regionSido || !regionSigungu) && rfq.buildingId) {
    const [b] = await db.select().from(buildingsTable).where(eq(buildingsTable.id, rfq.buildingId));
    regionSido = regionSido ?? (b?.sido ?? null);
    regionSigungu = regionSigungu ?? (b?.sigungu ?? null);
  }
  const cost = await computeCreditCost({
    category: rfq.category,
    estimatedAmount: rfq.estimatedAmount,
    buildingTotalArea: totalArea,
    buildingFireGrade: fireGrade,
    isPremiumOverride: rfq.isPremium,
    sido: regionSido,
    sigungu: regionSigungu,
  });
  const premiumThreshold = await getPremiumAmountThreshold();
  const defaultSlotLimit = await getPremiumSlotLimit();
  const estAmt = rfq.estimatedAmount != null ? Number(rfq.estimatedAmount) : null;
  const isPremiumRfq = Boolean(rfq.isPremium) || (estAmt != null && estAmt >= premiumThreshold);
  const slotLimit = rfq.premiumSlotLimit ?? defaultSlotLimit;
  const occupied = isPremiumRfq
    ? (await db.select().from(quotesTable).where(eq(quotesTable.rfqId, rfqId))).length
    : 0;
  const slotsRemaining = isPremiumRfq ? Math.max(0, slotLimit - occupied) : null;
  const enabled = await isCreditsEnabled();
  res.json({ rfqId, ...cost, creditsEnabled: enabled, isPremiumRfq, slotLimit: isPremiumRfq ? slotLimit : null, slotsRemaining });
});

const AdjustBody = z.object({
  vendorId: z.number().int(),
  amount: z.number().int(),
  kind: z.enum(["manual_credit", "manual_debit", "adjustment", "package_purchase", "rebate", "bonus_points"]),
  pointsAmount: z.number().int().optional(),
  notes: z.string().min(1),
});

router.post("/credits/adjust", hqOnly, async (req, res): Promise<void> => {
  const parsed = AdjustBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, parsed.data.vendorId));
  if (!vendor) {
    res.status(404).json({ error: "업체를 찾을 수 없습니다" });
    return;
  }
  const actorId = req.user?.userId ?? null;
  const [actor] = actorId ? await db.select().from(usersTable).where(eq(usersTable.id, actorId)) : [];
  const ledger = await postLedger({
    vendorId: parsed.data.vendorId,
    amount: parsed.data.amount,
    kind: parsed.data.kind,
    source: parsed.data.kind === "package_purchase" ? "package_purchase" : "manual",
    pointsAmount: parsed.data.pointsAmount ?? 0,
    notes: parsed.data.notes,
    actorId,
    actorName: actor?.name ?? req.user?.email ?? null,
  });
  res.status(201).json(ledger);
});

// [Task #312] 플랫폼 — 파트너 크레딧 현황 대시보드.
//   기간(months) 동안의 충전(top-up)/소모(consumption)/환불(refund) 추이 + 카테고리별 소모/환불,
//   현재 지갑 누계, 최근 30일 미열람 환불 통계.
//   집계는 모두 read-only 이며, raw SQL 로 한 번에 그룹핑한다.
router.get("/credits/admin/dashboard", platformAdminOnly, async (req, res): Promise<void> => {
  const monthsRaw = Number(req.query.months ?? 12);
  const months = Number.isFinite(monthsRaw) ? Math.min(Math.max(Math.trunc(monthsRaw), 1), 36) : 12;
  // 월 키는 UTC 기준 'YYYY-MM' (대시보드 차트용 단순 라벨).
  const TOP_UP_KINDS = ["manual_credit", "package_purchase", "rebate", "adjustment"];

  // 1) 합계 KPI ─ 충전(양수만)/소모(절대값)/환불(양수만)
  const totalsRow = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN kind IN ('manual_credit','package_purchase','rebate','adjustment')
                         AND amount > 0 THEN amount END), 0)::int   AS top_up_amount,
      COALESCE(SUM(CASE WHEN kind = 'consumption' THEN ABS(amount) END), 0)::int  AS consumption_amount,
      COALESCE(SUM(CASE WHEN kind = 'refund' AND amount > 0
                         AND notes LIKE '미열람 환불%' THEN amount END), 0)::int AS refund_amount,
      COALESCE(SUM(CASE WHEN kind = 'refund' AND amount > 0
                         AND notes LIKE '미열람 환불%' THEN 1 END), 0)::int      AS refund_count
    FROM credit_ledger
  `);
  const t = (totalsRow.rows?.[0] ?? {}) as Record<string, unknown>;

  // 2) 지갑 잔액/포인트 합계
  const walletRow = await db.execute(sql`
    SELECT COALESCE(SUM(balance), 0)::int AS wallet_balance,
           COALESCE(SUM(points_balance), 0)::int AS wallet_points_balance
    FROM vendor_credit_wallets
  `);
  const w = (walletRow.rows?.[0] ?? {}) as Record<string, unknown>;

  // 3) 월별 충전/소모/환불 추이 (UTC 월 트렁크).
  //    GENERATE_SERIES 로 빈 월을 0 으로 채워 차트가 끊기지 않게 한다.
  const monthly = await db.execute(sql`
    WITH months AS (
      SELECT to_char(date_trunc('month', (now() AT TIME ZONE 'UTC') - (s || ' month')::interval), 'YYYY-MM') AS m
      FROM generate_series(0, ${months - 1}) s
    ),
    agg AS (
      SELECT to_char(date_trunc('month', created_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS m,
             COALESCE(SUM(CASE WHEN kind IN ('manual_credit','package_purchase','rebate','adjustment')
                                AND amount > 0 THEN amount END), 0)::int AS top_up,
             COALESCE(SUM(CASE WHEN kind = 'consumption' THEN ABS(amount) END), 0)::int AS consumption,
             COALESCE(SUM(CASE WHEN kind = 'refund' AND amount > 0
                                AND notes LIKE '미열람 환불%' THEN amount END), 0)::int AS refund,
             COALESCE(SUM(CASE WHEN kind = 'refund' AND amount > 0
                                AND notes LIKE '미열람 환불%' THEN 1 END), 0)::int     AS refund_count
      FROM credit_ledger
      WHERE created_at >= date_trunc('month', (now() AT TIME ZONE 'UTC') - ((${months} - 1) || ' month')::interval)
      GROUP BY 1
    )
    SELECT months.m AS month,
           COALESCE(agg.top_up, 0) AS top_up,
           COALESCE(agg.consumption, 0) AS consumption,
           COALESCE(agg.refund, 0) AS refund,
           COALESCE(agg.refund_count, 0) AS refund_count
    FROM months LEFT JOIN agg USING (m)
    ORDER BY months.m ASC
  `);
  const monthlyRows = (monthly.rows ?? []) as Array<Record<string, unknown>>;

  // 4) 카테고리(용역유형)별 소모/환불 — credit_ledger.rfq_id → rfqs.category JOIN.
  //    카테고리가 없는(null) 레저는 'unknown' 으로 묶는다.
  const cat = await db.execute(sql`
    SELECT COALESCE(r.category, 'unknown') AS category,
           COALESCE(SUM(CASE WHEN cl.kind = 'consumption' THEN ABS(cl.amount) END), 0)::int AS consumption,
           COALESCE(SUM(CASE WHEN cl.kind = 'refund' AND cl.amount > 0
                              AND cl.notes LIKE '미열람 환불%' THEN cl.amount END), 0)::int AS refund,
           COALESCE(SUM(CASE WHEN cl.kind = 'consumption' THEN 1 END), 0)::int             AS consumption_count,
           COALESCE(SUM(CASE WHEN cl.kind = 'refund' AND cl.amount > 0
                              AND cl.notes LIKE '미열람 환불%' THEN 1 END), 0)::int AS refund_count
    FROM credit_ledger cl
    LEFT JOIN rfqs r ON r.id = cl.rfq_id
    WHERE cl.kind IN ('consumption','refund')
    GROUP BY 1
    ORDER BY consumption DESC
  `);
  const catRows = (cat.rows ?? []) as Array<Record<string, unknown>>;

  // 5) 최근 30일 미열람 환불 통계.
  const last30 = await db.execute(sql`
    SELECT COALESCE(SUM(amount), 0)::int AS amount,
           COALESCE(SUM(CASE WHEN amount > 0 THEN 1 END), 0)::int AS count
    FROM credit_ledger
    WHERE kind = 'refund'
      AND amount > 0
      AND notes LIKE '미열람 환불%'
      AND created_at >= (now() - interval '30 days')
  `);
  const r30 = (last30.rows?.[0] ?? {}) as Record<string, unknown>;

  res.json({
    totals: {
      topUpAmount: Number(t.top_up_amount ?? 0),
      consumptionAmount: Number(t.consumption_amount ?? 0),
      refundAmount: Number(t.refund_amount ?? 0),
      refundCount: Number(t.refund_count ?? 0),
      walletBalance: Number(w.wallet_balance ?? 0),
      walletPointsBalance: Number(w.wallet_points_balance ?? 0),
    },
    monthly: monthlyRows.map((r) => ({
      month: String(r.month),
      topUp: Number(r.top_up ?? 0),
      consumption: Number(r.consumption ?? 0),
      refund: Number(r.refund ?? 0),
      refundCount: Number(r.refund_count ?? 0),
    })),
    byCategory: catRows.map((r) => ({
      category: String(r.category),
      consumption: Number(r.consumption ?? 0),
      refund: Number(r.refund ?? 0),
      consumptionCount: Number(r.consumption_count ?? 0),
      refundCount: Number(r.refund_count ?? 0),
    })),
    refundLast30d: {
      amount: Number(r30.amount ?? 0),
      count: Number(r30.count ?? 0),
    },
    months,
    topUpKinds: TOP_UP_KINDS,
  });
});

router.get("/credits/admin/wallets", hqOnly, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      wallet: vendorCreditWalletsTable,
      vendor: vendorsTable,
    })
    .from(vendorsTable)
    .leftJoin(vendorCreditWalletsTable, eq(vendorCreditWalletsTable.vendorId, vendorsTable.id));
  res.json(
    rows.map((r) => ({
      vendorId: r.vendor.id,
      vendorName: r.vendor.name,
      category: r.vendor.category,
      balance: r.wallet?.balance ?? 0,
      pointsBalance: r.wallet?.pointsBalance ?? 0,
      updatedAt: r.wallet?.updatedAt ?? null,
    }))
  );
});

router.get("/credits/category-pricing", partnerOrHq, async (_req, res): Promise<void> => {
  const rows = await db.select().from(creditCategoryPricingTable).orderBy(creditCategoryPricingTable.tier, creditCategoryPricingTable.category);
  res.json(rows);
});

const UpsertPricingBody = z.object({
  category: z.string().min(1),
  tier: z.number().int().min(1).max(3),
  creditCost: z.number().int().min(1),
  description: z.string().optional().nullable(),
  // [Task #226] sido/sigungu 가 함께 지정되면 지역별 단가, 둘 다 null 이면 기본 단가.
  sido: z.string().min(1).optional().nullable(),
  sigungu: z.string().min(1).optional().nullable(),
  // [Task #298] 카테고리 단위 정책 오버라이드. null = 공통값 사용. 기본 단가 행에서만 의미가 있다.
  noViewRefundDays: z.number().int().min(1).max(60).optional().nullable(),
  noViewRefundRatioPercent: z.number().int().min(0).max(100).optional().nullable(),
  premiumSurchargePercent: z.number().int().min(0).max(500).optional().nullable(),
});

router.put("/credits/category-pricing", hqOnly, async (req, res): Promise<void> => {
  const parsed = UpsertPricingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const sido = parsed.data.sido ?? null;
  const sigungu = parsed.data.sigungu ?? null;
  // sigungu만 있고 sido 없으면 거부 (단가 fallback 의미가 모호해짐).
  if (!sido && sigungu) {
    res.status(400).json({ error: "시군구 단가는 시도와 함께 지정해야 합니다" });
    return;
  }
  const matchRegion = and(
    eq(creditCategoryPricingTable.category, parsed.data.category),
    sido ? eq(creditCategoryPricingTable.sido, sido) : sql`${creditCategoryPricingTable.sido} IS NULL`,
    sigungu ? eq(creditCategoryPricingTable.sigungu, sigungu) : sql`${creditCategoryPricingTable.sigungu} IS NULL`,
  );
  // [Task #226] 누가 마지막으로 저장했는지 기록한다.
  const actorId = req.user?.userId ?? null;
  let actorName: string | null = null;
  if (actorId) {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, actorId));
    actorName = u?.name ?? req.user?.email ?? null;
  }
  // [Task #298] 카테고리 단위 정책 오버라이드 — 기본 단가 행(둘 다 NULL)에서만 의미가 있다.
  const isDefaultRow = !sido && !sigungu;
  const policyFields = isDefaultRow
    ? {
        noViewRefundDays: parsed.data.noViewRefundDays ?? null,
        noViewRefundRatioPercent: parsed.data.noViewRefundRatioPercent ?? null,
        premiumSurchargePercent: parsed.data.premiumSurchargePercent ?? null,
      }
    : {};
  const existing = await db.select().from(creditCategoryPricingTable).where(matchRegion);
  if (existing.length > 0) {
    const [updated] = await db
      .update(creditCategoryPricingTable)
      .set({ tier: parsed.data.tier, creditCost: parsed.data.creditCost, description: parsed.data.description ?? null, updatedBy: actorName, ...policyFields })
      .where(matchRegion)
      .returning();
    res.json(updated);
    return;
  }
  const [created] = await db.insert(creditCategoryPricingTable).values({
    category: parsed.data.category,
    tier: parsed.data.tier,
    creditCost: parsed.data.creditCost,
    description: parsed.data.description ?? null,
    sido,
    sigungu,
    updatedBy: actorName,
    ...policyFields,
  }).returning();
  res.status(201).json(created);
});

// [Task #226] 지역 단가 행 삭제. id 기반.
router.delete("/credits/category-pricing/:id", hqOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "잘못된 id" });
    return;
  }
  const [removed] = await db.delete(creditCategoryPricingTable).where(eq(creditCategoryPricingTable.id, id)).returning();
  if (!removed) {
    res.status(404).json({ error: "단가 행을 찾을 수 없습니다" });
    return;
  }
  res.json({ ok: true, removed });
});

// [Task #298] 견적 유형별 크레딧 정책 통합 관리 — 플랫폼 전용 엔드포인트.
//   GET: 공통 기본값(platform_settings) + 카테고리 기본 행(default-region) 정책을 한 번에 반환.
//   PUT: 한 카테고리의 기본 단가 행에 대한 정책 오버라이드 upsert.
const POLICY_KEYS = [
  "no_view_refund_days",
  "no_view_refund_ratio",
  "premium_surcharge_ratio",
  "premium_slot_limit",
  "premium_amount_threshold",
] as const;

// [Task #312] 카테고리 한글 표시명 — 모든 인증된 사용자가 조회 가능.
//   견적/파트너/시설기사/본사 화면에서 카테고리 라벨의 단일 출처(SoT) 로 사용한다.
//   기본 단가 행(sido/sigungu = NULL)에서 display_name_ko 를 읽어 map 으로 반환한다.
router.get("/categories/labels", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ category: creditCategoryPricingTable.category, displayNameKo: creditCategoryPricingTable.displayNameKo, updatedAt: creditCategoryPricingTable.updatedAt })
    .from(creditCategoryPricingTable)
    .where(and(
      sql`${creditCategoryPricingTable.sido} IS NULL`,
      sql`${creditCategoryPricingTable.sigungu} IS NULL`,
    ));
  const labels: Record<string, string> = {};
  for (const r of rows) {
    if (r.displayNameKo && r.displayNameKo.trim()) {
      labels[r.category] = r.displayNameKo;
    }
  }
  res.json({ labels });
});

router.get("/credits/quote-type-policies", platformAdminOnly, async (_req, res): Promise<void> => {
  const settings = await db.select().from(platformSettingsTable);
  const settingsMap = new Map(settings.map((s) => [s.key, s]));
  const common = POLICY_KEYS.map((key) => {
    const s = settingsMap.get(key);
    return {
      key,
      value: s?.value ?? null,
      description: s?.description ?? null,
      updatedAt: s?.updatedAt ? new Date(s.updatedAt as unknown as string).toISOString() : null,
      updatedBy: s?.updatedBy ?? null,
    };
  });
  // 기본 단가 행만 (sido/sigungu 모두 NULL).
  const rows = await db
    .select()
    .from(creditCategoryPricingTable)
    .where(and(
      sql`${creditCategoryPricingTable.sido} IS NULL`,
      sql`${creditCategoryPricingTable.sigungu} IS NULL`,
    ))
    .orderBy(creditCategoryPricingTable.category);
  res.json({ common, categories: rows });
});

const UpsertQuoteTypePolicyBody = z.object({
  category: z.string().min(1),
  creditCost: z.number().int().min(1),
  noViewRefundDays: z.number().int().min(1).max(60).nullable().optional(),
  noViewRefundRatioPercent: z.number().int().min(0).max(100).nullable().optional(),
  premiumSurchargePercent: z.number().int().min(0).max(500).nullable().optional(),
  // [Task #312] 카테고리 한글 표시명. 빈 문자열은 null 로 정규화한다.
  displayNameKo: z.string().trim().min(1).max(60).nullable().optional(),
});

router.put("/credits/quote-type-policies/category", platformAdminOnly, async (req, res): Promise<void> => {
  const parsed = UpsertQuoteTypePolicyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "잘못된 요청", details: parsed.error.flatten() });
    return;
  }
  const actorId = req.user?.userId ? Number(req.user.userId) : null;
  let actorName: string | null = req.user?.email ?? null;
  if (actorId) {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, actorId));
    actorName = u?.name ?? req.user?.email ?? null;
  }
  const matchDefault = and(
    eq(creditCategoryPricingTable.category, parsed.data.category),
    sql`${creditCategoryPricingTable.sido} IS NULL`,
    sql`${creditCategoryPricingTable.sigungu} IS NULL`,
  );
  const existing = await db.select().from(creditCategoryPricingTable).where(matchDefault);
  const setValues = {
    creditCost: parsed.data.creditCost,
    noViewRefundDays: parsed.data.noViewRefundDays ?? null,
    noViewRefundRatioPercent: parsed.data.noViewRefundRatioPercent ?? null,
    premiumSurchargePercent: parsed.data.premiumSurchargePercent ?? null,
    // [Task #312] displayNameKo 가 명시적으로 전달된 경우에만 갱신한다 (undefined 면 기존값 유지).
    ...(parsed.data.displayNameKo !== undefined ? { displayNameKo: parsed.data.displayNameKo } : {}),
    updatedBy: actorName,
  };
  if (existing.length > 0) {
    const [updated] = await db
      .update(creditCategoryPricingTable)
      .set(setValues)
      .where(matchDefault)
      .returning();
    res.json(updated);
    return;
  }
  // 기본 단가 행이 아직 없으면 새로 만든다 (tier 기본 1).
  const [created] = await db
    .insert(creditCategoryPricingTable)
    .values({
      category: parsed.data.category,
      tier: 1,
      sido: null,
      sigungu: null,
      ...setValues,
    })
    .returning();
  res.status(201).json(created);
});

// ============================================================
// [Task #319] 파트너 크레딧 충전결제 (TossPayments)
// ============================================================
// 흐름: 1) POST /credits/topup/orders → pending order 생성 + tossOrderId 반환
//       2) 클라이언트에서 토스 결제창 → success URL 콜백
//       3) POST /credits/topup/orders/:id/confirm (paymentKey, amount) → 토스 confirm 호출
//          → 금액 검증 + DB 트랜잭션으로 paid 전환 + postLedger(package_purchase / bonus_points)
//       4) 결제 실패 시 POST /credits/topup/orders/:id/fail
// 멱등성: tossOrderId UNIQUE + paid 상태 재confirm 호출 시 기존 결과를 그대로 반환.
// 테스트키 fallback: 환경변수 TOSS_SECRET_KEY 가 없으면 토스 공식 테스트 시크릿 사용.
const TOSS_TEST_SECRET_KEY = "test_sk_DpexMgkW36vG40RNKDrwGbR5ozO0";
const TOSS_TEST_CLIENT_KEY = "test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq";
const TOSS_CONFIRM_URL = "https://api.tosspayments.com/v1/payments/confirm";

function tossSecretKey(): string {
  return process.env.TOSS_SECRET_KEY ?? TOSS_TEST_SECRET_KEY;
}
function tossClientKey(): string {
  return process.env.TOSS_CLIENT_KEY ?? TOSS_TEST_CLIENT_KEY;
}

// 파트너 본인 vendorId 만 허용 (admin은 별도 admin 라우트 사용).
async function requirePartnerVendorId(req: any, res: any): Promise<number | null> {
  if (req.user?.role !== "partner") {
    res.status(403).json({ error: "파트너만 사용 가능합니다" });
    return null;
  }
  const vid = await resolveVendorIdForUser(req);
  if (!vid) {
    res.status(400).json({ error: "연결된 업체가 없습니다" });
    return null;
  }
  return vid;
}

// ── 파트너용 패키지 목록 (활성만) ─────────────────────────────
//   파트너 전용 (요구사항: 결제 메뉴는 파트너 역할만 사용).
router.get("/credits/topup/packages", async (req, res): Promise<void> => {
  const vendorId = await requirePartnerVendorId(req, res);
  if (!vendorId) return;
  const rows = await db
    .select()
    .from(creditTopupPackagesTable)
    .where(eq(creditTopupPackagesTable.isActive, true))
    .orderBy(creditTopupPackagesTable.sortOrder, creditTopupPackagesTable.id);
  res.json({ packages: rows, tossClientKey: tossClientKey() });
});

// ── 주문 생성 ─────────────────────────────────────────────
const CreateOrderBody = z.object({
  packageId: z.number().int(),
});
router.post("/credits/topup/orders", async (req, res): Promise<void> => {
  const vendorId = await requirePartnerVendorId(req, res);
  if (!vendorId) return;
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [pkg] = await db.select().from(creditTopupPackagesTable).where(eq(creditTopupPackagesTable.id, parsed.data.packageId));
  if (!pkg || !pkg.isActive) {
    res.status(404).json({ error: "패키지를 찾을 수 없습니다" });
    return;
  }
  // 토스 orderId: 영문/숫자 6~64자. 'topup_<vendorId>_<timestamp>_<rand>' 형식.
  const tossOrderId = `topup_${vendorId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const [created] = await db.insert(creditTopupOrdersTable).values({
    vendorId,
    userId: req.user?.userId ?? null,
    packageId: pkg.id,
    packageName: pkg.name,
    credits: pkg.credits,
    bonusPoints: pkg.bonusPoints,
    amountKrw: pkg.priceKrw,
    status: "pending",
    tossOrderId,
  }).returning();
  res.status(201).json({
    order: created,
    tossClientKey: tossClientKey(),
  });
});

// ── 주문 confirm (토스 paymentKey 수신 → 서버에서 확정) ─────
const ConfirmOrderBody = z.object({
  paymentKey: z.string().min(1),
  amount: z.number().int().min(1),
});
router.post("/credits/topup/orders/:id/confirm", async (req, res): Promise<void> => {
  const vendorId = await requirePartnerVendorId(req, res);
  if (!vendorId) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "잘못된 주문 id" });
    return;
  }
  const parsed = ConfirmOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // [동시성 — 결제 손실 방지]
  //   토스 confirm 호출 *전에* pending → processing 으로 단일 점유(claim)한다.
  //   동시에 들어온 두 번째 confirm 은 0건 영향 → 이 요청은 토스 호출조차 하지 않고
  //   기존 주문 상태(paid/processing/failed)를 그대로 반환한다.
  //   이렇게 하면 “이긴 요청이 토스 성공 → 진 요청이 fail UPDATE 로 덮어써서 ledger 누락”
  //   같은 시나리오를 원천 차단한다 (진 요청은 status='pending' 가 아니므로 0건).
  const [precheck] = await db.select().from(creditTopupOrdersTable).where(eq(creditTopupOrdersTable.id, id));
  if (!precheck || precheck.vendorId !== vendorId) {
    res.status(404).json({ error: "주문을 찾을 수 없습니다" });
    return;
  }
  if (precheck.status === "paid") {
    res.json({ order: precheck, alreadyPaid: true });
    return;
  }
  if (precheck.amountKrw !== parsed.data.amount) {
    res.status(400).json({ error: "결제 금액이 주문 금액과 일치하지 않습니다" });
    return;
  }
  const [claimedOrder] = await db
    .update(creditTopupOrdersTable)
    .set({ status: "processing", tossPaymentKey: parsed.data.paymentKey })
    .where(and(eq(creditTopupOrdersTable.id, id), eq(creditTopupOrdersTable.status, "pending")))
    .returning();
  if (!claimedOrder) {
    // 이미 다른 요청이 점유했거나 종료(paid/failed/cancelled) 상태.
    const [latest] = await db.select().from(creditTopupOrdersTable).where(eq(creditTopupOrdersTable.id, id));
    if (latest?.status === "paid") {
      res.json({ order: latest, alreadyPaid: true });
      return;
    }
    if (latest?.status === "processing") {
      res.status(409).json({ error: "동일 주문이 처리 중입니다. 잠시 후 다시 시도하세요." });
      return;
    }
    res.status(409).json({ error: `결제가 ${latest?.status ?? "unknown"} 상태입니다` });
    return;
  }
  const order = claimedOrder;

  // 토스 confirm 호출. 이 시점부터는 이 요청만이 paid/failed 결말을 낼 수 있다
  // (다른 요청은 status='pending' 매칭 실패로 들어오지 못함).
  const auth = "Basic " + Buffer.from(`${tossSecretKey()}:`).toString("base64");
  const tossRes = await fetch(TOSS_CONFIRM_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: auth,
    },
    body: JSON.stringify({
      paymentKey: parsed.data.paymentKey,
      orderId: order.tossOrderId,
      amount: parsed.data.amount,
    }),
  });
  const tossJson: any = await tossRes.json().catch(() => ({}));
  if (!tossRes.ok) {
    const reason = tossJson?.message ?? `HTTP ${tossRes.status}`;
    // 점유한 본 요청만 processing → failed 로 마무리.
    await db
      .update(creditTopupOrdersTable)
      .set({ status: "failed", failReason: String(reason).slice(0, 500) })
      .where(and(eq(creditTopupOrdersTable.id, id), eq(creditTopupOrdersTable.status, "processing")));
    res.status(400).json({ error: "토스 결제 확정 실패", reason });
    return;
  }
  // 응답 금액 검증.
  if (Number(tossJson.totalAmount) !== order.amountKrw) {
    await db
      .update(creditTopupOrdersTable)
      .set({ status: "failed", failReason: "금액 불일치" })
      .where(and(eq(creditTopupOrdersTable.id, id), eq(creditTopupOrdersTable.status, "processing")));
    res.status(400).json({ error: "토스 응답 금액이 주문과 다릅니다" });
    return;
  }

  // DB 트랜잭션 안에서 ledger 기록 + 주문 paid 처리.
  const [actor] = req.user?.userId
    ? await db.select().from(usersTable).where(eq(usersTable.id, req.user.userId))
    : [];
  const actorName = actor?.name ?? req.user?.email ?? null;

  const result = await db.transaction(async (tx) => {
    // processing → paid 전환. 본 요청만 점유 중이므로 항상 성공해야 정상.
    const [claimed] = await tx
      .update(creditTopupOrdersTable)
      .set({
        status: "paid",
        tossMethod: typeof tossJson?.method === "string" ? tossJson.method : null,
        paidAt: new Date(),
      })
      .where(and(eq(creditTopupOrdersTable.id, id), eq(creditTopupOrdersTable.status, "processing")))
      .returning();
    if (!claimed) {
      // 운영자가 강제로 상태를 바꿨거나 동시 confirm 의 잔여 가능성. 안전한 쪽으로 idempotent 응답.
      const [existing] = await tx.select().from(creditTopupOrdersTable).where(eq(creditTopupOrdersTable.id, id));
      return { order: existing ?? order, alreadyPaid: true as const };
    }
    // ledger: 크레딧 충전.
    await getOrCreateWallet(order.vendorId, tx);
    const [creditRow] = await tx.insert(creditLedgerTable).values({
      vendorId: order.vendorId,
      amount: order.credits,
      kind: "package_purchase",
      source: "package_purchase",
      pointsAmount: 0,
      notes: `${order.packageName} 결제 (토스, 주문 ${order.tossOrderId})`,
      actorId: req.user?.userId ?? null,
      actorName,
    }).returning();
    let bonusRowId: number | null = null;
    if (order.bonusPoints > 0) {
      const [bonusRow] = await tx.insert(creditLedgerTable).values({
        vendorId: order.vendorId,
        amount: 0,
        kind: "bonus_points",
        source: "package_purchase",
        pointsAmount: order.bonusPoints,
        notes: `${order.packageName} 보너스 포인트`,
        actorId: req.user?.userId ?? null,
        actorName,
      }).returning();
      bonusRowId = bonusRow.id;
    }
    // wallet 재계산.
    await recalcWalletBalance(order.vendorId, tx);
    // ledger id 를 주문에 역참조로 저장 (감사 로그용).
    const [updated] = await tx
      .update(creditTopupOrdersTable)
      .set({ ledgerCreditId: creditRow.id, ledgerBonusId: bonusRowId })
      .where(eq(creditTopupOrdersTable.id, id))
      .returning();
    return { order: updated ?? claimed, alreadyPaid: false as const };
  });

  res.json(result);
});

// ── 주문 실패/취소 기록 (사용자 결제창 닫기 등) ───────────
const FailOrderBody = z.object({
  reason: z.string().optional(),
  cancelled: z.boolean().optional(),
});
router.post("/credits/topup/orders/:id/fail", async (req, res): Promise<void> => {
  const vendorId = await requirePartnerVendorId(req, res);
  if (!vendorId) return;
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "잘못된 주문 id" });
    return;
  }
  const parsed = FailOrderBody.safeParse(req.body);
  const [order] = await db.select().from(creditTopupOrdersTable).where(eq(creditTopupOrdersTable.id, id));
  if (!order || order.vendorId !== vendorId) {
    res.status(404).json({ error: "주문을 찾을 수 없습니다" });
    return;
  }
  if (order.status !== "pending") {
    res.json({ order });
    return;
  }
  const status = parsed.success && parsed.data.cancelled ? "cancelled" : "failed";
  const [updated] = await db
    .update(creditTopupOrdersTable)
    .set({ status, failReason: parsed.success ? (parsed.data.reason ?? null) : null })
    .where(eq(creditTopupOrdersTable.id, id))
    .returning();
  res.json({ order: updated });
});

// ── 파트너 본인의 충전 내역 ────────────────────────────────
router.get("/credits/topup/orders", async (req, res): Promise<void> => {
  const vendorId = await requirePartnerVendorId(req, res);
  if (!vendorId) return;
  const rows = await db
    .select()
    .from(creditTopupOrdersTable)
    .where(eq(creditTopupOrdersTable.vendorId, vendorId))
    .orderBy(desc(creditTopupOrdersTable.createdAt))
    .limit(100);
  res.json(rows);
});

// ── 관리자: 패키지 CRUD ──────────────────────────────────
router.get("/credits/admin/topup-packages", platformAdminOnly, async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(creditTopupPackagesTable)
    .orderBy(creditTopupPackagesTable.sortOrder, creditTopupPackagesTable.id);
  res.json(rows);
});

const TopupPackageBody = z.object({
  name: z.string().min(1).max(60),
  credits: z.number().int().min(1),
  priceKrw: z.number().int().min(100),
  bonusPoints: z.number().int().min(0).default(0),
  highlight: z.string().max(20).nullable().optional(),
  sortOrder: z.number().int().default(100),
  isActive: z.boolean().default(true),
});

router.post("/credits/admin/topup-packages", platformAdminOnly, async (req, res): Promise<void> => {
  const parsed = TopupPackageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db.insert(creditTopupPackagesTable).values({
    name: parsed.data.name,
    credits: parsed.data.credits,
    priceKrw: parsed.data.priceKrw,
    bonusPoints: parsed.data.bonusPoints,
    highlight: parsed.data.highlight ?? null,
    sortOrder: parsed.data.sortOrder,
    isActive: parsed.data.isActive,
  }).returning();
  res.status(201).json(created);
});

router.put("/credits/admin/topup-packages/:id", platformAdminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "잘못된 id" });
    return;
  }
  const parsed = TopupPackageBody.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const setValues: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) setValues.name = parsed.data.name;
  if (parsed.data.credits !== undefined) setValues.credits = parsed.data.credits;
  if (parsed.data.priceKrw !== undefined) setValues.priceKrw = parsed.data.priceKrw;
  if (parsed.data.bonusPoints !== undefined) setValues.bonusPoints = parsed.data.bonusPoints;
  if (parsed.data.highlight !== undefined) setValues.highlight = parsed.data.highlight;
  if (parsed.data.sortOrder !== undefined) setValues.sortOrder = parsed.data.sortOrder;
  if (parsed.data.isActive !== undefined) setValues.isActive = parsed.data.isActive;
  const [updated] = await db
    .update(creditTopupPackagesTable)
    .set(setValues)
    .where(eq(creditTopupPackagesTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "패키지를 찾을 수 없습니다" });
    return;
  }
  res.json(updated);
});

router.delete("/credits/admin/topup-packages/:id", platformAdminOnly, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "잘못된 id" });
    return;
  }
  const [removed] = await db
    .delete(creditTopupPackagesTable)
    .where(eq(creditTopupPackagesTable.id, id))
    .returning();
  if (!removed) {
    res.status(404).json({ error: "패키지를 찾을 수 없습니다" });
    return;
  }
  res.json({ ok: true, removed });
});

// ── 관리자: 충전 주문 목록 ────────────────────────────────
router.get("/credits/admin/topup-orders", platformAdminOnly, async (req, res): Promise<void> => {
  const status = typeof req.query.status === "string" ? req.query.status : null;
  const limit = Math.min(Math.max(Number(req.query.limit ?? 100) || 100, 1), 500);
  const where = status && (creditTopupOrderStatuses as readonly string[]).includes(status)
    ? eq(creditTopupOrdersTable.status, status as typeof creditTopupOrderStatuses[number])
    : undefined;
  const rowsQ = db
    .select({
      order: creditTopupOrdersTable,
      vendor: vendorsTable,
    })
    .from(creditTopupOrdersTable)
    .leftJoin(vendorsTable, eq(vendorsTable.id, creditTopupOrdersTable.vendorId))
    .orderBy(desc(creditTopupOrdersTable.createdAt))
    .limit(limit);
  const rows = where ? await rowsQ.where(where) : await rowsQ;
  res.json(rows.map((r) => ({
    ...r.order,
    vendorName: r.vendor?.name ?? null,
  })));
});

export default router;
