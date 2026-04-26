import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import { db, vendorsTable, usersTable, platformConsentsTable, vendorReviewsTable, contractsTable } from "@workspace/db";
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
// [Task #290] partner 는 협력업체 풀(/vendors) 접근 금지 — 본인 업체는 /me/vendor 사용.
// [Task #416] 시설기사(facility_staff)는 협력업체 주소록을 읽기/통화용으로만 본다.
//   따라서 /vendors GET 계열은 reader 권한, 쓰기/등록은 writer 권한으로 분리한다.
const VENDOR_READER_ROLES = [
  "manager",
  "platform_admin",
  "hq_executive",
  "accountant",
  "facility_staff",
] as const;
const VENDOR_WRITER_ROLES = [
  "manager",
  "platform_admin",
  "hq_executive",
  "accountant",
] as const;
const requireVendorReader = requireRole(...VENDOR_READER_ROLES);
const requireVendorWriter = requireRole(...VENDOR_WRITER_ROLES);

// [Task #339] 평가 평균/건수 집계용 서브쿼리.
const reviewAggSq = db.$with("review_agg").as(
  db
    .select({
      vendorId: vendorReviewsTable.vendorId,
      avgRating: sql<number | null>`avg(${vendorReviewsTable.rating})`.mapWith(Number).as("avg_rating"),
      reviewCount: sql<number>`count(*)`.mapWith(Number).as("review_count"),
    })
    .from(vendorReviewsTable)
    .groupBy(vendorReviewsTable.vendorId),
);

