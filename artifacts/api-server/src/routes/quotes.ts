import { Router, type IRouter } from "express";
import { eq, and, desc, sql, ne } from "drizzle-orm";
import {
  db,
  quotesTable,
  rfqsTable,
  vendorsTable,
  buildingsTable,
  usersTable,
  commissionsTable,
  commissionEventsTable,
  contractsTable,
  notificationsTable,
  approvalsTable,
} from "@workspace/db";
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
import { requireRole } from "../middlewares/auth";
import {
  computeCreditCost,
  getOrCreateWallet,
  postLedger,
  isCreditsEnabled,
  isAutoCommissionEnabled,
  getPremiumSlotLimit,
  getPremiumAmountThreshold,
  getRebateRatio,
} from "../lib/credits";
import { computeCommissionRate } from "./commissions";

const router: IRouter = Router();
router.use("/quotes", requireRole("manager", "platform_admin", "accountant", "partner"));
async function getPartnerVendorId(userId: number | undefined): Promise<number | null> {
  if (!userId) return null;
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  return u?.vendorId ?? null;
}

// [Task #335] 매니저(및 회계)는 본인 건물의 RFQ 에서 발생한 견적만 다룰 수 있다.
// platform_admin / hq_executive 는 전체 건물 가시성 유지. 파트너는 vendor 소유로 별도 가드.
async function getUserBuildingId(userId: number | undefined): Promise<number | null> {
  if (!userId) return null;
  const [u] = await db.select({ buildingId: usersTable.buildingId }).from(usersTable).where(eq(usersTable.id, userId));
  return u?.buildingId ?? null;
}
function isBuildingScopedRole(role: string | undefined): boolean {
  return role === "manager" || role === "accountant";
}

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

  if (req.user?.role === "partner") {
    const vId = await getPartnerVendorId(req.user.userId);
    if (!vId) {
      res.json([]);
      return;
    }
    conditions.push(eq(quotesTable.vendorId, vId));
  }

  // [Task #335] 매니저/회계는 본인 건물의 RFQ 에서 발생한 견적만 본다.
  let quotes;
  if (isBuildingScopedRole(req.user?.role)) {
    const userBId = await getUserBuildingId(req.user?.userId);
    if (userBId == null) {
      res.json([]);
      return;
    }
    const rows = await db
      .select({ quote: quotesTable })
      .from(quotesTable)
      .innerJoin(rfqsTable, eq(quotesTable.rfqId, rfqsTable.id))
      .where(and(...conditions, eq(rfqsTable.buildingId, userBId)))
      .orderBy(desc(quotesTable.createdAt));
    quotes = rows.map((r) => r.quote);
  } else {
    quotes = await db
      .select()
      .from(quotesTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(quotesTable.createdAt));
  }

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

  if (req.user?.role === "partner") {
    const vId = await getPartnerVendorId(req.user.userId);
    if (vId !== quote.vendorId) {
      res.status(403).json({ error: "본인 업체 견적만 조회할 수 있습니다" });
      return;
    }
  }

  // [Task #335] 매니저/회계는 자기 건물 RFQ 의 견적만 조회 가능 (IDOR 차단).
  if (isBuildingScopedRole(req.user?.role)) {
    const userBId = await getUserBuildingId(req.user?.userId);
    const [rfq] = await db.select({ buildingId: rfqsTable.buildingId }).from(rfqsTable).where(eq(rfqsTable.id, quote.rfqId));
    if (userBId == null || rfq?.buildingId == null || rfq.buildingId !== userBId) {
      res.status(403).json({ error: "본인 건물 RFQ 의 견적만 조회할 수 있습니다" });
      return;
    }
  }

  // [Task #226] 관리소장이 견적을 처음 열람한 시각을 기록한다 (미열람 환불 잡 판정용).
  if (req.user?.role === "manager" && !quote.firstViewedAt) {
    try {
      const now = new Date();
      await db.update(quotesTable).set({ firstViewedAt: now }).where(eq(quotesTable.id, quote.id));
      quote.firstViewedAt = now;
    } catch {
      // best-effort: 기록 실패해도 응답은 정상.
    }
  }

  res.json(GetQuoteResponse.parse(quote));
});

