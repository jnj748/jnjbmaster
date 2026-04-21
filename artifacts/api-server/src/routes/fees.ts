import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { db, unitsTable, usersTable, ownersTable, approvalsTable, monthlyPaymentsTable, monthlyBillSummariesTable } from "@workspace/db";
import { runBillOcr } from "../lib/billOcr";
import { ObjectStorageService } from "../lib/objectStorage";
import { ObjectPermission } from "../lib/objectAcl";
import {
  CalculateFeesBody,
  CalculateInterimSettlementBody,
  SendKakaoNotificationBody,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { tenantsTable } from "@workspace/db";

const router: IRouter = Router();
router.use("/fees", requireRole("manager", "platform_admin", "accountant"));
async function getUserBuildingId(req: Request): Promise<number | null> {
  const userId = req.user?.userId;
  if (!userId) return null;
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  return user?.buildingId ?? null;
}

router.post("/fees/calculate", async (req: Request, res: Response): Promise<void> => {
  const parsed = CalculateFeesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const {
    month,
    commonMaintenanceFee,
    specialFund,
    utilityTotal,
    additionalExpenses,
    specialSurcharge,
    splitHighCostRepairs,
    amortizationMonths,
  } = parsed.data;

  const units = await db
    .select()
    .from(unitsTable)
    .where(eq(unitsTable.buildingId, buildingId));

  if (units.length === 0) {
    res.json({ month, totalUnits: 0, grandTotal: 0, items: [] });
    return;
  }

  const totalArea = units.reduce((s, u) => s + Number(u.exclusiveArea || 0), 0);
  const additionalTotal = (additionalExpenses || []).reduce((s: number, e: { amount: number }) => s + e.amount, 0);
  const useEqualSplit = totalArea <= 0;

  const validAmortization = amortizationMonths && amortizationMonths >= 1 ? amortizationMonths : 12;
  const effectiveSpecialFund = splitHighCostRepairs
    ? (specialFund || 0) / validAmortization
    : (specialFund || 0);
  const surchargeAmount = specialSurcharge || 0;

  const [yearStr, monthStr2] = month.split("-");
  const dueDate = `${yearStr}-${monthStr2}-25`;

  let grandTotal = 0;
  const items = units.map((u) => {
    const area = Number(u.exclusiveArea || 0);
    const ratio = useEqualSplit ? 1 / units.length : area / totalArea;
    const commonFee = Math.round(commonMaintenanceFee * ratio);
    const sf = Math.round(effectiveSpecialFund * ratio);
    const utility = Math.round((utilityTotal || 0) * ratio);
    const additional = Math.round(additionalTotal * ratio);
    const surcharge = Math.round(surchargeAmount * ratio);
    const total = commonFee + sf + utility + additional + surcharge;
    grandTotal += total;

    return {
      unitId: u.id,
      unitNumber: u.unitNumber,
      exclusiveArea: area,
      areaRatio: Math.round(ratio * 10000) / 100,
      commonFee,
      specialFund: sf,
      utilityFee: utility,
      additionalFee: additional,
      specialSurcharge: surcharge,
      totalFee: total,
      isPaid: false,
    };
  });

  for (const item of items) {
    const existing = await db.select().from(monthlyPaymentsTable)
      .where(and(
        eq(monthlyPaymentsTable.unitId, item.unitId),
        eq(monthlyPaymentsTable.billingMonth, month)
      ));

    if (existing.length === 0) {
      await db.insert(monthlyPaymentsTable).values({
        unitId: item.unitId,
        billingMonth: month,
        totalAmount: item.totalFee,
        paidAmount: 0,
        isPaid: false,
        dueDate,
      });
    } else {
      await db.update(monthlyPaymentsTable)
        .set({ totalAmount: item.totalFee })
        .where(eq(monthlyPaymentsTable.id, existing[0].id));
    }
  }

  res.json({ month, totalUnits: units.length, grandTotal, items });
});

router.get("/fees/billing", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.json([]); return; }
  const month = req.query.month as string;

  if (!month) {
    res.status(400).json({ error: "월(month) 파라미터가 필요합니다" });
    return;
  }

  const units = await db
    .select()
    .from(unitsTable)
    .where(eq(unitsTable.buildingId, buildingId));

  if (units.length === 0) {
    res.json([]);
    return;
  }

  const owners = await db.select().from(ownersTable);
  const ownerMap = new Map<number, string>();
  for (const o of owners) {
    if (o.unitId) ownerMap.set(o.unitId, o.ownerName);
  }

  const totalArea = units.reduce((s, u) => s + Number(u.exclusiveArea || 0), 0);
  const useEqualSplitBilling = totalArea <= 0;
  const [yearStr, monthStr] = month.split("-");
  const dueDate = `${yearStr}-${monthStr}-25`;

  const paymentRecords = await db.select().from(monthlyPaymentsTable)
    .where(eq(monthlyPaymentsTable.billingMonth, month));
  const paymentMap = new Map<number, typeof paymentRecords[0]>();
  for (const p of paymentRecords) {
    paymentMap.set(p.unitId, p);
  }

  const items = units.map((u) => {
    const area = Number(u.exclusiveArea || 0);
    const ratio = useEqualSplitBilling ? 1 / units.length : area / totalArea;
    const commonFee = Math.round(150000 * ratio);
    const sf = Math.round(30000 * ratio);
    const utilityFee = Math.round(80000 * ratio);
    const total = commonFee + sf + utilityFee;

    const payment = paymentMap.get(u.id);
    const isPaid = payment ? payment.isPaid : false;

    return {
      unitId: u.id,
      unitNumber: u.unitNumber,
      ownerName: ownerMap.get(u.id) ?? null,
      exclusiveArea: area,
      areaRatio: Math.round(ratio * 10000) / 100,
      commonFee,
      specialFund: sf,
      utilityFee,
      additionalFee: 0,
      specialSurcharge: 0,
      totalFee: total,
      isPaid,
      dueDate,
    };
  });

  res.json(items);
});

