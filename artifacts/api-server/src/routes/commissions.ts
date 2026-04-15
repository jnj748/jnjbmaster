import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, commissionsTable, notificationsTable, vendorsTable } from "@workspace/db";
import {
  ListCommissionsResponse,
  CreateCommissionBody,
  UpdateCommissionParams,
  UpdateCommissionBody,
  UpdateCommissionResponse,
  AutoSettleCommissionBody,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireRole("manager", "platform_admin", "partner"));

const DEFAULT_COMMISSION_RATE = 7;
const MIN_COMMISSION_RATE = 5;
const MAX_COMMISSION_RATE = 10;

function calculateCommissionRate(contractAmount: number): number {
  if (contractAmount >= 50000000) return MIN_COMMISSION_RATE;
  if (contractAmount >= 10000000) return 6;
  if (contractAmount >= 5000000) return DEFAULT_COMMISSION_RATE;
  if (contractAmount >= 1000000) return 8;
  return MAX_COMMISSION_RATE;
}

router.get("/commissions", async (_req, res): Promise<void> => {
  const commissions = await db
    .select()
    .from(commissionsTable)
    .orderBy(commissionsTable.createdAt);

  res.json(ListCommissionsResponse.parse(commissions));
});

router.post("/commissions", async (req, res): Promise<void> => {
  const parsed = CreateCommissionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [commission] = await db.insert(commissionsTable).values(parsed.data).returning();
  res.status(201).json(UpdateCommissionResponse.parse(commission));
});

router.post("/commissions/auto-settle", async (req, res): Promise<void> => {
  const parsed = AutoSettleCommissionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, parsed.data.vendorId));
    if (!vendor) {
      res.status(404).json({ error: "업체를 찾을 수 없습니다" });
      return;
    }

    const verifiedVendorName = vendor.name;
    const rate = parsed.data.commissionRate ?? calculateCommissionRate(parsed.data.contractAmount);
    const clampedRate = Math.max(MIN_COMMISSION_RATE, Math.min(MAX_COMMISSION_RATE, rate));
    const commissionAmount = Math.round(parsed.data.contractAmount * clampedRate / 100);

    const todayStr = new Date().toISOString().split("T")[0];
    const noteParts = ["[자동 정산]"];
    if (parsed.data.inspectionId) noteParts.push(`점검 ID: ${parsed.data.inspectionId}`);
    if (parsed.data.rfqId) noteParts.push(`견적요청 ID: ${parsed.data.rfqId}`);
    if (parsed.data.notes) noteParts.push(parsed.data.notes);

    const [commission] = await db.insert(commissionsTable).values({
      vendorId: parsed.data.vendorId,
      vendorName: verifiedVendorName,
      contractAmount: parsed.data.contractAmount,
      commissionRate: clampedRate,
      commissionAmount,
      status: "pending",
      matchedDate: todayStr,
      notes: noteParts.join(" | "),
    }).returning();

    await db.insert(notificationsTable).values({
      recipientType: "admin",
      notificationType: "commission_settled",
      title: `[수수료 자동 정산] ${verifiedVendorName}`,
      message: `${verifiedVendorName}과의 계약(${parsed.data.contractAmount.toLocaleString()}원)에 대해 수수료 ${commissionAmount.toLocaleString()}원(${clampedRate}%)이 자동 정산되었습니다.`,
      relatedEntityType: "commission",
      relatedEntityId: commission.id,
    });

    res.status(201).json({
      commission: UpdateCommissionResponse.parse(commission),
      message: `수수료 ${commissionAmount.toLocaleString()}원(${clampedRate}%)이 자동 정산되었습니다.`,
    });
  } catch (error) {
    res.status(500).json({ error: "수수료 자동 정산 중 오류가 발생했습니다" });
  }
});

router.patch("/commissions/:id", async (req, res): Promise<void> => {
  const params = UpdateCommissionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateCommissionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [commission] = await db
    .update(commissionsTable)
    .set(parsed.data)
    .where(eq(commissionsTable.id, params.data.id))
    .returning();

  if (!commission) {
    res.status(404).json({ error: "Commission not found" });
    return;
  }

  res.json(UpdateCommissionResponse.parse(commission));
});

export default router;
