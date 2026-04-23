import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lte, isNull, or, sql, inArray } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  platformCampaignsTable,
  platformCampaignUserStatesTable,
  campaignTargetRoles,
  campaignTypes,
  campaignChannels,
  campaignAudienceFilters,
  campaignRecurrence,
  usersTable,
} from "@workspace/db";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

const targetRoleEnum = z.enum(campaignTargetRoles);
const typeEnum = z.enum(campaignTypes);
const channelEnum = z.enum(campaignChannels);
const audienceEnum = z.enum(campaignAudienceFilters);
const recurrenceEnum = z.enum(campaignRecurrence);

const CreateBody = z.object({
  targetRole: targetRoleEnum,
  type: typeEnum.default("other"),
  audienceFilter: audienceEnum.default("all"),
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  imageUrl: z.string().nullable().optional(),
  channels: z.array(channelEnum).min(1).default(["modal"]),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  recurrence: recurrenceEnum.default("none"),
  recurrenceDays: z.array(z.number().int()).nullable().optional(),
  maxImpressionsPerUser: z.number().int().min(1).max(100).default(3),
  ctaLabel: z.string().nullable().optional(),
  ctaUrl: z.string().nullable().optional(),
  achievementText: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

const UpdateBody = CreateBody.partial();

const adminGuard = requireRole("platform_admin");

// ── Admin: list campaigns (optionally filter by targetRole) ─────────
router.get("/platform/campaigns", adminGuard, async (req, res): Promise<void> => {
  const role = typeof req.query.role === "string" ? req.query.role : "";
  const filter = (campaignTargetRoles as readonly string[]).includes(role)
    ? eq(platformCampaignsTable.targetRole, role as typeof campaignTargetRoles[number])
    : undefined;
  const rows = filter
    ? await db.select().from(platformCampaignsTable).where(filter).orderBy(desc(platformCampaignsTable.createdAt))
    : await db.select().from(platformCampaignsTable).orderBy(desc(platformCampaignsTable.createdAt));

  // attach summary stats per campaign
  const ids = rows.map((r) => r.id);
  const stats: Record<number, { impressions: number; reads: number; ctaClicks: number }> = {};
  if (ids.length > 0) {
    const states = await db
      .select()
      .from(platformCampaignUserStatesTable)
      .where(inArray(platformCampaignUserStatesTable.campaignId, ids));
    for (const id of ids) stats[id] = { impressions: 0, reads: 0, ctaClicks: 0 };
    for (const s of states) {
      const k = stats[s.campaignId];
      if (!k) continue;
      k.impressions += s.impressionCount;
      if (s.readAt) k.reads += 1;
      if (s.ctaClickedAt) k.ctaClicks += 1;
    }
  }
  res.json(rows.map((r) => ({ ...r, stats: stats[r.id] ?? { impressions: 0, reads: 0, ctaClicks: 0 } })));
});

router.post("/platform/campaigns", adminGuard, async (req, res): Promise<void> => {
  const parsed = CreateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const d = parsed.data;
  const [author] = await db
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.userId));
  const [created] = await db
    .insert(platformCampaignsTable)
    .values({
      targetRole: d.targetRole,
      type: d.type,
      audienceFilter: d.audienceFilter,
      title: d.title,
      body: d.body,
      imageUrl: d.imageUrl ?? null,
      channels: d.channels,
      startsAt: d.startsAt ? new Date(d.startsAt) : new Date(),
      endsAt: d.endsAt ? new Date(d.endsAt) : null,
      recurrence: d.recurrence,
      recurrenceDays: d.recurrenceDays ?? null,
      maxImpressionsPerUser: d.maxImpressionsPerUser,
      ctaLabel: d.ctaLabel ?? null,
      ctaUrl: d.ctaUrl ?? null,
      achievementText: d.achievementText ?? null,
      isActive: d.isActive ?? true,
      createdBy: req.user!.userId,
      createdByName: author?.name ?? null,
    })
    .returning();
  res.status(201).json(created);
});

router.patch("/platform/campaigns/:id", adminGuard, async (req, res): Promise<void> => {
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
  if (d.targetRole !== undefined) patch.targetRole = d.targetRole;
  if (d.type !== undefined) patch.type = d.type;
  if (d.audienceFilter !== undefined) patch.audienceFilter = d.audienceFilter;
  if (d.title !== undefined) patch.title = d.title;
  if (d.body !== undefined) patch.body = d.body;
  if (d.imageUrl !== undefined) patch.imageUrl = d.imageUrl;
  if (d.channels !== undefined) patch.channels = d.channels;
  if (d.startsAt !== undefined) patch.startsAt = new Date(d.startsAt);
  if (d.endsAt !== undefined) patch.endsAt = d.endsAt ? new Date(d.endsAt) : null;
  if (d.recurrence !== undefined) patch.recurrence = d.recurrence;
  if (d.recurrenceDays !== undefined) patch.recurrenceDays = d.recurrenceDays;
  if (d.maxImpressionsPerUser !== undefined) patch.maxImpressionsPerUser = d.maxImpressionsPerUser;
  if (d.ctaLabel !== undefined) patch.ctaLabel = d.ctaLabel;
  if (d.ctaUrl !== undefined) patch.ctaUrl = d.ctaUrl;
  if (d.achievementText !== undefined) patch.achievementText = d.achievementText;
  if (d.isActive !== undefined) patch.isActive = d.isActive;
  const [updated] = await db
    .update(platformCampaignsTable)
    .set(patch)
    .where(eq(platformCampaignsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "캠페인을 찾을 수 없습니다" });
    return;
  }
  res.json(updated);
});

