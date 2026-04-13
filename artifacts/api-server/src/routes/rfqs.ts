import { Router, type IRouter } from "express";
import { eq, and, desc, or } from "drizzle-orm";
import { db, rfqsTable, vendorsTable } from "@workspace/db";
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
  ExpandRfqScopeParams,
  ExpandRfqScopeResponse,
  GetRfqMatchedVendorsParams,
  GetRfqMatchedVendorsResponse,
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

  if (params.success && params.data.forVendorId) {
    const forVendorId = params.data.forVendorId;
    const vendor = await db
      .select()
      .from(vendorsTable)
      .where(eq(vendorsTable.id, forVendorId))
      .then((rows) => rows[0]);

    if (!vendor) {
      res.json(ListRfqsResponse.parse([]));
      return;
    }

    const vendorIdStr = forVendorId.toString();
    const filtered = rfqs.filter((r) => {
      const isDirectlyInvited =
        r.vendorIds && r.vendorIds.split(",").includes(vendorIdStr);
      if (isDirectlyInvited) return true;

      if (r.status === "open" && vendor.category && vendor.sido) {
        const categoryMatch = r.category === vendor.category;
        const sidoMatch = r.sido === vendor.sido;
        if (categoryMatch && sidoMatch) {
          return true;
        }
      }
      return false;
    });
    res.json(ListRfqsResponse.parse(filtered));
    return;
  }

  res.json(ListRfqsResponse.parse(rfqs));
});

router.get("/rfqs/:id/matched-vendors", async (req, res): Promise<void> => {
  const params = GetRfqMatchedVendorsParams.safeParse(req.params);
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

  const conditions = [
    eq(vendorsTable.type, "platform"),
    eq(vendorsTable.category, rfq.category),
  ];

  if ((rfq.geoScope === "sigungu" || rfq.geoScope === "sido") && rfq.sido) {
    conditions.push(eq(vendorsTable.sido, rfq.sido));
  }

  const matchedVendors = await db
    .select()
    .from(vendorsTable)
    .where(and(...conditions))
    .orderBy(desc(vendorsTable.rating));

  res.json(GetRfqMatchedVendorsResponse.parse(matchedVendors));
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

  const data = { ...parsed.data };

  if (data.sido && data.sigungu && !data.geoScope) {
    data.geoScope = "sigungu";
  } else if (data.sido && !data.sigungu && !data.geoScope) {
    data.geoScope = "sido";
  }

  if (data.sido) {
    const geoConditions = [
      eq(vendorsTable.type, "platform"),
      eq(vendorsTable.category, data.category),
      eq(vendorsTable.sido, data.sido),
    ];

    const matchedVendors = await db
      .select({ id: vendorsTable.id })
      .from(vendorsTable)
      .where(and(...geoConditions));

    const manualIds = data.vendorIds ? data.vendorIds.split(",") : [];
    const geoIds = matchedVendors.map((v) => v.id.toString());
    const allIds = [...new Set([...manualIds, ...geoIds])];

    if (allIds.length > 0) {
      data.vendorIds = allIds.join(",");
    }
  }

  const [rfq] = await db.insert(rfqsTable).values(data).returning();
  res.status(201).json(UpdateRfqResponse.parse(rfq));
});

router.patch("/rfqs/:id/expand-scope", async (req, res): Promise<void> => {
  const params = ExpandRfqScopeParams.safeParse(req.params);
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

  if (!rfq.sido) {
    res.status(400).json({ error: "RFQ has no geo information" });
    return;
  }

  const matchedVendors = await db
    .select({ id: vendorsTable.id })
    .from(vendorsTable)
    .where(
      and(
        eq(vendorsTable.type, "platform"),
        eq(vendorsTable.category, rfq.category),
        eq(vendorsTable.sido, rfq.sido)
      )
    );

  const existingIds = rfq.vendorIds ? rfq.vendorIds.split(",") : [];
  const newGeoIds = matchedVendors.map((v) => v.id.toString());
  const mergedIds = [...new Set([...existingIds, ...newGeoIds])];

  const [updated] = await db
    .update(rfqsTable)
    .set({
      geoScope: "sido",
      vendorIds: mergedIds.length > 0 ? mergedIds.join(",") : rfq.vendorIds,
    })
    .where(eq(rfqsTable.id, params.data.id))
    .returning();

  res.json(ExpandRfqScopeResponse.parse(updated));
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