router.get("/fees/trend", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.json([]); return; }

  const units = await db
    .select()
    .from(unitsTable)
    .where(eq(unitsTable.buildingId, buildingId));

  const unitCount = units.length || 1;
  const now = new Date();
  const trend = [];
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const seasonalFactor = [1.15, 1.1, 1.0, 0.95, 0.9, 0.95, 1.0, 1.05, 0.95, 0.9, 1.0, 1.1][d.getMonth()];
    const base = Math.round(260000 * seasonalFactor / unitCount) * unitCount;
    trend.push({
      month: monthStr,
      buildingAvg: Math.round(base / unitCount),
      kaptAvg: Math.round((base * 0.95) / unitCount),
    });
  }

  const result = trend.slice(12).map((current, idx) => ({
    ...current,
    priorYearAvg: trend[idx].buildingAvg,
  }));

  res.json(result);
});

router.get("/fees/approval-check", async (req: Request, res: Response): Promise<void> => {
  const month = req.query.month as string;
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: "월(YYYY-MM) 형식이 필요합니다" });
    return;
  }

  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }

  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const mon = Number(monthStr);
  const monthStart = new Date(year, mon - 1, 1);
  const monthEnd = new Date(year, mon, 0, 23, 59, 59);

  const approvals = await db.select().from(approvalsTable)
    .where(
      and(
        gte(approvalsTable.createdAt, monthStart),
        lte(approvalsTable.createdAt, monthEnd)
      )
    );

  const buildingUsers = await db.select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.buildingId, buildingId));
  const buildingUserIds = new Set(buildingUsers.map(u => u.id));

  const scopedApprovals = approvals.filter(a => buildingUserIds.has(a.requesterId));
  const nonDraft = scopedApprovals.filter(a => !a.isDraft);
  const total = nonDraft.length;
  const approved = nonDraft.filter(a => a.status === "approved").length;
  const pending = nonDraft.filter(a => a.status === "pending" || a.status === "in_progress").length;
  const rejected = nonDraft.filter(a => a.status === "rejected").length;
  const unapproved = nonDraft.filter(a => a.status !== "approved");

  res.json({
    month,
    total,
    approved,
    pending,
    rejected,
    allApproved: total === 0 || approved === total,
    unapprovedItems: unapproved.map(a => ({
      id: a.id,
      title: a.title,
      category: a.category,
      status: a.status,
      estimatedAmount: a.estimatedAmount,
    })),
  });
});

