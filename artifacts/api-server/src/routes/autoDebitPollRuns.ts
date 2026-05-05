// [Task #833] 자동이체 폴링 잡 모니터링 — 본사 운영 화면에서 사용.
//
//   GET /admin/auto-debit-poll-runs
//     최근 실행 이력 N건 + 잡 상태 메타(설정 여부/마지막 실행/지연 여부).
//     platform_admin / hq_executive 만 접근.
//
import { Router, type IRouter, type Request, type Response } from "express";
import { desc, gte, eq, sql } from "drizzle-orm";
import { db, autoDebitPollRunsTable, dispatchJobsTable, operationalPurgeRunsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth";
import {
  recordPurgeRun,
  getPurgeErrorCounts,
  OPERATIONAL_PURGE_RUNS_RETAIN_DAYS,
} from "../lib/operationalPurgeRecorder";
import { OPERATIONAL_PURGE_STALE_MS } from "../lib/operationalPurgeAlerts";

// [Task #852] purge audit 테이블에서 사용하는 jobName 상수.
//   API/스케줄러/마이그레이션에서 동일한 식별자를 써야 하므로 한 곳에서 관리한다.
export const AUTO_DEBIT_POLL_PURGE_JOB_NAME = "auto_debit_poll_runs";

// [Task #853] 모니터 화면 "최근 N일간 오류 횟수" 카드의 윈도우(일).
//   환경변수 OPERATIONAL_PURGE_ERROR_WINDOW_DAYS 로 조절 가능.
const PURGE_ERROR_WINDOW_DAYS = (() => {
  const raw = process.env.OPERATIONAL_PURGE_ERROR_WINDOW_DAYS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 1 ? n : 7;
})();

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

  const [lastDispatch] = await db
    .select({ createdAt: dispatchJobsTable.createdAt, status: dispatchJobsTable.status })
    .from(dispatchJobsTable)
    .where(eq(dispatchJobsTable.triggerSource, "auto_debit_poll_stale"))
    .orderBy(desc(dispatchJobsTable.createdAt))
    .limit(1);

  // [Task #852] 보존 정책 정리 이력은 audit 테이블(operational_purge_runs) 에서 조회.
  //   - lastPurge: 자동이체 폴링 잡의 마지막 정리 결과(서버 재시작과 무관하게 유지).
  //   - recentPurges: 모든 잡 이름의 최근 N건(운영 화면 "최근 정리 이력" 표시).
  const [lastPurgeRow] = await db
    .select()
    .from(operationalPurgeRunsTable)
    .where(eq(operationalPurgeRunsTable.jobName, AUTO_DEBIT_POLL_PURGE_JOB_NAME))
    .orderBy(desc(operationalPurgeRunsTable.startedAt))
    .limit(1);

  const recentPurgeLimit = Math.min(50, Math.max(1, Number(req.query.purgeLimit) || 10));
  const recentPurges = await db
    .select()
    .from(operationalPurgeRunsTable)
    .orderBy(desc(operationalPurgeRunsTable.startedAt))
    .limit(recentPurgeLimit);

  // [Task #853] 모니터 화면 "최근 N일간 오류 횟수" 카드용 집계.
  //   알려진 모든 purge 잡 별로 errorCount/lastError/lastErrorAt 를 반환한다.
  const purgeErrorCounts = await getPurgeErrorCounts(PURGE_ERROR_WINDOW_DAYS);
  const totalPurgeErrors = purgeErrorCounts.reduce((s, r) => s + r.errorCount, 0);

  res.json({
    config: {
      pollUrlConfigured,
      webhookSecretConfigured,
      intervalMs,
      staleThresholdMs,
      retainDays: AUTO_DEBIT_POLL_RUN_RETAIN_DAYS,
      // [Task #853] audit 테이블 자체의 보존/모니터링 설정.
      auditRetainDays: OPERATIONAL_PURGE_RUNS_RETAIN_DAYS,
      purgeStaleThresholdMs: OPERATIONAL_PURGE_STALE_MS,
      purgeErrorWindowDays: PURGE_ERROR_WINDOW_DAYS,
    },
    status: {
      lastStartedAt: last?.startedAt ?? null,
      lastFinishedAt: last?.finishedAt ?? null,
      lastEnabled: last?.enabled ?? null,
      lastError: last?.error ?? null,
      isStale,
    },
    summary24h: summary,
    lastAlertDispatch: lastDispatch
      ? { dispatchedAt: lastDispatch.createdAt, status: lastDispatch.status }
      : null,
    // [Task #852] 마지막 자동이체 폴링 보존 정책 정리 결과. audit 테이블 기반이므로
    //   서버 재시작 후에도 마지막 정리 정보가 유지된다.
    lastPurge: lastPurgeRow
      ? {
          ranAt: lastPurgeRow.startedAt,
          finishedAt: lastPurgeRow.finishedAt,
          deleted: lastPurgeRow.deleted,
          retentionDays: lastPurgeRow.retentionDays,
          durationMs: lastPurgeRow.durationMs,
          error: lastPurgeRow.error,
        }
      : null,
    // [Task #852] 모든 보존 정책 잡(usage_events/auto_debit_poll_runs 등)의 최근 정리 이력.
    recentPurges: recentPurges.map((r) => ({
      id: r.id,
      jobName: r.jobName,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      durationMs: r.durationMs,
      retentionDays: r.retentionDays,
      deleted: r.deleted,
      error: r.error,
    })),
    // [Task #853] 모니터 화면 "최근 N일간 오류 횟수" 요약.
    //   각 purge 잡 별로 windowDays 일 동안 error 가 채워진 row 수를 집계한다.
    purgeErrors: {
      windowDays: PURGE_ERROR_WINDOW_DAYS,
      total: totalPurgeErrors,
      byJob: purgeErrorCounts.map((s) => ({
        jobName: s.jobName,
        errorCount: s.errorCount,
        lastError: s.lastError,
        lastErrorAt: s.lastErrorAt,
      })),
    },
    runs: rows,
  });
});

export const AUTO_DEBIT_POLL_RUN_RETAIN_DAYS = (() => {
  const raw = process.env.AUTO_DEBIT_POLL_RUN_RETAIN_DAYS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 1 ? n : 90;
})();

// [Task #852] 자동이체 폴링 이력의 보존 정책 정리. 결과는 audit 테이블
//   (operational_purge_runs)에 영구 기록되어 서버 재시작과 무관하게 유지된다.
export async function purgeOldAutoDebitPollRuns(
  retentionDays: number = AUTO_DEBIT_POLL_RUN_RETAIN_DAYS,
): Promise<number> {
  return recordPurgeRun(AUTO_DEBIT_POLL_PURGE_JOB_NAME, retentionDays, async () => {
    const cutoff = new Date(Date.now() - retentionDays * 86400000);
    const result = await db.execute(
      sql`DELETE FROM ${autoDebitPollRunsTable} WHERE started_at < ${cutoff}`,
    );
    return (result as unknown as { rowCount?: number }).rowCount ?? 0;
  });
}

export default router;
