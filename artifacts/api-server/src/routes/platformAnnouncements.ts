import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte, isNull, or, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  platformAnnouncementsTable,
  platformAnnouncementReadsTable,
  announcementAudienceRoles,
  usersTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

const audienceEnum = z.enum(announcementAudienceRoles);

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  audience: z.array(audienceEnum).min(1).default(["all"]),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  isActive: z.boolean().optional(),
});

const UpdateBody = CreateBody.partial();

// HQ admin: list all announcements (any status, any window).
router.get(
  "/platform/announcements",
  requireRole("platform_admin", "hq_executive"),
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(platformAnnouncementsTable)
      .orderBy(desc(platformAnnouncementsTable.createdAt));
    res.json(rows);
  },
);

router.post(
  "/platform/announcements",
  requireRole("platform_admin", "hq_executive"),
  async (req, res): Promise<void> => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const { title, body, audience, startsAt, endsAt, isActive } = parsed.data;
    const [author] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, req.user!.userId));
    const [created] = await db
      .insert(platformAnnouncementsTable)
      .values({
        title,
        body,
        audience,
        startsAt: startsAt ? new Date(startsAt) : new Date(),
        endsAt: endsAt ? new Date(endsAt) : null,
        isActive: isActive ?? true,
        createdBy: req.user!.userId,
        createdByName: author?.name ?? null,
      })
      .returning();
    res.status(201).json(created);
  },
);

router.patch(
  "/platform/announcements/:id",
  requireRole("platform_admin", "hq_executive"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "유효한 ID가 필요합니다" });
      return;
    }
    const parsed = UpdateBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const d = parsed.data;
    if (d.title !== undefined) patch.title = d.title;
    if (d.body !== undefined) patch.body = d.body;
    if (d.audience !== undefined) patch.audience = d.audience;
    if (d.startsAt !== undefined) patch.startsAt = new Date(d.startsAt);
    if (d.endsAt !== undefined) patch.endsAt = d.endsAt ? new Date(d.endsAt) : null;
    if (d.isActive !== undefined) patch.isActive = d.isActive;

    const [updated] = await db
      .update(platformAnnouncementsTable)
      .set(patch)
      .where(eq(platformAnnouncementsTable.id, id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "공지를 찾을 수 없습니다" });
      return;
    }
    res.json(updated);
  },
);

router.delete(
  "/platform/announcements/:id",
  requireRole("platform_admin", "hq_executive"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "유효한 ID가 필요합니다" });
      return;
    }
    await db
      .delete(platformAnnouncementReadsTable)
      .where(eq(platformAnnouncementReadsTable.announcementId, id));
    const result = await db
      .delete(platformAnnouncementsTable)
      .where(eq(platformAnnouncementsTable.id, id))
      .returning({ id: platformAnnouncementsTable.id });
    if (result.length === 0) {
      res.status(404).json({ error: "공지를 찾을 수 없습니다" });
      return;
    }
    res.json({ ok: true });
  },
);

// Returns announcements visible to the current user (audience matches role,
// active, within publish window). Includes per-user read state.
async function loadVisibleAnnouncementsForUser(userId: number, role: string) {
  const now = new Date();
  const rows = await db
    .select()
    .from(platformAnnouncementsTable)
    .where(
      and(
        eq(platformAnnouncementsTable.isActive, true),
        lte(platformAnnouncementsTable.startsAt, now),
        or(
          isNull(platformAnnouncementsTable.endsAt),
          gte(platformAnnouncementsTable.endsAt, now),
        ),
        // audience array contains user's role or "all"
        sql`(${platformAnnouncementsTable.audience} @> ${JSON.stringify(["all"])}::jsonb OR ${platformAnnouncementsTable.audience} @> ${JSON.stringify([role])}::jsonb)`,
      ),
    )
    .orderBy(desc(platformAnnouncementsTable.startsAt));

  if (rows.length === 0) return [] as Array<typeof rows[number] & { isRead: boolean }>;

  const reads = await db
    .select()
    .from(platformAnnouncementReadsTable)
    .where(eq(platformAnnouncementReadsTable.userId, userId));
  const readIds = new Set(reads.map((r) => r.announcementId));

  return rows.map((r) => ({ ...r, isRead: readIds.has(r.id) }));
}

router.get(
  "/notifications/announcements",
  async (req, res): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "인증이 필요합니다" });
      return;
    }
    const list = await loadVisibleAnnouncementsForUser(req.user.userId, req.user.role);
    res.json(list);
  },
);

router.post(
  "/notifications/announcements/:id/read",
  async (req, res): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: "인증이 필요합니다" });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "유효한 ID가 필요합니다" });
      return;
    }
    // Verify the announcement exists and is currently visible to this user
    // before recording a read — prevents pre-marking unknown IDs.
    const visible = await loadVisibleAnnouncementsForUser(
      req.user.userId,
      req.user.role,
    );
    if (!visible.some((a) => a.id === id)) {
      res.status(404).json({ error: "공지를 찾을 수 없습니다" });
      return;
    }
    await db
      .insert(platformAnnouncementReadsTable)
      .values({ announcementId: id, userId: req.user.userId })
      .onConflictDoNothing();
    res.json({ ok: true });
  },
);

export { loadVisibleAnnouncementsForUser };
export default router;
