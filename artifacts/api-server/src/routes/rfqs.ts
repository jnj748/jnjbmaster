import { Router, type IRouter } from "express";
import { eq, and, desc, or } from "drizzle-orm";
import { db, rfqsTable, vendorsTable, usersTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";
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
const managerOnly = requireRole("manager", "platform_admin");

router.get("/rfqs", async (req, res): Promise<void> => {
  const params = ListRfqsQueryParams.safeParse(req.query);
  const conditions = [];
  const isPartner = req.user?.role === "partner";

  if (isPartner) {
    const [authUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
    if (!authUser?.vendorId) {
      res.json(ListRfqsResponse.parse([]));
      return;
    }
    req.query.forVendorId = authUser.vendorId.toString();
  }

  if (params.success && params.data.status) {
    conditions.push(eq(rfqsTable.status, params.data.status));
  }

  const rfqs = await db
    .select()
    .from(rfqsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(rfqsTable.createdAt));

  if (!isPartner && params.success && params.data.vendorId) {
    const vendorId = params.data.vendorId.toString();
    const filtered = rfqs.filter((r) => {
      if (!r.vendorIds) return false;
      return r.vendorIds.split(",").includes(vendorId);
    });
    res.json(ListRfqsResponse.parse(filtered));
    return;
  }

  const forVendorIdParam = isPartner ? req.query.forVendorId : (params.success && params.data.forVendorId ? params.data.forVendorId.toString() : null);
  if (forVendorIdParam) {
    const forVendorId = parseInt(forVendorIdParam as string, 10);
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
        if (!categoryMatch) return false;
        if (!r.sido) return true;
        if (r.sido !== vendor.sido) return false;
        if (r.geoScope === "sigungu" && r.sigungu && vendor.sigungu) {
          return r.sigungu === vendor.sigungu;
        }
        return true;
      }
      return false;
    });
    res.json(ListRfqsResponse.parse(filtered));
    return;
  }

  res.json(ListRfqsResponse.parse(rfqs));
});

router.get("/rfqs/:id/matched-vendors", managerOnly, async (req, res): Promise<void> => {
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

  if (rfq.geoScope === "sigungu" && rfq.sido && rfq.sigungu) {
    conditions.push(eq(vendorsTable.sido, rfq.sido));
    conditions.push(eq(vendorsTable.sigungu, rfq.sigungu));
  } else if (rfq.sido) {
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

  if (req.user?.role === "partner") {
    const [authUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.userId));
    if (!authUser?.vendorId) {
      res.status(403).json({ error: "접근 권한이 없습니다" });
      return;
    }
    const vendorIdStr = authUser.vendorId.toString();
    const isInvited = rfq.vendorIds?.split(",").includes(vendorIdStr);
    if (!isInvited) {
      const vendor = await db.select().from(vendorsTable).where(eq(vendorsTable.id, authUser.vendorId)).then(r => r[0]);
      if (!vendor) {
        res.status(403).json({ error: "접근 권한이 없습니다" });
        return;
      }
      const geoMatch = rfq.status === "open" && rfq.category === vendor.category && rfq.sido === vendor.sido;
      if (!geoMatch) {
        res.status(403).json({ error: "접근 권한이 없습니다" });
        return;
      }
    }
  }

  res.json(GetRfqResponse.parse(rfq));
});

router.post("/rfqs", managerOnly, async (req, res): Promise<void> => {
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

    if (data.geoScope === "sigungu" && data.sigungu) {
      geoConditions.push(eq(vendorsTable.sigungu, data.sigungu));
    }

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

router.patch("/rfqs/:id/expand-scope", managerOnly, async (req, res): Promise<void> => {
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

router.patch("/rfqs/:id", managerOnly, async (req, res): Promise<void> => {
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

router.delete("/rfqs/:id", managerOnly, async (req, res): Promise<void> => {
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
