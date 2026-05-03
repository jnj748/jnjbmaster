// [Task #780] T9 마감·보고엔진 v01 — 게이트/잠금/해제/스냅샷/표준보고 라우트.

import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, desc, gte, lte, sql } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  periodClosingsTable,
  closingSnapshotsTable,
  carryForwardBalancesTable,
  billsTable,
  billPaymentsTable,
  unitsTable,
  usersTable,
} from "@workspace/db";
import { audit, requireAction } from "../middlewares/audit";
import { requireRole } from "../middlewares/auth";
import { getUserBuildingId } from "../middlewares/buildingScope";
import { runGates, lockMonth, unlockMonth, buildSnapshot, isYM, isMonthLocked } from "../lib/closingEngine";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// [Task #780 review] 라우터 단위 역할 가드 — 회계·재무 보고서/마감 라우트는
//   facility_staff/custodian 등 비회계 역할에게 노출되면 안 된다. 매트릭스의
//   action 가드에 더해 라우터 자체에서도 화이트리스트로 한 번 더 막는다.
router.use("/closings", requireRole("manager", "accountant", "hq_executive", "platform_admin"));

// ── 0. 마감 목록 / 단건 ────────────────────────────────────
router.get("/closings", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const rows = await db.select().from(periodClosingsTable)
    .where(eq(periodClosingsTable.buildingId, buildingId))
    .orderBy(desc(periodClosingsTable.month));
  res.json({ closings: rows });
});

router.get("/closings/by-month/:month", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const month = String(req.params.month ?? "");
  if (!isYM(month)) { res.status(400).json({ error: "month must be YYYY-MM" }); return; }
  const [row] = await db.select().from(periodClosingsTable)
    .where(and(eq(periodClosingsTable.buildingId, buildingId), eq(periodClosingsTable.month, month)));
  res.json({ closing: row ?? null });
});

// ── 1. 게이트 사전 점검 ───────────────────────────────────
router.get("/closings/gate", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const month = String(req.query.month ?? "");
  if (!isYM(month)) { res.status(400).json({ error: "month must be YYYY-MM" }); return; }
  try {
    const gates = await runGates(buildingId, month);
    const passed = gates.every(g => g.passed);
    res.json({ buildingId, month, passed, gates });
  } catch (err) {
    logger.error({ err, month, buildingId }, "[T9] gate check failed");
    res.status(500).json({ error: "게이트 점검 실패" });
  }
});

// ── 2. 잠금 ──────────────────────────────────────────────
const LockBody = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  reason: z.string().max(500).optional(),
});

router.post(
  "/closings/lock",
  requireAction("closing.lock"),
  audit("closing.lock", { targetType: "period_closing", resolveTargetId: (_req, res) => Number((res.locals?.lockResult as { closingId?: number } | undefined)?.closingId ?? null) }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const userId = req.user?.userId;
    if (!userId) { res.status(403).json({ error: "사용자 정보가 없습니다" }); return; }

    const parsed = LockBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }

    try {
      const result = await lockMonth(buildingId, parsed.data.month, userId, parsed.data.reason ?? null);
      res.locals.lockResult = result;
      res.json({ ok: true, ...result });
    } catch (err) {
      const e = err as Error & { code?: string; gates?: unknown };
      if (e.code === "CLOSING_GATE_FAILED") {
        res.status(409).json({ error: "gate_failed", message: e.message, gates: e.gates });
        return;
      }
      logger.error({ err }, "[T9] lock failed");
      res.status(500).json({ error: e.message ?? "잠금 실패" });
    }
  },
);

// ── 3. 해제(파괴적, 이중승인) ─────────────────────────────
//   1단계: /closings/unlock-request — 1차 승인자(closing.unlock 권한)가 사유와 함께 요청.
//   2단계: /closings/unlock-approve — 2차 승인자(closing.unlock 권한, 1차와 반드시 다른 사용자)가
//          확인하면 그제야 실제 잠금 해제(unlockMonth) 가 실행된다.
//   기존 /closings/unlock 은 보존(혼선 방지)하되, 단일 호출로는 풀리지 않도록 차단해
//   사용자 코드가 자동으로 새 흐름으로 마이그레이션되도록 안내한다.
const UnlockBody = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  reason: z.string().min(3).max(500),
});