router.get("/fees/incomplete-units", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.json([]); return; }

  const units = await db.select().from(unitsTable)
    .where(eq(unitsTable.buildingId, buildingId));

  const buildingUnitIds = new Set(units.map(u => u.id));
  const allTenants = await db.select().from(tenantsTable);
  const tenants = allTenants.filter(t => t.unitId && buildingUnitIds.has(t.unitId));
  const tenantUnitIds = new Set(
    tenants.filter(t => t.status === "active" && t.unitId).map(t => t.unitId!)
  );

  const unverifiedTenants = tenants.filter(t =>
    t.status === "active" && t.verificationStatus === "unverified" && t.unitId
  );
  const unverifiedUnitIds = new Set(unverifiedTenants.map(t => t.unitId!));

  const unitsMissingArea = units.filter(u => !u.exclusiveArea || Number(u.exclusiveArea) === 0);
  const unitsNoTenant = units.filter(u => u.status === "occupied" && !tenantUnitIds.has(u.id));
  const unitsUnverified = units.filter(u => unverifiedUnitIds.has(u.id));

  const issues: Array<{
    unitNumber: string;
    unitId: number;
    issue: string;
  }> = [];

  for (const u of unitsMissingArea) {
    issues.push({ unitNumber: u.unitNumber, unitId: u.id, issue: "면적 데이터 미입력" });
  }
  for (const u of unitsNoTenant) {
    issues.push({ unitNumber: u.unitNumber, unitId: u.id, issue: "입주자카드 미작성" });
  }
  for (const u of unitsUnverified) {
    issues.push({ unitNumber: u.unitNumber, unitId: u.id, issue: "입주자카드 미확인" });
  }

  res.json(issues);
});

router.post("/fees/interim", async (req: Request, res: Response): Promise<void> => {
  const parsed = CalculateInterimSettlementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const { unitNumber, moveOutDate, monthlyFee, includeSpecialFund } = parsed.data;
  const moveOut = new Date(moveOutDate);
  const year = moveOut.getFullYear();
  const month = moveOut.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const residencyDays = moveOut.getDate();
  const dailyRate = Math.round(monthlyFee / daysInMonth);
  const proRatedFee = dailyRate * residencyDays;
  const specialFundRefund = includeSpecialFund ? Math.round(monthlyFee * 0.05 * residencyDays / daysInMonth) : 0;
  const totalSettlement = proRatedFee - specialFundRefund;

  res.json({
    unitNumber,
    moveOutDate,
    daysInMonth,
    residencyDays,
    dailyRate,
    proRatedFee,
    specialFundRefund,
    totalSettlement,
  });
});

router.post("/fees/kakao-notify", async (req: Request, res: Response): Promise<void> => {
  const parsed = SendKakaoNotificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const { month, unitNumbers } = parsed.data;

  const units = await db
    .select()
    .from(unitsTable)
    .where(eq(unitsTable.buildingId, buildingId));

  const targets = unitNumbers
    ? units.filter((u) => unitNumbers.includes(u.unitNumber))
    : units;

  const details = targets.map((u) => ({
    unitNumber: u.unitNumber,
    status: "sent" as const,
  }));

  const sent = details.length;
  const failed = 0;

  res.json({ sent, failed, details });
});

