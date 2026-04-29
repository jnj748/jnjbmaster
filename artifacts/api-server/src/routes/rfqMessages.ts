import { Router, type IRouter, type Request } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  db,
  rfqsTable,
  rfqMessagesTable,
  rfqMessageThreadsTable,
  usersTable,
  vendorsTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import { insertNotification } from "../lib/notificationRecipient";
import { canAccessBuilding } from "../middlewares/buildingScope";
import { PostRfqMessageBody } from "@workspace/api-zod";

const router: IRouter = Router();
router.use(
  "/rfqs/:rfqId/messages",
  requireRole("manager", "platform_admin", "accountant", "hq_executive", "partner"),
);

// [Task #612] RFQ × vendor 단위 1:1 메시지 스레드.
//   - 매니저(또는 본사 관리자)는 vendorId 를 명시해 특정 파트너와의 스레드를 본다.
//   - 파트너는 본인 vendorId 만 접근 가능하므로 query/body 의 vendorId 를 본인 값으로 강제.
//   - platform_admin / hq_executive 는 읽기 전용. 메시지 전송은 차단된다.
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

async function getOrCreateThread(rfqId: number, vendorId: number) {
  const [existing] = await db
    .select()
    .from(rfqMessageThreadsTable)
    .where(and(eq(rfqMessageThreadsTable.rfqId, rfqId), eq(rfqMessageThreadsTable.vendorId, vendorId)));
  if (existing) return existing;
  const [created] = await db
    .insert(rfqMessageThreadsTable)
    .values({ rfqId, vendorId })
    .returning();
  return created;
}

