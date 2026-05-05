// [Task #833] 자동이체 폴링 잡 모니터링 — 본사 운영 화면에서 사용.
//
//   GET /admin/auto-debit-poll-runs
//     최근 실행 이력 N건 + 잡 상태 메타(설정 여부/마지막 실행/지연 여부).
//     platform_admin / hq_executive 만 접근.
//
import { Router, type IRouter, type Request, type Response } from "express";
import { desc, gte, eq, sql } from "drizzle-orm";
import { db, autoDebitPollRunsTable, dispatchJobsTable } from "@workspace/db";
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

  const [lastDispatch] = await db
    .select({ createdAt: dispatchJobsTable.createdAt, status: dispatchJobsTable.status })
    .from(dispatchJobsTable)
    .where(eq(dispatchJobsTable.triggerSource, "auto_debit_poll_stale"))
    .orderBy(desc(dispatchJobsTable.createdAt))
    .limit(1);

  res.json({
    config: {
      pollUrlConfigured,
      webhookSecretConfigured,
      intervalMs,
      staleThresholdMs,
      retainDays: AUTO_DEBIT_POLL_RUN_RETAIN_DAYS,
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
    // [Task #845] 마지막 보존 정책 정리 결과(시각/삭제 건수). 서버 부팅 후 한 번도
    //   실행되지 않았다면 null. in-memory 상태이므로 재시작 시 초기화된다.
    lastPurge: lastPurgeState,
    runs: rows,
  });
});

export const AUTO_DEBIT_POLL_RUN_RETAIN_DAYS = (() => {
  const raw = process.env.AUTO_DEBIT_POLL_RUN_RETAIN_DAYS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 1 ? n : 90;
})();

// [Task #845] 마지막 purge 결과를 in-memory 로 기록해 모니터 API 에서 노출.
//   scheduler 와 routes 가 동일 프로세스에서 동작하므로 모듈 변수로 충분.
//   더 강한 가시성이 필요해지면 별도 audit 테이블로 승격할 것.
export interface AutoDebitPollPurgeState {
  ranAt: string;
  deleted: number;
  retentionDays: number;
}
let lastPurgeState: AutoDebitPollPurgeState | null = null;

export function getLastAutoDebitPollPurge(): AutoDebitPollPurgeState | null {
  return lastPurgeState;
}

export async function purgeOldAutoDebitPollRuns(retentionDays: number = AUTO_DEBIT_POLL_RUN_RETAIN_DAYS): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86400000);
  const result = await db.execute(
    sql`DELETE FROM ${autoDebitPollRunsTable} WHERE started_at < ${cutoff}`,
  );
  const deleted = (result as unknown as { rowCount?: number }).rowCount ?? 0;
  lastPurgeState = {
    ranAt: new Date().toISOString(),
    deleted,
    retentionDays,
  };
  return deleted;
}

export default router;