// Stop a campaign without deleting it.
router.post("/platform/campaigns/:id/stop", adminGuard, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "유효한 ID가 필요합니다" });
    return;
  }
  const [updated] = await db
    .update(platformCampaignsTable)
    .set({ isStopped: true, isActive: false, updatedAt: new Date() })
    .where(eq(platformCampaignsTable.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "캠페인을 찾을 수 없습니다" });
    return;
  }
  res.json(updated);
});

router.delete("/platform/campaigns/:id", adminGuard, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "유효한 ID가 필요합니다" });
    return;
  }
  const result = await db
    .delete(platformCampaignsTable)
    .where(eq(platformCampaignsTable.id, id))
    .returning({ id: platformCampaignsTable.id });
  if (result.length === 0) {
    res.status(404).json({ error: "캠페인을 찾을 수 없습니다" });
    return;
  }
  res.json({ ok: true });
});

// ── User-side: load active campaigns ────────────────────────────────
function startOfTodayUtc(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function loadActiveCampaignsForUser(userId: number, role: string) {
  const now = new Date();
  // [Task #283] audienceFilter 적용: 'active' 캠페인은 approvalStatus='active' 사용자에게만 노출.
  const [user] = await db
    .select({ approvalStatus: usersTable.approvalStatus })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  const userIsActive = user?.approvalStatus === "active";

  const audienceClause = userIsActive
    ? undefined
    : eq(platformCampaignsTable.audienceFilter, "all");

  const rows = await db
    .select()
    .from(platformCampaignsTable)
    .where(
      and(
        eq(platformCampaignsTable.isActive, true),
        eq(platformCampaignsTable.isStopped, false),
        eq(platformCampaignsTable.targetRole, role as typeof campaignTargetRoles[number]),
        lte(platformCampaignsTable.startsAt, now),
        or(
          isNull(platformCampaignsTable.endsAt),
          gte(platformCampaignsTable.endsAt, now),
        ),
        ...(audienceClause ? [audienceClause] : []),
      ),
    )
    .orderBy(desc(platformCampaignsTable.startsAt));

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const states = await db
    .select()
    .from(platformCampaignUserStatesTable)
    .where(
      and(
        eq(platformCampaignUserStatesTable.userId, userId),
        inArray(platformCampaignUserStatesTable.campaignId, ids),
      ),
    );
  const stateById = new Map(states.map((s) => [s.campaignId, s]));

  // [Task #283] 노출 제한 정책:
  //   - dontShowAgain / dismissedUntil: required 캠페인은 사용자가 닫을 수 없으므로
  //     해당 상태가 있어도 무시한다 (UI/서버 dismiss 모두 차단됨).
  //   - maxImpressionsPerUser: required 포함 모든 타입에 동일 적용해
  //     "최대 N회 노출 후 자동 종료" 라는 스케줄 의미를 지킨다.
  //   - bell 카테고리는 노출 캡 도달 후에도 이력으로 남아야 하므로 row 는 보존하고
  //     modalEligible=false 로 표시해 모달/배너 채널에서만 제외한다.
  const dow = now.getUTCDay();
  const dom = now.getUTCDate();
  return rows
    .map((r) => {
      const s = stateById.get(r.id);
      const isRequired = r.type === "required";
      if (s?.dontShowAgain && !isRequired) return null;
      if (s?.dismissedUntil && new Date(s.dismissedUntil) > now && !isRequired) return null;
      // Recurrence schedule is a hard eligibility gate — applies to all channels
      // (modal/banner/bell). Off-schedule campaigns are excluded entirely.
      // Must run BEFORE impression-cap handling so off-schedule items don't leak
      // into the bell channel via the modalEligible=false branch.
      if (r.recurrence === "weekly" && Array.isArray(r.recurrenceDays) && r.recurrenceDays.length > 0) {
        if (!r.recurrenceDays.includes(dow)) return null;
      }
      if (r.recurrence === "monthly" && Array.isArray(r.recurrenceDays) && r.recurrenceDays.length > 0) {
        if (!r.recurrenceDays.includes(dom)) return null;
      }
      if (
        s &&
        r.maxImpressionsPerUser > 0 &&
        s.impressionCount >= r.maxImpressionsPerUser
      ) {
        return { row: r, state: s, modalEligible: false };
      }
      return { row: r, state: s, modalEligible: true };
    })
    .filter((x): x is { row: typeof rows[number]; state: typeof states[number] | undefined; modalEligible: boolean } => x !== null)
    .map(({ row, state, modalEligible }) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      imageUrl: row.imageUrl,
      channels: row.channels,
      ctaLabel: row.ctaLabel,
      ctaUrl: row.ctaUrl,
      achievementText: row.achievementText,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      maxImpressionsPerUser: row.maxImpressionsPerUser,
      impressionCount: state?.impressionCount ?? 0,
      isRead: !!state?.readAt,
      modalEligible,
    }));
}

