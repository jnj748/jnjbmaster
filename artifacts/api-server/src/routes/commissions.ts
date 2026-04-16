import { Router, type IRouter } from "express";
import { eq, desc, sql, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  commissionsTable,
  commissionEventsTable,
  commissionRatesTable,
  notificationsTable,
  vendorsTable,
  usersTable,
  type SlidingRule,
} from "@workspace/db";
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
router.use(requireRole("manager", "platform_admin", "partner", "hq_executive", "accountant"));

export const DEFAULT_REGULAR_RATE = 5;
export const DEFAULT_SLIDING_RULES: SlidingRule[] = [
  { minAmount: 0, maxAmount: 5_000_000, ratePercent: 10 },
  { minAmount: 5_000_000, maxAmount: 20_000_000, ratePercent: 7 },
  { minAmount: 20_000_000, maxAmount: null, ratePercent: 5 },
];

export async function computeCommissionRate(category: string, contractAmount: number): Promise<number> {
  const [row] = await db.select().from(commissionRatesTable).where(eq(commissionRatesTable.category, category));
  if (!row) return DEFAULT_REGULAR_RATE;
  if (row.rateType === "fixed") return row.fixedRate;
  let rules: SlidingRule[] = DEFAULT_SLIDING_RULES;
  if (row.slidingRules) {
    try {
      const parsed = JSON.parse(row.slidingRules);
      if (Array.isArray(parsed)) rules = parsed;
    } catch {
      // fall back to default
    }
  }
  const match = rules.find(
    (r) => contractAmount >= r.minAmount && (r.maxAmount == null || contractAmount < r.maxAmount)
  );
  return match?.ratePercent ?? DEFAULT_REGULAR_RATE;
}

router.get("/commissions", async (req, res): Promise<void> => {
  const isPartner = req.user?.role === "partner";
  let vendorId: number | null = null;
  if (isPartner) {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
    vendorId = u?.vendorId ?? null;
    if (!vendorId) {
      res.json([]);
      return;
    }
  }

  const rows = isPartner && vendorId
    ? await db.select().from(commissionsTable).where(eq(commissionsTable.vendorId, vendorId)).orderBy(desc(commissionsTable.createdAt))
    : await db.select().from(commissionsTable).orderBy(desc(commissionsTable.createdAt));

  res.json(ListCommissionsResponse.parse(rows));
});

router.get("/commissions/pipeline", requireRole("platform_admin", "hq_executive", "accountant"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(commissionsTable);
  const nowMs = Date.now();
  const DELAY_DAYS = 14;
  const summary: Record<string, { count: number; amount: number; delayed: number }> = {
    pending: { count: 0, amount: 0, delayed: 0 },
    billed: { count: 0, amount: 0, delayed: 0 },
    collected: { count: 0, amount: 0, delayed: 0 },
    completed: { count: 0, amount: 0, delayed: 0 },
    cancelled: { count: 0, amount: 0, delayed: 0 },
  };
  const delayed: typeof rows = [];
  for (const r of rows) {
    const bucket = summary[r.status] ?? (summary[r.status] = { count: 0, amount: 0, delayed: 0 });
    bucket.count += 1;
    bucket.amount += r.commissionAmount ?? 0;
    if (r.status === "pending" || r.status === "billed" || r.status === "collected") {
      const ref = r.status === "pending" ? r.createdAt : r.status === "billed" ? r.billedAt : r.collectedAt;
      if (ref && nowMs - new Date(ref).getTime() > DELAY_DAYS * 24 * 60 * 60 * 1000) {
        bucket.delayed += 1;
        delayed.push(r);
      }
    }
  }
  res.json({ summary, delayed });
});

router.get("/commissions/rates", async (_req, res): Promise<void> => {
  const rows = await db.select().from(commissionRatesTable).orderBy(commissionRatesTable.category);
  res.json(rows);
});

const UpsertRateBody = z.object({
  category: z.string().min(1),
  rateType: z.enum(["fixed", "sliding"]),
  fixedRate: z.number().min(0).max(100).optional(),
  slidingRules: z.array(z.object({ minAmount: z.number(), maxAmount: z.number().nullable(), ratePercent: z.number() })).optional(),
  description: z.string().optional().nullable(),
});

