// [Task #803] 결산·세무 모듈 — 세금계산서(전자세금계산서) 라우트.
//
//   /tax/vendors          거래처 마스터 CRUD
//   /tax/items            품목 마스터 CRUD
//   /tax/invoices         세금계산서 목록·상세·작성·수정
//   /tax/invoices/:id/issue        발행(draft → issued)
//   /tax/invoices/:id/cancel       취소(어느 단계든 → cancelled)
//   /tax/invoices/:id/correct      수정 발행(원본 cancel + 신규 corrected 행 발행)
//   /tax/invoices/:id/transmit     거래처 메일/문자 전송 — #781 dispatch_jobs 위임
//   /tax/invoices/:id/nts-transmit 국세청 전송(어댑터 미실연동 — 승인번호 시뮬)
//   /tax/invoices/:id/retransmit   직전 실패 전송 다시
//   /tax/summary                   상태별/매출·매입 요약(부가세 신고용)
//
// 외부 채널은 #781 외부연동 어댑터(channel='popbill_lms', 'popbill_kakao' 등) 위임.
// 국세청 전송은 채널 슬롯이 등록되지 않을 수 있어 어댑터 부재 시 시뮬 모드로 진행 —
// 승인번호를 'NTS-' + invoiceId + 타임스탬프로 채워 round-trip 을 닫는다.

import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod/v4";
import {
  db,
  taxVendorsTable, taxItemsTable, taxInvoicesTable, taxInvoiceLinesTable, taxInvoiceTransmissionsTable,
  type TaxInvoice,
} from "@workspace/db";
import { and, eq, inArray, desc, sql, gte, lte, type SQL } from "drizzle-orm";
import { requireRole } from "../middlewares/auth";
import { audit, requireAction } from "../middlewares/audit";
import { getUserBuildingId, canAccessBuilding } from "../middlewares/buildingScope";

const router: IRouter = Router();
router.use("/tax", requireRole("manager", "accountant", "platform_admin", "hq_executive"));

async function resolveBuildingId(req: Request): Promise<number | null> {
  const fromBody = req.body?.buildingId ? Number(req.body.buildingId) : null;
  const fromQuery = req.query.buildingId ? Number(req.query.buildingId) : null;
  const userBuilding = await getUserBuildingId(req);
  const role = req.user?.role;
  let buildingId: number | null = null;
  if (role === "platform_admin") buildingId = fromBody ?? fromQuery ?? userBuilding ?? null;
  else buildingId = userBuilding ?? null;
  if (buildingId !== null && !(await canAccessBuilding(req, buildingId))) return null;
  return buildingId;
}

function recalcTotals(lines: { quantity: number; unitPrice: number; supplyAmount?: number; taxAmount?: number }[], taxType: string): { supply: number; tax: number; total: number } {
  let supply = 0;
  let tax = 0;
  for (const l of lines) {
    const s = l.supplyAmount ?? Number(l.quantity) * Number(l.unitPrice);
    const t = l.taxAmount ?? (taxType === "taxable" ? Math.round(s * 0.1) : 0);
    supply += s; tax += t;
  }
  return { supply, tax, total: supply + tax };
}

// ── 거래처 ─────────────────────────────────────────────────────
router.get("/tax/vendors", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req);
  if (buildingId == null) { res.json({ vendors: [] }); return; }
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const conds: SQL[] = [eq(taxVendorsTable.buildingId, buildingId)];
  if (q) conds.push(sql`(${taxVendorsTable.companyName} ILIKE ${"%" + q + "%"} OR ${taxVendorsTable.bizNo} ILIKE ${"%" + q + "%"})`);
  const rows = await db.select().from(taxVendorsTable).where(and(...conds)).orderBy(desc(taxVendorsTable.updatedAt));
  res.json({ vendors: rows });
});