async function loadClosing(buildingId: number, month: string) {
  const [row] = await db.select().from(periodClosingsTable)
    .where(and(eq(periodClosingsTable.buildingId, buildingId), eq(periodClosingsTable.month, month)));
  return row ?? null;
}

// [Task #780 review] 이중승인 역할 페어링 — 한 명은 hq_executive, 다른 한 명은 platform_admin 이어야 한다.
const UNLOCK_PAIR_ROLES = new Set(["hq_executive", "platform_admin"]);
async function getUserRole(userId: number): Promise<string | null> {
  const [u] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId));
  return u?.role ?? null;
}
function isValidUnlockPair(roleA: string | null, roleB: string | null): boolean {
  if (!roleA || !roleB) return false;
  if (!UNLOCK_PAIR_ROLES.has(roleA) || !UNLOCK_PAIR_ROLES.has(roleB)) return false;
  return roleA !== roleB; // 한 명은 hq_executive, 다른 한 명은 platform_admin.
}

router.post(
  "/closings/unlock-request",
  requireAction("closing.unlock"),
  audit("closing.unlock", { targetType: "period_closing" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const userId = req.user?.userId;
    if (!userId) { res.status(403).json({ error: "사용자 정보가 없습니다" }); return; }
    const parsed = UnlockBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }

    const closing = await loadClosing(buildingId, parsed.data.month);
    if (!closing) { res.status(404).json({ error: "마감 기록이 없습니다" }); return; }
    if (closing.status !== "locked") {
      res.status(409).json({ error: "잠긴 월만 해제 요청할 수 있습니다" }); return;
    }
    // 1차 요청자도 페어 후보 역할(hq_executive | platform_admin) 만 허용.
    const role = await getUserRole(userId);
    if (!role || !UNLOCK_PAIR_ROLES.has(role)) {
      res.status(403).json({ error: "이중승인 1차 요청은 본부장(hq_executive) 또는 플랫폼관리자(platform_admin) 만 가능합니다." });
      return;
    }
    await db.update(periodClosingsTable).set({
      unlockRequestedAt: new Date(),
      unlockRequestedById: userId,
      unlockRequestReason: parsed.data.reason,
    }).where(eq(periodClosingsTable.id, closing.id));
    res.json({ ok: true, requestedById: userId, requestedByRole: role, awaiting: "second_approver_other_role" });
  },
);

router.post(
  "/closings/unlock-approve",
  requireAction("closing.unlock"),
  audit("closing.unlock", { targetType: "period_closing", resolveTargetId: (_req, res) => Number((res.locals?.unlockResult as { closingId?: number } | undefined)?.closingId ?? null) }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const userId = req.user?.userId;
    if (!userId) { res.status(403).json({ error: "사용자 정보가 없습니다" }); return; }
    const parsed = UnlockBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.issues }); return; }

    const closing = await loadClosing(buildingId, parsed.data.month);
    if (!closing) { res.status(404).json({ error: "마감 기록이 없습니다" }); return; }
    if (closing.status !== "locked") { res.status(409).json({ error: "잠긴 월만 해제할 수 있습니다" }); return; }
    if (!closing.unlockRequestedById || !closing.unlockRequestedAt) {
      res.status(409).json({ error: "1차 해제 요청이 먼저 등록되어야 합니다" }); return;
    }
    if (closing.unlockRequestedById === userId) {
      res.status(409).json({ error: "1차 요청자와 2차 승인자는 달라야 합니다" }); return;
    }
    // 역할 페어링 — 한 명은 hq_executive, 다른 한 명은 platform_admin.
    const [firstRole, secondRole] = await Promise.all([
      getUserRole(closing.unlockRequestedById),
      getUserRole(userId),
    ]);
    if (!isValidUnlockPair(firstRole, secondRole)) {
      res.status(403).json({
        error: "invalid_unlock_role_pair",
        message: "이중승인은 본부장(hq_executive) 1인 + 플랫폼관리자(platform_admin) 1인 조합만 허용됩니다.",
        firstRole, secondRole,
      });
      return;
    }
    // 24시간 내 승인 — 만료된 요청은 다시 1단계부터.
    const ageMs = Date.now() - new Date(closing.unlockRequestedAt).getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      await db.update(periodClosingsTable).set({
        unlockRequestedAt: null, unlockRequestedById: null, unlockRequestReason: null,
      }).where(eq(periodClosingsTable.id, closing.id));
      res.status(409).json({ error: "1차 요청이 만료되었습니다(24시간). 다시 요청해주세요" }); return;
    }

    try {
      const combinedReason = `[1차:${closing.unlockRequestedById} ${closing.unlockRequestReason}] [2차:${userId} ${parsed.data.reason}]`;
      const result = await unlockMonth(buildingId, parsed.data.month, userId, combinedReason);
      // 요청 컬럼 정리.
      await db.update(periodClosingsTable).set({
        unlockRequestedAt: null, unlockRequestedById: null, unlockRequestReason: null,
      }).where(eq(periodClosingsTable.id, closing.id));
      res.locals.unlockResult = result;
      res.json({ ok: true, ...result, firstApproverId: closing.unlockRequestedById, secondApproverId: userId });
    } catch (err) {
      const e = err as Error;
      logger.error({ err }, "[T9] unlock-approve failed");
      res.status(409).json({ error: e.message ?? "해제 실패" });
    }
  },
);