router.get("/rfqs/:rfqId/messages", async (req, res): Promise<void> => {
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

  let vendorId: number | null = null;
  if (req.user?.role === "partner") {
    vendorId = await resolvePartnerVendorId(req.user.userId);
    if (!vendorId) {
      res.status(403).json({ error: "vendor 정보가 없습니다" });
      return;
    }
  } else {
    const q = req.query.vendorId;
    vendorId = typeof q === "string" ? Number(q) : null;
    if (!vendorId || Number.isNaN(vendorId)) {
      res.status(400).json({ error: "vendorId 가 필요합니다" });
      return;
    }
    const ok = await ensureManagerScope(req, rfq);
    if (!ok) {
      res.status(403).json({ error: "RFQ 접근 권한이 없습니다" });
      return;
    }
  }

  const thread = await getOrCreateThread(rfqId, vendorId);
  const messages = await db
    .select()
    .from(rfqMessagesTable)
    .where(and(eq(rfqMessagesTable.rfqId, rfqId), eq(rfqMessagesTable.vendorId, vendorId)))
    .orderBy(asc(rfqMessagesTable.createdAt));

  // 발신자 이름은 별도 조회로 채운다 (스레드 길이는 보통 짧음).
  const senderIds = Array.from(new Set(messages.map((m) => m.senderUserId)));
  const senders = senderIds.length > 0
    ? await db
        .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
        .from(usersTable)
        .where(sql`${usersTable.id} = ANY(${senderIds})`)
    : [];
  const senderNameById = new Map(senders.map((s) => [s.id, s.name ?? s.email ?? null]));

  res.json({
    vendorId,
    readByManagerAt: thread.readByManagerAt?.toISOString() ?? null,
    readByPartnerAt: thread.readByPartnerAt?.toISOString() ?? null,
    messages: messages.map((m) => ({
      id: m.id,
      rfqId: m.rfqId,
      vendorId: m.vendorId,
      senderUserId: m.senderUserId,
      senderName: senderNameById.get(m.senderUserId) ?? null,
      senderRole: m.senderRole,
      body: m.body,
      attachments: m.attachments,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

router.post("/rfqs/:rfqId/messages", async (req, res): Promise<void> => {
  const rfqId = Number(req.params.rfqId);
  const parsed = PostRfqMessageBody.safeParse(req.body);
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
  let senderRole: "manager" | "partner";
  if (req.user?.role === "partner") {
    vendorId = await resolvePartnerVendorId(req.user.userId);
    if (!vendorId) {
      res.status(403).json({ error: "vendor 정보가 없습니다" });
      return;
    }
    senderRole = "partner";
  } else if (req.user?.role === "manager" || req.user?.role === "accountant" || req.user?.role === "platform_admin") {
    vendorId = parsed.data.vendorId ?? null;
    if (!vendorId) {
      res.status(400).json({ error: "vendorId 가 필요합니다" });
      return;
    }
    const ok = await ensureManagerScope(req, rfq);
    if (!ok) {
      res.status(403).json({ error: "RFQ 접근 권한이 없습니다" });
      return;
    }
    senderRole = "manager";
  } else {
    // hq_executive 등은 읽기 전용
    res.status(403).json({ error: "메시지 전송 권한이 없습니다" });
    return;
  }

  const body = (parsed.data.body ?? "").trim();
  const attachments = parsed.data.attachments ?? null;
  if (body.length === 0 && !attachments) {
    res.status(400).json({ error: "메시지 본문 또는 첨부가 필요합니다" });
    return;
  }

  const thread = await getOrCreateThread(rfqId, vendorId);

  const [created] = await db
    .insert(rfqMessagesTable)
    .values({
      rfqId,
      vendorId,
      senderUserId: req.user!.userId,
      senderRole,
      body,
      attachments,
    })
    .returning();

  // 발신자 본인의 read marker 업데이트.
  await db
    .update(rfqMessageThreadsTable)
    .set(
      senderRole === "partner"
        ? { readByPartnerAt: new Date() }
        : { readByManagerAt: new Date() },
    )
    .where(eq(rfqMessageThreadsTable.id, thread.id));

  // 상대방에게 알림.
  const [vendor] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, vendorId));
  if (senderRole === "partner") {
    if (rfq.buildingId) {
      await insertNotification({
        recipientType: `manager:${rfq.buildingId}`,
        notificationType: "rfq_message",
        title: "비교견적 메시지",
        message: `${vendor?.name ?? "파트너"}: ${body.slice(0, 60)}`,
        relatedEntityType: "rfq",
        relatedEntityId: rfqId,
      });
    }
  } else {
    await insertNotification({
      recipientType: `vendor:${vendorId}`,
      notificationType: "rfq_message",
      title: "비교견적 메시지",
      message: `[${rfq.title}] 매니저: ${body.slice(0, 60)}`,
      relatedEntityType: "rfq",
      relatedEntityId: rfqId,
    });
  }

  const [sender] = await db
    .select({ name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.userId));

  res.status(201).json({
    id: created.id,
    rfqId: created.rfqId,
    vendorId: created.vendorId,
    senderUserId: created.senderUserId,
    senderName: sender?.name ?? sender?.email ?? null,
    senderRole: created.senderRole,
    body: created.body,
    attachments: created.attachments,
    createdAt: created.createdAt.toISOString(),
  });
});

router.post("/rfqs/:rfqId/messages/read", async (req, res): Promise<void> => {
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
  let vendorId: number | null = null;
  let role: "manager" | "partner";
  if (req.user?.role === "partner") {
    vendorId = await resolvePartnerVendorId(req.user.userId);
    role = "partner";
  } else {
    vendorId = Number(req.body?.vendorId);
    if (!vendorId || Number.isNaN(vendorId)) {
      res.status(400).json({ error: "vendorId 가 필요합니다" });
      return;
    }
    const ok = await ensureManagerScope(req, rfq);
    if (!ok) {
      res.status(403).json({ error: "RFQ 접근 권한이 없습니다" });
      return;
    }
    role = "manager";
  }
  if (!vendorId) {
    res.status(403).json({ error: "vendor 정보가 없습니다" });
    return;
  }
  const thread = await getOrCreateThread(rfqId, vendorId);
  await db
    .update(rfqMessageThreadsTable)
    .set(
      role === "partner"
        ? { readByPartnerAt: new Date() }
        : { readByManagerAt: new Date() },
    )
    .where(eq(rfqMessageThreadsTable.id, thread.id));
  res.sendStatus(204);
});

export default router;
