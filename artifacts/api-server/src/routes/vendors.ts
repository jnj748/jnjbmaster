import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, vendorsTable, usersTable, platformConsentsTable } from "@workspace/db";
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
router.use("/vendors", requireRole("manager", "platform_admin", "hq_executive", "accountant", "partner"));
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

// [Task #132] 파트너사 위저드 완료. 회사 + 사업자등록증 + 분야 저장 후 user.vendorId 연결.
router.post("/vendors/onboarding", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.userId;
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).then(r => r[0]);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (user.role !== "partner") { res.status(403).json({ error: "파트너사 계정만 사용 가능합니다" }); return; }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const businessNumber = typeof req.body?.businessNumber === "string" ? req.body.businessNumber.trim() : "";
  const representativeName = typeof req.body?.representativeName === "string" ? req.body.representativeName.trim() : "";
  const phone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
  const businessRegUrl = typeof req.body?.businessRegUrl === "string" ? req.body.businessRegUrl : null;
  const categories: string[] = Array.isArray(req.body?.categories) ? req.body.categories.filter((c: unknown) => typeof c === "string") : [];

  if (!name || !businessNumber || !representativeName) { res.status(400).json({ error: "회사명·사업자등록번호·대표자명은 필수입니다" }); return; }
  // [Task #132] 사업자등록증 업로드는 필수.
  if (!businessRegUrl) { res.status(400).json({ error: "사업자등록증을 업로드해 주세요" }); return; }
  if (categories.length === 0) { res.status(400).json({ error: "최소 1개 이상의 취급 분야를 선택해 주세요" }); return; }

  // 약관 동의 필수.
  const [consent] = await db.select().from(platformConsentsTable)
    .where(and(eq(platformConsentsTable.userId, userId), eq(platformConsentsTable.consentType, "partner_terms")))
    .orderBy(desc(platformConsentsTable.consentedAt));
  if (!consent) { res.status(403).json({ error: "파트너사 약관 동의가 필요합니다" }); return; }

  // 기존 vendorId가 있으면 update, 없으면 insert.
  let vendorRow;
  if (user.vendorId) {
    const [updated] = await db.update(vendorsTable)
      .set({
        name,
        category: categories[0],
        subCategories: categories.join(","),
        businessRegNumber: businessNumber,
        representativeName,
        phone,
        notes: businessRegUrl ? `사업자등록증: ${businessRegUrl}` : null,
        type: "platform",
      })
      .where(eq(vendorsTable.id, user.vendorId))
      .returning();
    vendorRow = updated;
  } else {
    const [inserted] = await db.insert(vendorsTable)
      .values({
        name,
        category: categories[0],
        subCategories: categories.join(","),
        businessRegNumber: businessNumber,
        representativeName,
        phone,
        notes: businessRegUrl ? `사업자등록증: ${businessRegUrl}` : null,
        type: "platform",
        joinedAt: new Date(),
      })
      .returning();
    vendorRow = inserted;
    await db.update(usersTable).set({ vendorId: vendorRow.id }).where(eq(usersTable.id, userId));
  }
  res.status(200).json({ vendor: vendorRow });
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