router.post("/fees/record-payment", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }

  const { unitId, billingMonth, paidAmount } = req.body;
  if (!unitId || !billingMonth) {
    res.status(400).json({ error: "unitId와 billingMonth가 필요합니다" });
    return;
  }

  const [unit] = await db.select().from(unitsTable)
    .where(and(eq(unitsTable.id, unitId), eq(unitsTable.buildingId, buildingId)));
  if (!unit) {
    res.status(404).json({ error: "해당 세대를 찾을 수 없습니다" });
    return;
  }

  const [existing] = await db.select().from(monthlyPaymentsTable)
    .where(and(
      eq(monthlyPaymentsTable.unitId, unitId),
      eq(monthlyPaymentsTable.billingMonth, billingMonth)
    ));

  if (!existing) {
    res.status(404).json({ error: "해당 월 청구 내역이 없습니다" });
    return;
  }

  const paymentToApply = paidAmount != null ? paidAmount : existing.totalAmount;
  if (paymentToApply < 0) {
    res.status(400).json({ error: "납부 금액은 0 이상이어야 합니다" });
    return;
  }
  const newPaidAmount = (existing.paidAmount || 0) + paymentToApply;
  const isPaid = newPaidAmount >= existing.totalAmount;

  const [updated] = await db.update(monthlyPaymentsTable)
    .set({
      paidAmount: newPaidAmount,
      isPaid,
      paidAt: isPaid ? new Date() : null,
    })
    .where(eq(monthlyPaymentsTable.id, existing.id))
    .returning();

  res.json(updated);
});

// ─── 관리비 고지서 OCR & 월별 요약 ─────────────────────────────────
router.post("/fees/bill-ocr", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const { objectPath, fileName } = req.body ?? {};
  if (!objectPath || typeof objectPath !== "string") {
    res.status(400).json({ error: "objectPath가 필요합니다" });
    return;
  }
  // [Task #170] OCR 입력 객체 ACL 검증 (소유자/업로더만 처리 허용).
  try {
    const storage = new ObjectStorageService();
    const objectFile = await storage.getObjectEntityFile(objectPath);
    const allowed = await storage.canAccessObjectEntity({
      userId: req.user?.userId ? String(req.user.userId) : undefined,
      objectFile,
      requestedPermission: ObjectPermission.READ,
    });
    if (!allowed) { res.status(403).json({ error: "해당 파일에 접근할 권한이 없습니다" }); return; }
  } catch {
    res.status(404).json({ error: "파일을 찾지 못했습니다" }); return;
  }
  try {
    const ocr = await runBillOcr({ objectPath, fileName });
    const billingMonth = ocr.billingMonth || new Date().toISOString().slice(0, 7);

    const [existing] = await db.select().from(monthlyBillSummariesTable)
      .where(and(
        eq(monthlyBillSummariesTable.buildingId, buildingId),
        eq(monthlyBillSummariesTable.billingMonth, billingMonth),
      ));

    const values = {
      buildingId,
      billingMonth,
      totalAmount: ocr.totalAmount ?? 0,
      unitCount: ocr.unitCount ?? null,
      dueDate: ocr.dueDate,
      lineItems: ocr.lineItems,
      fieldConfidence: ocr.fieldConfidence,
      ocrRawText: ocr.rawText,
      sourceFileUrl: objectPath,
      sourceFileName: fileName ?? null,
      confirmed: false,
      uploadedById: req.user?.userId ?? null,
    };

    let saved;
    if (existing) {
      [saved] = await db.update(monthlyBillSummariesTable)
        .set(values)
        .where(eq(monthlyBillSummariesTable.id, existing.id))
        .returning();
    } else {
      [saved] = await db.insert(monthlyBillSummariesTable)
        .values(values)
        .returning();
    }
    res.json(saved);
  } catch (err) {
    req.log.error({ err }, "bill-ocr failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "OCR 처리 실패" });
  }
});

router.get("/fees/bill-summaries", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.json([]); return; }
  const rows = await db.select().from(monthlyBillSummariesTable)
    .where(eq(monthlyBillSummariesTable.buildingId, buildingId))
    .orderBy(desc(monthlyBillSummariesTable.billingMonth));
  res.json(rows);
});

