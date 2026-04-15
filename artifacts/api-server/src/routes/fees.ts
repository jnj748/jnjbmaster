import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, gte, lte } from "drizzle-orm";
import { db, unitsTable, usersTable, ownersTable, approvalsTable } from "@workspace/db";
import {
  CalculateFeesBody,
  CalculateInterimSettlementBody,
  SendKakaoNotificationBody,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";
import { tenantsTable } from "@workspace/db";

const router: IRouter = Router();
router.use(requireRole("manager", "platform_admin", "accountant"));

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

  const items = units.map((u) => {
    const area = Number(u.exclusiveArea || 0);
    const ratio = useEqualSplitBilling ? 1 / units.length : area / totalArea;
    const commonFee = Math.round(150000 * ratio);
    const sf = Math.round(30000 * ratio);
    const utilityFee = Math.round(80000 * ratio);
    const total = commonFee + sf + utilityFee;

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
      isPaid: u.status === "occupied",
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

  const tenants = await db.select().from(tenantsTable);
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

export default router;
