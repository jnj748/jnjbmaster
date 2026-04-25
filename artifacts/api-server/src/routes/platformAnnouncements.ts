import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte, isNull, or, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  platformAnnouncementsTable,
  platformAnnouncementReadsTable,
  announcementAudienceRoles,
  announcementRecurrence,
  usersTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

const audienceEnum = z.enum(announcementAudienceRoles);
const recurrenceEnum = z.enum(announcementRecurrence);

const CreateBody = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  audience: z.array(audienceEnum).min(1).default(["all"]),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  // [Task #365] 캠페인과 동일한 반복주기 설정. weekly: 0(일)~6(토), monthly: 1~31.
  recurrence: recurrenceEnum.default("none"),
  recurrenceDays: z.array(z.number().int()).nullable().optional(),
  isActive: z.boolean().optional(),
})
  .superRefine((d, ctx) => {
    // weekly/monthly 일 때는 recurrenceDays 가 비어 있으면 안 되고(빈 배열은
    // "항상 노출" 로 오해될 수 있음), 모든 값이 정해진 범위(weekly 0~6, monthly
    // 1~31) 안에 있어야 한다. 잘못된 값은 묵묵히 정규화하지 않고 400 으로 거절한다.
    if (d.recurrence !== "weekly" && d.recurrence !== "monthly") return;
    const days = d.recurrenceDays;
    if (!Array.isArray(days) || days.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recurrenceDays"],
        message: "weekly/monthly 반복은 recurrenceDays 를 비울 수 없습니다",
      });
      return;
    }
    const range = d.recurrence === "weekly" ? { min: 0, max: 6 } : { min: 1, max: 31 };
    const invalid = days.find(
      (v) => !Number.isInteger(v) || v < range.min || v > range.max,
    );
    if (invalid !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recurrenceDays"],
        message:
          d.recurrence === "weekly"
            ? "weekly 의 recurrenceDays 는 0~6 사이의 정수여야 합니다"
            : "monthly 의 recurrenceDays 는 1~31 사이의 정수여야 합니다",
      });
    }
  });

// 부분 업데이트는 위 refine 을 그대로 적용할 수 없어 별도 zod 객체를 만들고,
// 정규화는 핸들러에서 effectiveRecurrence 와 함께 검사한다.
const UpdateBody = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).optional(),
  audience: z.array(audienceEnum).min(1).optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  recurrence: recurrenceEnum.optional(),
  recurrenceDays: z.array(z.number().int()).nullable().optional(),
  isActive: z.boolean().optional(),
});

