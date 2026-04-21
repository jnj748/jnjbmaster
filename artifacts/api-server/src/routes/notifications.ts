import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, notificationsTable } from "@workspace/db";
import {
  ListNotificationsResponse,
  MarkNotificationReadParams,
  MarkNotificationReadResponse,
} from "@workspace/api-zod";
import { loadVisibleAnnouncementsForUser } from "./platformAnnouncements";

const router: IRouter = Router();

router.get("/notifications", async (req, res): Promise<void> => {
  const notifications = await db
    .select()
    .from(notificationsTable)
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  const systemItems = notifications.map((n) => ({ ...n, kind: "system" as const }));

  let announcementItems: Array<Record<string, unknown>> = [];
  if (req.user) {
    const anns = await loadVisibleAnnouncementsForUser(req.user.userId, req.user.role);
    announcementItems = anns.map((a) => ({
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
  }

  const merged = [...announcementItems, ...systemItems].sort((a, b) => {
    const ta = new Date(a.createdAt as string | Date).getTime();
    const tb = new Date(b.createdAt as string | Date).getTime();
    return tb - ta;
  });

  // Validate the system-shaped portion against the existing zod schema, but
  // pass through the merged array so the `kind` discriminator is preserved.
  ListNotificationsResponse.parse(systemItems);
  res.json(merged);
});

router.get("/notifications/unread-count", async (req, res): Promise<void> => {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notificationsTable)
    .where(eq(notificationsTable.isRead, false));

  let announcementUnread = 0;
  if (req.user) {
    const anns = await loadVisibleAnnouncementsForUser(req.user.userId, req.user.role);
    announcementUnread = anns.filter((a) => !a.isRead).length;
  }

  res.json({ count: (result?.count ?? 0) + announcementUnread });
});

router.patch("/notifications/:id/read", async (req, res): Promise<void> => {
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [notification] = await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(eq(notificationsTable.id, params.data.id))
    .returning();

  if (!notification) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  res.json(MarkNotificationReadResponse.parse(notification));
});

export default router;
