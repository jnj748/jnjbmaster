import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, unitsTable } from "@workspace/db";
import {
  CalculateFeesBody,
  CalculateInterimSettlementBody,
  SendKakaoNotificationBody,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireRole("manager", "platform_admin", "accountant"));

function getUserBuildingId(req: any): number {
  return req.user?.buildingId ?? 1;
}

router.post("/fees/calculate", async (req, res): Promise<void> => {
  const parsed = CalculateFeesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }
  const buildingId = getUserBuildingId(req);
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
  const additionalTotal = (additionalExpenses || []).reduce((s, e) => s + e.amount, 0);

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

router.get("/fees/billing", async (req, res): Promise<void> => {
  const buildingId = getUserBuildingId(req);
  const month = req.query.month as string;

  if (!month) {
    res.status(400).json({ error: "month parameter required" });
    return;
  }

  const units = await db
    .select()
    .from(unitsTable)
    .where(eq(unitsTable.buildingId, buildingId));

  const items = units.map((u) => ({
    unitNumber: u.unitNumber,
    exclusiveArea: Number(u.exclusiveArea || 0),
    areaRatio: 0,
    commonFee: 0,
    specialFund: 0,
    utilityFee: 0,
    additionalFee: 0,
    totalFee: 0,
    isPaid: false,
  }));

  res.json(items);
});

router.get("/fees/trend", async (_req, res): Promise<void> => {
  const now = new Date();
  const trend = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const base = 250000 + Math.round(Math.random() * 50000);
    trend.push({
      month: monthStr,
      buildingAvg: base,
      kaptAvg: Math.round(base * (0.85 + Math.random() * 0.3)),
    });
  }
  res.json(trend);
});

router.post("/fees/interim", async (req, res): Promise<void> => {
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

router.post("/fees/kakao-notify", async (req, res): Promise<void> => {
  const parsed = SendKakaoNotificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues });
    return;
  }

  const buildingId = getUserBuildingId(req);
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
    status: Math.random() > 0.1 ? "sent" : "failed",
  }));

  const sent = details.filter((d) => d.status === "sent").length;
  const failed = details.filter((d) => d.status === "failed").length;

  res.json({ sent, failed, details });
});

export default router;
