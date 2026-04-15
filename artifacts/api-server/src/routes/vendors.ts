import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, vendorsTable } from "@workspace/db";
import {
  ListVendorsQueryParams,
  ListVendorsResponse,
  CreateVendorBody,
  UpdateVendorParams,
  UpdateVendorBody,
  UpdateVendorResponse,
  DeleteVendorParams,
  GetRecommendedVendorsQueryParams,
  GetRecommendedVendorsResponse,
  RegisterPlatformVendorBody,
} from "@workspace/api-zod";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use(requireRole("manager", "platform_admin", "hq_executive", "accountant", "partner"));

router.get("/vendors", async (req, res): Promise<void> => {
  const params = ListVendorsQueryParams.safeParse(req.query);
  const conditions = [];

  if (params.success && params.data.category) {
    conditions.push(eq(vendorsTable.category, params.data.category));
  }

  if (params.success && params.data.type) {
    conditions.push(eq(vendorsTable.type, params.data.type));
  }

  const vendors = await db
    .select()
    .from(vendorsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(vendorsTable.name);

  res.json(ListVendorsResponse.parse(vendors));
});

router.post("/vendors", async (req, res): Promise<void> => {
  const parsed = CreateVendorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [vendor] = await db.insert(vendorsTable).values(parsed.data).returning();
  res.status(201).json(UpdateVendorResponse.parse(vendor));
});

router.patch("/vendors/:id", async (req, res): Promise<void> => {
  const params = UpdateVendorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateVendorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [vendor] = await db
    .update(vendorsTable)
    .set(parsed.data)
    .where(eq(vendorsTable.id, params.data.id))
    .returning();

  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }

  res.json(UpdateVendorResponse.parse(vendor));
});

router.delete("/vendors/:id", async (req, res): Promise<void> => {
  const params = DeleteVendorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [vendor] = await db
    .delete(vendorsTable)
    .where(eq(vendorsTable.id, params.data.id))
    .returning();

  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }

  res.sendStatus(204);
});

router.get("/vendors/recommend", async (req, res): Promise<void> => {
  const params = GetRecommendedVendorsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const vendors = await db
    .select()
    .from(vendorsTable)
    .where(
      and(
        eq(vendorsTable.category, params.data.category),
        eq(vendorsTable.isRecommended, true)
      )
    )
    .orderBy(desc(vendorsTable.rating));

  res.json(GetRecommendedVendorsResponse.parse(vendors));
});

router.post("/vendors/register", async (req, res): Promise<void> => {
  const parsed = RegisterPlatformVendorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [vendor] = await db
    .insert(vendorsTable)
    .values({
      ...parsed.data,
      type: "platform",
      isRecommended: false,
      joinedAt: new Date(),
    })
    .returning();

  res.status(201).json(UpdateVendorResponse.parse(vendor));
});

export default router;