// 1차 요청 취소(같은 요청자만 가능). 비파괴적이라 destructive reason 필요 없음 —
//   requireAction("closing.unlock") 은 사유 422 를 강제하므로 requireRole 만 쓴다.
router.post(
  "/closings/unlock-cancel",
  requireRole("hq_executive", "platform_admin"),
  audit("closing.unlock", { targetType: "period_closing" }),
  async (req: Request, res: Response): Promise<void> => {
    const buildingId = await getUserBuildingId(req);
    if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
    const userId = req.user?.userId;
    if (!userId) { res.status(403).json({ error: "사용자 정보가 없습니다" }); return; }
    const month = String(req.body?.month ?? "");
    if (!isYM(month)) { res.status(400).json({ error: "month" }); return; }
    const closing = await loadClosing(buildingId, month);
    if (!closing) { res.status(404).json({ error: "마감 기록이 없습니다" }); return; }
    if (closing.unlockRequestedById !== userId) {
      res.status(403).json({ error: "1차 요청자만 취소할 수 있습니다" }); return;
    }
    await db.update(periodClosingsTable).set({
      unlockRequestedAt: null, unlockRequestedById: null, unlockRequestReason: null,
    }).where(eq(periodClosingsTable.id, closing.id));
    res.json({ ok: true });
  },
);

// 레거시 단일-호출 해제는 차단(이중승인 강제).
router.post(
  "/closings/unlock",
  requireAction("closing.unlock"),
  async (_req: Request, res: Response): Promise<void> => {
    res.status(410).json({
      error: "deprecated",
      message: "단일 호출 해제는 폐지되었습니다. /closings/unlock-request → /closings/unlock-approve 이중승인 흐름을 사용하세요.",
    });
  },
);

// ── 4. 스냅샷 조회 ───────────────────────────────────────
router.get("/closings/:id/snapshot", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) { res.status(400).json({ error: "id" }); return; }
  const [pc] = await db.select().from(periodClosingsTable)
    .where(and(eq(periodClosingsTable.id, id), eq(periodClosingsTable.buildingId, buildingId)));
  if (!pc) { res.status(404).json({ error: "마감을 찾을 수 없습니다" }); return; }
  if (!pc.snapshotId) { res.json({ closing: pc, snapshot: null }); return; }
  const [snap] = await db.select().from(closingSnapshotsTable)
    .where(eq(closingSnapshotsTable.id, pc.snapshotId));
  res.json({ closing: pc, snapshot: snap ?? null });
});

// ── 5. 이월잔액 조회 ─────────────────────────────────────
router.get("/closings/carry-forward", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const month = String(req.query.toMonth ?? req.query.month ?? "");
  if (!isYM(month)) { res.status(400).json({ error: "toMonth must be YYYY-MM" }); return; }
  const rows = await db.select().from(carryForwardBalancesTable)
    .where(and(eq(carryForwardBalancesTable.buildingId, buildingId), eq(carryForwardBalancesTable.toMonth, month)))
    .orderBy(carryForwardBalancesTable.accountCode);
  res.json({ balances: rows });
});