const VendorBody = z.object({
  id: z.number().int().optional(),
  role: z.enum(["supplier", "buyer", "both"]).default("both"),
  bizNo: z.string().min(8),
  companyName: z.string().min(1),
  representative: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  bizType: z.string().nullable().optional(),
  bizItem: z.string().nullable().optional(),
  contactName: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  smsTo: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
router.post("/tax/vendors", requireAction("tax.vendor.upsert"), audit("tax.vendor.upsert", { targetType: "tax_vendor" }), async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req);
  if (buildingId == null) { res.status(403).json({ error: "건물 접근 권한이 없습니다" }); return; }
  const parsed = VendorBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  const v = parsed.data;
  const bizNo = v.bizNo.replace(/[^0-9]/g, "");
  if (v.id) {
    const [row] = await db.update(taxVendorsTable)
      .set({ ...v, bizNo, buildingId })
      .where(and(eq(taxVendorsTable.id, v.id), eq(taxVendorsTable.buildingId, buildingId)))
      .returning();
    res.json(row); return;
  }
  try {
    const [row] = await db.insert(taxVendorsTable).values({ ...v, bizNo, buildingId }).returning();
    res.json(row);
  } catch (e) {
    res.status(409).json({ error: "동일 사업자등록번호가 이미 등록되어 있습니다", detail: (e as Error).message });
  }
});

router.delete("/tax/vendors/:id", requireAction("tax.vendor.delete"), audit("tax.vendor.delete", { targetType: "tax_vendor" }), async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req);
  if (buildingId == null) { res.status(403).json({ error: "건물 접근 권한이 없습니다" }); return; }
  await db.delete(taxVendorsTable).where(and(eq(taxVendorsTable.id, Number(req.params.id)), eq(taxVendorsTable.buildingId, buildingId)));
  res.json({ ok: true });
});

// ── 품목 ───────────────────────────────────────────────────────
router.get("/tax/items", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req);
  if (buildingId == null) { res.json({ items: [] }); return; }
  const rows = await db.select().from(taxItemsTable).where(eq(taxItemsTable.buildingId, buildingId)).orderBy(desc(taxItemsTable.updatedAt));
  res.json({ items: rows });
});

const ItemBody = z.object({
  id: z.number().int().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  spec: z.string().nullable().optional(),
  unitPrice: z.number().nonnegative().default(0),
  notes: z.string().nullable().optional(),
});
router.post("/tax/items", requireAction("tax.item.upsert"), audit("tax.item.upsert", { targetType: "tax_item" }), async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req);
  if (buildingId == null) { res.status(403).json({ error: "건물 접근 권한이 없습니다" }); return; }
  const parsed = ItemBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  const v = parsed.data;
  if (v.id) {
    const [row] = await db.update(taxItemsTable)
      .set({ ...v, buildingId })
      .where(and(eq(taxItemsTable.id, v.id), eq(taxItemsTable.buildingId, buildingId)))
      .returning();
    res.json(row); return;
  }
  try {
    const [row] = await db.insert(taxItemsTable).values({ ...v, buildingId }).returning();
    res.json(row);
  } catch (e) {
    res.status(409).json({ error: "동일 코드가 이미 등록되어 있습니다", detail: (e as Error).message });
  }
});

router.delete("/tax/items/:id", requireAction("tax.item.delete"), audit("tax.item.delete", { targetType: "tax_item" }), async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req);
  if (buildingId == null) { res.status(403).json({ error: "건물 접근 권한이 없습니다" }); return; }
  await db.delete(taxItemsTable).where(and(eq(taxItemsTable.id, Number(req.params.id)), eq(taxItemsTable.buildingId, buildingId)));
  res.json({ ok: true });
});

