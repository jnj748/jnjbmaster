import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, quotesTable } from "@workspace/db";
import {
  ListQuotesQueryParams,
  ListQuotesResponse,
  CreateQuoteBody,
  GetQuoteParams,
  GetQuoteResponse,
  UpdateQuoteParams,
  UpdateQuoteBody,
  UpdateQuoteResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/quotes", async (req, res): Promise<void> => {
  const params = ListQuotesQueryParams.safeParse(req.query);
  const conditions = [];

  if (params.success && params.data.rfqId) {
    conditions.push(eq(quotesTable.rfqId, params.data.rfqId));
  }
  if (params.success && params.data.vendorId) {
    conditions.push(eq(quotesTable.vendorId, params.data.vendorId));
  }
  if (params.success && params.data.status) {
    conditions.push(eq(quotesTable.status, params.data.status));
  }

  const quotes = await db
    .select()
    .from(quotesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(quotesTable.createdAt));

  res.json(ListQuotesResponse.parse(quotes));
});

router.get("/quotes/:id", async (req, res): Promise<void> => {
  const params = GetQuoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [quote] = await db
    .select()
    .from(quotesTable)
    .where(eq(quotesTable.id, params.data.id));

  if (!quote) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }

  res.json(GetQuoteResponse.parse(quote));
});

router.post("/quotes", async (req, res): Promise<void> => {
  const parsed = CreateQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [quote] = await db.insert(quotesTable).values(parsed.data).returning();
  res.status(201).json(UpdateQuoteResponse.parse(quote));
});

router.patch("/quotes/:id", async (req, res): Promise<void> => {
  const params = UpdateQuoteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [quote] = await db
    .update(quotesTable)
    .set(parsed.data)
    .where(eq(quotesTable.id, params.data.id))
    .returning();

  if (!quote) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }

  res.json(UpdateQuoteResponse.parse(quote));
});

export default router;