// ── 6. 표준보고 ──────────────────────────────────────────
// /reports/monthly      — 월간 (스냅샷이 있으면 그것, 없으면 실시간 buildSnapshot)
// /reports/annual       — 연간 (1~12월 스냅샷/실시간 합산)
// /reports/resident     — 호실별 부과·수납·미수
// /reports/balance-sheet, /reports/operations — snapshot.balanceSheet/operations 노출
async function loadOrBuild(buildingId: number, month: string) {
  const [pc] = await db.select().from(periodClosingsTable)
    .where(and(eq(periodClosingsTable.buildingId, buildingId), eq(periodClosingsTable.month, month)));
  if (pc?.snapshotId) {
    const [snap] = await db.select().from(closingSnapshotsTable)
      .where(eq(closingSnapshotsTable.id, pc.snapshotId));
    if (snap) return { snapshot: snap.summary, fromSnapshot: true, status: pc.status };
  }
  const live = await buildSnapshot(buildingId, month);
  return { snapshot: live, fromSnapshot: false, status: pc?.status ?? "open" };
}

router.get("/closings/reports/monthly", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const month = String(req.query.month ?? "");
  if (!isYM(month)) { res.status(400).json({ error: "month must be YYYY-MM" }); return; }
  const r = await loadOrBuild(buildingId, month);
  res.json(r);
});

router.get("/closings/reports/annual", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const year = Number(req.query.year);
  if (!Number.isFinite(year)) { res.status(400).json({ error: "year" }); return; }
  const months: string[] = [];
  for (let m = 1; m <= 12; m++) months.push(`${year}-${String(m).padStart(2, "0")}`);
  const items = await Promise.all(months.map(async (m) => {
    try { return { month: m, ...(await loadOrBuild(buildingId, m)) }; }
    catch { return { month: m, snapshot: null, fromSnapshot: false, status: "open" as const }; }
  }));
  // 연간 합계
  const totals = items.reduce((acc, it) => {
    const t = (it.snapshot as { totals?: Record<string, number> } | null)?.totals;
    if (!t) return acc;
    for (const k of Object.keys(t)) acc[k] = (acc[k] ?? 0) + Number(t[k] ?? 0);
    return acc;
  }, {} as Record<string, number>);
  // [Task #780 review-2] 연간 보고서에도 AI 인사이트 코멘트(1~3줄) 부착.
  //   tier0 (Gemini Flash 라우팅) 로 12개월 totals/추세를 요약. 실패 시 빈 배열.
  let comments: string[] = [];
  try {
    const { routedGenerate } = await import("../lib/llmRouter");
    const monthly = items.map(it => ({
      month: it.month,
      totals: (it.snapshot as { totals?: Record<string, number> } | null)?.totals ?? {},
      collection: (it.snapshot as { collection?: unknown } | null)?.collection ?? null,
    }));
    const prompt = [
      "당신은 건물 회계 연간보고 코멘트를 작성하는 분석가입니다.",
      `${year}년 12개월의 핵심 수치(JSON)를 보고 한국어 1~3줄로 연간 인사이트를 써주세요.`,
      "전체 추세, 피크/저점 월, 미수율 변화, 이상 월 정도만. 마크다운/리스트 기호 금지.",
      `연간 합계: ${JSON.stringify(totals)}`,
      `월별: ${JSON.stringify(monthly)}`,
    ].join("\n");
    const r = await routedGenerate({
      parts: [{ text: prompt }],
      tier: "tier0",
      maxOutputTokens: 320,
      inputTextForRouting: prompt,
    });
    comments = r.text.split(/\n+/).map(s => s.trim()).filter(s => s.length > 0).slice(0, 3);
  } catch {
    comments = [];
  }
  res.json({ year, items, totals, comments });
});

router.get("/closings/reports/resident", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const month = String(req.query.month ?? "");
  if (!isYM(month)) { res.status(400).json({ error: "month must be YYYY-MM" }); return; }
  // [Task #780 review] 잠긴 월은 스냅샷의 residentReport 를 그대로 돌려준다.
  //   bills 사후 변경에도 보고가 흔들리지 않게 하기 위함. 스냅샷이 없거나
  //   open 상태이면 실시간 buildSnapshot 의 residentReport 사용.
  const r = await loadOrBuild(buildingId, month);
  const rr = (r.snapshot as { residentReport?: { items: unknown[]; totals: Record<string, number> } } | null)?.residentReport;
  if (rr) {
    res.json({ month, fromSnapshot: r.fromSnapshot, items: rr.items, totals: rr.totals });
    return;
  }
  // 폴백 — 스냅샷에 residentReport 가 없는 구버전 데이터.
  res.json({ month, fromSnapshot: r.fromSnapshot, items: [], totals: { billed: 0, paid: 0, overdue: 0 } });
});

