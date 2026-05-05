// [Task #852] 운영 데이터 정리(purge) 잡 실행 결과를 영구 audit 테이블에 기록하는 헬퍼.
//
//   기존에는 in-memory 변수(lastPurgeState)에만 두었던 정보를 DB 에 누적 보관한다.
//   purge 본체 로직은 콜백으로 받아서, 시각/소요/삭제 건수/에러를 한 곳에서 일관되게
//   기록한다. 기록 자체가 실패해도(예: 운영 잠시 장애) purge 본체 결과는 그대로
//   호출자에게 반환한다.
//
// [Task #853] audit 테이블 자체의 보존 정책 + 잡 모니터링 헬퍼.
//   - operational_purge_runs 도 무한히 증가하므로 정기적으로 정리한다.
//     (잡 이름 `operational_purge_runs` 로 동일 audit 테이블에 한 줄 기록.)
//   - 모니터 화면/알림 잡이 공유할 "알려진 purge 잡" 목록과 오류 카운트 헬퍼.

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, operationalPurgeRunsTable } from "@workspace/db";
import { logger } from "./logger";

export interface PurgeRunOutcome {
  deleted: number;
}

export async function recordPurgeRun(
  jobName: string,
  retentionDays: number,
  run: () => Promise<number>,
): Promise<number> {
  const startedAt = new Date();
  const startMs = Date.now();
  let deleted = 0;
  let errorMessage: string | null = null;
  try {
    deleted = await run();
    return deleted;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    const finishedAt = new Date();
    const durationMs = Date.now() - startMs;
    try {
      await db.insert(operationalPurgeRunsTable).values({
        jobName,
        startedAt,
        finishedAt,
        durationMs,
        retentionDays,
        deleted,
        error: errorMessage ? errorMessage.slice(0, 1000) : null,
      });
    } catch (auditErr) {
      logger.error(
        { err: auditErr, jobName },
        "Failed to record operational purge run audit entry",
      );
    }
  }
}

// [Task #853] audit 테이블 자체의 정리 잡 이름. 모니터/알림이 다른 잡과
//   동일한 방식으로 추적할 수 있도록 같은 audit 테이블에 기록한다.
export const OPERATIONAL_PURGE_AUDIT_JOB_NAME = "operational_purge_runs";

// [Task #853] audit 테이블 자체의 기본 보존 기간(일).
//   - 환경변수 OPERATIONAL_PURGE_RUNS_RETAIN_DAYS 로 조절 (>=1).
//   - 기본 365일: 자동이체 폴링(90일)/usage_events(180일)보다 길게 잡아 잡
//     이력 자체는 1년치 추적이 가능하도록 한다.
export const OPERATIONAL_PURGE_RUNS_RETAIN_DAYS = (() => {
  const raw = process.env.OPERATIONAL_PURGE_RUNS_RETAIN_DAYS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 1 ? n : 365;
})();

// [Task #853] 모니터/알림이 추적해야 할 알려진 purge 잡 목록.
//   - 새 purge 잡이 추가되면 여기에 등록해야 stale/오류 알림이 발송된다.
//   - 값은 routes 측에서 export 한 상수와 일치해야 한다.
//     (auto_debit_poll_runs / usage_events — autoDebitPollRuns.ts /
//      usageAnalytics.ts 의 *_PURGE_JOB_NAME 와 동일.)
export const KNOWN_PURGE_JOBS: ReadonlyArray<string> = [
  "auto_debit_poll_runs",
  "usage_events",
  OPERATIONAL_PURGE_AUDIT_JOB_NAME,
];

// [Task #853] audit 테이블 자체에 적용되는 보존 정책.
//   결과는 같은 audit 테이블에 jobName="operational_purge_runs" 로 한 줄 기록되어,
//   이 잡의 실행 여부도 다른 잡과 동일한 방식으로 모니터링 된다.
export async function purgeOldOperationalPurgeRuns(
  retentionDays: number = OPERATIONAL_PURGE_RUNS_RETAIN_DAYS,
): Promise<number> {
  return recordPurgeRun(OPERATIONAL_PURGE_AUDIT_JOB_NAME, retentionDays, async () => {
    const cutoff = new Date(Date.now() - retentionDays * 86400000);
    const result = await db.execute(
      sql`DELETE FROM ${operationalPurgeRunsTable} WHERE started_at < ${cutoff}`,
    );
    return (result as unknown as { rowCount?: number }).rowCount ?? 0;
  });
}

export interface PurgeJobErrorSummary {
  jobName: string;
  errorCount: number;
  lastError: string | null;
  lastErrorAt: Date | null;
}

// [Task #853] 모니터 화면 "최근 N일간 오류 횟수" 카드용 집계.
//   알려진 purge 잡 별로 sinceDays 일 동안 error 가 채워진 row 수를 센다.
export async function getPurgeErrorCounts(
  sinceDays: number,
  jobs: ReadonlyArray<string> = KNOWN_PURGE_JOBS,
): Promise<PurgeJobErrorSummary[]> {
  const since = new Date(Date.now() - sinceDays * 86400000);
  const summaries: PurgeJobErrorSummary[] = [];
  for (const jobName of jobs) {
    const rows = await db
      .select({
        startedAt: operationalPurgeRunsTable.startedAt,
        error: operationalPurgeRunsTable.error,
      })
      .from(operationalPurgeRunsTable)
      .where(
        and(
          eq(operationalPurgeRunsTable.jobName, jobName),
          gte(operationalPurgeRunsTable.startedAt, since),
        ),
      )
      .orderBy(desc(operationalPurgeRunsTable.startedAt));
    const errored = rows.filter((r) => r.error);
    const last = errored[0];
    summaries.push({
      jobName,
      errorCount: errored.length,
      lastError: last?.error ?? null,
      lastErrorAt: last?.startedAt ?? null,
    });
  }
  return summaries;
}
