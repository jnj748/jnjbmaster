import { Router, type IRouter } from "express";
import { eq, and, desc, or, inArray, sum, count } from "drizzle-orm";
import { db, rfqsTable, vendorsTable, usersTable, quotesTable, buildingsTable, creditLedgerTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import {
  refundRfqConsumption,
  computeCreditCost,
  getNoViewRefundDays,
  getNoViewRefundRatio,
  isCreditsEnabled,
} from "../lib/credits";
import { buildRfqAutoTitle, RFQ_SERVICE_TYPES } from "@workspace/shared/rfq-service-types";
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

// [Task #226] 파트너 시점에서 RFQ 카드에 즉시 표시할 예상 차감 / 환불 정책 메타를 부착한다.
// 카드 1장당 별도 요청을 못 하기 때문에 서버에서 batch 로 채워 보낸다.
async function enrichWithExpectedCredits<T extends Record<string, unknown> & { id: number; category: string; sido: string | null; sigungu: string | null; buildingId: number | null; estimatedAmount: number | null; }>(
  rows: T[],
): Promise<Array<T & { expectedCreditCost: number | null; expectedCreditScope: "sigungu" | "sido" | "default" | null; noViewRefundDays: number | null; noViewRefundRatio: number | null; }>> {
  if (rows.length === 0) return [];
  const enabled = await isCreditsEnabled().catch(() => false);
  const days = enabled ? await getNoViewRefundDays().catch(() => null) : null;
  const ratio = enabled ? await getNoViewRefundRatio().catch(() => null) : null;

  const buildingIds = Array.from(new Set(rows.map((r) => r.buildingId).filter((x): x is number => typeof x === "number")));
  const buildings = buildingIds.length > 0
    ? await db.select().from(buildingsTable).where(inArray(buildingsTable.id, buildingIds))
    : [];
  const buildingById = new Map(buildings.map((b) => [b.id, b]));

  const out: Array<T & { expectedCreditCost: number | null; expectedCreditScope: "sigungu" | "sido" | "default" | null; noViewRefundDays: number | null; noViewRefundRatio: number | null; }> = [];
  for (const r of rows) {
    if (!enabled) {
      out.push({ ...r, expectedCreditCost: null, expectedCreditScope: null, noViewRefundDays: days, noViewRefundRatio: ratio });
      continue;
    }
    const b = r.buildingId != null ? buildingById.get(r.buildingId) : undefined;
    const sido = r.sido ?? b?.sido ?? null;
    const sigungu = r.sigungu ?? b?.sigungu ?? null;
    try {
      const cost = await computeCreditCost({
        category: r.category,
        estimatedAmount: r.estimatedAmount ?? null,
        buildingTotalArea: b?.totalArea ? Number(b.totalArea) : null,
        buildingFireGrade: b?.fireGrade ?? null,
        sido,
        sigungu,
      });
      // OpenAPI 의 expectedCreditScope enum 은 sigungu|sido|default|null 만 허용한다.
      // 단가 행이 없는 "fallback" 케이스는 클라이언트에 null 로 노출한다.
      const scope = cost.pricingScope === "fallback" ? null : cost.pricingScope ?? null;
      out.push({
        ...r,
        expectedCreditCost: cost.totalCost,
        expectedCreditScope: scope,
        noViewRefundDays: days,
        noViewRefundRatio: ratio,
      });
    } catch {
      out.push({ ...r, expectedCreditCost: null, expectedCreditScope: null, noViewRefundDays: days, noViewRefundRatio: ratio });
    }
  }
  return out;
}

function toIsoDate(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split("T")[0];
  }
  return d;
}

// [Task #510] drizzle 의 timestamp 컬럼은 Date 객체로 돌아오는 반면, 우리가
//   응답으로 사용하는 zod 스키마(UpdateRfqResponse / ListRfqsResponseItem 등)
//   는 createdAt/updatedAt 을 ISO datetime string 으로 기대한다. 그대로
//   .parse 를 태우면 ZodError 가 터져 INSERT 자체는 성공했음에도 클라이언트는
//   500 을 받고 사용자 입장에서는 "버튼이 죽은 것 처럼" 보였다 (견적 요청 모달
//   제출 무반응 이슈). 응답 스키마는 건드리지 않고, 직렬화 단계에서만
//   Date → ISO string / YYYY-MM-DD 로 정규화한다.
type RfqRowDateFields = {
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  deadline?: Date | string | null;
  desiredDate?: Date | string | null;
};