router.get("/closings/reports/balance-sheet", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const month = String(req.query.month ?? "");
  if (!isYM(month)) { res.status(400).json({ error: "month must be YYYY-MM" }); return; }
  const r = await loadOrBuild(buildingId, month);
  const bs = (r.snapshot as { balanceSheet?: unknown } | null)?.balanceSheet ?? null;
  res.json({ month, fromSnapshot: r.fromSnapshot, balanceSheet: bs });
});

router.get("/closings/reports/operations", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const month = String(req.query.month ?? "");
  if (!isYM(month)) { res.status(400).json({ error: "month must be YYYY-MM" }); return; }
  const r = await loadOrBuild(buildingId, month);
  const op = (r.snapshot as { operations?: unknown } | null)?.operations ?? null;
  res.json({ month, fromSnapshot: r.fromSnapshot, operations: op });
});

// ── 7. 마감 스냅샷 diff ──────────────────────────────────
// 두 마감(또는 실시간 빌드) 의 totals/collection/operations 를 비교한 diff 를 반환.
// 사용처: 마감 이력 화면에서 전월 대비 또는 이전 마감 대비 변동 시각화.
router.get("/closings/diff", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const from = String(req.query.from ?? "");
  const to = String(req.query.to ?? "");
  if (!isYM(from) || !isYM(to)) { res.status(400).json({ error: "from, to must be YYYY-MM" }); return; }

  const loadOne = async (m: string) => {
    const [pc] = await db.select().from(periodClosingsTable)
      .where(and(eq(periodClosingsTable.buildingId, buildingId), eq(periodClosingsTable.month, m)));
    if (pc?.snapshotId) {
      const [snap] = await db.select().from(closingSnapshotsTable).where(eq(closingSnapshotsTable.id, pc.snapshotId));
      if (snap) return { month: m, fromSnapshot: true, status: pc.status, summary: snap.summary };
    }
    const live = await buildSnapshot(buildingId, m);
    return { month: m, fromSnapshot: false, status: pc?.status ?? "open", summary: live };
  };

  const [a, b] = await Promise.all([loadOne(from), loadOne(to)]);
  const keys: Array<keyof typeof a.summary.totals> = ["billed", "collected", "overdue", "expense", "revenue", "netIncome"];
  const totals = Object.fromEntries(keys.map((k) => {
    const av = Number(a.summary.totals?.[k] ?? 0);
    const bv = Number(b.summary.totals?.[k] ?? 0);
    const delta = bv - av;
    const pct = av === 0 ? null : Number(((delta / Math.abs(av)) * 100).toFixed(2));
    return [k, { from: av, to: bv, delta, pct }];
  })) as Record<string, { from: number; to: number; delta: number; pct: number | null }>;

  const collection = {
    rate: { from: a.summary.collection?.rate ?? 0, to: b.summary.collection?.rate ?? 0, delta: (b.summary.collection?.rate ?? 0) - (a.summary.collection?.rate ?? 0) },
    overdueCount: { from: a.summary.collection?.overdueCount ?? 0, to: b.summary.collection?.overdueCount ?? 0, delta: (b.summary.collection?.overdueCount ?? 0) - (a.summary.collection?.overdueCount ?? 0) },
  };

  res.json({ from: a, to: b, diff: { totals, collection } });
});

// 잠금 상태 빠른 조회 (T10/UI 가드용)
router.get("/closings/status", async (req: Request, res: Response): Promise<void> => {
  const buildingId = await getUserBuildingId(req);
  if (!buildingId) { res.status(403).json({ error: "건물 정보가 없습니다" }); return; }
  const month = String(req.query.month ?? "");
  if (!isYM(month)) { res.status(400).json({ error: "month must be YYYY-MM" }); return; }
  const locked = await isMonthLocked(buildingId, month);
  res.json({ month, locked });
});

export default router;