router.put("/commissions/rates", requireRole("platform_admin", "hq_executive"), async (req, res): Promise<void> => {
  const parsed = UpsertRateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = {
    category: parsed.data.category,
    rateType: parsed.data.rateType,
    fixedRate: parsed.data.fixedRate ?? DEFAULT_REGULAR_RATE,
    slidingRules: parsed.data.slidingRules ? JSON.stringify(parsed.data.slidingRules) : null,
    description: parsed.data.description ?? null,
  };
  const existing = await db.select().from(commissionRatesTable).where(eq(commissionRatesTable.category, parsed.data.category));
  if (existing.length > 0) {
    const [updated] = await db.update(commissionRatesTable).set(data).where(eq(commissionRatesTable.category, parsed.data.category)).returning();
    res.json(updated);
    return;
  }
  const [created] = await db.insert(commissionRatesTable).values(data).returning();
  res.status(201).json(created);
});

router.post("/commissions", requireRole("manager", "platform_admin", "hq_executive"), async (req, res): Promise<void> => {
  const parsed = CreateCommissionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [commission] = await db.insert(commissionsTable).values(parsed.data).returning();
  await db.insert(commissionEventsTable).values({
    commissionId: commission.id,
    fromStatus: null,
    toStatus: "pending",
    reason: "수동 생성",
    actorId: req.user?.userId ?? null,
    actorName: req.user?.email ?? null,
  });
  res.status(201).json(UpdateCommissionResponse.parse(commission));
});

const MIN_COMMISSION_RATE = 5;
const MAX_COMMISSION_RATE = 10;

router.post("/commissions/auto-settle", requireRole("manager", "platform_admin"), async (req, res): Promise<void> => {
  const parsed = AutoSettleCommissionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, parsed.data.vendorId));
  if (!vendor) {
    res.status(404).json({ error: "업체를 찾을 수 없습니다" });
    return;
  }

  const rate = parsed.data.commissionRate ?? (await computeCommissionRate(vendor.category, parsed.data.contractAmount));
  const clampedRate = Math.max(MIN_COMMISSION_RATE, Math.min(MAX_COMMISSION_RATE, rate));
  const commissionAmount = Math.round((parsed.data.contractAmount * clampedRate) / 100);
  const todayStr = new Date().toISOString().split("T")[0];
  const noteParts = ["[자동 정산]"];
  if (parsed.data.inspectionId) noteParts.push(`점검 ID: ${parsed.data.inspectionId}`);
  if (parsed.data.rfqId) noteParts.push(`견적요청 ID: ${parsed.data.rfqId}`);
  if (parsed.data.notes) noteParts.push(parsed.data.notes);

  const [commission] = await db.insert(commissionsTable).values({
    vendorId: parsed.data.vendorId,
    vendorName: vendor.name,
    contractAmount: parsed.data.contractAmount,
    commissionRate: clampedRate,
    commissionAmount,
    status: "pending",
    matchedDate: todayStr,
    notes: noteParts.join(" | "),
    rfqId: parsed.data.rfqId ?? null,
    category: vendor.category,
  }).returning();

  await db.insert(commissionEventsTable).values({
    commissionId: commission.id,
    fromStatus: null,
    toStatus: "pending",
    reason: "자동 생성",
    actorId: req.user?.userId ?? null,
    actorName: req.user?.email ?? null,
  });

  await db.insert(notificationsTable).values({
    recipientType: "admin",
    notificationType: "commission_settled",
    title: `[수수료 자동 정산] ${vendor.name}`,
    message: `${vendor.name}과의 계약(${parsed.data.contractAmount.toLocaleString()}원)에 대해 수수료 ${commissionAmount.toLocaleString()}원(${clampedRate}%)이 자동 정산되었습니다.`,
    relatedEntityType: "commission",
    relatedEntityId: commission.id,
  });

  res.status(201).json({
    commission: UpdateCommissionResponse.parse(commission),
    message: `수수료 ${commissionAmount.toLocaleString()}원(${clampedRate}%)이 자동 정산되었습니다.`,
  });
});

const TransitionBody = z.object({
  toStatus: z.enum(["pending", "billed", "collected", "completed", "cancelled"]),
  reason: z.string().optional().nullable(),
});

