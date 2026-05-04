// [Task #833] 자동이체 폴링 잡 모니터링 — 본사 운영 화면에서 사용.
//
//   GET /admin/auto-debit-poll-runs
//     최근 실행 이력 N건 + 잡 상태 메타(설정 여부/마지막 실행/지연 여부).
//     platform_admin / hq_executive 만 접근.
//
import { Router, type IRouter, type Request, type Response } from "express";
import { desc, gte } from "drizzle-orm";
import { db, autoDebitPollRunsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.use("/admin/auto-debit-poll-runs", requireRole("platform_admin", "hq_executive"));

router.get("/admin/auto-debit-poll-runs", async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const rows = await db
    .select()
    .from(autoDebitPollRunsTable)
    .orderBy(desc(autoDebitPollRunsTable.startedAt))
    .limit(limit);

  // [Task #833] 24h 요약은 list limit 와 무관하게 시간 윈도우로 별도 집계.
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const summaryRows = await db
    .select({
      enabled: autoDebitPollRunsTable.enabled,
      scanned: autoDebitPollRunsTable.scanned,
      updated: autoDebitPollRunsTable.updated,
      error: autoDebitPollRunsTable.error,
    })
    .from(autoDebitPollRunsTable)
    .where(gte(autoDebitPollRunsTable.startedAt, since24h));

  const pollUrlConfigured = Boolean(process.env.PG_AUTO_DEBIT_POLL_URL);
  const webhookSecretConfigured = Boolean(process.env.PG_AUTO_DEBIT_SECRET);

  const intervalMsRaw = process.env.PG_AUTO_DEBIT_POLL_INTERVAL_MS;
  const intervalMsParsed = intervalMsRaw ? Number(intervalMsRaw) : NaN;
  const intervalMs = Number.isFinite(intervalMsParsed) && intervalMsParsed >= 30_000
    ? intervalMsParsed
    : 5 * 60 * 1000;

  const staleMsRaw = process.env.PG_AUTO_DEBIT_STALE_MS;
  const staleMsParsed = staleMsRaw ? Number(staleMsRaw) : NaN;
  const staleThresholdMs = Number.isFinite(staleMsParsed) && staleMsParsed >= 60_000
    ? staleMsParsed
    : 30 * 60 * 1000;

  const last = rows[0] ?? null;
  const now = Date.now();
  const isStale = last
    ? now - new Date(last.startedAt).getTime() > staleThresholdMs
    : true;

  const summary = {
    total: summaryRows.length,
    enabled: summaryRows.filter((r) => r.enabled).length,
    withErrors: summaryRows.filter((r) => r.error).length,
    totalScanned: summaryRows.reduce((s, r) => s + (r.scanned ?? 0), 0),
    totalUpdated: summaryRows.reduce((s, r) => s + (r.updated ?? 0), 0),
  };

  res.json({
    config: {
      pollUrlConfigured,
      webhookSecretConfigured,
      intervalMs,
      staleThresholdMs,
    },
    status: {
      lastStartedAt: last?.startedAt ?? null,
      lastFinishedAt: last?.finishedAt ?? null,
      lastEnabled: last?.enabled ?? null,
      lastError: last?.error ?? null,
      isStale,
    },
    summary24h: summary,
    runs: rows,
  });
});

export default router;
