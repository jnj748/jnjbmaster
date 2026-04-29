import { Router, type IRouter, type Request } from "express";
import { and, asc, eq } from "drizzle-orm";
import {
  db,
  rfqsTable,
  rfqSiteVisitsTable,
  usersTable,
  vendorsTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { insertNotification } from "../lib/notificationRecipient";
import { canAccessBuilding } from "../middlewares/buildingScope";
import { CreateRfqSiteVisitBody, UpdateRfqSiteVisitBody } from "@workspace/api-zod";

// [Task #612] 현장방문 견적 일정 조율.
//   - 파트너: 본인 vendorId 의 슬롯 제안/수정.
//   - 매니저: 본인 건물 RFQ 의 모든 파트너 슬롯 조회 + 확정/취소.
//   - 확정 슬롯은 양측의 /api/calendar/events 응답에 자동 합쳐 노출된다 (calendar.ts).

const router: IRouter = Router();
router.use(
  "/rfqs/:rfqId/site-visits",
  requireRole("manager", "platform_admin", "accountant", "hq_executive", "partner"),
);

async function resolvePartnerVendorId(userId: number): Promise<number | null> {
  const [u] = await db
    .select({ vendorId: usersTable.vendorId })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return u?.vendorId ?? null;
}

async function loadRfqOr404(rfqId: number) {
  const [rfq] = await db.select().from(rfqsTable).where(eq(rfqsTable.id, rfqId));
  return rfq ?? null;
}

async function ensureManagerScope(
  req: Request,
  rfq: { buildingId: number | null },
): Promise<boolean> {
  const role = req.user?.role;
  if (role === "platform_admin" || role === "hq_executive") return true;
  if (role === "manager" || role === "accountant") {
    if (rfq.buildingId == null) return false;
    return await canAccessBuilding(req, rfq.buildingId);
  }
  return false;
}

function serializeVisit(v: typeof rfqSiteVisitsTable.$inferSelect, vendorName?: string | null) {
  return {
    id: v.id,
    rfqId: v.rfqId,
    vendorId: v.vendorId,
    vendorName: vendorName ?? null,
    status: v.status as "proposed" | "confirmed" | "cancelled" | "completed",
    proposedSlots: v.proposedSlots,
    confirmedSlot: v.confirmedSlot?.toISOString() ?? null,
    confirmedAt: v.confirmedAt?.toISOString() ?? null,
    notes: v.notes,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}

router.get("/rfqs/:rfqId/site-visits", async (req, res): Promise<void> => {
  const rfqId = Number(req.params.rfqId);
  if (Number.isNaN(rfqId)) {
    res.status(400).json({ error: "invalid rfq id" });
    return;
  }
  const rfq = await loadRfqOr404(rfqId);
  if (!rfq) {
    res.status(404).json({ error: "RFQ not found" });
    return;
  }

  let conditions = [eq(rfqSiteVisitsTable.rfqId, rfqId)];
  if (req.user?.role === "partner") {
    const vId = await resolvePartnerVendorId(req.user.userId);
    if (!vId) {
      res.status(403).json({ error: "vendor 정보가 없습니다" });
      return;
    }
    conditions.push(eq(rfqSiteVisitsTable.vendorId, vId));
  } else {
    const ok = await ensureManagerScope(req, rfq);
    if (!ok) {
      res.status(403).json({ error: "RFQ 접근 권한이 없습니다" });
      return;
    }
  }

  const visits = await db
    .select()
    .from(rfqSiteVisitsTable)
    .where(and(...conditions))
    .orderBy(asc(rfqSiteVisitsTable.createdAt));

  // vendor name lookup
  const vendorIds = Array.from(new Set(visits.map((v) => v.vendorId)));
  const vendors = vendorIds.length > 0
    ? await db.select({ id: vendorsTable.id, name: vendorsTable.name }).from(vendorsTable)
    : [];
  const nameById = new Map(vendors.map((v) => [v.id, v.name]));

  res.json(visits.map((v) => serializeVisit(v, nameById.get(v.vendorId) ?? null)));
});

router.post("/rfqs/:rfqId/site-visits", async (req, res): Promise<void> => {
  const rfqId = Number(req.params.rfqId);
  const parsed = CreateRfqSiteVisitBody.safeParse(req.body);
  if (Number.isNaN(rfqId) || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "invalid rfq id" : parsed.error.message });
    return;
  }
  const rfq = await loadRfqOr404(rfqId);
  if (!rfq) {
    res.status(404).json({ error: "RFQ not found" });
    return;
  }

  let vendorId: number | null = null;
  if (req.user?.role === "partner") {
    vendorId = await resolvePartnerVendorId(req.user.userId);
  } else {
    const ok = await ensureManagerScope(req, rfq);
    if (!ok) {
      res.status(403).json({ error: "RFQ 접근 권한이 없습니다" });
      return;
    }
    vendorId = parsed.data.vendorId ?? null;
  }
  if (!vendorId) {
    res.status(400).json({ error: "vendorId 가 필요합니다" });
    return;
  }

  // proposedSlots validation: must be a JSON array of ISO datetime strings.
  let slots: string[] = [];
  try {
    const arr = JSON.parse(parsed.data.proposedSlots);
    if (!Array.isArray(arr) || arr.length === 0) throw new Error("empty");
    slots = arr.map((x) => String(x));
    for (const s of slots) {
      if (Number.isNaN(Date.parse(s))) throw new Error(`bad slot: ${s}`);
    }
  } catch {
    res.status(400).json({ error: "proposedSlots 가 ISO datetime 배열이어야 합니다" });
    return;
  }

  // 중복 제안 방지: 같은 RFQ × vendor 의 비종결 슬롯이 있으면 갱신.
  const [existing] = await db
    .select()
    .from(rfqSiteVisitsTable)
    .where(
      and(
        eq(rfqSiteVisitsTable.rfqId, rfqId),
        eq(rfqSiteVisitsTable.vendorId, vendorId),
      ),
    );

  let row;
  if (existing) {
    [row] = await db
      .update(rfqSiteVisitsTable)
      .set({
        status: "proposed",
        proposedSlots: JSON.stringify(slots),
        confirmedSlot: null,
        confirmedAt: null,
        notes: parsed.data.notes ?? existing.notes,
      })
      .where(eq(rfqSiteVisitsTable.id, existing.id))
      .returning();
  } else {
    [row] = await db
      .insert(rfqSiteVisitsTable)
      .values({
        rfqId,
        vendorId,
        status: "proposed",
        proposedSlots: JSON.stringify(slots),
        notes: parsed.data.notes ?? null,
      })
      .returning();
  }

  // 상대방 알림.
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  if (req.user?.role === "partner" && rfq.buildingId) {
    await insertNotification({
      recipientType: `manager:${rfq.buildingId}`,
      notificationType: "rfq_site_visit_proposed",
      title: "현장방문 일정 제안",
      message: `${vendor?.name ?? "파트너"}이(가) [${rfq.title}] 의 현장방문 후보 ${slots.length}건을 제안했습니다.`,
      relatedEntityType: "rfq",
      relatedEntityId: rfqId,
    });
  } else {
    await insertNotification({
      recipientType: `vendor:${vendorId}`,
      notificationType: "rfq_site_visit_proposed",
      title: "현장방문 일정 제안",
      message: `[${rfq.title}] 매니저가 현장방문 후보 ${slots.length}건을 제안했습니다.`,
      relatedEntityType: "rfq",
      relatedEntityId: rfqId,
    });
  }

  res.status(201).json(serializeVisit(row, vendor?.name ?? null));
});

