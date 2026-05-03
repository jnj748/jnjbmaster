// [Task #796] XpBIZ 호실관리·환경설정 풀세트 — 5종 1:1 환경 + 호실별 2종.
import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  meteringEnvironmentTable,
  meteringUsageSettingsTable,
  noticeOutputSettingsTable,
  billingEnvironmentSettingsTable,
  yearEndTaxInfoTable,
  prepaidDepositsTable,
  accessCardsTable,
  unitsTable,
} from "@workspace/db";
import {
  UpsertMeteringEnvironmentBody,
  UpsertMeteringUsageSettingsBody,
  UpsertNoticeOutputSettingsBody,
  UpsertBillingEnvironmentSettingsBody,
  UpsertYearEndTaxInfoBody,
  UpsertPrepaidDepositBody,
  CreateAccessCardBody,
  UpdateAccessCardBody,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

// 환경설정 전체는 manager / accountant / platform_admin 만 접근 가능.
router.use((req, res, next) => {
  const guard = requireRole("manager", "accountant", "platform_admin");
  guard(req, res, next);
});

async function getBuildingId(req: Request): Promise<number | null> {
  const userId = req.user?.userId;
  if (!userId) return null;
  const u = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then((r) => r[0]);
  return u?.buildingId ?? null;
}
function send403(res: Response) {
  res.status(403).json({ error: "건물이 등록되지 않았습니다" });
}

// ── /settings/metering-environment ──────────────────────────────
router.get("/settings/metering-environment", async (req, res) => {
  const buildingId = await getBuildingId(req);
  if (!buildingId) return send403(res);
  const [row] = await db.select().from(meteringEnvironmentTable).where(eq(meteringEnvironmentTable.buildingId, buildingId));
  res.json(row ?? { id: 0, buildingId, config: {}, kepcoTerms: [], notes: null, updatedAt: new Date().toISOString() });
});
router.put("/settings/metering-environment", async (req, res) => {
  const buildingId = await getBuildingId(req);
  if (!buildingId) return send403(res);
  const parsed = UpsertMeteringEnvironmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const existing = await db.select().from(meteringEnvironmentTable).where(eq(meteringEnvironmentTable.buildingId, buildingId)).then((r) => r[0]);
  const values = {
    config: parsed.data.config ?? {},
    kepcoTerms: parsed.data.kepcoTerms ?? [],
    notes: parsed.data.notes ?? null,
  };
  if (existing) {
    const [row] = await db.update(meteringEnvironmentTable).set(values).where(eq(meteringEnvironmentTable.id, existing.id)).returning();
    res.json(row);
  } else {
    const [row] = await db.insert(meteringEnvironmentTable).values({ ...values, buildingId }).returning();
    res.json(row);
  }
  req.log?.info?.({ buildingId }, "metering_environment_saved");
});

// ── /settings/metering-usage ────────────────────────────────────
router.get("/settings/metering-usage", async (req, res) => {
  const buildingId = await getBuildingId(req);
  if (!buildingId) return send403(res);
  const [row] = await db.select().from(meteringUsageSettingsTable).where(eq(meteringUsageSettingsTable.buildingId, buildingId));
  res.json(row ?? { id: 0, buildingId, config: {}, notes: null, updatedAt: new Date().toISOString() });
});
router.put("/settings/metering-usage", async (req, res) => {
  const buildingId = await getBuildingId(req);
  if (!buildingId) return send403(res);
  const parsed = UpsertMeteringUsageSettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const existing = await db.select().from(meteringUsageSettingsTable).where(eq(meteringUsageSettingsTable.buildingId, buildingId)).then((r) => r[0]);
  const values = { config: parsed.data.config ?? {}, notes: parsed.data.notes ?? null };
  if (existing) {
    const [row] = await db.update(meteringUsageSettingsTable).set(values).where(eq(meteringUsageSettingsTable.id, existing.id)).returning();
    res.json(row);
  } else {
    const [row] = await db.insert(meteringUsageSettingsTable).values({ ...values, buildingId }).returning();
    res.json(row);
  }
  req.log?.info?.({ buildingId }, "metering_usage_saved");
});

// ── /settings/notice-output ─────────────────────────────────────
router.get("/settings/notice-output", async (req, res) => {
  const buildingId = await getBuildingId(req);
  if (!buildingId) return send403(res);
  const [row] = await db.select().from(noticeOutputSettingsTable).where(eq(noticeOutputSettingsTable.buildingId, buildingId));
  res.json(row ?? {
    id: 0, buildingId,
    showAlias: false, aliasName: null,
    deliveryPostal: true, deliveryDirect: false, deliveryEmail: false,
    registeredNo: null, autoTransferOrg: null,
    vatIncluded: false, positions: {}, notes: null,
    updatedAt: new Date().toISOString(),
  });
});
router.put("/settings/notice-output", async (req, res) => {
  const buildingId = await getBuildingId(req);
  if (!buildingId) return send403(res);
  const parsed = UpsertNoticeOutputSettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const existing = await db.select().from(noticeOutputSettingsTable).where(eq(noticeOutputSettingsTable.buildingId, buildingId)).then((r) => r[0]);
  const values = {
    showAlias: d.showAlias ?? false,
    aliasName: d.aliasName ?? null,
    deliveryPostal: d.deliveryPostal ?? true,
    deliveryDirect: d.deliveryDirect ?? false,
    deliveryEmail: d.deliveryEmail ?? false,
    registeredNo: d.registeredNo ?? null,
    autoTransferOrg: d.autoTransferOrg ?? null,
    vatIncluded: d.vatIncluded ?? false,
    positions: d.positions ?? {},
    notes: d.notes ?? null,
  };
  if (existing) {
    const [row] = await db.update(noticeOutputSettingsTable).set(values).where(eq(noticeOutputSettingsTable.id, existing.id)).returning();
    res.json(row);
  } else {
    const [row] = await db.insert(noticeOutputSettingsTable).values({ ...values, buildingId }).returning();
    res.json(row);
  }
  req.log?.info?.({ buildingId }, "notice_output_saved");
});

// ── /settings/billing-environment ───────────────────────────────
router.get("/settings/billing-environment", async (req, res) => {
  const buildingId = await getBuildingId(req);
  if (!buildingId) return send403(res);
  const [row] = await db.select().from(billingEnvironmentSettingsTable).where(eq(billingEnvironmentSettingsTable.buildingId, buildingId));
  res.json(row ?? {
    id: 0, buildingId, categoryConfig: {}, vatThresholdM2: "135",
    escoConfig: {}, notes: null, updatedAt: new Date().toISOString(),
  });
});
router.put("/settings/billing-environment", async (req, res) => {
  const buildingId = await getBuildingId(req);
  if (!buildingId) return send403(res);
  const parsed = UpsertBillingEnvironmentSettingsBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const existing = await db.select().from(billingEnvironmentSettingsTable).where(eq(billingEnvironmentSettingsTable.buildingId, buildingId)).then((r) => r[0]);
  const values = {
    categoryConfig: d.categoryConfig ?? {},
    vatThresholdM2: d.vatThresholdM2 ?? null,
    escoConfig: d.escoConfig ?? {},
    notes: d.notes ?? null,
  };
  if (existing) {
    const [row] = await db.update(billingEnvironmentSettingsTable).set(values).where(eq(billingEnvironmentSettingsTable.id, existing.id)).returning();
    res.json(row);
  } else {
    const [row] = await db.insert(billingEnvironmentSettingsTable).values({ ...values, buildingId }).returning();
    res.json(row);
  }
  req.log?.info?.({ buildingId }, "billing_env_saved");
});

// ── /settings/year-end-tax ──────────────────────────────────────
router.get("/settings/year-end-tax", async (req, res) => {
  const buildingId = await getBuildingId(req);
  if (!buildingId) return send403(res);
  const [row] = await db.select().from(yearEndTaxInfoTable).where(eq(yearEndTaxInfoTable.buildingId, buildingId));
  res.json(row ?? {
    id: 0, buildingId,
    settlementYear: null, businessNumber: null, companyName: null,
    representative: null, businessAddress: null, industryType: null,
    businessItem: null, contactPerson: null, taxOfficeCode: null,
    deductionMethod: null, quarterlyPay: false, invoiceStatus: [],
    notes: null, updatedAt: new Date().toISOString(),
  });
});
router.put("/settings/year-end-tax", async (req, res) => {
  const buildingId = await getBuildingId(req);
  if (!buildingId) return send403(res);
  const parsed = UpsertYearEndTaxInfoBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const existing = await db.select().from(yearEndTaxInfoTable).where(eq(yearEndTaxInfoTable.buildingId, buildingId)).then((r) => r[0]);
  const values = {
    settlementYear: d.settlementYear ?? null,
    businessNumber: d.businessNumber ?? null,
    companyName: d.companyName ?? null,
    representative: d.representative ?? null,
    businessAddress: d.businessAddress ?? null,
    industryType: d.industryType ?? null,
    businessItem: d.businessItem ?? null,
    contactPerson: d.contactPerson ?? null,
    taxOfficeCode: d.taxOfficeCode ?? null,
    deductionMethod: d.deductionMethod ?? null,
    quarterlyPay: d.quarterlyPay ?? false,
    invoiceStatus: d.invoiceStatus ?? [],
    notes: d.notes ?? null,
  };
  if (existing) {
    const [row] = await db.update(yearEndTaxInfoTable).set(values).where(eq(yearEndTaxInfoTable.id, existing.id)).returning();
    res.json(row);
  } else {
    const [row] = await db.insert(yearEndTaxInfoTable).values({ ...values, buildingId }).returning();
    res.json(row);
  }
  req.log?.info?.({ buildingId }, "year_end_tax_saved");
});

// ── /accountant/prepaid-deposits ────────────────────────────────
router.get("/accountant/prepaid-deposits", async (req, res) => {
  const buildingId = await getBuildingId(req);
  if (!buildingId) return send403(res);
  const rows = await db.select().from(prepaidDepositsTable).where(eq(prepaidDepositsTable.buildingId, buildingId));
  res.json(rows);
});
router.post("/accountant/prepaid-deposits", async (req, res) => {
  const buildingId = await getBuildingId(req);
  if (!buildingId) return send403(res);
  const parsed = UpsertPrepaidDepositBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  const [unit] = await db.select({ id: unitsTable.id }).from(unitsTable)
    .where(and(eq(unitsTable.id, d.unitId), eq(unitsTable.buildingId, buildingId)));
  if (!unit) { res.status(404).json({ error: "Unit not found" }); return; }

  const existing = await db.select().from(prepaidDepositsTable)
    .where(and(eq(prepaidDepositsTable.buildingId, buildingId), eq(prepaidDepositsTable.unitId, d.unitId)))
    .then((r) => r[0]);
  const values = {
    unitId: d.unitId,
    depositDate: d.depositDate ?? null,
    receiptPeriod: d.receiptPeriod ?? null,
    supplyArea: d.supplyArea != null ? String(d.supplyArea) : null,
    moveInDate: d.moveInDate ?? null,
    prepaidAmount: d.prepaidAmount ?? 0,
    receivedAmount: d.receivedAmount ?? 0,
    unpaidAmount: d.unpaidAmount ?? 0,
    paidAt: d.paidAt ?? null,
    notes: d.notes ?? null,
  };
  if (existing) {
    const [row] = await db.update(prepaidDepositsTable).set(values).where(eq(prepaidDepositsTable.id, existing.id)).returning();
    res.json(row);
  } else {
    const [row] = await db.insert(prepaidDepositsTable).values({ ...values, buildingId }).returning();
    res.json(row);
  }
  req.log?.info?.({ buildingId, unitId: d.unitId }, "prepaid_deposit_saved");
});

// ── /settings/access-cards ──────────────────────────────────────
router.get("/settings/access-cards", async (req, res) => {
  const buildingId = await getBuildingId(req);
  if (!buildingId) return send403(res);
  const rows = await db.select().from(accessCardsTable)
    .where(eq(accessCardsTable.buildingId, buildingId))
    .orderBy(sql`${accessCardsTable.createdAt} DESC`);
  res.json(rows);
});
router.post("/settings/access-cards", async (req, res) => {
  const buildingId = await getBuildingId(req);
  if (!buildingId) return send403(res);
  const parsed = CreateAccessCardBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const d = parsed.data;
  if (d.unitId != null) {
    const [unit] = await db.select({ id: unitsTable.id }).from(unitsTable)
      .where(and(eq(unitsTable.id, d.unitId), eq(unitsTable.buildingId, buildingId)));
    if (!unit) { res.status(404).json({ error: "Unit not found" }); return; }
  }
  const [row] = await db.insert(accessCardsTable).values({
    buildingId,
    unitId: d.unitId ?? null,
    serialNo: d.serialNo,
    issuedAt: d.issuedAt ?? null,
    revokedAt: d.revokedAt ?? null,
    cardRegistered: d.cardRegistered ?? true,
    depositAmount: d.depositAmount ?? 0,
    issueFee: d.issueFee ?? 0,
    recipientName: d.recipientName ?? null,
    recipientPhone: d.recipientPhone ?? null,
    bankName: d.bankName ?? null,
    notes: d.notes ?? null,
  }).returning();
  req.log?.info?.({ buildingId, serialNo: d.serialNo }, "access_card_created");
  res.status(201).json(row);
});
router.patch("/settings/access-cards/:id", async (req, res) => {
  const buildingId = await getBuildingId(req);
  if (!buildingId) return send403(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "invalid id" }); return; }
  const parsed = UpdateAccessCardBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const [row] = await db.update(accessCardsTable)
    .set(parsed.data)
    .where(and(eq(accessCardsTable.id, id), eq(accessCardsTable.buildingId, buildingId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});
router.delete("/settings/access-cards/:id", async (req, res) => {
  const buildingId = await getBuildingId(req);
  if (!buildingId) return send403(res);
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "invalid id" }); return; }
  const [row] = await db.delete(accessCardsTable)
    .where(and(eq(accessCardsTable.id, id), eq(accessCardsTable.buildingId, buildingId)))
    .returning();
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.sendStatus(204);
});

export default router;
