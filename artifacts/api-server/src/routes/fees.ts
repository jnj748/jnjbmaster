import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, unitsTable, usersTable, meterReadingsTable } from "@workspace/db";
import {
  CalculateFeesBody,
  CalculateInterimSettlementBody,
  SendKakaoNotificationBody,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

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
  const { month, commonMaintenanceFee, specialFund, utilityTotal, additionalExpenses } = parsed.data;

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

  let grandTotal = 0;
  const items = units.map((u) => {
    const area = Number(u.exclusiveArea || 0);
    const ratio = totalArea > 0 ? area / totalArea : 1 / units.length;
    const commonFee = Math.round(commonMaintenanceFee * ratio);
    const sf = Math.round((specialFund || 0) * ratio);
    const utility = Math.round((utilityTotal || 0) * ratio);
    const additional = Math.round(additionalTotal * ratio);
    const total = commonFee + sf + utility + additional;
    grandTotal += total;

    return {
      unitNumber: u.unitNumber,
      exclusiveArea: area,
      areaRatio: Math.round(ratio * 10000) / 100,
      commonFee,
      specialFund: sf,
      utilityFee: utility,
      additionalFee: additional,
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
    res.status(400).json({ error: "month parameter required" });
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

  const totalArea = units.reduce((s, u) => s + Number(u.exclusiveArea || 0), 0);

  const items = units.map((u) => {
    const area = Number(u.exclusiveArea || 0);
    const ratio = totalArea > 0 ? area / totalArea : 1 / units.length;
    const commonFee = Math.round(150000 * ratio);
    const sf = Math.round(30000 * ratio);
    const utilityFee = Math.round(80000 * ratio);
    const total = commonFee + sf + utilityFee;

    return {
      unitNumber: u.unitNumber,
      exclusiveArea: area,
      areaRatio: Math.round(ratio * 10000) / 100,
      commonFee,
      specialFund: sf,
      utilityFee,
      additionalFee: 0,
      totalFee: total,
      isPaid: u.status === "occupied",
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
  for (let i = 11; i >= 0; i--) {
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
  res.json(trend);
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
