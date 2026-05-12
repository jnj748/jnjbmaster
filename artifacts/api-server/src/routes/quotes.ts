import { insertNotification } from "../lib/notificationRecipient";
// [Task #610] 견적 채택 시 자동 생성되는 업체선정 기안서를 documents 레지스트리에
import { registerDocument } from "../services/documents/registerDocument";
import { saveProducingDocument, MissingSourceRowError } from "../repo/producingDocuments";
import { buildDocumentName } from "@workspace/document-naming";
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
  approvalsTable,
  type DocumentAuthorRole,
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
import { enqueueDispatch } from "../lib/external/adapter";

const router: IRouter = Router();

// [Task #769] DB(Date) → ISO 문자열로 직렬화하여 UpdateQuoteResponse zod 스키마(.datetime())에 맞춤.
// 이 변환이 누락되면 트랜잭션은 정상 커밋되어도 응답 단계에서 ZodError로 500이 발생함.
function serializeQuoteForResponse<T extends Record<string, unknown>>(quote: T): T {
  const dateKeys = ["createdAt", "updatedAt", "contractUploadedAt", "firstViewedAt", "noViewRefundedAt"] as const;
  const out: Record<string, unknown> = { ...quote };
  for (const k of dateKeys) {
    const v = out[k];
    if (v instanceof Date) out[k] = v.toISOString();
  }
  return out as T;
}
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
      // [allow-direct-write: 매니저 첫 열람 타임스탬프 기록 (best-effort 환불 잡 판정용);
      //   견적 라이프사이클 상태 변화 없음. 트리거 trg_documents_quotes 가 documents.updated_at 만
      //   새로고침한다.]
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

  // [Task #612] 표준 양식: subtotal+vatAmount 와 totalAmount 가 1원 이내로 일관되어야 한다.
  //   클라이언트 자동합산 외에도 서버에서 마지막 가드. 라인아이템만 보내고 합계가 비어 있는
  //   에지 케이스도 막는다.
  if (body.subtotal != null && body.vatAmount != null) {
    const sum = Number(body.subtotal) + Number(body.vatAmount);
    if (Math.abs(sum - Number(body.totalAmount)) > 1) {
      res.status(400).json({ error: `합계 불일치: 공급가 ${body.subtotal} + 부가세 ${body.vatAmount} ≠ 합계 ${body.totalAmount}` });
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
  // [Task #견적-알림톡 #1/#2 fix] tx 내부에서는 발송 페이로드만 수집,
  //   tx 커밋 후에만 enqueueDispatch 호출 — 롤백 시 알림톡 강행 방지.
  type PendingAligo = {
    buildingId: number | null;
    target: string;
    templateCode: string;
    message: string;
    relatedEntityId: number;
  };
  const pendingDispatches: PendingAligo[] = [];
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

      // [Task #610] 2층 단일 통로 — 견적 INSERT + documents upsert 헬퍼 위임.
      const inserted = await saveProducingDocument({
        executor: tx,
        write: (exec) => exec.insert(quotesTable).values(body).returning().then((r) => r[0]),
        document: {
          kind: "quote",
          sourceTable: "quotes",
          state: "active",
          title: `[견적] ${vendor.name} - ${rfq.title}`,
          authorId: req.user?.userId ?? null,
          authorRole: "partner",
          buildingId: rfq.buildingId,
          href: (r) => `/quotes?id=${r.id}`,
          metadata: (r) => ({ vendorId: r.vendorId, rfqId: r.rfqId, totalAmount: r.totalAmount }),
        },
      });

      // [Task #335] 견적 도착 알림: 해당 RFQ 가 속한 건물의 매니저들에게 인앱 알림 전송.
      // 대시보드의 quote_received 알림은 dashboard.ts 에서 별도로 집계되며, 이 알림은
      // 알림센터(/notifications) 노출 및 푸시 채널을 위한 것이다.
      if (rfq.buildingId) {
        // [Task #532] 같은 트랜잭션 안에서 manager:<bid> → user:<id> fan-out 을
        // 수행한다. tx 를 헬퍼에 넘겨 트랜잭션 경계를 깨지 않는다.
        await insertNotification(
          {
            recipientType: `manager:${rfq.buildingId}`,
            notificationType: "quote_received",
            title: "견적 도착, 확인하세요",
            message: `${vendor.name} 업체가 [${rfq.title}] 공고에 견적을 제출했습니다. 견적을 확인하고 채택 여부를 결정해주세요.`,
            relatedEntityType: "quote",
            relatedEntityId: inserted.id,
          },
          tx,
        );

        // [Task #견적-알림톡 작업 B / #1·#2 fix] 소장 alimtalk 페이로드를 수집만 한다.
        //   building 의 manager role 유저 phone 조회. 발송은 tx 종료 후.
        const managerUsers = await tx
          .select({ phone: usersTable.phone })
          .from(usersTable)
          .where(and(eq(usersTable.buildingId, rfq.buildingId), eq(usersTable.role, "manager")));
        for (const m of managerUsers) {
          if (!m.phone) continue;
          const aligoMessage =
            `[관리의달인] 견적서가 도착했습니다\n\n` +
            `${rfq.title}에 ${vendor.name}의 견적이 접수되었습니다.\n` +
            `견적 금액: ${Number(inserted.totalAmount ?? 0).toLocaleString("ko-KR")}원\n` +
            `유효기간: ${inserted.validUntil ?? "미정"}까지\n\n` +
            `앱에서 확인 후 채택 여부를 결정해 주세요.`;
          pendingDispatches.push({
            buildingId: rfq.buildingId,
            target: m.phone,
            templateCode: "quote_received_manager",
            message: aligoMessage,
            relatedEntityId: inserted.id,
          });
        }
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

    // [Task #견적-알림톡 #1·#2 fix] tx 커밋 성공 후에만 알림톡 발송. 실패해도 본 흐름 유지.
    for (const d of pendingDispatches) {
      try {
        await enqueueDispatch({
          buildingId: d.buildingId,
          channel: "aligo_kakao",
          target: d.target,
          payload: {
            templateCode: d.templateCode,
            senderKey: process.env.ALIGO_SENDER_KEY ?? "",
            senderNumber: process.env.ALIGO_SENDER_NUMBER ?? "",
            message: d.message,
            receiverName: "",
            buildingId: d.buildingId,
          },
          relatedEntityType: "quote",
          relatedEntityId: d.relatedEntityId,
          triggerSource: d.templateCode,
        });
      } catch (err) {
        console.error("[quotes] aligo_kakao dispatch failed", d.templateCode, d.target, err);
      }
    }

    res.status(201).json(UpdateQuoteResponse.parse(serializeQuoteForResponse(quote)));
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

  // 견적 수락은 quote/RFQ/commissions/approval/contract/documents 까지
  // 한 트랜잭션으로 묶어 부분 실패 시 일관성 깨짐을 막는다.
  // [Task #견적-알림톡 #1/#2 fix] tx 내부에서는 발송 페이로드만 수집,
  //   tx 커밋 후에만 enqueueDispatch — 롤백 시 알림톡 강행 방지.
  type PendingAligo = {
    buildingId: number | null;
    target: string;
    templateCode: string;
    message: string;
    relatedEntityType: string;
    relatedEntityId: number;
  };
  const pendingDispatches: PendingAligo[] = [];
  const quote = await db.transaction(async (tx) => {
    // OpenAPI 의 string|null 시간 필드를 Drizzle 의 Date|null 로 변환해
    // .set 의 타입 우회 캐스팅을 제거한다. 명시 부분 페이로드만 넘긴다.
    const p = parsed.data;
    const updateSet: Partial<typeof quotesTable.$inferInsert> = {};
    if (p.status !== undefined) updateSet.status = p.status;
    if (p.notes !== undefined) updateSet.notes = p.notes;
    if (p.contractFilePath !== undefined) updateSet.contractFilePath = p.contractFilePath;
    if (p.contractUploadedAt !== undefined) {
      updateSet.contractUploadedAt = p.contractUploadedAt === null ? null : new Date(p.contractUploadedAt);
    }
    if (p.lineItems !== undefined) updateSet.lineItems = p.lineItems;
    if (p.subtotal !== undefined) updateSet.subtotal = p.subtotal;
    if (p.vatAmount !== undefined) updateSet.vatAmount = p.vatAmount;
    if (p.validUntil !== undefined) updateSet.validUntil = p.validUntil;
    if (p.warrantyTerms !== undefined) updateSet.warrantyTerms = p.warrantyTerms;
    if (p.attachmentUrl !== undefined) updateSet.attachmentUrl = p.attachmentUrl;
    if (p.attachmentUrls !== undefined) updateSet.attachmentUrls = p.attachmentUrls;

    let updated!: typeof quotesTable.$inferSelect;
    try {
      updated = await saveProducingDocument({
        executor: tx,
        write: (exec) =>
          exec
            .update(quotesTable)
            .set(updateSet)
            .where(eq(quotesTable.id, params.data.id))
            .returning()
            .then((r) => r[0]),
        document: {
          kind: "quote",
          sourceTable: "quotes",
          title: (r) => r.vendorName,
          buildingId: null,
          href: (r) => `/quotes/${r.id}`,
        },
      });
    } catch (e) {
      if (e instanceof MissingSourceRowError) {
        throw Object.assign(new Error("Quote not found"), { http: 404 });
      }
      throw e;
    }

    // Auto-create commission in 'pending' status when quote is accepted AND contract copy is uploaded
    const wasReady = prev.status === "accepted" && prev.contractUploadedAt != null;
    const isReady = updated.status === "accepted" && updated.contractUploadedAt != null;
    const justReady = !wasReady && isReady;
    if (justReady && (await isAutoCommissionEnabled())) {
      const [rfq] = await tx.select().from(rfqsTable).where(eq(rfqsTable.id, updated.rfqId));
      const category = rfq?.category ?? "기타";
      const rate = await computeCommissionRate(category, updated.totalAmount);
      const commissionAmount = Math.round((updated.totalAmount * rate) / 100);
      const [created] = await tx
        .insert(commissionsTable)
        .values({
          vendorId: updated.vendorId,
          vendorName: updated.vendorName,
          contractAmount: updated.totalAmount,
          commissionRate: rate,
          commissionAmount,
          status: "pending",
          matchedDate: new Date().toISOString().split("T")[0],
          rfqId: updated.rfqId,
          quoteId: updated.id,
          category,
          notes: "[자동] 견적 선정 및 계약 진행",
        })
        .returning();
      await tx.insert(commissionEventsTable).values({
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
    // [Task #612] 채택 시 closedAt / closedQuoteId 기록 + 거절 파트너에게도 알림.
    // [Task #610] 거절된 견적 ID 들은 quote_bundle documents.metadata 에 보존한다.
    let rejectedQuoteIdsForBundle: number[] = [];
    let rejectedVendorIdsForBundle: number[] = [];
    if (prev.status !== "accepted" && updated.status === "accepted") {
      // 거절될 다른 견적들 — 각각 saveProducingDocument 로 통과시켜 documents.state 동기화.
      //   대량(보통 1~3건)이지만 한 트랜잭션 안에서 순차 처리한다.
      const others = await tx
        .select({ id: quotesTable.id, vendorId: quotesTable.vendorId, vendorName: quotesTable.vendorName })
        .from(quotesTable)
        .where(
          and(
            eq(quotesTable.rfqId, updated.rfqId),
            ne(quotesTable.id, updated.id),
            eq(quotesTable.status, "submitted"),
          ),
        );
      for (const o of others) {
        // [Task #610] 단일 통로 — 자동 거절도 saveProducingDocument 로.
        await saveProducingDocument({
          executor: tx,
          write: (exec) =>
            exec
              .update(quotesTable)
              .set({ status: "rejected" })
              .where(eq(quotesTable.id, o.id))
              .returning()
              .then((r) => r[0]),
          document: {
            kind: "quote",
            sourceTable: "quotes",
            title: (r) => r.vendorName,
            buildingId: null,
            href: (r) => `/quotes/${r.id}`,
          },
        });
      }
      rejectedQuoteIdsForBundle = others.map((r) => r.id);
      rejectedVendorIdsForBundle = others.map((r) => r.vendorId);
      // [Task #610] 단일 통로 — RFQ awarded 마감도 saveProducingDocument 로.
      await saveProducingDocument({
        executor: tx,
        write: (exec) =>
          exec
            .update(rfqsTable)
            .set({ status: "awarded", closedAt: new Date(), closedQuoteId: updated.id })
            .where(eq(rfqsTable.id, updated.rfqId))
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

      const [rfqForNotify] = await tx.select().from(rfqsTable).where(eq(rfqsTable.id, updated.rfqId));
      for (const r of others) {
        await insertNotification(
          {
            recipientType: `vendor:${r.vendorId}`,
            notificationType: "quote_rejected",
            title: "비교견적 결과 안내",
            message: `[${rfqForNotify?.title ?? "RFQ"}] 다른 업체 견적이 채택되었습니다.`,
            relatedEntityType: "rfq",
            relatedEntityId: updated.rfqId,
          },
          tx,
        );

        // [Task #견적-알림톡 작업 D / #1·#2·#3 fix] 견적 반려 파트너 — vendor 대표자 1명만, tx 커밋 후 발송.
        const [repPartner] = await tx
          .select({ phone: usersTable.phone })
          .from(usersTable)
          .where(eq(usersTable.vendorId, r.vendorId))
          .orderBy(usersTable.createdAt)
          .limit(1);
        if (repPartner?.phone) {
          const aligoMessage =
            `[관리의달인] 견적이 반려되었습니다\n\n` +
            `${rfqForNotify?.buildingName ?? ""}의 ${rfqForNotify?.title ?? "RFQ"} 견적이 반려되었습니다.\n` +
            `사유: 다른 업체 견적이 채택되었습니다.`;
          pendingDispatches.push({
            buildingId: rfqForNotify?.buildingId ?? null,
            target: repPartner.phone,
            templateCode: "quote_rejected_partner",
            message: aligoMessage,
            relatedEntityType: "quote",
            relatedEntityId: r.id,
          });
        }
      }
    }

    // Auto-create contract draft when quote transitions to accepted (Task #65)
    if (prev.status !== "accepted" && updated.status === "accepted") {
      const existing = await tx.select().from(contractsTable).where(eq(contractsTable.quoteId, updated.id));
      if (existing.length === 0) {
        const [rfq] = await tx.select().from(rfqsTable).where(eq(rfqsTable.id, updated.rfqId));
        const requesterId = req.user?.userId ?? null;
        const [requester] = requesterId
          ? await tx.select({ name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, requesterId))
          : [undefined];

        const title = `[업체선정] ${rfq?.title ?? "RFQ"} - ${updated.vendorName}`;

        // [Task #610] 2층 단일 통로 — 자동 생성 기안서 INSERT + documents upsert 헬퍼 위임.
        const naming = buildDocumentName({
          kind: "quote_bundle",
          date: new Date(),
          title: rfq?.title ?? "RFQ",
          selectedVendorName: updated.vendorName,
          buildingName: rfq?.buildingName ?? null,
        });
        const baseBundleMetadata = {
          rfqId: updated.rfqId,
          acceptedQuoteId: updated.id,
          acceptedVendorId: updated.vendorId,
          acceptedVendorName: updated.vendorName,
          rejectedQuoteIds: rejectedQuoteIdsForBundle,
          rejectedVendorIds: rejectedVendorIdsForBundle,
          totalAmount: updated.totalAmount,
          autoCreated: true,
        };

        const approval = await saveProducingDocument({
          executor: tx,
          write: (exec) =>
            exec
              .insert(approvalsTable)
              .values({
                title,
                description: `업체 선정 결재 (자동 생성) — ${updated.vendorName} (RFQ #${updated.rfqId}, 견적 #${updated.id}). 결재선을 추가한 뒤 상신하세요.`,
                category: "other",
                status: "pending",
                isDraft: true,
                requesterId: requesterId ?? 0,
                requesterName: requester?.name ?? requester?.email ?? "system",
                estimatedAmount: updated.totalAmount,
                vendorName: updated.vendorName,
                vendorQuoteDetails: updated.itemBreakdown ?? null,
                totalSteps: 1,
                currentStep: 1,
              })
              .returning()
              .then((r) => r[0]),
          document: {
            // 트리거 1층이 박은 'approval' 을 'quote_bundle' 로 덮어쓴다.
            kind: "quote_bundle",
            sourceTable: "approvals",
            state: "draft",
            title: naming.title,
            subtitle: `${updated.vendorName} · ₩${Number(updated.totalAmount ?? 0).toLocaleString("ko-KR")}`,
            authorId: requesterId,
            // 견적 채택 행위자(manager/accountant/platform_admin) 의 실제 역할.
            authorRole: (req.user?.role as DocumentAuthorRole) ?? null,
            buildingId: rfq?.buildingId ?? null,
            href: (a) => `/approvals/${a.id}`,
            metadata: baseBundleMetadata,
          },
        });

        const contract = await saveProducingDocument({
          executor: tx,
          write: (exec) =>
            exec
              .insert(contractsTable)
              .values({
                buildingId: rfq?.buildingId ?? null,
                buildingName: rfq?.buildingName ?? null,
                vendorId: updated.vendorId,
                vendorName: updated.vendorName,
                category: rfq?.category ?? "other",
                title,
                rfqId: updated.rfqId,
                quoteId: updated.id,
                approvalId: approval.id,
                contractAmount: updated.totalAmount,
                status: "in_approval",
                isRecurring: false,
                notes: "견적 채택 시 자동 생성된 계약. 연결된 업체선정 품의가 최종 승인되면 자동으로 활성화됩니다.",
              })
              .returning()
              .then((r) => r[0]),
          document: {
            kind: "contract",
            sourceTable: "contracts",
            state: "draft",
            title,
            authorId: requesterId,
            authorRole: (req.user?.role as DocumentAuthorRole) ?? null,
            buildingId: rfq?.buildingId ?? null,
            href: (c) => `/contracts?id=${c.id}`,
            metadata: (c) => ({ vendorName: c.vendorName, status: c.status, autoCreated: true }),
          },
        });

        // contract.id 를 quote_bundle metadata 에 추가하는 idempotent upsert.
        // 같은 (sourceTable='approvals', sourceId=approval.id) 라 같은 documents 행을 갱신.
        await registerDocument({
          executor: tx,
          kind: "quote_bundle",
          sourceTable: "approvals",
          sourceId: approval.id,
          state: "draft",
          title: naming.title,
          subtitle: `${updated.vendorName} · ₩${Number(updated.totalAmount ?? 0).toLocaleString("ko-KR")}`,
          authorId: requesterId,
          authorRole: (req.user?.role as DocumentAuthorRole) ?? null,
          buildingId: rfq?.buildingId ?? null,
          href: `/approvals/${approval.id}`,
          metadata: { ...baseBundleMetadata, contractId: contract.id },
        });

        await insertNotification(
          {
            recipientType: "admin",
            notificationType: "contract_auto_created",
            title: "[계약] 견적 채택 → 품의·계약 자동 생성",
            message: `${updated.vendorName} 견적 채택으로 업체선정 품의(#${approval.id})와 계약(#${contract.id})이 생성되었습니다. 결재선을 추가해 상신하세요.`,
            relatedEntityType: "contract",
            relatedEntityId: contract.id,
          },
          tx,
        );

        // [Task #335] 파트너에게 계약 초안 도착 알림. 파트너는 알림 클릭 후
        // /vendor-portal?openContract={id} 딥링크로 진입해 "계약 내용에 동의" 한다.
        await insertNotification(
          {
            recipientType: `vendor:${updated.vendorId}`,
            notificationType: "contract_draft_ready",
            title: "[계약] 견적이 채택되어 계약 초안이 생성되었습니다",
            message: `[${rfq?.title ?? "RFQ"}] 견적이 채택되었습니다. 계약 내용을 확인하고 동의해주세요.`,
            relatedEntityType: "contract",
            relatedEntityId: contract.id,
          },
          tx,
        );

        // [Task #견적-알림톡 작업 C / #1·#2·#3 fix] 견적 채택 파트너 — vendor 대표자 1명만, tx 커밋 후 발송.
        const [acceptedRep] = await tx
          .select({ phone: usersTable.phone })
          .from(usersTable)
          .where(eq(usersTable.vendorId, updated.vendorId))
          .orderBy(usersTable.createdAt)
          .limit(1);
        if (acceptedRep?.phone) {
          const aligoMessage =
            `[관리의달인] 견적이 채택되었습니다\n\n` +
            `${rfq?.buildingName ?? ""}의 ${rfq?.title ?? "RFQ"} 견적이 채택되었습니다.\n` +
            `채택 금액: ${Number(updated.totalAmount ?? 0).toLocaleString("ko-KR")}원\n\n` +
            `관리소장과 일정을 조율해 주세요.`;
          pendingDispatches.push({
            buildingId: rfq?.buildingId ?? null,
            target: acceptedRep.phone,
            templateCode: "quote_accepted_partner",
            message: aligoMessage,
            relatedEntityType: "quote",
            relatedEntityId: updated.id,
          });
        }
      }
    }

    return updated;
  }).catch((e) => {
    const err = e as { http?: number; message?: string };
    if (err.http === 404) {
      res.status(404).json({ error: err.message ?? "Quote not found" });
      return null;
    }
    throw e;
  });

  if (!quote) return; // already responded

  // [Task #견적-알림톡 #1·#2 fix] tx 커밋 성공 후에만 알림톡 발송. 실패해도 본 흐름 유지.
  for (const d of pendingDispatches) {
    try {
      await enqueueDispatch({
        buildingId: d.buildingId,
        channel: "aligo_kakao",
        target: d.target,
        payload: {
          templateCode: d.templateCode,
          senderKey: process.env.ALIGO_SENDER_KEY ?? "",
          senderNumber: process.env.ALIGO_SENDER_NUMBER ?? "",
          message: d.message,
          receiverName: "",
          buildingId: d.buildingId,
        },
        relatedEntityType: d.relatedEntityType,
        relatedEntityId: d.relatedEntityId,
        triggerSource: d.templateCode,
      });
    } catch (err) {
      console.error("[quotes] aligo_kakao dispatch failed", d.templateCode, d.target, err);
    }
  }

  res.json(UpdateQuoteResponse.parse(serializeQuoteForResponse(quote)));
});

export default router;