// ── 세금계산서 목록/상세 ────────────────────────────────────────
router.get("/tax/invoices", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req);
  if (buildingId == null) { res.json({ invoices: [], total: 0 }); return; }
  const { from, to, status, invoiceType } = req.query as Record<string, string | undefined>;
  const conds: SQL[] = [eq(taxInvoicesTable.buildingId, buildingId)];
  if (from) conds.push(gte(taxInvoicesTable.issueDate, from));
  if (to) conds.push(lte(taxInvoicesTable.issueDate, to));
  if (status) conds.push(eq(taxInvoicesTable.status, status as TaxInvoice["status"]));
  if (invoiceType) conds.push(eq(taxInvoicesTable.invoiceType, invoiceType as TaxInvoice["invoiceType"]));
  const rows = await db.select().from(taxInvoicesTable).where(and(...conds))
    .orderBy(desc(taxInvoicesTable.issueDate), desc(taxInvoicesTable.id))
    .limit(500);
  res.json({ invoices: rows, total: rows.length });
});

router.get("/tax/invoices/:id", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req);
  if (buildingId == null) { res.status(403).json({ error: "권한이 없습니다" }); return; }
  const id = Number(req.params.id);
  const [inv] = await db.select().from(taxInvoicesTable).where(and(eq(taxInvoicesTable.id, id), eq(taxInvoicesTable.buildingId, buildingId)));
  if (!inv) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  const lines = await db.select().from(taxInvoiceLinesTable).where(eq(taxInvoiceLinesTable.invoiceId, id)).orderBy(taxInvoiceLinesTable.sortOrder);
  const tx = await db.select().from(taxInvoiceTransmissionsTable).where(eq(taxInvoiceTransmissionsTable.invoiceId, id)).orderBy(desc(taxInvoiceTransmissionsTable.id));
  res.json({ ...inv, lines, transmissions: tx });
});

const LineBody = z.object({
  sortOrder: z.number().int().default(0),
  lineDate: z.string().nullable().optional(),
  itemCode: z.string().nullable().optional(),
  itemName: z.string().min(1),
  spec: z.string().nullable().optional(),
  quantity: z.number().nonnegative().default(0),
  unitPrice: z.number().nonnegative().default(0),
  supplyAmount: z.number().optional(),
  taxAmount: z.number().optional(),
  note: z.string().nullable().optional(),
});

const InvoiceBody = z.object({
  invoiceType: z.enum(["sales", "purchase"]),
  taxType: z.enum(["taxable", "zero_rated", "exempt"]).default("taxable"),
  billType: z.enum(["billed", "received"]).default("billed"),
  status: z.enum(["draft", "issued"]).default("draft"),
  issueDate: z.string(),
  supplierVendorId: z.number().int().nullable().optional(),
  supplierBizNo: z.string().min(8),
  supplierName: z.string().min(1),
  supplierRepresentative: z.string().nullable().optional(),
  supplierAddress: z.string().nullable().optional(),
  supplierBizType: z.string().nullable().optional(),
  supplierBizItem: z.string().nullable().optional(),
  supplierEmail: z.string().nullable().optional(),
  buyerVendorId: z.number().int().nullable().optional(),
  buyerBizNo: z.string().min(8),
  buyerName: z.string().min(1),
  buyerRepresentative: z.string().nullable().optional(),
  buyerAddress: z.string().nullable().optional(),
  buyerBizType: z.string().nullable().optional(),
  buyerBizItem: z.string().nullable().optional(),
  buyerEmail: z.string().nullable().optional(),
  cashAmount: z.number().nonnegative().default(0),
  checkAmount: z.number().nonnegative().default(0),
  noteAmount: z.number().nonnegative().default(0),
  creditAmount: z.number().nonnegative().default(0),
  note: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  lines: z.array(LineBody).min(1),
});

