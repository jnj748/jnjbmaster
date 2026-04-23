import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { and, gte, lt, sql, eq } from "drizzle-orm";
import { db, usageEventsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";

// [Task #296] 유저유형별 이용현황 분석 — 이벤트 수집 + 집계 엔드포인트.
//   - POST /usage-events  : 인증 사용자(플랫폼관리자 제외 기본)의 페이지 진입을 적재.
//                            role 은 서버측 req.user.role 를 신뢰(위·변조 방지).
//   - GET  /platform/usage-analytics : 플랫폼관리자 전용 집계.

const router: IRouter = Router();

const TARGET_ROLES = [
  "manager",
  "accountant",
  "facility_staff",
  "hq_executive",
  "partner",
] as const;

const IngestBody = z.object({
  path: z.string().min(1).max(500),
  menuKey: z.string().min(1).max(200).optional().nullable(),
});

router.post("/usage-events", async (req, res): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: "인증이 필요합니다" });
    return;
  }
  const parsed = IngestBody.safeParse(req.body);
  if (!parsed.success) {
    // 수집 엔드포인트는 실패해도 사용자 동선에 영향이 없어야 한다.
    res.status(204).end();
    return;
  }
  // 플랫폼관리자 자기 자신의 트래픽은 분석 대상에서 제외(과한 자가집계 방지).
  if (req.user.role === "platform_admin") {
    res.status(204).end();
    return;
  }
  // fire-and-forget: 응답 먼저 보내고 적재는 비동기.
  res.status(204).end();
  try {
    await db.insert(usageEventsTable).values({
      userId: req.user.userId,
      role: req.user.role,
      path: parsed.data.path.slice(0, 500),
      menuKey: parsed.data.menuKey?.slice(0, 200) ?? null,
    });
  } catch {
    // 적재 실패는 무시(분석은 best-effort).
  }
});

const RANGES = { "7d": 7, "30d": 30, "90d": 90 } as const;
type RangeKey = keyof typeof RANGES;

const QuerySchema = z.object({
  range: z.enum(["7d", "30d", "90d"]).optional(),
  role: z.string().optional(),
});

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