// [Task #436] vendor 행을 응답으로 내보내는 모든 지점이 통과해야 하는 직렬화 헬퍼.
//   drizzle 의 timestamp 컬럼은 JS Date 객체를 돌려주는데 응답 Zod 스키마
//   (ListVendorsResponseItem / UpdateVendorResponse / GetRecommendedVendorsResponseItem)
//   는 createdAt / updatedAt / joinedAt 을 ISO 문자열로 기대한다. 누락 시
//   `*.parse(vendor)` 가 throw → 클라이언트는 500 만 받고 같은 다이얼로그 재시도로
//   동일 vendor 가 중복 생성되는 사이드이펙트가 발생한다.
//   `routes/contracts.ts:serializeContract` 와 같은 패턴을 vendor 에도 적용해
//   POST /vendors, PATCH /vendors/:id, POST /vendors/register, GET /vendors,
//   GET /vendors/recommend, GET/PATCH /me/vendor 모두 동일 헬퍼를 통과시킨다.
function serializeVendor<T extends typeof vendorsTable.$inferSelect>(
  v: T,
): Omit<T, "joinedAt" | "createdAt" | "updatedAt"> & {
  joinedAt: string | null;
  createdAt: string;
  updatedAt: string;
} {
  return {
    ...v,
    joinedAt: v.joinedAt ? v.joinedAt.toISOString() : null,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

// 단건 vendor 응답에 avgRating·reviewCount 를 채우고 timestamp 를 ISO 문자열로
// 직렬화한다. 모든 vendor-반환 엔드포인트가 동일한 응답 모델을 갖도록 보장한다.
async function enrichVendorAggregates(vendor: typeof vendorsTable.$inferSelect) {
  const [agg] = await db
    .select({
      avgRating: sql<number | null>`avg(${vendorReviewsTable.rating})`.mapWith(Number),
      reviewCount: sql<number>`count(*)`.mapWith(Number),
    })
    .from(vendorReviewsTable)
    .where(eq(vendorReviewsTable.vendorId, vendor.id));
  const reviewCount = agg?.reviewCount ?? 0;
  return {
    ...serializeVendor(vendor),
    avgRating: reviewCount > 0 ? (agg?.avgRating ?? null) : null,
    reviewCount,
  };
}

router.get("/vendors", requireVendorReader, async (req, res): Promise<void> => {
  const params = ListVendorsQueryParams.safeParse(req.query);
  const conditions = [];

  if (params.success && params.data.category) {
    conditions.push(eq(vendorsTable.category, params.data.category));
  }

  if (params.success && params.data.type) {
    conditions.push(eq(vendorsTable.type, params.data.type));
  }

  // [Task #416] facility_staff 는 platform-wide 협력업체 풀을 다 보지 않고
  //   본인 소속 건물의 계약과 연결된 vendor 만 본다(최소 권한). 그 외 reader 역할
  //   (manager/accountant/hq_executive/platform_admin)은 종전대로 전체 조회.
  if (req.user?.role === "facility_staff") {
    const [me] = await db
      .select({ buildingId: usersTable.buildingId })
      .from(usersTable)
      .where(eq(usersTable.id, req.user.userId));
    const buildingId = me?.buildingId ?? null;
    if (buildingId == null) {
      res.json([]);
      return;
    }
    const ids = await db
      .selectDistinct({ vendorId: contractsTable.vendorId })
      .from(contractsTable)
      .where(eq(contractsTable.buildingId, buildingId));
    const vendorIds = ids.map((r) => r.vendorId);
    if (vendorIds.length === 0) {
      res.json([]);
      return;
    }
    conditions.push(inArray(vendorsTable.id, vendorIds));
  }

  const vendors = await db
    .with(reviewAggSq)
    .select({
      vendor: vendorsTable,
      avgRating: reviewAggSq.avgRating,
      reviewCount: reviewAggSq.reviewCount,
    })
    .from(vendorsTable)
    .leftJoin(reviewAggSq, eq(reviewAggSq.vendorId, vendorsTable.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(vendorsTable.name);

  // [Task #436] timestamp 직렬화는 serializeVendor 헬퍼로 일원화 — 응답 모델은
  //   ISO 문자열을 기대한다. (Task #339 에서 `enriched` 매핑이 추가된 이후 누적된
  //   직렬화 누락을 동시에 해소.)
  const enriched = vendors.map((row) => ({
    ...serializeVendor(row.vendor),
    avgRating: row.avgRating ?? null,
    reviewCount: row.reviewCount ?? 0,
  }));

  res.json(ListVendorsResponse.parse(enriched));
});

router.post("/vendors", requireVendorWriter, async (req, res): Promise<void> => {
  const parsed = CreateVendorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [vendor] = await db.insert(vendorsTable).values(parsed.data).returning();
  // [Task #436] timestamp 직렬화 포함. avgRating/reviewCount 는 신규 vendor 라
  //   집계 자체가 비어 있어 별도 조회 없이 기본값으로 채운다.
  res.status(201).json(
    UpdateVendorResponse.parse({
      ...serializeVendor(vendor),
      avgRating: null,
      reviewCount: 0,
    }),
  );
});

router.patch("/vendors/:id", requireVendorWriter, async (req, res): Promise<void> => {
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

  // [Task #436] timestamp 직렬화 + 누적 평가 집계 포함.
  res.json(UpdateVendorResponse.parse(await enrichVendorAggregates(vendor)));
});

router.delete("/vendors/:id", requireVendorWriter, async (req, res): Promise<void> => {
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

// [Task #416] /vendors/recommend 는 RFQ 신규 발의 시 카테고리별 추천 풀을 platform 전체에서
//   조회하는 경로다. 시설기사(facility_staff)는 RFQ 를 직접 발의하지 않으므로 추천 풀에 접근할
//   필요가 없고, 최소 권한 원칙에 따라 writer 권한(=발의 가능 역할)만 호출 가능하도록 제한한다.
router.get("/vendors/recommend", requireVendorWriter, async (req, res): Promise<void> => {
  const params = GetRecommendedVendorsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // [Task #339] 추천 업체 응답에도 누적 평가 집계를 포함한다.
  const vendors = await db
    .with(reviewAggSq)
    .select({
      vendor: vendorsTable,
      avgRating: reviewAggSq.avgRating,
      reviewCount: reviewAggSq.reviewCount,
    })
    .from(vendorsTable)
    .leftJoin(reviewAggSq, eq(reviewAggSq.vendorId, vendorsTable.id))
    .where(
      and(
        eq(vendorsTable.category, params.data.category),
        eq(vendorsTable.isRecommended, true)
      )
    )
    .orderBy(desc(vendorsTable.rating));

  // [Task #436] timestamp 직렬화 + 평가 집계 통합.
  const enriched = vendors.map((row) => ({
    ...serializeVendor(row.vendor),
    avgRating: row.avgRating ?? null,
    reviewCount: row.reviewCount ?? 0,
  }));
  res.json(GetRecommendedVendorsResponse.parse(enriched));
});

// [Task #132] 파트너사 위저드 완료. 회사 + 사업자등록증 + 분야 저장 후 user.vendorId 연결.
//   onboarding 은 partner 본인이 호출하는 경로라 vendor-writer 가 아니라 본문 내부에서
//   role==='partner' 만 허용하는 자체 체크를 사용한다 (아래 내부 체크 참조).
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
  // [Task #436] 응답 모델은 Zod 검증을 거치지 않지만 클라이언트가 ISO 문자열을
  //   기대하므로 다른 vendor 응답과 동일한 직렬화를 적용해 일관성을 유지한다.
  res.status(200).json({ vendor: vendorRow ? serializeVendor(vendorRow) : vendorRow });
});

// [Task #290] partner 자기 업체 전용 엔드포인트.
//   - GET /me/vendor   → 본인(user.vendorId)의 vendor 행만 반환.
//   - PATCH /me/vendor → 본인(user.vendorId)의 vendor 행만 수정.
//   풀 목록(/vendors)을 클라이언트로 내려보내지 않기 위한 분리.
router.get("/me/vendor", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.role !== "partner") {
    res.status(403).json({ error: "파트너 계정만 사용할 수 있습니다" });
    return;
  }
  if (!user.vendorId) {
    res.status(404).json({ error: "연결된 업체가 없습니다" });
    return;
  }
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, user.vendorId));
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  // [Task #339] 본인 업체에도 누적 평가 집계를 포함해 일관된 응답 모델을 보장한다.
  res.json(UpdateVendorResponse.parse(await enrichVendorAggregates(vendor)));
});

router.patch("/me/vendor", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.role !== "partner") {
    res.status(403).json({ error: "파트너 계정만 사용할 수 있습니다" });
    return;
  }
  if (!user.vendorId) {
    res.status(404).json({ error: "연결된 업체가 없습니다" });
    return;
  }
  const parsed = UpdateVendorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  // type 필드는 파트너가 변경할 수 없도록 강제로 platform 으로 고정.
  const safe = { ...parsed.data, type: "platform" as const };
  const [vendor] = await db
    .update(vendorsTable)
    .set(safe)
    .where(eq(vendorsTable.id, user.vendorId))
    .returning();
  if (!vendor) {
    res.status(404).json({ error: "Vendor not found" });
    return;
  }
  res.json(UpdateVendorResponse.parse(await enrichVendorAggregates(vendor)));
});

router.post("/vendors/register", requireVendorWriter, async (req, res): Promise<void> => {
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

  // [Task #436] timestamp 직렬화 + 평가 집계 기본값 채워서 응답 통일.
  res.status(201).json(
    UpdateVendorResponse.parse({
      ...serializeVendor(vendor),
      avgRating: null,
      reviewCount: 0,
    }),
  );
});

export default router;
