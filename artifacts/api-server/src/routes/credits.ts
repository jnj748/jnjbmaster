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
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import {
  getOrCreateWallet,
  computeCreditCost,
  postLedger,
  isCreditsEnabled,
  getPremiumAmountThreshold,
  getPremiumSlotLimit,
} from "../lib/credits";

const router: IRouter = Router();
const hqOnly = requireRole("platform_admin", "hq_executive");
const partnerOrHq = requireRole("partner", "platform_admin", "hq_executive");

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
  const cost = await computeCreditCost({
    category: rfq.category,
    estimatedAmount: rfq.estimatedAmount,
    buildingTotalArea: totalArea,
    buildingFireGrade: fireGrade,
    isPremiumOverride: rfq.isPremium,
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
});

router.put("/credits/category-pricing", hqOnly, async (req, res): Promise<void> => {
  const parsed = UpsertPricingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await db.select().from(creditCategoryPricingTable).where(eq(creditCategoryPricingTable.category, parsed.data.category));
  if (existing.length > 0) {
    const [updated] = await db
      .update(creditCategoryPricingTable)
      .set({ tier: parsed.data.tier, creditCost: parsed.data.creditCost, description: parsed.data.description ?? null })
      .where(eq(creditCategoryPricingTable.category, parsed.data.category))
      .returning();
    res.json(updated);
    return;
  }
  const [created] = await db.insert(creditCategoryPricingTable).values(parsed.data).returning();
  res.status(201).json(created);
});

export default router;
