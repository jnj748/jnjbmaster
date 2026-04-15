import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, settlementsTable } from "@workspace/db";
import {
  ListSettlementsQueryParams,
  ListSettlementsResponse,
  CreateSettlementBody,
  UpdateSettlementParams,
  UpdateSettlementBody,
  UpdateSettlementResponse,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireRole("manager", "platform_admin", "accountant"));

router.get("/settlements", async (req, res): Promise<void> => {
  const params = ListSettlementsQueryParams.safeParse(req.query);
  const conditions = [];

  if (params.success && params.data.vendorId) {
    conditions.push(eq(settlementsTable.vendorId, params.data.vendorId));
  }
  if (params.success && params.data.status) {
    conditions.push(eq(settlementsTable.status, params.data.status));
  }

  const settlements = await db
    .select()
    .from(settlementsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(settlementsTable.createdAt));

  res.json(ListSettlementsResponse.parse(settlements));
});

router.post("/settlements", async (req, res): Promise<void> => {
  const parsed = CreateSettlementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [settlement] = await db.insert(settlementsTable).values(parsed.data).returning();
  res.status(201).json(UpdateSettlementResponse.parse(settlement));
});

router.patch("/settlements/:id", async (req, res): Promise<void> => {
  const params = UpdateSettlementParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateSettlementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [settlement] = await db
    .update(settlementsTable)
    .set(parsed.data)
    .where(eq(settlementsTable.id, params.data.id))
    .returning();

  if (!settlement) {
    res.status(404).json({ error: "Settlement not found" });
    return;
  }

  res.json(UpdateSettlementResponse.parse(settlement));
});

export default router;