router.post("/quotes", async (req, res): Promise<void> => {
  const parsed = CreateQuoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const body = parsed.data;

  // Server-side validation of requiredDocsComplete: only accept true when the
  // submission actually includes the verifiable fields we persist for the quote
  // (item breakdown, scope, estimated days, and available date). Prevents
  // clients from claiming the rebate without real submission data.
  if (body.requiredDocsComplete) {
    const attested = Boolean(
      body.itemBreakdown && body.itemBreakdown.trim().length > 0 &&
      body.scope && body.scope.trim().length > 0 &&
      body.estimatedDays != null &&
      body.availableDate
    );
    if (!attested) {
      body.requiredDocsComplete = false;
    }
  }

  // partner vendorId enforcement
  if (req.user?.role === "partner") {
    const [u] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.userId));
    if (!u?.vendorId || u.vendorId !== body.vendorId) {
      res.status(403).json({ error: "본인 업체로만 제출할 수 있습니다" });
      return;
    }
  }

  const [rfq] = await db.select().from(rfqsTable).where(eq(rfqsTable.id, body.rfqId));
  if (!rfq) {
    res.status(404).json({ error: "RFQ를 찾을 수 없습니다" });
    return;
  }
  if (rfq.status !== "open") {
    res.status(400).json({ error: "마감된 공고에는 견적을 제출할 수 없습니다" });
    return;
  }

  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, body.vendorId));
  if (!vendor) {
    res.status(404).json({ error: "업체를 찾을 수 없습니다" });
    return;
  }

  const creditsOn = await isCreditsEnabled();

  // Prevent duplicate quote from same vendor for same RFQ
  const existing = await db
    .select()
    .from(quotesTable)
    .where(and(eq(quotesTable.rfqId, body.rfqId), eq(quotesTable.vendorId, body.vendorId)));
  if (existing.length > 0) {
    res.status(409).json({ error: "이미 이 공고에 견적을 제출하셨습니다" });
    return;
  }

  // Premium / large-building criteria from DB settings
  const premiumThreshold = await getPremiumAmountThreshold();
  const defaultSlotLimit = await getPremiumSlotLimit();
  const estAmt = rfq.estimatedAmount != null ? Number(rfq.estimatedAmount) : null;
  const isPremiumRfq = Boolean(rfq.isPremium) || (estAmt != null && estAmt >= premiumThreshold);
  const slotLimit = rfq.premiumSlotLimit ?? defaultSlotLimit;

  let totalArea: number | null = null;
  let fireGrade: number | null = null;
  if (rfq.buildingId) {
    const [b] = await db.select().from(buildingsTable).where(eq(buildingsTable.id, rfq.buildingId));
    totalArea = b?.totalArea ? Number(b.totalArea) : null;
    fireGrade = b?.fireGrade ?? null;
  }

  // [Task #226] 단가는 RFQ→건물의 시도/시군구 기준으로 결정한다.
  let regionSido: string | null = rfq.sido ?? null;
  let regionSigungu: string | null = rfq.sigungu ?? null;
  if ((!regionSido || !regionSigungu) && rfq.buildingId) {
    const [b] = await db.select().from(buildingsTable).where(eq(buildingsTable.id, rfq.buildingId));
    regionSido = regionSido ?? (b?.sido ?? null);
    regionSigungu = regionSigungu ?? (b?.sigungu ?? null);
  }
  const cost = creditsOn
    ? await computeCreditCost({
        category: rfq.category,
        estimatedAmount: rfq.estimatedAmount,
        buildingTotalArea: totalArea,
        buildingFireGrade: fireGrade,
        isPremiumOverride: rfq.isPremium,
        sido: regionSido,
        sigungu: regionSigungu,
      })
    : null;

  // Transactional insert: lock RFQ row + wallet row, re-check duplicate/seat/balance inside tx.
  try {
    const quote = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM rfqs WHERE id = ${rfq.id} FOR UPDATE`);

      // Duplicate check inside tx (and backed by unique index (rfq_id, vendor_id)).
      const dup = await tx
        .select()
        .from(quotesTable)
        .where(and(eq(quotesTable.rfqId, body.rfqId), eq(quotesTable.vendorId, body.vendorId)));
      if (dup.length > 0) {
        throw Object.assign(new Error("이미 이 공고에 견적을 제출하셨습니다"), { http: 409 });
      }

      if (isPremiumRfq) {
        const occupied = await tx.select().from(quotesTable).where(eq(quotesTable.rfqId, rfq.id));
        if (occupied.length >= slotLimit) {
          throw Object.assign(new Error(`Premium 공고 선착순 ${slotLimit}개 입찰이 마감되었습니다`), { http: 409 });
        }
      }

      if (creditsOn && cost) {
        await tx.execute(sql`SELECT id FROM vendor_credit_wallets WHERE vendor_id = ${body.vendorId} FOR UPDATE`);
        const wallet = await getOrCreateWallet(body.vendorId, tx);
        if (wallet.balance < cost.totalCost) {
          throw Object.assign(
            new Error(`크레딧이 부족합니다. 필요 ${cost.totalCost} / 보유 ${wallet.balance}`),
            { http: 402, required: cost.totalCost, balance: wallet.balance },
          );
        }
      }

      const [inserted] = await tx.insert(quotesTable).values(body).returning();

      // [Task #335] 견적 도착 알림: 해당 RFQ 가 속한 건물의 매니저들에게 인앱 알림 전송.
      // 대시보드의 quote_received 알림은 dashboard.ts 에서 별도로 집계되며, 이 알림은
      // 알림센터(/notifications) 노출 및 푸시 채널을 위한 것이다.
      if (rfq.buildingId) {
        await tx.insert(notificationsTable).values({
          recipientType: `manager:${rfq.buildingId}`,
          notificationType: "quote_received",
          title: "견적 도착, 확인하세요",
          message: `${vendor.name} 업체가 [${rfq.title}] 공고에 견적을 제출했습니다. 견적을 확인하고 채택 여부를 결정해주세요.`,
          relatedEntityType: "quote",
          relatedEntityId: inserted.id,
        });
      }

      if (creditsOn && cost) {
        await postLedger(
          {
            vendorId: body.vendorId,
            amount: -cost.totalCost,
            kind: "consumption",
            source: "consumption",
            rfqId: rfq.id,
            quoteId: inserted.id,
            notes: `견적 제출 차감 | pricingId=${cost.pricingId ?? "none"} scope=${cost.pricingScope ?? "fallback"} | ${cost.reason.join(", ")}`,
            actorId: req.user?.userId ?? null,
            actorName: req.user?.email ?? null,
          },
          tx,
        );

        // Activity-point rebate: award 10% of cost in bonus points if required docs are complete.
        if (inserted.requiredDocsComplete) {
          const ratio = await getRebateRatio();
          const rebate = Math.max(1, Math.round(cost.totalCost * ratio));
          await postLedger(
            {
              vendorId: body.vendorId,
              amount: 0,
              pointsAmount: rebate,
              kind: "bonus_points",
              source: "rebate",
              rfqId: rfq.id,
              quoteId: inserted.id,
              notes: `필수 서류 완비 활동 포인트 적립 (${rebate}P)`,
              actorId: req.user?.userId ?? null,
              actorName: req.user?.email ?? null,
            },
            tx,
          );
        }
      }
      return inserted;
    });

    res.status(201).json(UpdateQuoteResponse.parse(quote));
  } catch (e) {
    const err = e as { http?: number; message?: string; required?: number; balance?: number; code?: string };
    if (err.http === 402) {
      res.status(402).json({ error: err.message, required: err.required, balance: err.balance });
      return;
    }
    if (err.http === 409 || err.code === "23505") {
      res.status(409).json({ error: err.message ?? "이미 이 공고에 견적을 제출하셨습니다" });
      return;
    }
    throw e;
  }
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

  const [prev] = await db.select().from(quotesTable).where(eq(quotesTable.id, params.data.id));
  if (!prev) {
    res.status(404).json({ error: "Quote not found" });
    return;
  }

  if (req.user?.role === "partner") {
    const vId = await getPartnerVendorId(req.user.userId);
    if (vId !== prev.vendorId) {
      res.status(403).json({ error: "본인 업체 견적만 수정할 수 있습니다" });
      return;
    }
    // Partners may not change status (selection is manager/HQ only)
    if (parsed.data.status && parsed.data.status !== prev.status) {
      res.status(403).json({ error: "상태 변경 권한이 없습니다" });
      return;
    }
  }

  // [Task #335] 매니저/회계는 자기 건물 RFQ 의 견적만 수정/수락 가능 (IDOR 차단).
  // 타 건물 견적을 accepted/rejected 로 바꾸거나 RFQ 를 awarded 로 마감하는 것을 막는다.
  if (isBuildingScopedRole(req.user?.role)) {
    const userBId = await getUserBuildingId(req.user?.userId);
    const [rfq] = await db.select({ buildingId: rfqsTable.buildingId }).from(rfqsTable).where(eq(rfqsTable.id, prev.rfqId));
    if (userBId == null || rfq?.buildingId == null || rfq.buildingId !== userBId) {
      res.status(403).json({ error: "본인 건물 RFQ 의 견적만 수정할 수 있습니다" });
      return;
    }
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

  // Auto-create commission in 'pending' status when quote is accepted AND contract copy is uploaded
  const wasReady = prev.status === "accepted" && prev.contractUploadedAt != null;
  const isReady = quote.status === "accepted" && quote.contractUploadedAt != null;
  const justReady = !wasReady && isReady;
  if (justReady && (await isAutoCommissionEnabled())) {
    const [rfq] = await db.select().from(rfqsTable).where(eq(rfqsTable.id, quote.rfqId));
    const category = rfq?.category ?? "기타";
    const rate = await computeCommissionRate(category, quote.totalAmount);
    const commissionAmount = Math.round((quote.totalAmount * rate) / 100);
    const [created] = await db
      .insert(commissionsTable)
      .values({
        vendorId: quote.vendorId,
        vendorName: quote.vendorName,
        contractAmount: quote.totalAmount,
        commissionRate: rate,
        commissionAmount,
        status: "pending",
        matchedDate: new Date().toISOString().split("T")[0],
        rfqId: quote.rfqId,
        quoteId: quote.id,
        category,
        notes: "[자동] 견적 선정 및 계약 진행",
      })
      .returning();
    await db.insert(commissionEventsTable).values({
      commissionId: created.id,
      fromStatus: null,
      toStatus: "pending",
      reason: "견적 선정 자동 생성",
      actorId: req.user?.userId ?? null,
      actorName: req.user?.email ?? null,
    });
  }

  // [Task #335] 견적 채택 시 동일 RFQ 의 다른 submitted 견적은 자동으로 rejected 처리하고
  // RFQ 자체도 awarded 상태로 마감해, 매니저 대시보드의 "견적 도착" 잔여 알림이 즉시 사라지게 한다.
  if (prev.status !== "accepted" && quote.status === "accepted") {
    await db
      .update(quotesTable)
      .set({ status: "rejected" })
      .where(
        and(
          eq(quotesTable.rfqId, quote.rfqId),
          ne(quotesTable.id, quote.id),
          eq(quotesTable.status, "submitted"),
        ),
      );
    await db
      .update(rfqsTable)
      .set({ status: "awarded" })
      .where(eq(rfqsTable.id, quote.rfqId));
  }

  // Auto-create contract draft when quote transitions to accepted (Task #65)
  if (prev.status !== "accepted" && quote.status === "accepted") {
    const existing = await db.select().from(contractsTable).where(eq(contractsTable.quoteId, quote.id));
    if (existing.length === 0) {
      const [rfq] = await db.select().from(rfqsTable).where(eq(rfqsTable.id, quote.rfqId));
      const requesterId = req.user?.userId ?? null;
      const [requester] = requesterId
        ? await db.select({ name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, requesterId))
        : [undefined];

      const title = `[업체선정] ${rfq?.title ?? "RFQ"} - ${quote.vendorName}`;

      const [approval] = await db
        .insert(approvalsTable)
        .values({
          title,
          description: `업체 선정 결재 (자동 생성) — ${quote.vendorName} (RFQ #${quote.rfqId}, 견적 #${quote.id}). 결재선을 추가한 뒤 상신하세요.`,
          category: "other",
          status: "pending",
          isDraft: true,
          requesterId: requesterId ?? 0,
          requesterName: requester?.name ?? requester?.email ?? "system",
          estimatedAmount: quote.totalAmount,
          vendorName: quote.vendorName,
          vendorQuoteDetails: quote.itemBreakdown ?? null,
          totalSteps: 1,
          currentStep: 1,
        })
        .returning();

      const [contract] = await db
        .insert(contractsTable)
        .values({
          buildingId: rfq?.buildingId ?? null,
          buildingName: rfq?.buildingName ?? null,
          vendorId: quote.vendorId,
          vendorName: quote.vendorName,
          category: rfq?.category ?? "other",
          title,
          rfqId: quote.rfqId,
          quoteId: quote.id,
          approvalId: approval.id,
          contractAmount: quote.totalAmount,
          status: "in_approval",
          isRecurring: false,
          notes: "견적 채택 시 자동 생성된 계약. 연결된 업체선정 품의가 최종 승인되면 자동으로 활성화됩니다.",
        })
        .returning();

      await db.insert(notificationsTable).values({
        recipientType: "admin",
        notificationType: "contract_auto_created",
        title: "[계약] 견적 채택 → 품의·계약 자동 생성",
        message: `${quote.vendorName} 견적 채택으로 업체선정 품의(#${approval.id})와 계약(#${contract.id})이 생성되었습니다. 결재선을 추가해 상신하세요.`,
        relatedEntityType: "contract",
        relatedEntityId: contract.id,
      });

      // [Task #335] 파트너에게 계약 초안 도착 알림. 파트너는 알림 클릭 후
      // /vendor-portal?openContract={id} 딥링크로 진입해 "계약 내용에 동의" 한다.
      await db.insert(notificationsTable).values({
        recipientType: `vendor:${quote.vendorId}`,
        notificationType: "contract_draft_ready",
        title: "[계약] 견적이 채택되어 계약 초안이 생성되었습니다",
        message: `[${rfq?.title ?? "RFQ"}] 견적이 채택되었습니다. 계약 내용을 확인하고 동의해주세요.`,
        relatedEntityType: "contract",
        relatedEntityId: contract.id,
      });
    }
  }

  res.json(UpdateQuoteResponse.parse(quote));
});

export default router;