function serializeRfqRow<T extends RfqRowDateFields>(row: T): T {
  return {
    ...row,
    desiredDate: toIsoDate(row.desiredDate),
    deadline: toIsoDate(row.deadline),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

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
    const enriched = await enrichWithExpectedCredits(filtered);
    res.json(ListRfqsResponse.parse(enriched.map(serializeRfqRow)));
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
    const enriched = await enrichWithExpectedCredits(filtered);
    res.json(ListRfqsResponse.parse(enriched.map(serializeRfqRow)));
    return;
  }

  res.json(ListRfqsResponse.parse(rfqs.map(serializeRfqRow)));
});

// [Task #226] HQ 어드민 대시보드용 매칭/제출/환불 통계.
// 운영팀이 단가 행을 조정할 때 매칭 인원·제출 건수·누적 차감/환불을 한눈에 볼 수 있어야 한다.
router.get("/rfqs/admin/stats", requireRole("platform_admin", "hq_executive"), async (_req, res): Promise<void> => {
  const rfqs = await db.select().from(rfqsTable).orderBy(desc(rfqsTable.createdAt));
  if (rfqs.length === 0) {
    res.json({ totals: { matched: 0, quoted: 0, debited: 0, refunded: 0 }, rows: [] });
    return;
  }
  const rfqIds = rfqs.map((r) => r.id);

  const quoteRows = await db
    .select({ rfqId: quotesTable.rfqId, id: quotesTable.id })
    .from(quotesTable)
    .where(inArray(quotesTable.rfqId, rfqIds));
  const quoteCountByRfq = new Map<number, number>();
  for (const q of quoteRows) quoteCountByRfq.set(q.rfqId, (quoteCountByRfq.get(q.rfqId) ?? 0) + 1);

  const ledgerRows = await db
    .select()
    .from(creditLedgerTable)
    .where(inArray(creditLedgerTable.rfqId, rfqIds));
  const debitedByRfq = new Map<number, number>();
  const refundedByRfq = new Map<number, number>();
  for (const l of ledgerRows) {
    if (l.rfqId == null) continue;
    if (l.kind === "consumption") debitedByRfq.set(l.rfqId, (debitedByRfq.get(l.rfqId) ?? 0) + Math.abs(l.amount));
    if (l.kind === "refund") refundedByRfq.set(l.rfqId, (refundedByRfq.get(l.rfqId) ?? 0) + Math.abs(l.amount));
  }

  const rows = rfqs.map((r) => {
    const matched = r.vendorIds ? r.vendorIds.split(",").filter(Boolean).length : 0;
    return {
      id: r.id,
      title: r.title,
      category: r.category,
      sido: r.sido,
      sigungu: r.sigungu,
      status: r.status,
      createdAt: r.createdAt,
      matchedPartnerCount: matched,
      quoteCount: quoteCountByRfq.get(r.id) ?? 0,
      creditsDebited: debitedByRfq.get(r.id) ?? 0,
      creditsRefunded: refundedByRfq.get(r.id) ?? 0,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      matched: acc.matched + r.matchedPartnerCount,
      quoted: acc.quoted + r.quoteCount,
      debited: acc.debited + r.creditsDebited,
      refunded: acc.refunded + r.creditsRefunded,
    }),
    { matched: 0, quoted: 0, debited: 0, refunded: 0 },
  );

  res.json({ totals, rows });
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
      const categoryAndSidoMatch = rfq.status === "open" && rfq.category === vendor.category && rfq.sido === vendor.sido;
      if (!categoryAndSidoMatch) {
        res.status(403).json({ error: "접근 권한이 없습니다" });
        return;
      }
      if (rfq.geoScope === "sigungu" && rfq.sigungu && vendor.sigungu && rfq.sigungu !== vendor.sigungu) {
        res.status(403).json({ error: "접근 권한이 없습니다" });
        return;
      }
    }
  }

  if (req.user?.role === "partner") {
    const [enriched] = await enrichWithExpectedCredits([rfq]);
    res.json(GetRfqResponse.parse(serializeRfqRow(enriched ?? rfq)));
    return;
  }

  res.json(GetRfqResponse.parse(serializeRfqRow(rfq)));
});