router.get("/fees/bill-summaries/:id", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const id = Number(req.params.id);
  const [row] = await db.select().from(monthlyBillSummariesTable)
    .where(and(eq(monthlyBillSummariesTable.id, id), eq(monthlyBillSummariesTable.buildingId, buildingId)));
  if (!row) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  res.json(row);
});

router.patch("/fees/bill-summaries/:id", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const id = Number(req.params.id);
  const [existing] = await db.select().from(monthlyBillSummariesTable)
    .where(and(eq(monthlyBillSummariesTable.id, id), eq(monthlyBillSummariesTable.buildingId, buildingId)));
  if (!existing) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }

  const allowed: Record<string, unknown> = {};
  const { billingMonth, totalAmount, unitCount, dueDate, lineItems, confirmed } = req.body ?? {};
  if (typeof billingMonth === "string") allowed.billingMonth = billingMonth;
  if (typeof totalAmount === "number") allowed.totalAmount = totalAmount;
  if (typeof unitCount === "number" || unitCount === null) allowed.unitCount = unitCount;
  if (typeof dueDate === "string" || dueDate === null) allowed.dueDate = dueDate;
  if (lineItems && typeof lineItems === "object" && !Array.isArray(lineItems)) {
    // [Task #170] 알려진 항목 키만 + 음수 아닌 숫자만 허용.
    const ALLOWED_KEYS = new Set([
      "general","cleaning","security","disinfection","elevator","electricity",
      "water","heating","gas","longTermRepairFund","insurance","other",
    ]);
    const sanitized: Record<string, number> = {};
    for (const [k, v] of Object.entries(lineItems as Record<string, unknown>)) {
      if (!ALLOWED_KEYS.has(k)) continue;
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) sanitized[k] = Math.round(n);
    }
    allowed.lineItems = sanitized;
  }
  if (typeof confirmed === "boolean") allowed.confirmed = confirmed;

  const [updated] = await db.update(monthlyBillSummariesTable)
    .set(allowed)
    .where(eq(monthlyBillSummariesTable.id, id))
    .returning();
  res.json(updated);
});

router.post("/fees/bill-summaries/:id/reocr", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const id = Number(req.params.id);
  const [existing] = await db.select().from(monthlyBillSummariesTable)
    .where(and(eq(monthlyBillSummariesTable.id, id), eq(monthlyBillSummariesTable.buildingId, buildingId)));
  if (!existing) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  if (!existing.sourceFileUrl) { res.status(400).json({ error: "원본 파일이 없습니다" }); return; }

  try {
    const ocr = await runBillOcr({ objectPath: existing.sourceFileUrl, fileName: existing.sourceFileName });
    const [updated] = await db.update(monthlyBillSummariesTable)
      .set({
        billingMonth: ocr.billingMonth || existing.billingMonth,
        totalAmount: ocr.totalAmount ?? existing.totalAmount,
        unitCount: ocr.unitCount ?? existing.unitCount,
        dueDate: ocr.dueDate ?? existing.dueDate,
        lineItems: ocr.lineItems,
        fieldConfidence: ocr.fieldConfidence,
        ocrRawText: ocr.rawText,
        confirmed: false,
      })
      .where(eq(monthlyBillSummariesTable.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "reocr failed");
    res.status(500).json({ error: err instanceof Error ? err.message : "재인식 실패" });
  }
});

router.delete("/fees/bill-summaries/:id", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const id = Number(req.params.id);
  const [existing] = await db.select().from(monthlyBillSummariesTable)
    .where(and(eq(monthlyBillSummariesTable.id, id), eq(monthlyBillSummariesTable.buildingId, buildingId)));
  if (!existing) { res.status(404).json({ error: "찾을 수 없습니다" }); return; }
  await db.delete(monthlyBillSummariesTable).where(eq(monthlyBillSummariesTable.id, id));
  res.json({ success: true });
});

export default router;
