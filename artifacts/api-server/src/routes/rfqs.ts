import { Router, type IRouter } from "express";
import { eq, and, desc, or, inArray, sum, count } from "drizzle-orm";
import {
  db,
  rfqsTable,
  vendorsTable,
  usersTable,
  quotesTable,
  buildingsTable,
  creditLedgerTable,
  rfqMessagesTable,
  rfqSiteVisitsTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";
// [Task #610] 2층 단일 통로 — RFQ commit 후 documents 레지스트리에 등록.
import { saveProducingDocument, MissingSourceRowError } from "../repo/producingDocuments";
import { buildDocumentName } from "@workspace/document-naming";
import type { DocumentAuthorRole } from "@workspace/db";
import {
  getUserBuildingId,
  isBuildingScopedRole,
  getAccessibleBuildingIds,
  buildingScopeFilter,
  canAccessBuilding,
} from "../middlewares/buildingScope";
import {
  refundRfqConsumption,
  computeCreditCost,
  getNoViewRefundDays,
  getNoViewRefundRatio,
  isCreditsEnabled,
} from "../lib/credits";
import { buildRfqAutoTitle, RFQ_SERVICE_TYPES, rfqCategoryLabel, rfqServiceTypeLabel } from "@workspace/shared/rfq-service-types";
import { vendorMatchesRfq, normalizeRfqCategory, type VendorMatchProfile, type RfqMatchProfile } from "@workspace/shared/rfq-vendor-matching";
import { insertNotification } from "../lib/notificationRecipient";
import { sendMail, isMailEnabled } from "../lib/mail";
import { enqueueDispatch } from "../lib/external/adapter";
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
//
// [Task #668] 추가로 category / serviceType 가 strict enum 밖의 레거시 값
//   ("방수/도장", "옥상 방수" 등)일 때, 응답 한 줄이 zod 파싱을 깨고 GET
//   /api/rfqs 가 통째로 500 으로 나오던 사고를 방지하기 위해, 직렬화 단계에서
//   안전한 기본값으로 정규화한다. 응답 스키마(OpenAPI Rfq) 도 이미 string 으로
//   완화되어 있어 이 가드는 "방어선 1" 역할을 한다.
const RFQ_CATEGORY_VALUES: ReadonlySet<string> = new Set([
  "elevator", "water_tank", "fire_safety", "electrical", "gas", "septic",
  "cleaning", "security", "waterproofing", "maintenance_repair",
  "defect_diagnosis", "building_maintenance", "mechanical", "landscaping", "other",
]);

// 신규 용역종류 + DB 잔존 breakdown/defect(응답 직렬화 시 null 로 떨어지지 않게 유지).
const RFQ_SERVICE_TYPE_VALUES: ReadonlySet<string> = new Set([
  ...RFQ_SERVICE_TYPES,
  "breakdown",
  "defect",
]);

const warnedRfqEnumIds = new Set<string>();
function warnLegacyRfqEnumOnce(rfqId: number, field: string, original: string): void {
  const key = `${rfqId}:${field}`;
  if (warnedRfqEnumIds.has(key)) return;
  warnedRfqEnumIds.add(key);
  // eslint-disable-next-line no-console
  console.warn(
    `[rfqs] legacy enum value normalized — rfqId=${rfqId} field=${field} original=${JSON.stringify(original)}`,
  );
}

type RfqRowDateFields = {
  id?: number;
  category?: string | null;
  serviceType?: string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
  deadline?: Date | string | null;
  desiredDate?: Date | string | null;
};

function serializeRfqRow<T extends RfqRowDateFields>(row: T): T {
  let category = row.category ?? null;
  let serviceType = row.serviceType ?? null;
  if (category != null && !RFQ_CATEGORY_VALUES.has(category)) {
    if (typeof row.id === "number") warnLegacyRfqEnumOnce(row.id, "category", category);
    category = "other";
  }
  if (serviceType != null && !RFQ_SERVICE_TYPE_VALUES.has(serviceType)) {
    if (typeof row.id === "number") warnLegacyRfqEnumOnce(row.id, "serviceType", serviceType);
    serviceType = null;
  }
  return {
    ...row,
    category: category as T["category"],
    serviceType: serviceType as T["serviceType"],
    desiredDate: toIsoDate(row.desiredDate),
    deadline: toIsoDate(row.deadline),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

router.get("/rfqs", async (req, res): Promise<void> => {
  const params = ListRfqsQueryParams.safeParse(req.query);
  const conditions = [];
  const role = req.user?.role;
  const isPartner = role === "partner";

  // [Task #668] Express 5 부터 req.query 가 read-only 게터가 되어 직접 할당이
  //   조용히 무시된다. 기존 코드가 `req.query.forVendorId = X` 로 강제 주입을
  //   했지만 이것이 no-op 이 되어 파트너 시점 GET /rfqs 가 사실상 무필터로
  //   "모든 RFQ" 를 돌려주고 있었다. (자기 vendor 와 매칭되지 않는 RFQ 도 노출.)
  //   로컬 변수로 교체해 의도대로 forVendorId 필터가 걸리도록 한다.
  let partnerForVendorId: string | null = null;
  if (isPartner) {
    const [authUser] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.userId));
    if (!authUser?.vendorId) {
      res.json(ListRfqsResponse.parse([]));
      return;
    }
    partnerForVendorId = authUser.vendorId.toString();
  } else {
    // [Task #551/#596] 건물 단위 역할(매니저/회계/시설기사)과 hq_executive 는
    //   접근 가능한 건물 ID 합집합으로 필터. platform_admin 만 무제한 가시.
    //   ?buildingId 쿼리 파라미터로 추가 필터(권한 확인 후) 가능.
    if (params.success && params.data.buildingId != null) {
      const requestedBid = Number(params.data.buildingId);
      if (!(await canAccessBuilding(req, requestedBid))) {
        res.json(ListRfqsResponse.parse([]));
        return;
      }
      conditions.push(eq(rfqsTable.buildingId, requestedBid));
    } else {
      const scope = await getAccessibleBuildingIds(req);
      const scopeWhere = buildingScopeFilter(scope, rfqsTable.buildingId);
      if (scopeWhere === "empty") {
        res.json(ListRfqsResponse.parse([]));
        return;
      }
      if (scopeWhere) conditions.push(scopeWhere);
    }
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

  const forVendorIdParam = isPartner
    ? partnerForVendorId
    : (params.success && params.data.forVendorId ? params.data.forVendorId.toString() : null);
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
    // [Task #698] 단일 매칭 진입점(vendorMatchesRfq) 사용. 옛날 단일값 비교 대신
    //   subCategories(다중) + serviceArea.nationwide/bySido(JSON) 까지 본다.
    const vendorProfile: VendorMatchProfile = vendor;
    const filtered = rfqs.filter((r) => {
      const isDirectlyInvited =
        r.vendorIds && r.vendorIds.split(",").includes(vendorIdStr);
      if (isDirectlyInvited) return true;
      if (r.status !== "open") return false;
      const rfqProfile: RfqMatchProfile = {
        category: r.category,
        sido: r.sido,
        sigungu: r.sigungu,
        geoScope: r.geoScope,
      };
      return vendorMatchesRfq(vendorProfile, rfqProfile);
    });
    const enriched = await enrichWithExpectedCredits(filtered);
    res.json(ListRfqsResponse.parse(enriched.map(serializeRfqRow)));
    return;
  }

  res.json(ListRfqsResponse.parse(rfqs.map(serializeRfqRow)));
});

// [Task #226] HQ 어드민 대시보드용 매칭/제출/환불 통계.
// 운영팀이 단가 행을 조정할 때 매칭 인원·제출 건수·누적 차감/환불을 한눈에 볼 수 있어야 한다.
router.get("/rfqs/admin/stats", requireRole("platform_admin", "hq_executive"), async (req, res): Promise<void> => {
  // [Task #596] hq_executive 는 매핑된 건물의 RFQ 만 통계로 본다.
  //   platform_admin 만 전 건물 통계.
  const scope = await getAccessibleBuildingIds(req);
  const scopeWhere = buildingScopeFilter(scope, rfqsTable.buildingId);
  if (scopeWhere === "empty") {
    res.json({ totals: { matched: 0, quoted: 0, debited: 0, refunded: 0 }, rows: [] });
    return;
  }
  const rfqs = scopeWhere
    ? await db.select().from(rfqsTable).where(scopeWhere).orderBy(desc(rfqsTable.createdAt))
    : await db.select().from(rfqsTable).orderBy(desc(rfqsTable.createdAt));
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

// [Task #612] HQ 모니터링: 비교견적 워크플로우 통합 지표.
//   - 매칭 파트너 수 / 견적 수 / 평균 견적가 / 메시지 수 / 확정 현장방문 수 / 마감 여부
//   - hq_executive 는 관할 건물에 한정, platform_admin 은 전체.
router.get("/rfqs/admin/monitoring", requireRole("platform_admin", "hq_executive"), async (req, res): Promise<void> => {
  const scope = await getAccessibleBuildingIds(req);
  const scopeWhere = buildingScopeFilter(scope, rfqsTable.buildingId);
  if (scopeWhere === "empty") {
    res.json({ totals: { rfqs: 0, closed: 0, quotes: 0, messages: 0, siteVisitsConfirmed: 0 }, rows: [] });
    return;
  }
  const rfqs = scopeWhere
    ? await db.select().from(rfqsTable).where(scopeWhere).orderBy(desc(rfqsTable.createdAt))
    : await db.select().from(rfqsTable).orderBy(desc(rfqsTable.createdAt));
  if (rfqs.length === 0) {
    res.json({ totals: { rfqs: 0, closed: 0, quotes: 0, messages: 0, siteVisitsConfirmed: 0 }, rows: [] });
    return;
  }
  const rfqIds = rfqs.map((r) => r.id);
  const [quotes, messages, visits] = await Promise.all([
    db.select({ rfqId: quotesTable.rfqId, totalAmount: quotesTable.totalAmount }).from(quotesTable).where(inArray(quotesTable.rfqId, rfqIds)),
    db.select({ rfqId: rfqMessagesTable.rfqId }).from(rfqMessagesTable).where(inArray(rfqMessagesTable.rfqId, rfqIds)),
    db.select({ rfqId: rfqSiteVisitsTable.rfqId, status: rfqSiteVisitsTable.status }).from(rfqSiteVisitsTable).where(inArray(rfqSiteVisitsTable.rfqId, rfqIds)),
  ]);

  const quoteByRfq = new Map<number, number[]>();
  for (const q of quotes) {
    const arr = quoteByRfq.get(q.rfqId) ?? [];
    arr.push(Number(q.totalAmount));
    quoteByRfq.set(q.rfqId, arr);
  }
  const msgCount = new Map<number, number>();
  for (const m of messages) msgCount.set(m.rfqId, (msgCount.get(m.rfqId) ?? 0) + 1);
  const visitConfirmed = new Map<number, number>();
  for (const v of visits) {
    if (v.status === "confirmed") visitConfirmed.set(v.rfqId, (visitConfirmed.get(v.rfqId) ?? 0) + 1);
  }

  const rows = rfqs.map((r) => {
    const matched = r.vendorIds ? r.vendorIds.split(",").filter(Boolean).length : 0;
    const arr = quoteByRfq.get(r.id) ?? [];
    const avg = arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;
    const closed = r.status === "awarded" || r.status === "closed" || r.closedAt != null;
    return {
      id: r.id,
      title: r.title,
      category: r.category,
      sido: r.sido,
      sigungu: r.sigungu,
      status: r.status,
      requiresSiteVisit: Boolean(r.requiresSiteVisit),
      buildingName: r.buildingName,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      closedAt: r.closedAt ? (r.closedAt instanceof Date ? r.closedAt.toISOString() : r.closedAt) : null,
      closedQuoteId: r.closedQuoteId ?? null,
      matchedPartnerCount: matched,
      quoteCount: arr.length,
      averageQuoteAmount: avg,
      messageCount: msgCount.get(r.id) ?? 0,
      siteVisitConfirmedCount: visitConfirmed.get(r.id) ?? 0,
      closed,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      rfqs: acc.rfqs + 1,
      closed: acc.closed + (r.closed ? 1 : 0),
      quotes: acc.quotes + r.quoteCount,
      messages: acc.messages + r.messageCount,
      siteVisitsConfirmed: acc.siteVisitsConfirmed + r.siteVisitConfirmedCount,
    }),
    { rfqs: 0, closed: 0, quotes: 0, messages: 0, siteVisitsConfirmed: 0 },
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

  // [Task #698] 매칭 룰을 단일 헬퍼(vendorMatchesRfq) 로 통일.
  //   SQL eq() 만으로는 subCategories(콤마 리스트) / serviceArea(JSON) /
  //   카테고리 한글-영문 정규화를 표현할 수 없어, 후보 vendor(platform 전부)
  //   를 한 번에 가져와 in-memory 필터로 매칭한다. vendor 모수가 작아 OK.
  const candidateVendors = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.type, "platform"))
    .orderBy(desc(vendorsTable.rating));

  const rfqProfile: RfqMatchProfile = {
    category: rfq.category,
    sido: rfq.sido,
    sigungu: rfq.sigungu,
    geoScope: rfq.geoScope,
  };
  const matchedVendors = candidateVendors.filter((v) => vendorMatchesRfq(v, rfqProfile));

  // [Task #698] GetRfqMatchedVendorsResponse 는 createdAt/updatedAt/joinedAt 을
  //   ISO 문자열로, category 를 영문 enum 으로 기대한다. 옛 매칭이 사실상 0건만
  //   반환하던 시절에는 잠복돼 있던 두 버그가 매칭이 정상 작동하면서 노출된다:
  //   1) Date → string 직렬화 누락 → Zod 500.
  //   2) vendor.category 에 옛 한글값("방수/도장") 이 남아 있는 vendor 가 매칭
  //      되면 enum violation → Zod 500.
  //   화면 표시 안전을 위해 매칭 시점에만 정규화해 응답한다(원본 DB 는 무변경).
  //   subCategories 콤마 리스트도 영문 코드로 통일.
  const serialized = matchedVendors.map((v) => {
    const normalizedCategory = normalizeRfqCategory(v.category) ?? v.category;
    const normalizedSubCategories = v.subCategories
      ? v.subCategories
          .split(",")
          .map((p) => normalizeRfqCategory(p) ?? p.trim())
          .filter((p) => p.length > 0)
          .join(",")
      : v.subCategories;
    return {
      ...v,
      category: normalizedCategory,
      subCategories: normalizedSubCategories,
      joinedAt: v.joinedAt ? v.joinedAt.toISOString() : null,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    };
  });

  res.json(GetRfqMatchedVendorsResponse.parse(serialized));
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
      // [Task #698] 단건 RFQ 조회 권한도 단일 매칭 헬퍼로 통일.
      //   "open" 상태이고 카테고리/지역이 매칭되면 통과. 직접 초대(isInvited)
      //   는 위에서 이미 체크. 옛 단일값 정확비교는 신규 vendor 의 nationwide/
      //   subCategories 를 못 읽어 매번 403 을 반환하던 잠복 버그가 있었다.
      if (rfq.status !== "open") {
        res.status(403).json({ error: "접근 권한이 없습니다" });
        return;
      }
      const ok = vendorMatchesRfq(vendor as VendorMatchProfile, {
        category: rfq.category,
        sido: rfq.sido,
        sigungu: rfq.sigungu,
        geoScope: rfq.geoScope,
      });
      if (!ok) {
        res.status(403).json({ error: "접근 권한이 없습니다" });
        return;
      }
    }
  } else if (req.user?.role !== "platform_admin") {
    // [Task #551/#596] 건물 단위 직원 역할 + hq_executive 는 본인 관할이 아닌
    //   건물의 RFQ 단건 조회를 차단한다. platform_admin 만 무제한 가시.
    //   존재 자체를 노출하지 않기 위해 403 대신 404 로 응답.
    if (rfq.buildingId == null || !(await canAccessBuilding(req, rfq.buildingId))) {
      res.status(404).json({ error: "RFQ not found" });
      return;
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
  if (!serviceType || !(RFQ_SERVICE_TYPES as readonly string[]).includes(serviceType)) {
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

  // [Task #335/#596] RFQ 생성은 manager / platform_admin 전용 (managerOnly).
  //   매니저는 본인 buildingId 로 강제 스코프 (클라이언트 input 무시).
  //   platform_admin 만 다른 건물에 RFQ 를 직접 생성할 수 있다.
  //   (hq_executive 는 read-only — 승인/할당 권한만 가짐.)
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
  if (role === "platform_admin") {
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
    // [Task #698] vendor_ids fan-out 매칭도 단일 헬퍼로 통일. SQL eq() 조건
    //   대신 platform vendor 를 모두 가져와서 in-memory 매칭한다 — 그래야
    //   vendor.subCategories / serviceArea.nationwide 까지 일관되게 본다.
    const candidateVendors = await db
      .select()
      .from(vendorsTable)
      .where(eq(vendorsTable.type, "platform"));

    const rfqProfile: RfqMatchProfile = {
      category: data.category,
      sido: data.sido,
      sigungu: data.sigungu,
      geoScope: data.geoScope,
    };
    const matched = candidateVendors.filter((v) => vendorMatchesRfq(v, rfqProfile));

    const manualIds = data.vendorIds ? data.vendorIds.split(",") : [];
    const geoIds = matched.map((v) => v.id.toString());
    const allIds = [...new Set([...manualIds, ...geoIds])];

    if (allIds.length > 0) {
      data.vendorIds = allIds.join(",");
    }
  }

  let rfq;
  try {
    // [Task #610] 2층 단일 통로 — RFQ INSERT + documents upsert 헬퍼 위임.
    rfq = await saveProducingDocument({
      write: (exec) => exec.insert(rfqsTable).values(data).returning().then((r) => r[0]),
      document: {
        kind: "rfq",
        sourceTable: "rfqs",
        // 신규 RFQ 는 거의 항상 "open" 으로 들어오지만, 'awarded' 인 경우 'completed'.
        state: "active",
        // [Task #610] 명명 SoT — buildDocumentName('rfq') 적용.
        title: (r) =>
          buildDocumentName({
            kind: "rfq",
            title: r.title,
            buildingName: r.buildingName,
            date: r.createdAt,
          }).title,
        authorId: req.user?.userId ?? null,
        authorRole: (req.user?.role as DocumentAuthorRole) ?? null,
        buildingId: (r) => r.buildingId,
        href: (r) => `/rfqs?id=${r.id}`,
        metadata: (r) => ({ category: r.category, serviceType: r.serviceType, status: r.status }),
      },
    });
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
  // [Task #668] 매칭 파트너에게 인앱 알림 + (가능하면) 안내 이메일 fan-out.
  //   알림 fan-out 실패는 RFQ 생성 자체를 실패시키지 않도록 try/catch.
  try {
    await fanOutNewRfqToVendors(rfq);
  } catch (err) {
    console.error("[rfqs] vendor notification fan-out failed:", err);
  }

  // [Task #510] drizzle 가 timestamp/date 컬럼을 Date 객체로 돌려주기 때문에
  //   응답 스키마(UpdateRfqResponse) 의 string 기대치와 어긋나 INSERT 성공
  //   직후 ZodError → 500 이 발생했었다. serializeRfqRow 로 Date → ISO string
  //   정규화만 거친 뒤 .parse 에 넘긴다.
  res.status(201).json(UpdateRfqResponse.parse(serializeRfqRow(rfq)));
});

// [Task #668] 매칭 파트너에게 사내 알림(+ best-effort 이메일) 을 fan-out 한다.
//   - vendor:<vendorId> 정규형으로 1행씩 적재 → 파트너 벨이 즉시 인지.
//   - 메일 어댑터(SMTP 환경 변수)가 활성화된 경우에만 동일 요약을 메일로 발송.
//   - 어떤 단계가 실패해도 다른 vendor 의 fan-out 은 계속 진행 (best-effort).
async function fanOutNewRfqToVendors(rfq: typeof rfqsTable.$inferSelect): Promise<void> {
  const ids = (rfq.vendorIds ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (ids.length === 0) return;

  const catLabel = rfqCategoryLabel(rfq.category) || rfq.category;
  const svcLabel = rfqServiceTypeLabel(rfq.serviceType ?? null);
  const titleSuffix = svcLabel ? `${catLabel} / ${svcLabel}` : catLabel;
  const title = `새 견적 요청 — ${titleSuffix}`;

  const deadline = toIsoDate(rfq.deadline) ?? "";
  const region = [rfq.sido, rfq.sigungu].filter(Boolean).join(" ");
  const summaryParts = [
    rfq.buildingName ? `건물: ${rfq.buildingName}` : null,
    region ? `지역: ${region}` : null,
    deadline ? `마감: ${deadline}` : null,
    rfq.requiresSiteVisit ? "현장방문 필요" : null,
  ].filter(Boolean) as string[];
  const message = summaryParts.join(" · ") || "새 견적 요청이 도착했습니다.";

  const mailEnabled = isMailEnabled();
  // 파트너 소유 user 의 email/phone 을 한 번에 조회 (vendorId 별 1건 이상일 수 있으므로 grouping).
  // [Task #RFQ-알림톡] phone 도 함께 가져와 aligo_kakao 발송 대상으로 사용.
  //   #3 fix: 알림톡은 vendor 당 대표자 1명에게만 — createdAt ASC 로 정렬해 첫 user 의 phone 만 keep.
  //   email 은 사내 알림 fan-out 성격이라 기존대로 다중 발송 유지.
  const owners = await db
    .select({ vendorId: usersTable.vendorId, email: usersTable.email, phone: usersTable.phone })
    .from(usersTable)
    .where(inArray(usersTable.vendorId, ids))
    .orderBy(usersTable.createdAt);
  const emailsByVendor = new Map<number, string[]>();
  const repPhoneByVendor = new Map<number, string>();
  for (const o of owners) {
    if (o.vendorId == null) continue;
    if (o.email) {
      const arr = emailsByVendor.get(o.vendorId) ?? [];
      arr.push(o.email);
      emailsByVendor.set(o.vendorId, arr);
    }
    if (o.phone && !repPhoneByVendor.has(o.vendorId)) {
      repPhoneByVendor.set(o.vendorId, o.phone);
    }
  }

  // [Task #RFQ-알림톡] building.address 는 rfq 에 없으므로 buildingId 가 있을 때만 한 번 조회.
  let buildingAddress = "";
  if (rfq.buildingId) {
    const [b] = await db
      .select({ addressFull: buildingsTable.addressFull, addressJibun: buildingsTable.addressJibun })
      .from(buildingsTable)
      .where(eq(buildingsTable.id, rfq.buildingId));
    buildingAddress = b?.addressFull ?? b?.addressJibun ?? "";
  }

  // [Task #RFQ-알림톡] 예상 크레딧 차감 — 파트너 측 안내용 1건만 계산(실패 시 0 fallback).
  let creditCostForMessage = 0;
  try {
    const cost = await computeCreditCost({
      category: rfq.category,
      sido: rfq.sido,
      sigungu: rfq.sigungu,
      estimatedAmount: rfq.estimatedAmount,
    });
    creditCostForMessage = cost?.totalCost ?? 0;
  } catch {
    creditCostForMessage = 0;
  }

  const portalLink = `/rfqs?id=${rfq.id}`;
  for (const vendorId of ids) {
    try {
      await insertNotification({
        recipientType: `vendor:${vendorId}`,
        notificationType: "rfq_new",
        title,
        message,
        relatedEntityType: "rfq",
        relatedEntityId: rfq.id,
      });
    } catch (err) {
      console.error("[rfqs] insertNotification failed for vendor", vendorId, err);
    }

    if (mailEnabled) {
      const emails = emailsByVendor.get(vendorId) ?? [];
      for (const to of emails) {
        try {
          const text =
            `${title}\n\n` +
            `${message}\n\n` +
            `포털에서 자세히 보기: ${portalLink}\n`;
          await sendMail({ to, subject: title, text });
        } catch (err) {
          console.error("[rfqs] sendMail failed for vendor", vendorId, to, err);
        }
      }
    }

    // [Task #RFQ-알림톡] aligo_kakao dispatch — vendor 대표자 1명 phone 으로만 발송 (#3 fix).
    //   채널·환경변수 미설정 시 어댑터가 devSimulate 로 자동 동작 (실 발송 X).
    const repPhone = repPhoneByVendor.get(vendorId);
    if (repPhone) {
      const phone = repPhone;
      const aligoMessage =
        `[관리의달인] 새 견적 요청이 도착했습니다\n\n` +
        `${rfq.buildingName ?? ""}에서 ${catLabel} 견적을 요청했습니다.\n` +
        `요청 내용: ${rfq.title}\n` +
        `위치: ${buildingAddress}\n` +
        `마감: ${deadline || "미정"}\n` +
        `예상 크레딧 차감: ${creditCostForMessage}C\n\n` +
        `지금 파트너 포털에서 확인해 주세요.`;
      try {
        await enqueueDispatch({
          buildingId: rfq.buildingId,
          channel: "aligo_kakao",
          target: phone,
          payload: {
            templateCode: "rfq_new_partner",
            senderKey: process.env.ALIGO_SENDER_KEY ?? "",
            senderNumber: process.env.ALIGO_SENDER_NUMBER ?? "",
            message: aligoMessage,
            receiverName: "",
            buildingId: rfq.buildingId,
          },
          relatedEntityType: "rfq",
          relatedEntityId: rfq.id,
          triggerSource: "rfq_new_partner",
        });
      } catch (err) {
        console.error("[rfqs] aligo_kakao dispatch failed for vendor", vendorId, phone, err);
      }
    }
  }
}


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

  // [Task #698] 범위 확대도 같은 단일 헬퍼로 매칭.
  //   기존 SQL eq() 는 시도 단위만 풀어 줬는데, 단일 헬퍼는 vendor 의
  //   subCategories / serviceArea.nationwide 까지 자동으로 본다.
  const candidateVendors = await db
    .select()
    .from(vendorsTable)
    .where(eq(vendorsTable.type, "platform"));

  const expandedRfq: RfqMatchProfile = {
    category: rfq.category,
    sido: rfq.sido,
    sigungu: rfq.sigungu,
    geoScope: "sido", // 시도 단위로 풀어서 매칭
  };
  const matchedVendors = candidateVendors.filter((v) => vendorMatchesRfq(v, expandedRfq));

  const existingIds = rfq.vendorIds ? rfq.vendorIds.split(",") : [];
  const newGeoIds = matchedVendors.map((v) => v.id.toString());
  const mergedIds = [...new Set([...existingIds, ...newGeoIds])];

  // [allow-direct-write: vendorIds 매칭 풀 확장 — 라이프사이클 상태(open/closed/awarded) 변화 없음.
  //   트리거 trg_documents_rfqs 가 documents.metadata 머지로 closedQuoteId 변화만 감지한다.]
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

  // [Task #610] 단일 통로 — RFQ PATCH 도 saveProducingDocument 로.
  let rfq!: typeof rfqsTable.$inferSelect;
  try {
    rfq = await saveProducingDocument({
      write: (exec) =>
        exec
          .update(rfqsTable)
          .set(parsed.data)
          .where(eq(rfqsTable.id, params.data.id))
          .returning()
          .then((r) => r[0]),
      document: {
        kind: "rfq",
        sourceTable: "rfqs",
        title: (r) => r.title,
        buildingId: (r) => r.buildingId,
        href: (r) => `/rfqs?id=${r.id}`,
      },
    });
  } catch (e) {
    if (e instanceof MissingSourceRowError) {
      res.status(404).json({ error: "RFQ not found" });
      return;
    }
    throw e;
  }

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