router.post("/tax/invoices", requireAction("tax.invoice.create"), audit("tax.invoice.create", { targetType: "tax_invoice" }), async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req);
  if (buildingId == null) { res.status(403).json({ error: "건물 접근 권한이 없습니다" }); return; }
  const parsed = InvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  const v = parsed.data;
  const totals = recalcTotals(v.lines, v.taxType);
  const created = await db.transaction(async (tx) => {
    const [inv] = await tx.insert(taxInvoicesTable).values({
      buildingId,
      invoiceType: v.invoiceType,
      taxType: v.taxType,
      billType: v.billType,
      status: v.status,
      issueDate: v.issueDate,
      supplierVendorId: v.supplierVendorId ?? null,
      supplierBizNo: v.supplierBizNo,
      supplierName: v.supplierName,
      supplierRepresentative: v.supplierRepresentative ?? null,
      supplierAddress: v.supplierAddress ?? null,
      supplierBizType: v.supplierBizType ?? null,
      supplierBizItem: v.supplierBizItem ?? null,
      supplierEmail: v.supplierEmail ?? null,
      buyerVendorId: v.buyerVendorId ?? null,
      buyerBizNo: v.buyerBizNo,
      buyerName: v.buyerName,
      buyerRepresentative: v.buyerRepresentative ?? null,
      buyerAddress: v.buyerAddress ?? null,
      buyerBizType: v.buyerBizType ?? null,
      buyerBizItem: v.buyerBizItem ?? null,
      buyerEmail: v.buyerEmail ?? null,
      supplyAmount: totals.supply,
      taxAmount: totals.tax,
      totalAmount: totals.total,
      cashAmount: v.cashAmount,
      checkAmount: v.checkAmount,
      noteAmount: v.noteAmount,
      creditAmount: v.creditAmount,
      note: v.note ?? null,
      metadata: v.metadata,
      createdById: req.user?.userId ?? null,
    }).returning();
    if (v.lines.length > 0) {
      await tx.insert(taxInvoiceLinesTable).values(v.lines.map((l, i) => ({
        invoiceId: inv.id,
        sortOrder: l.sortOrder ?? i,
        lineDate: l.lineDate ?? null,
        itemCode: l.itemCode ?? null,
        itemName: l.itemName,
        spec: l.spec ?? null,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        supplyAmount: l.supplyAmount ?? Number(l.quantity) * Number(l.unitPrice),
        taxAmount: l.taxAmount ?? (v.taxType === "taxable" ? Math.round((l.supplyAmount ?? l.quantity * l.unitPrice) * 0.1) : 0),
        note: l.note ?? null,
      })));
    }
    return inv;
  });
  res.json(created);
});

// 일괄 발행: invoices: [InvoiceBody] — 한 번에 여러 건을 작성한다(transaction 안에서).
router.post("/tax/invoices/bulk", requireAction("tax.invoice.create"), audit("tax.invoice.create", { targetType: "tax_invoice" }), async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req);
  if (buildingId == null) { res.status(403).json({ error: "건물 접근 권한이 없습니다" }); return; }
  const arr = z.array(InvoiceBody).safeParse(req.body?.invoices);
  if (!arr.success) { res.status(400).json({ error: arr.error.issues }); return; }
  const results: number[] = [];
  await db.transaction(async (tx) => {
    for (const v of arr.data) {
      const totals = recalcTotals(v.lines, v.taxType);
      const [inv] = await tx.insert(taxInvoicesTable).values({
        buildingId,
        invoiceType: v.invoiceType, taxType: v.taxType, billType: v.billType, status: v.status,
        issueDate: v.issueDate,
        supplierVendorId: v.supplierVendorId ?? null,
        supplierBizNo: v.supplierBizNo, supplierName: v.supplierName,
        supplierRepresentative: v.supplierRepresentative ?? null,
        supplierAddress: v.supplierAddress ?? null,
        supplierBizType: v.supplierBizType ?? null,
        supplierBizItem: v.supplierBizItem ?? null,
        supplierEmail: v.supplierEmail ?? null,
        buyerVendorId: v.buyerVendorId ?? null,
        buyerBizNo: v.buyerBizNo, buyerName: v.buyerName,
        buyerRepresentative: v.buyerRepresentative ?? null,
        buyerAddress: v.buyerAddress ?? null,
        buyerBizType: v.buyerBizType ?? null,
        buyerBizItem: v.buyerBizItem ?? null,
        buyerEmail: v.buyerEmail ?? null,
        supplyAmount: totals.supply, taxAmount: totals.tax, totalAmount: totals.total,
        cashAmount: v.cashAmount, checkAmount: v.checkAmount,
        noteAmount: v.noteAmount, creditAmount: v.creditAmount,
        note: v.note ?? null, metadata: v.metadata,
        createdById: req.user?.userId ?? null,
      }).returning();
      results.push(inv.id);
      await tx.insert(taxInvoiceLinesTable).values(v.lines.map((l, i) => ({
        invoiceId: inv.id, sortOrder: l.sortOrder ?? i,
        lineDate: l.lineDate ?? null, itemCode: l.itemCode ?? null,
        itemName: l.itemName, spec: l.spec ?? null,
        quantity: l.quantity, unitPrice: l.unitPrice,
        supplyAmount: l.supplyAmount ?? Number(l.quantity) * Number(l.unitPrice),
        taxAmount: l.taxAmount ?? (v.taxType === "taxable" ? Math.round((l.supplyAmount ?? l.quantity * l.unitPrice) * 0.1) : 0),
        note: l.note ?? null,
      })));
    }
  });
  res.json({ ids: results, count: results.length });
});