router.get(
  "/platform/usage-analytics",
  requireRole("platform_admin"),
  async (req, res): Promise<void> => {
    const parsed = QuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const range: RangeKey = (parsed.data.range as RangeKey) ?? "30d";
    const days = RANGES[range];
    const roleFilter =
      parsed.data.role && (TARGET_ROLES as readonly string[]).includes(parsed.data.role)
        ? parsed.data.role
        : null;

    const now = new Date();
    const periodEnd = now;
    const periodStart = new Date(startOfDay(now).getTime() - (days - 1) * 86400000);
    const prevEnd = periodStart;
    const prevStart = new Date(periodStart.getTime() - days * 86400000);

    // 단일 쿼리로 두 기간을 모두 조회 (period+prev).
    const baseConditions = [
      gte(usageEventsTable.occurredAt, prevStart),
      lt(usageEventsTable.occurredAt, periodEnd),
      ...(roleFilter ? [eq(usageEventsTable.role, roleFilter)] : []),
    ];

    const rows = await db
      .select({
        userId: usageEventsTable.userId,
        role: usageEventsTable.role,
        path: usageEventsTable.path,
        menuKey: usageEventsTable.menuKey,
        occurredAt: usageEventsTable.occurredAt,
      })
      .from(usageEventsTable)
      .where(and(...baseConditions));

    type Bucket = "current" | "prev";
    function bucketOf(d: Date): Bucket | null {
      if (d >= periodStart && d < periodEnd) return "current";
      if (d >= prevStart && d < prevEnd) return "prev";
      return null;
    }

    function pct(curr: number, prev: number): number | null {
      if (prev === 0) return curr === 0 ? 0 : null; // null = 신규 (직전 0)
      return Math.round(((curr - prev) / prev) * 1000) / 10;
    }

    // 1) 역할별 활성사용자/총조회수
    const perRole: Record<
      string,
      { activeUsersCurr: Set<number>; activeUsersPrev: Set<number>; viewsCurr: number; viewsPrev: number }
    > = {};
    for (const r of TARGET_ROLES) {
      perRole[r] = {
        activeUsersCurr: new Set(),
        activeUsersPrev: new Set(),
        viewsCurr: 0,
        viewsPrev: 0,
      };
    }

    // 2) 메뉴별 (path 기준) 집계 — 선택 역할 범위 내에서만(또는 전체).
    type MenuAgg = { viewsCurr: number; viewsPrev: number; usersCurr: Set<number>; menuKey: string | null };
    const menuMap = new Map<string, MenuAgg>();

    for (const ev of rows) {
      const occurredAtDate =
        ev.occurredAt instanceof Date ? ev.occurredAt : new Date(ev.occurredAt as unknown as string);
      const b = bucketOf(occurredAtDate);
      if (!b) continue;
      const bucket = perRole[ev.role];
      if (bucket) {
        if (b === "current") {
          bucket.activeUsersCurr.add(ev.userId);
          bucket.viewsCurr += 1;
        } else {
          bucket.activeUsersPrev.add(ev.userId);
          bucket.viewsPrev += 1;
        }
      }
      // 메뉴 집계 (역할 필터 적용 시에는 baseConditions 가 이미 필터링됨).
      const m = menuMap.get(ev.path) ?? {
        viewsCurr: 0,
        viewsPrev: 0,
        usersCurr: new Set<number>(),
        menuKey: ev.menuKey ?? null,
      };
      if (b === "current") {
        m.viewsCurr += 1;
        m.usersCurr.add(ev.userId);
      } else {
        m.viewsPrev += 1;
      }
      if (!m.menuKey && ev.menuKey) m.menuKey = ev.menuKey;
      menuMap.set(ev.path, m);
    }

    const roleSummary = TARGET_ROLES.map((r) => {
      const b = perRole[r];
      const activeUsersCurr = b.activeUsersCurr.size;
      const activeUsersPrev = b.activeUsersPrev.size;
      return {
        role: r,
        activeUsers: activeUsersCurr,
        activeUsersPrev,
        activeUsersChangePct: pct(activeUsersCurr, activeUsersPrev),
        totalViews: b.viewsCurr,
        totalViewsPrev: b.viewsPrev,
        totalViewsChangePct: pct(b.viewsCurr, b.viewsPrev),
      };
    });

    // 선택 역할이 있으면 그 역할만, 아니면 전체 합계를 요약 카드로 사용.
    const focused = roleFilter
      ? roleSummary.filter((r) => r.role === roleFilter)
      : roleSummary;
    const summary = focused.reduce(
      (acc, r) => ({
        activeUsers: acc.activeUsers + r.activeUsers,
        activeUsersPrev: acc.activeUsersPrev + r.activeUsersPrev,
        totalViews: acc.totalViews + r.totalViews,
        totalViewsPrev: acc.totalViewsPrev + r.totalViewsPrev,
      }),
      { activeUsers: 0, activeUsersPrev: 0, totalViews: 0, totalViewsPrev: 0 },
    );

    const topMenus = Array.from(menuMap.entries())
      .map(([path, m]) => ({
        path,
        menuKey: m.menuKey,
        views: m.viewsCurr,
        uniqueUsers: m.usersCurr.size,
        viewsPrev: m.viewsPrev,
        changePct: pct(m.viewsCurr, m.viewsPrev),
      }))
      .filter((x) => x.views > 0)
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);

    res.json({
      range,
      role: roleFilter,
      period: { start: periodStart.toISOString(), end: periodEnd.toISOString() },
      previousPeriod: { start: prevStart.toISOString(), end: prevEnd.toISOString() },
      summary: {
        activeUsers: summary.activeUsers,
        activeUsersChangePct: pct(summary.activeUsers, summary.activeUsersPrev),
        totalViews: summary.totalViews,
        totalViewsChangePct: pct(summary.totalViews, summary.totalViewsPrev),
      },
      byRole: roleSummary,
      topMenus,
    });
  },
);

// [Task #296] 보존: 180일 이전 이벤트 정리. 스케줄러에서 호출.
export async function purgeOldUsageEvents(retentionDays: number = 180): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86400000);
  const result = await db.execute(
    sql`DELETE FROM ${usageEventsTable} WHERE occurred_at < ${cutoff}`,
  );
  // node-postgres returns rowCount on result.
  return (result as unknown as { rowCount?: number }).rowCount ?? 0;
}

export default router;
