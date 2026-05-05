// [Task #853] 운영 정리(purge) 잡 모니터링 알림.
//
//   audit 테이블(operational_purge_runs) 을 주기적으로 살펴 다음 두 가지 상황에
//   대해 본사 운영팀에 알림을 보낸다:
//     1) 잡이 일정 시간(`OPERATIONAL_PURGE_STALE_MS`, 기본 48h) 이상 실행되지 않은 경우
//        — 스케줄러가 정지했거나 잡 호출부가 누락됐다는 신호.
//     2) 마지막 실행 row 의 `error` 컬럼이 채워진 경우
//        — 잡 본체가 예외를 던져 정리가 실패했다는 신호.
//
//   알림은 잡 이름/상태별로 dedupe 되어 임계 윈도우(기본 24h) 내에 동일 알림이
//   중복 발송되지 않는다. 본사 운영팀에는 in-app 알림(notifications) 과 함께
//   카카오/SMS dispatch_jobs 도 큐잉한다.

import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import {
  db,
  notificationsTable,
  operationalPurgeRunsTable,
  dispatchJobsTable,
  usersTable,
} from "@workspace/db";
import { logger } from "./logger";
import { insertNotification } from "./notificationRecipient";
import { KNOWN_PURGE_JOBS } from "./operationalPurgeRecorder";

// stale 임계 시간(밀리초). 기본 48h — daily 틱이 한 번이라도 누락되면 감지.
//   환경변수 OPERATIONAL_PURGE_STALE_MS 로 조절 가능 (>= 60000).
export const OPERATIONAL_PURGE_STALE_MS = (() => {
  const raw = process.env.OPERATIONAL_PURGE_STALE_MS;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 60_000 ? n : 48 * 60 * 60 * 1000;
})();

// 동일 알림 중복 발송 방지 윈도우. 24h 내에 같은 (잡, 상태) 알림이 이미
// 적재되어 있으면 새 알림을 만들지 않는다.
const ALERT_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;

// notification_type 네이밍 규약. dedupe 가 잡 이름까지 포함되도록 잡 이름을
// 타입 문자열에 끼워 넣는다 (notifications.notification_type 은 free-form text).
function staleNotificationType(jobName: string): string {
  return `operational_purge_stale:${jobName}`;
}
function errorNotificationType(jobName: string): string {
  return `operational_purge_error:${jobName}`;
}

const KOR_JOB_LABEL: Record<string, string> = {
  auto_debit_poll_runs: "자동이체 폴링 정리",
  usage_events: "이용현황 이벤트 정리",
  operational_purge_runs: "정리 이력 audit 정리",
};

function labelFor(jobName: string): string {
  return KOR_JOB_LABEL[jobName] ?? jobName;
}

async function alertOnce(
  notificationType: string,
  title: string,
  message: string,
): Promise<boolean> {
  const dedupeSince = new Date(Date.now() - ALERT_DEDUPE_WINDOW_MS);
  const existing = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(
      and(
        eq(notificationsTable.notificationType, notificationType),
        gte(notificationsTable.createdAt, dedupeSince),
      ),
    )
    .limit(1);
  if (existing.length > 0) return false;

  await insertNotification({
    recipientType: "admin",
    notificationType,
    title,
    message,
    relatedEntityType: "operational_purge_runs",
  });

  // 모바일(카카오/SMS) 발송 — webhook/dispatch 어댑터가 미설정이어도 큐는 적재.
  try {
    const { enqueueDispatch } = await import("./external/adapter");
    const existingDispatch = await db
      .select({ id: dispatchJobsTable.id })
      .from(dispatchJobsTable)
      .where(
        and(
          eq(dispatchJobsTable.triggerSource, notificationType),
          gte(dispatchJobsTable.createdAt, dedupeSince),
        ),
      )
      .limit(1);
    if (existingDispatch.length === 0) {
      const hqAdmins = await db
        .select({ id: usersTable.id, phone: usersTable.phone, name: usersTable.name })
        .from(usersTable)
        .where(
          and(
            inArray(usersTable.role, ["platform_admin", "hq_executive"]),
            isNotNull(usersTable.phone),
          ),
        );
      for (const admin of hqAdmins) {
        if (!admin.phone) continue;
        await enqueueDispatch({
          buildingId: null,
          channel: "popbill_kakao",
          target: admin.phone,
          payload: {
            templateCode: "operational_purge_alert",
            title,
            message,
            recipientName: admin.name,
          },
          triggerSource: notificationType,
          relatedEntityType: "operational_purge_runs",
          maxAttempts: 3,
        }).catch((dispatchErr) => {
          logger.warn(
            { err: dispatchErr, adminId: admin.id, notificationType },
            "[Task #853] kakao dispatch failed, falling back to SMS",
          );
          return enqueueDispatch({
            buildingId: null,
            channel: "popbill_sms",
            target: admin.phone!,
            payload: { title, message, recipientName: admin.name },
            triggerSource: notificationType,
            relatedEntityType: "operational_purge_runs",
            maxAttempts: 3,
          });
        });
      }
      if (hqAdmins.length > 0) {
        logger.info(
          { recipientCount: hqAdmins.length, notificationType },
          "[Task #853] operational purge alert dispatched to mobile",
        );
      }
    }
  } catch (dispatchErr) {
    logger.error(
      { err: dispatchErr, notificationType },
      "[Task #853] mobile dispatch for purge alert failed",
    );
  }

  return true;
}