router.post("/rfqs", managerOnly, async (req, res): Promise<void> => {
  const parsed = CreateRfqBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // [Task #222] 시설분야·용역종류·근경/원경 사진은 서버에서도 필수로 검증한다.
  const incoming = parsed.data;
  if (!incoming.category) {
    res.status(400).json({ error: "시설분야는 필수입니다" });
    return;
  }
  const serviceType = incoming.serviceType ?? null;
  if (!serviceType || !RFQ_SERVICE_TYPES.includes(serviceType)) {
    res.status(400).json({ error: "용역종류는 필수입니다" });
    return;
  }
  if (!incoming.closeUpPhotoUrl || !incoming.widePhotoUrl) {
    res.status(400).json({ error: "근경/원경 사진은 필수입니다" });
    return;
  }

  // 제목이 비어 오면 시설분야+용역종류로 보강.
  const rawTitle = incoming.title;
  const title =
    typeof rawTitle === "string" && rawTitle.trim().length > 0
      ? rawTitle.trim()
      : buildRfqAutoTitle(incoming.category, serviceType);

  // [Task #335] 매니저가 작성하는 RFQ 는 본인이 속한 buildingId 로 강제로 스코프한다.
  // 클라이언트가 임의의 buildingId 를 보내도 무시 (브로큰 액세스 컨트롤 방지).
  // platform_admin / hq_executive 는 다른 건물에 RFQ 를 만들 수 있으므로 클라이언트 값을 허용.
  let scopedBuildingId: number | null = null;
  let userBuildingId: number | null = null;
  if (req.user?.userId) {
    const [u] = await db
      .select({ buildingId: usersTable.buildingId })
      .from(usersTable)
      .where(eq(usersTable.id, req.user.userId));
    userBuildingId = u?.buildingId ?? null;
  }
  const role = req.user?.role;
  if (role === "platform_admin" || role === "hq_executive") {
    scopedBuildingId = incoming.buildingId ?? userBuildingId;
  } else {
    if (incoming.buildingId != null && userBuildingId != null && incoming.buildingId !== userBuildingId) {
      res.status(403).json({ error: "본인 건물의 RFQ만 생성할 수 있습니다" });
      return;
    }
    scopedBuildingId = userBuildingId;
  }

  const data = {
    ...incoming,
    serviceType,
    title,
    deadline: toIsoDate(incoming.deadline)!,
    desiredDate: toIsoDate(incoming.desiredDate),
    buildingId: scopedBuildingId,
  };

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

  let rfq;
  try {
    [rfq] = await db.insert(rfqsTable).values(data).returning();
  } catch (e: any) {
    console.error("RFQ insert failed:", {
      message: e?.message,
      cause: e?.cause?.message,
      code: e?.cause?.code,
      detail: e?.cause?.detail,
      column: e?.cause?.column,
      data,
    });
    throw e;
  }
  // [Task #510] drizzle 가 timestamp/date 컬럼을 Date 객체로 돌려주기 때문에
  //   응답 스키마(UpdateRfqResponse) 의 string 기대치와 어긋나 INSERT 성공
  //   직후 ZodError → 500 이 발생했었다. serializeRfqRow 로 Date → ISO string
  //   정규화만 거친 뒤 .parse 에 넘긴다.
  res.status(201).json(UpdateRfqResponse.parse(serializeRfqRow(rfq)));
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

  res.json(ExpandRfqScopeResponse.parse(serializeRfqRow(updated)));
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

  const [prev] = await db.select().from(rfqsTable).where(eq(rfqsTable.id, params.data.id));
  if (!prev) {
    res.status(404).json({ error: "RFQ not found" });
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

  // Refund all consumption on cancel or close-without-accepted-quote
  const becameCancelled = prev.status !== "cancelled" && rfq.status === "cancelled";
  if (becameCancelled) {
    await refundRfqConsumption(rfq.id, req.user?.email ?? "system", "RFQ 취소");
  }
  if (prev.status !== "closed" && rfq.status === "closed") {
    const quotes = await db.select().from(quotesTable).where(eq(quotesTable.rfqId, rfq.id));
    const hasAccepted = quotes.some((q) => q.status === "accepted");
    if (!hasAccepted) {
      await refundRfqConsumption(rfq.id, req.user?.email ?? "system", "선정 없이 마감");
    }
  }

  res.json(UpdateRfqResponse.parse(serializeRfqRow(rfq)));
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