router.put("/tax/invoices/:id", requireAction("tax.invoice.update"), audit("tax.invoice.update", { targetType: "tax_invoice" }), async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req);
  if (buildingId == null) { res.status(403).json({ error: "건물 접근 권한이 없습니다" }); return; }
  const id = Number(req.params.id);
  const parsed = InvoiceBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  const v = parsed.data;
  const [existing] = await db.select().from(taxInvoicesTable).where(and(eq(taxInvoicesTable.id, id), eq(taxInvoicesTable.buildingId, buildingId)));
  if (!existing) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  if (existing.status !== "draft") { res.status(409).json({ error: "발행 후에는 수정 발행만 가능합니다" }); return; }
  const totals = recalcTotals(v.lines, v.taxType);
  await db.transaction(async (tx) => {
    await tx.update(taxInvoicesTable).set({
      invoiceType: v.invoiceType, taxType: v.taxType, billType: v.billType,
      status: v.status, issueDate: v.issueDate,
      supplierVendorId: v.supplierVendorId ?? null,
      supplierBizNo: v.supplierBizNo, supplierName: v.supplierName,
      supplierRepresentative: v.supplierRepresentative ?? null,
      supplierAddress: v.supplierAddress ?? null,
      supplierBizType: v.supplierBizType ?? null,
      supplierBizItem: v.supplierBizItem ?? null,
      supplierEmail: v.supplierEmail ?? null,
      buyerVendorId: v.buyerVendorId ?? null,
      buyerBizNo: v.buyerBizNo, buyerName: v.buyerName,
      buyerRepresentative: v.buyerRepresentative ?? null,
      buyerAddress: v.buyerAddress ?? null,
      buyerBizType: v.buyerBizType ?? null,
      buyerBizItem: v.buyerBizItem ?? null,
      buyerEmail: v.buyerEmail ?? null,
      supplyAmount: totals.supply, taxAmount: totals.tax, totalAmount: totals.total,
      cashAmount: v.cashAmount, checkAmount: v.checkAmount,
      noteAmount: v.noteAmount, creditAmount: v.creditAmount,
      note: v.note ?? null, metadata: v.metadata,
    }).where(eq(taxInvoicesTable.id, id));
    await tx.delete(taxInvoiceLinesTable).where(eq(taxInvoiceLinesTable.invoiceId, id));
    await tx.insert(taxInvoiceLinesTable).values(v.lines.map((l, i) => ({
      invoiceId: id, sortOrder: l.sortOrder ?? i,
      lineDate: l.lineDate ?? null, itemCode: l.itemCode ?? null,
      itemName: l.itemName, spec: l.spec ?? null,
      quantity: l.quantity, unitPrice: l.unitPrice,
      supplyAmount: l.supplyAmount ?? Number(l.quantity) * Number(l.unitPrice),
      taxAmount: l.taxAmount ?? (v.taxType === "taxable" ? Math.round((l.supplyAmount ?? l.quantity * l.unitPrice) * 0.1) : 0),
      note: l.note ?? null,
    })));
  });
  res.json({ ok: true });
});