router.patch("/rfqs/:rfqId/site-visits/:id", async (req, res): Promise<void> => {
  const rfqId = Number(req.params.rfqId);
  const id = Number(req.params.id);
  const parsed = UpdateRfqSiteVisitBody.safeParse(req.body);
  if (Number.isNaN(rfqId) || Number.isNaN(id) || !parsed.success) {
    res.status(400).json({ error: parsed.success ? "invalid id" : parsed.error.message });
    return;
  }
  const rfq = await loadRfqOr404(rfqId);
  if (!rfq) {
    res.status(404).json({ error: "RFQ not found" });
    return;
  }
  const [existing] = await db
    .select()
    .from(rfqSiteVisitsTable)
    .where(and(eq(rfqSiteVisitsTable.id, id), eq(rfqSiteVisitsTable.rfqId, rfqId)));
  if (!existing) {
    res.status(404).json({ error: "Site visit not found" });
    return;
  }

  let isPartner = false;
  if (req.user?.role === "partner") {
    const vId = await resolvePartnerVendorId(req.user.userId);
    if (vId !== existing.vendorId) {
      res.status(403).json({ error: "본인 일정만 수정할 수 있습니다" });
      return;
    }
    isPartner = true;
    // 파트너는 confirmedSlot 을 변경할 수 없다.
    if (parsed.data.confirmedSlot != null) {
      res.status(403).json({ error: "확정은 매니저만 할 수 있습니다" });
      return;
    }
  } else {
    const ok = await ensureManagerScope(req, rfq);
    if (!ok) {
      res.status(403).json({ error: "RFQ 접근 권한이 없습니다" });
      return;
    }
  }

  const update: Record<string, unknown> = {};
  if (parsed.data.status) update.status = parsed.data.status;
  if (parsed.data.proposedSlots != null) update.proposedSlots = parsed.data.proposedSlots;
  if (parsed.data.notes != null) update.notes = parsed.data.notes;

  // 매니저가 confirmedSlot 을 지정하면 status 를 confirmed 로 강제하고 confirmedAt 기록.
  if (!isPartner && parsed.data.confirmedSlot != null) {
    update.status = "confirmed";
    update.confirmedSlot = new Date(parsed.data.confirmedSlot);
    update.confirmedAt = new Date();
  }
  if (parsed.data.status === "cancelled") {
    update.confirmedSlot = null;
    update.confirmedAt = null;
  }

  const [row] = await db
    .update(rfqSiteVisitsTable)
    .set(update)
    .where(eq(rfqSiteVisitsTable.id, id))
    .returning();

  // 알림.
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, existing.vendorId));
  if (!isPartner) {
    if (parsed.data.confirmedSlot != null) {
      await insertNotification({
        recipientType: `vendor:${existing.vendorId}`,
        notificationType: "rfq_site_visit_confirmed",
        title: "현장방문 일정 확정",
        message: `[${rfq.title}] 의 현장방문 일정이 확정되었습니다.`,
        relatedEntityType: "rfq",
        relatedEntityId: rfqId,
      });
    } else if (parsed.data.status === "cancelled") {
      await insertNotification({
        recipientType: `vendor:${existing.vendorId}`,
        notificationType: "rfq_site_visit_cancelled",
        title: "현장방문 일정 취소",
        message: `[${rfq.title}] 의 현장방문 일정이 취소되었습니다.`,
        relatedEntityType: "rfq",
        relatedEntityId: rfqId,
      });
    }
  } else if (rfq.buildingId) {
    await insertNotification({
      recipientType: `manager:${rfq.buildingId}`,
      notificationType: "rfq_site_visit_updated",
      title: "현장방문 일정 변경",
      message: `${vendor?.name ?? "파트너"}이(가) [${rfq.title}] 의 현장방문 일정을 갱신했습니다.`,
      relatedEntityType: "rfq",
      relatedEntityId: rfqId,
    });
  }

  res.json(serializeVisit(row, vendor?.name ?? null));
});

export default router;
