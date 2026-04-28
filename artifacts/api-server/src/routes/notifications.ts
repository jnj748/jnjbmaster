import { Router, type IRouter } from "express";
import { and, eq, sql, desc } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import {
  MarkNotificationReadParams,
  MarkNotificationReadResponse,
} from "@workspace/api-zod";
import { loadVisibleAnnouncementsForUser } from "./platformAnnouncements";
import {
  loadRecipientContext,
  recipientWhere,
} from "../lib/notificationRecipient";

const router: IRouter = Router();

// [Task #532] 본인 앞으로 온 시스템 알림(=현재 로그인 사용자의 role/userId/
// vendorId 와 매치되는 recipient_type 행) 만 반환한다. 이전 구현은 전체 행을
// 반환해 본사 전용 알림이나 다른 사용자의 결재 알림이 모든 사용자 벨에
// 노출되는 버그가 있었다. 두 핸들러는 같은 recipientWhere() 헬퍼를 공유해
// 카운트와 목록 건수가 항상 일치하도록 보장한다.
router.get("/notifications", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "인증이 필요합니다" });
    return;
  }
  const ctx = await loadRecipientContext(req.user.userId, req.user.role);

  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(recipientWhere(ctx))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  const systemItems = notifications.map((n) => ({ ...n, kind: "system" as const }));

  const anns = await loadVisibleAnnouncementsForUser(
    req.user.userId,
    req.user.role,
  );
  const announcementItems: Array<Record<string, unknown>> = anns.map((a) => ({
    id: a.id,
    kind: "announcement" as const,
    recipientType: "all",
    notificationType: "platform_announcement",
    title: a.title,
    message: a.body,
    isRead: a.isRead,
    relatedEntityType: "platform_announcement",
    relatedEntityId: a.id,
    createdAt: a.startsAt,
  }));

  const merged = [...announcementItems, ...systemItems].sort((a, b) => {
    const ta = new Date(a.createdAt as string | Date).getTime();
    const tb = new Date(b.createdAt as string | Date).getTime();
    return tb - ta;
  });

  // 응답 형태는 Drizzle row + announcement 객체 union 으로 이미 타입 안전하다.
  // (구버전은 zod 스키마 .parse() 를 호출했으나 createdAt 이 Date 인 반면
  // 스키마는 string 을 기대해 항상 throw → 알림이 있으면 라우트가 500 을
  // 내던 잠재 버그였다. Task #532 가 본인 알림만 필터링하면서 자주 hit 하게
  // 되어 제거.)
  res.json(merged);
});

router.get("/notifications/unread-count", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "인증이 필요합니다" });
    return;
  }
  const ctx = await loadRecipientContext(req.user.userId, req.user.role);

  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.isRead, false), recipientWhere(ctx)));

  const anns = await loadVisibleAnnouncementsForUser(
    req.user.userId,
    req.user.role,
  );
  const announcementUnread = anns.filter((a) => !a.isRead).length;

  res.json({ count: (result?.count ?? 0) + announcementUnread });
});

router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "인증이 필요합니다" });
    return;
  }
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  // [Task #532] IDOR 방지: 본인 앞으로 온 알림(=수신부 필터에 매치되는 행)
  // 만 읽음 처리할 수 있다. 이전 구현은 ID 만으로 UPDATE 했기 때문에 다른
  // 사용자의 알림 ID 를 추측해 읽음 상태를 바꿀 수 있었다.
  const ctx = await loadRecipientContext(req.user.userId, req.user.role);
  const [notification] = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, params.data.id), recipientWhere(ctx)))
    .returning();

  if (!notification) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  // 스키마는 createdAt 을 ISO 문자열로 기대하지만 Drizzle 은 Date 를 반환하므로
  // 직렬화 가능한 형태로 변환한 뒤 parse 한다.
  res.json(
    MarkNotificationReadResponse.parse({
      ...notification,
      createdAt:
        notification.createdAt instanceof Date
          ? notification.createdAt.toISOString()
          : notification.createdAt,
    }),
  );
});

export default router;