export interface PurgeAlertOutcome {
  staleAlerts: string[];
  errorAlerts: string[];
}

// 알려진 모든 purge 잡에 대해 stale/error 상태를 평가한다.
// - 한 번도 실행된 적 없는 잡은 stale 로 간주(첫 부팅 직후엔 알림이 1회 떠도
//   곧 첫 daily 틱이 적재되면 자동으로 "정상" 상태가 된다).
// - 같은 잡이 stale + error 동시에 해당되면 error 만 발송한다(에러가 더 시급).
export async function maybeAlertStalePurgeJobs(): Promise<PurgeAlertOutcome> {
  const outcome: PurgeAlertOutcome = { staleAlerts: [], errorAlerts: [] };
  const staleSince = new Date(Date.now() - OPERATIONAL_PURGE_STALE_MS);

  for (const jobName of KNOWN_PURGE_JOBS) {
    try {
      const [last] = await db
        .select()
        .from(operationalPurgeRunsTable)
        .where(eq(operationalPurgeRunsTable.jobName, jobName))
        .orderBy(desc(operationalPurgeRunsTable.startedAt))
        .limit(1);

      const isStale = !last || last.startedAt < staleSince;
      const lastError = last?.error ?? null;

      if (lastError) {
        const ranAt = last!.startedAt.toISOString();
        const message =
          `[${labelFor(jobName)}] 마지막 정리(${ranAt}) 가 오류로 종료되었습니다: ` +
          lastError.slice(0, 300);
        const sent = await alertOnce(
          errorNotificationType(jobName),
          `정리 잡 오류 · ${labelFor(jobName)}`,
          message,
        );
        if (sent) outcome.errorAlerts.push(jobName);
        continue;
      }

      if (isStale) {
        const staleHours = Math.round(OPERATIONAL_PURGE_STALE_MS / 3_600_000);
        const lastInfo = last
          ? `마지막 실행: ${last.startedAt.toISOString()}`
          : "한 번도 실행된 이력이 없습니다";
        const message = `[${labelFor(jobName)}] 최근 ${staleHours}시간 동안 실행 이력이 없습니다 (${lastInfo}). 스케줄러/잡 호출부 점검이 필요합니다.`;
        const sent = await alertOnce(
          staleNotificationType(jobName),
          `정리 잡 정지 의심 · ${labelFor(jobName)}`,
          message,
        );
        if (sent) outcome.staleAlerts.push(jobName);
      }
    } catch (err) {
      logger.error({ err, jobName }, "[Task #853] purge job alert check failed");
    }
  }

  if (outcome.staleAlerts.length > 0 || outcome.errorAlerts.length > 0) {
    logger.warn(outcome, "[Task #853] purge audit alerts dispatched");
  }
  return outcome;
}