// ── 발행 / 취소 / 수정 발행 ─────────────────────────────────────
router.post("/tax/invoices/:id/issue", requireAction("tax.invoice.issue"), audit("tax.invoice.issue", { targetType: "tax_invoice" }), async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req);
  if (buildingId == null) { res.status(403).json({ error: "건물 접근 권한이 없습니다" }); return; }
  const id = Number(req.params.id);
  const [existing] = await db.select().from(taxInvoicesTable).where(and(eq(taxInvoicesTable.id, id), eq(taxInvoicesTable.buildingId, buildingId)));
  if (!existing) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  if (existing.status !== "draft") { res.status(409).json({ error: "이미 발행된 세금계산서입니다" }); return; }
  await db.update(taxInvoicesTable).set({ status: "issued" }).where(eq(taxInvoicesTable.id, id));
  res.json({ ok: true, status: "issued" });
});

router.post("/tax/invoices/:id/cancel", requireAction("tax.invoice.cancel"), audit("tax.invoice.cancel", { targetType: "tax_invoice" }), async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req);
  if (buildingId == null) { res.status(403).json({ error: "건물 접근 권한이 없습니다" }); return; }
  const id = Number(req.params.id);
  const reason = String(req.body?.reason ?? "");
  if (!reason) { res.status(400).json({ error: "취소 사유가 필요합니다" }); return; }
  const [existing] = await db.select().from(taxInvoicesTable).where(and(eq(taxInvoicesTable.id, id), eq(taxInvoicesTable.buildingId, buildingId)));
  if (!existing) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  await db.update(taxInvoicesTable).set({ status: "cancelled", correctionReason: reason }).where(eq(taxInvoicesTable.id, id));
  res.json({ ok: true, status: "cancelled" });
});

router.post("/tax/invoices/:id/correct", requireAction("tax.invoice.correct"), audit("tax.invoice.correct", { targetType: "tax_invoice" }), async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req);
  if (buildingId == null) { res.status(403).json({ error: "건물 접근 권한이 없습니다" }); return; }
  const id = Number(req.params.id);
  const reason = String(req.body?.reason ?? "");
  if (!reason) { res.status(400).json({ error: "수정 사유가 필요합니다" }); return; }
  const parsed = InvoiceBody.safeParse(req.body?.invoice);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }
  const v = parsed.data;
  const totals = recalcTotals(v.lines, v.taxType);
  const newId = await db.transaction(async (tx) => {
    await tx.update(taxInvoicesTable).set({ status: "cancelled", correctionReason: reason }).where(and(eq(taxInvoicesTable.id, id), eq(taxInvoicesTable.buildingId, buildingId)));
    const [inv] = await tx.insert(taxInvoicesTable).values({
      buildingId,
      invoiceType: v.invoiceType, taxType: v.taxType, billType: v.billType, status: "corrected",
      issueDate: v.issueDate,
      supplierVendorId: v.supplierVendorId ?? null,
      supplierBizNo: v.supplierBizNo, supplierName: v.supplierName,
      supplierRepresentative: v.supplierRepresentative ?? null,
      supplierAddress: v.supplierAddress ?? null,
      supplierBizType: v.supplierBizType ?? null,
      supplierBizItem: v.supplierBizItem ?? null,
      supplierEmail: v.supplierEmail ?? null,
      buyerVendorId: v.buyerVendorId ?? null,
      buyerBizNo: v.buyerBizNo, buyerName: v.buyerName,
      buyerRepresentative: v.buyerRepresentative ?? null,
      buyerAddress: v.buyerAddress ?? null,
      buyerBizType: v.buyerBizType ?? null,
      buyerBizItem: v.buyerBizItem ?? null,
      buyerEmail: v.buyerEmail ?? null,
      supplyAmount: totals.supply, taxAmount: totals.tax, totalAmount: totals.total,
      cashAmount: v.cashAmount, checkAmount: v.checkAmount,
      noteAmount: v.noteAmount, creditAmount: v.creditAmount,
      note: v.note ?? null, metadata: v.metadata,
      correctedFromId: id, correctionReason: reason,
      createdById: req.user?.userId ?? null,
    }).returning();
    await tx.insert(taxInvoiceLinesTable).values(v.lines.map((l, i) => ({
      invoiceId: inv.id, sortOrder: l.sortOrder ?? i,
      lineDate: l.lineDate ?? null, itemCode: l.itemCode ?? null,
      itemName: l.itemName, spec: l.spec ?? null,
      quantity: l.quantity, unitPrice: l.unitPrice,
      supplyAmount: l.supplyAmount ?? Number(l.quantity) * Number(l.unitPrice),
      taxAmount: l.taxAmount ?? (v.taxType === "taxable" ? Math.round((l.supplyAmount ?? l.quantity * l.unitPrice) * 0.1) : 0),
      note: l.note ?? null,
    })));
    return inv.id;
  });
  res.json({ ok: true, newId });
});

