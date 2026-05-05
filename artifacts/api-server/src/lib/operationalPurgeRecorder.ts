// [Task #852] 운영 데이터 정리(purge) 잡 실행 결과를 영구 audit 테이블에 기록하는 헬퍼.
//
//   기존에는 in-memory 변수(lastPurgeState)에만 두었던 정보를 DB 에 누적 보관한다.
//   purge 본체 로직은 콜백으로 받아서, 시각/소요/삭제 건수/에러를 한 곳에서 일관되게
//   기록한다. 기록 자체가 실패해도(예: 운영 잠시 장애) purge 본체 결과는 그대로
//   호출자에게 반환한다.

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