const validTransitions: Record<string, string[]> = {
  pending: ["billed", "cancelled"],
  billed: ["collected", "cancelled"],
  collected: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

router.post("/commissions/:id/transition", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id invalid" });
    return;
  }
  const parsed = TransitionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [commission] = await db.select().from(commissionsTable).where(eq(commissionsTable.id, id));
  if (!commission) {
    res.status(404).json({ error: "Commission not found" });
    return;
  }
  const { toStatus } = parsed.data;
  const allowed = validTransitions[commission.status] ?? [];
  if (!allowed.includes(toStatus)) {
    res.status(400).json({ error: `${commission.status} 상태에서 ${toStatus}로 전환할 수 없습니다` });
    return;
  }

  const role = req.user?.role;
  if (toStatus === "billed" && !["manager", "platform_admin"].includes(role ?? "")) {
    res.status(403).json({ error: "권한이 없습니다" });
    return;
  }
  if (toStatus === "collected" && !["manager", "platform_admin", "partner"].includes(role ?? "")) {
    res.status(403).json({ error: "권한이 없습니다" });
    return;
  }
  if ((toStatus === "completed" || toStatus === "cancelled") && !["platform_admin", "hq_executive"].includes(role ?? "")) {
    res.status(403).json({ error: "권한이 없습니다" });
    return;
  }

  if (req.user?.role === "partner") {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.userId));
    if (!u || u.vendorId !== commission.vendorId) {
      res.status(403).json({ error: "본인 건만 처리 가능합니다" });
      return;
    }
  }

  const now = new Date();
  let invoicePatch: { invoiceNumber?: string; invoiceIssuedAt?: Date } = {};
  if (toStatus === "billed" && !commission.invoiceNumber) {
    const invoiceNumber = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${String(commission.id).padStart(6, "0")}`;
    invoicePatch = { invoiceNumber, invoiceIssuedAt: now };
  }
  const patch: Partial<typeof commissionsTable.$inferInsert> = {
    status: toStatus,
    ...(toStatus === "billed" ? { billedAt: now, ...invoicePatch } : {}),
    ...(toStatus === "collected" ? { collectedAt: now } : {}),
    ...(toStatus === "completed" ? { completedAt: now } : {}),
  };

  const [updated] = await db.update(commissionsTable).set(patch).where(eq(commissionsTable.id, id)).returning();

  const [actor] = req.user?.userId ? await db.select().from(usersTable).where(eq(usersTable.id, req.user.userId)) : [];
  await db.insert(commissionEventsTable).values({
    commissionId: id,
    fromStatus: commission.status,
    toStatus,
    reason: parsed.data.reason ?? null,
    actorId: req.user?.userId ?? null,
    actorName: actor?.name ?? req.user?.email ?? null,
  });

  res.json(UpdateCommissionResponse.parse(updated));
});

router.get("/commissions/:id/events", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id invalid" });
    return;
  }
  const [commission] = await db.select().from(commissionsTable).where(eq(commissionsTable.id, id));
  if (!commission) {
    res.status(404).json({ error: "Commission not found" });
    return;
  }
  if (req.user?.role === "partner") {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.userId));
    if (!u || u.vendorId !== commission.vendorId) {
      res.status(403).json({ error: "본인 업체 건만 조회할 수 있습니다" });
      return;
    }
  }
  const rows = await db.select().from(commissionEventsTable).where(eq(commissionEventsTable.commissionId, id)).orderBy(desc(commissionEventsTable.createdAt));
  res.json(rows);
});

router.get("/commissions/:id/invoice", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "id invalid" });
    return;
  }
  const [commission] = await db.select().from(commissionsTable).where(eq(commissionsTable.id, id));
  if (!commission) {
    res.status(404).json({ error: "Commission not found" });
    return;
  }
  if (req.user?.role === "partner") {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.userId));
    if (!u || u.vendorId !== commission.vendorId) {
      res.status(403).json({ error: "본인 업체 건만 조회할 수 있습니다" });
      return;
    }
  }
  if (!commission.invoiceNumber) {
    res.status(404).json({ error: "청구서가 아직 발행되지 않았습니다" });
    return;
  }
  res.json({
    invoiceNumber: commission.invoiceNumber,
    issuedAt: commission.invoiceIssuedAt,
    vendorId: commission.vendorId,
    vendorName: commission.vendorName,
    contractAmount: commission.contractAmount,
    commissionRate: commission.commissionRate,
    commissionAmount: commission.commissionAmount,
    category: commission.category,
    matchedDate: commission.matchedDate,
    status: commission.status,
  });
});

router.patch("/commissions/:id", requireRole("manager", "platform_admin", "hq_executive"), async (req, res): Promise<void> => {
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

  // Pipeline status changes must go through POST /commissions/:id/transition
  // so they are validated against the allowed-transition graph and logged
  // in commission_events. Reject attempts to mutate pipeline status here.
  const pipelineStatuses = new Set(["pending", "billed", "collected", "completed", "cancelled"]);
  if (parsed.data.status && pipelineStatuses.has(parsed.data.status)) {
    res.status(400).json({
      error: "상태 변경은 /commissions/:id/transition 을 통해서만 가능합니다",
    });
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