router.get("/campaigns/active", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "인증이 필요합니다" });
    return;
  }
  const list = await loadActiveCampaignsForUser(req.user.userId, req.user.role);
  res.json(list);
});

// [Task #283] 사용자측 캠페인 상태 변경 전 가시성 검사:
//   캠페인이 존재하고 호출자의 역할에 매칭되어야 한다. 그래야 임의 ID 로 다른 역할
//   캠페인의 통계/상태를 조작하지 못한다.
async function assertCampaignVisible(campaignId: number, role: string): Promise<boolean> {
  const [c] = await db
    .select({ id: platformCampaignsTable.id, targetRole: platformCampaignsTable.targetRole })
    .from(platformCampaignsTable)
    .where(eq(platformCampaignsTable.id, campaignId));
  if (!c) return false;
  return c.targetRole === role;
}

async function upsertState(campaignId: number, userId: number, patch: Record<string, unknown>) {
  // Pure UPSERT using ON CONFLICT
  await db
    .insert(platformCampaignUserStatesTable)
    .values({ campaignId, userId, ...patch })
    .onConflictDoUpdate({
      target: [platformCampaignUserStatesTable.campaignId, platformCampaignUserStatesTable.userId],
      set: { ...patch, updatedAt: new Date() },
    });
}

router.post("/campaigns/:id/impression", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "인증이 필요합니다" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "유효한 ID가 필요합니다" });
    return;
  }
  if (!(await assertCampaignVisible(id, req.user.role))) {
    res.status(404).json({ error: "캠페인을 찾을 수 없습니다" });
    return;
  }
  // Increment via raw upsert with COALESCE
  await db.execute(sql`
    INSERT INTO platform_campaign_user_states (campaign_id, user_id, impression_count, last_impression_at)
    VALUES (${id}, ${req.user.userId}, 1, now())
    ON CONFLICT (campaign_id, user_id) DO UPDATE
      SET impression_count = platform_campaign_user_states.impression_count + 1,
          last_impression_at = now(),
          updated_at = now()
  `);
  res.json({ ok: true });
});

router.post("/campaigns/:id/read", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "인증이 필요합니다" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "유효한 ID가 필요합니다" });
    return;
  }
  if (!(await assertCampaignVisible(id, req.user.role))) {
    res.status(404).json({ error: "캠페인을 찾을 수 없습니다" });
    return;
  }
  await upsertState(id, req.user.userId, { readAt: new Date() });
  res.json({ ok: true });
});

router.post("/campaigns/:id/cta-click", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "인증이 필요합니다" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "유효한 ID가 필요합니다" });
    return;
  }
  if (!(await assertCampaignVisible(id, req.user.role))) {
    res.status(404).json({ error: "캠페인을 찾을 수 없습니다" });
    return;
  }
  await upsertState(id, req.user.userId, { ctaClickedAt: new Date() });
  res.json({ ok: true });
});

router.post("/campaigns/:id/dismiss", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "인증이 필요합니다" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: "유효한 ID가 필요합니다" });
    return;
  }
  if (!(await assertCampaignVisible(id, req.user.role))) {
    res.status(404).json({ error: "캠페인을 찾을 수 없습니다" });
    return;
  }
  // [Task #283] 필수(required) 캠페인은 어떤 모드로도 사용자가 일방적으로 닫을 수 없다.
  //   서버에서도 강제로 차단해 클라이언트 우회를 방지한다.
  const [campaignRow] = await db
    .select({ type: platformCampaignsTable.type })
    .from(platformCampaignsTable)
    .where(eq(platformCampaignsTable.id, id));
  if (campaignRow?.type === "required") {
    res.status(400).json({ error: "필수 캠페인은 닫을 수 없습니다" });
    return;
  }
  const mode = typeof req.body?.mode === "string" ? req.body.mode : "today";
  if (mode === "forever") {
    await upsertState(id, req.user.userId, { dontShowAgain: true });
  } else if (mode === "today") {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    await upsertState(id, req.user.userId, { dismissedUntil: tomorrow });
  } else {
    res.status(400).json({ error: "지원하지 않는 모드입니다" });
    return;
  }
  res.json({ ok: true });
});

export { loadActiveCampaignsForUser };
export default router;
