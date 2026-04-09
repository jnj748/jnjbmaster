import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, rfqsTable } from "@workspace/db";
import {
  ListRfqsQueryParams,
  ListRfqsResponse,
  CreateRfqBody,
  GetRfqParams,
  GetRfqResponse,
  UpdateRfqParams,
  UpdateRfqBody,
  UpdateRfqResponse,
  DeleteRfqParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/rfqs", async (req, res): Promise<void> => {
  const params = ListRfqsQueryParams.safeParse(req.query);
  const conditions = [];

  if (params.success && params.data.status) {
    conditions.push(eq(rfqsTable.status, params.data.status));
  }

  const rfqs = await db
    .select()
    .from(rfqsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(rfqsTable.createdAt));

  if (params.success && params.data.vendorId) {
    const vendorId = params.data.vendorId.toString();
    const filtered = rfqs.filter((r) => {
      if (!r.vendorIds) return false;
      return r.vendorIds.split(",").includes(vendorId);
    });
    res.json(ListRfqsResponse.parse(filtered));
    return;
  }

  res.json(ListRfqsResponse.parse(rfqs));
});

router.get("/rfqs/:id", async (req, res): Promise<void> => {
  const params = GetRfqParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [rfq] = await db
    .select()
    .from(rfqsTable)
    .where(eq(rfqsTable.id, params.data.id));

  if (!rfq) {
    res.status(404).json({ error: "RFQ not found" });
    return;
  }

  res.json(GetRfqResponse.parse(rfq));
});

router.post("/rfqs", async (req, res): Promise<void> => {
  const parsed = CreateRfqBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [rfq] = await db.insert(rfqsTable).values(parsed.data).returning();
  res.status(201).json(UpdateRfqResponse.parse(rfq));
});

router.patch("/rfqs/:id", async (req, res): Promise<void> => {
  const params = UpdateRfqParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateRfqBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [rfq] = await db
    .update(rfqsTable)
    .set(parsed.data)
    .where(eq(rfqsTable.id, params.data.id))
    .returning();

  if (!rfq) {
    res.status(404).json({ error: "RFQ not found" });
    return;
  }

  res.json(UpdateRfqResponse.parse(rfq));
});

router.delete("/rfqs/:id", async (req, res): Promise<void> => {
  const params = DeleteRfqParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [rfq] = await db
    .delete(rfqsTable)
    .where(eq(rfqsTable.id, params.data.id))
    .returning();

  if (!rfq) {
    res.status(404).json({ error: "RFQ not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