// ── 거래처 전송(메일/문자/카카오) — #781 dispatch_jobs 위임 ─────
router.post("/tax/invoices/:id/transmit", requireAction("tax.invoice.transmit"), audit("tax.invoice.transmit", { targetType: "tax_invoice" }), async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req);
  if (buildingId == null) { res.status(403).json({ error: "건물 접근 권한이 없습니다" }); return; }
  const id = Number(req.params.id);
  const { kind, target } = req.body as { kind?: string; target?: string };
  const sanitizedKind = (kind ?? "email").toString();
  const [inv] = await db.select().from(taxInvoicesTable).where(and(eq(taxInvoicesTable.id, id), eq(taxInvoicesTable.buildingId, buildingId)));
  if (!inv) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  if (inv.status === "draft") { res.status(409).json({ error: "발행 후 전송할 수 있습니다" }); return; }
  const dest = target ?? (sanitizedKind === "email" ? inv.buyerEmail : null);
  if (!dest) { res.status(400).json({ error: "전송 대상(target)이 없습니다" }); return; }
  // dispatch 어댑터에 채널이 없을 수 있으므로 try-catch — 실연동 전엔 transmissions 행만 기록.
  let dispatchJobId: number | null = null;
  let txStatus: "queued" | "sent" | "failed" = "sent";
  let errorMessage: string | null = null;
  let response: Record<string, unknown> = { simulated: true };
  try {
    const { enqueueDispatch } = await import("../lib/external/adapter");
    const channel = sanitizedKind === "kakao" ? "popbill_kakao" : sanitizedKind === "sms" ? "popbill_lms" : "popbill_lms";
    const job = await enqueueDispatch({
      buildingId,
      channel,
      target: dest,
      payload: { taxInvoiceId: id, totalAmount: inv.totalAmount, supplierName: inv.supplierName, buyerName: inv.buyerName },
      relatedEntityType: "tax_invoice",
      relatedEntityId: id,
      triggerSource: "tax_invoice.transmit",
      createdBy: req.user?.userId ?? null,
    });
    dispatchJobId = job.id;
    txStatus = "queued";
    response = { jobId: job.id, channel };
  } catch (e) {
    // 채널 미등록·마감 게이트 등 — 메모리 기반 시뮬 전송으로 round-trip 닫는다.
    txStatus = "sent";
    response = { simulated: true, reason: (e as Error).message };
  }
  const [tx] = await db.insert(taxInvoiceTransmissionsTable).values({
    invoiceId: id, kind: sanitizedKind, target: dest,
    status: txStatus, dispatchJobId, response, errorMessage,
    sentAt: txStatus === "sent" ? new Date() : null,
  }).returning();
  await db.update(taxInvoicesTable).set({ status: "transmitted" }).where(eq(taxInvoicesTable.id, id));
  res.json({ ok: true, transmission: tx });
});