// [Task #365] weekly/monthly 가 아닐 때는 recurrenceDays 를 null 로 정규화한다.
function normalizeRecurrenceDays(
  recurrence: (typeof announcementRecurrence)[number] | undefined,
  days: number[] | null | undefined,
): number[] | null {
  if (recurrence !== "weekly" && recurrence !== "monthly") return null;
  if (!Array.isArray(days)) return null;
  const range = recurrence === "weekly" ? { min: 0, max: 6 } : { min: 1, max: 31 };
  const cleaned = Array.from(
    new Set(
      days.filter(
        (d) => Number.isInteger(d) && d >= range.min && d <= range.max,
      ),
    ),
  ).sort((a, b) => a - b);
  return cleaned.length > 0 ? cleaned : null;
}

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
    const { title, body, audience, startsAt, endsAt, recurrence, recurrenceDays, isActive } =
      parsed.data;
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
        recurrence,
        recurrenceDays: normalizeRecurrenceDays(recurrence, recurrenceDays),
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
    // [Task #365] recurrence 가 함께 들어왔으면 그것을 기준으로, 단독으로 들어왔으면
    // 기존 행의 recurrence 와 비교해 정규화한다.
    if (d.recurrence !== undefined || d.recurrenceDays !== undefined) {
      let effectiveRecurrence = d.recurrence;
      let existingDays: unknown = undefined;
      if (effectiveRecurrence === undefined || d.recurrenceDays === undefined) {
        const [existing] = await db
          .select({
            recurrence: platformAnnouncementsTable.recurrence,
            recurrenceDays: platformAnnouncementsTable.recurrenceDays,
          })
          .from(platformAnnouncementsTable)
          .where(eq(platformAnnouncementsTable.id, id));
        if (effectiveRecurrence === undefined) {
          effectiveRecurrence = existing?.recurrence as
            | (typeof announcementRecurrence)[number]
            | undefined;
        }
        existingDays = existing?.recurrenceDays;
      }
      // weekly/monthly 로 바뀌거나 유지되는데 recurrenceDays 가 명시적으로
      // 빈배열/null 이면 거절한다(create 와 동일한 규칙). 또한 명시적으로 들어온
      // 값은 범위(weekly 0~6, monthly 1~31) 도 확인해서 잘못된 값은 묵묵히
      // 정규화하지 않고 400 으로 거절한다. 미지정이면 기존 값을 유지하며,
      // 그 경우에도 결국 비어 있다면 동일하게 거절한다.
      if (effectiveRecurrence === "weekly" || effectiveRecurrence === "monthly") {
        const candidate =
          d.recurrenceDays !== undefined ? d.recurrenceDays : (existingDays as number[] | null | undefined);
        if (!Array.isArray(candidate) || candidate.length === 0) {
          res.status(400).json({ error: "weekly/monthly 반복은 recurrenceDays 를 비울 수 없습니다" });
          return;
        }
        if (d.recurrenceDays !== undefined) {
          const range =
            effectiveRecurrence === "weekly" ? { min: 0, max: 6 } : { min: 1, max: 31 };
          const invalid = d.recurrenceDays.find(
            (v) => !Number.isInteger(v) || v < range.min || v > range.max,
          );
          if (invalid !== undefined) {
            res.status(400).json({
              error:
                effectiveRecurrence === "weekly"
                  ? "weekly 의 recurrenceDays 는 0~6 사이의 정수여야 합니다"
                  : "monthly 의 recurrenceDays 는 1~31 사이의 정수여야 합니다",
            });
            return;
          }
        }
      }
      if (d.recurrence !== undefined) patch.recurrence = d.recurrence;
      if (d.recurrenceDays !== undefined) {
        patch.recurrenceDays = normalizeRecurrenceDays(effectiveRecurrence, d.recurrenceDays);
      } else if (d.recurrence !== undefined) {
        // recurrence 만 바꾸는 경우(예: weekly→none) 기존 days 도 함께 정규화한다.
        patch.recurrenceDays = normalizeRecurrenceDays(
          effectiveRecurrence,
          existingDays as number[] | null | undefined,
        );
      }
    }

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

  // [Task #365] 게시 윈도우(starts_at ~ ends_at) 안이라도 weekly/monthly 반복주기가
  // 설정되어 있으면 오늘 요일/일자가 일치할 때만 노출한다. (캠페인과 동일한 패턴.)
  // weekly/monthly 인데 recurrenceDays 가 비어/누락 되어 있으면 의도한 노출일이
  // 정의되지 않았다는 뜻이므로 fail-closed 로 제외한다(잘못된 데이터가 "항상 노출"로
  // 동작하는 것을 방지).
  const dow = now.getUTCDay();
  const dom = now.getUTCDate();
  const eligible = rows.filter((r) => {
    if (r.recurrence === "weekly") {
      if (!Array.isArray(r.recurrenceDays) || r.recurrenceDays.length === 0) return false;
      return r.recurrenceDays.includes(dow);
    }
    if (r.recurrence === "monthly") {
      if (!Array.isArray(r.recurrenceDays) || r.recurrenceDays.length === 0) return false;
      return r.recurrenceDays.includes(dom);
    }
    // none/daily 는 게시 윈도우 안에서 추가 필터 없이 통과.
    return true;
  });

  if (eligible.length === 0) return [] as Array<typeof rows[number] & { isRead: boolean }>;

  const reads = await db
    .select()
    .from(platformAnnouncementReadsTable)
    .where(eq(platformAnnouncementReadsTable.userId, userId));
  const readIds = new Set(reads.map((r) => r.announcementId));

  return eligible.map((r) => ({ ...r, isRead: readIds.has(r.id) }));
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