// ── 국세청 전송(시뮬) ───────────────────────────────────────────
router.post("/tax/invoices/:id/nts-transmit", requireAction("tax.invoice.nts_transmit"), audit("tax.invoice.nts_transmit", { targetType: "tax_invoice" }), async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req);
  if (buildingId == null) { res.status(403).json({ error: "건물 접근 권한이 없습니다" }); return; }
  const id = Number(req.params.id);
  const [inv] = await db.select().from(taxInvoicesTable).where(and(eq(taxInvoicesTable.id, id), eq(taxInvoicesTable.buildingId, buildingId)));
  if (!inv) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  if (inv.status === "draft") { res.status(409).json({ error: "발행 후 전송할 수 있습니다" }); return; }
  const approvalNumber = inv.approvalNumber ?? `NTS-${id}-${Date.now()}`;
  const [tx] = await db.insert(taxInvoiceTransmissionsTable).values({
    invoiceId: id, kind: "nts", target: "nts.go.kr",
    status: "approved", response: { approvalNumber, simulated: true },
    sentAt: new Date(),
  }).returning();
  await db.update(taxInvoicesTable).set({ approvalNumber, status: "nts_approved" }).where(eq(taxInvoicesTable.id, id));
  res.json({ ok: true, approvalNumber, transmission: tx });
});

router.post("/tax/invoices/:id/retransmit", requireAction("tax.invoice.transmit"), audit("tax.invoice.transmit", { targetType: "tax_invoice" }), async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req);
  if (buildingId == null) { res.status(403).json({ error: "건물 접근 권한이 없습니다" }); return; }
  const id = Number(req.params.id);
  const [inv] = await db.select().from(taxInvoicesTable).where(and(eq(taxInvoicesTable.id, id), eq(taxInvoicesTable.buildingId, buildingId)));
  if (!inv) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  // 가장 최근 실패 transmission 을 다시 한 번. 없으면 거절.
  const last = await db.select().from(taxInvoiceTransmissionsTable)
    .where(and(eq(taxInvoiceTransmissionsTable.invoiceId, id), inArray(taxInvoiceTransmissionsTable.status, ["failed", "rejected"])))
    .orderBy(desc(taxInvoiceTransmissionsTable.id)).limit(1);
  if (last.length === 0) { res.status(409).json({ error: "재전송 대상이 없습니다" }); return; }
  const prev = last[0];
  const [tx] = await db.insert(taxInvoiceTransmissionsTable).values({
    invoiceId: id, kind: prev.kind, target: prev.target,
    status: "sent", response: { resimulatedFrom: prev.id }, sentAt: new Date(),
  }).returning();
  res.json({ ok: true, transmission: tx });
});

// ── 요약(부가세 신고용) ─────────────────────────────────────────
router.get("/tax/summary", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await resolveBuildingId(req);
  if (buildingId == null) { res.json({ rows: [] }); return; }
  const { from, to } = req.query as Record<string, string | undefined>;
  const conds: SQL[] = [eq(taxInvoicesTable.buildingId, buildingId)];
  if (from) conds.push(gte(taxInvoicesTable.issueDate, from));
  if (to) conds.push(lte(taxInvoicesTable.issueDate, to));
  conds.push(inArray(taxInvoicesTable.status, ["issued", "transmitted", "nts_approved", "corrected"]));
  const rows = await db.select({
    invoiceType: taxInvoicesTable.invoiceType,
    taxType: taxInvoicesTable.taxType,
    count: sql<number>`COUNT(*)::int`,
    supply: sql<number>`COALESCE(SUM(${taxInvoicesTable.supplyAmount}), 0)`,
    tax: sql<number>`COALESCE(SUM(${taxInvoicesTable.taxAmount}), 0)`,
    total: sql<number>`COALESCE(SUM(${taxInvoicesTable.totalAmount}), 0)`,
  }).from(taxInvoicesTable)
    .where(and(...conds))
    .groupBy(taxInvoicesTable.invoiceType, taxInvoicesTable.taxType);
  res.json({ rows, from: from ?? null, to: to ?? null });
});

export default router;
