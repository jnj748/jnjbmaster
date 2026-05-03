// [Task #781] 외부연동 어댑터 인터페이스 + 채널 레지스트리.
//
// 모든 외부 발송/검증/조회는 본 모듈을 통해 일관된 send/verify/status 3 메서드만
// 노출한다. 채널 등록만으로 Popbill 외 신규 외부 서비스(오픈뱅킹·국세청 진위조회·PG·
// 본인인증)를 추가할 수 있다.
//
// 발송 흐름:
//   1) enqueue(...)          dispatch_jobs 1행 적재. T9 마감 게이트는 enqueue 단계에서 강제.
//   2) processDueJobs()      워커가 queued 잡을 꺼내 channel.send(...) 호출 — 스케줄러가 주기 호출.
//   3) retry(jobId)          실패/대기 잡을 즉시 한 번 더 시도(스케줄 시점 0).
//
// 재시도는 지수백오프 — 베이스 2분 × 2^attempts (상한 2시간). maxAttempts 도달 시 dead.

import { db, dispatchJobsTable, type DispatchJob, type InsertDispatchJob, type DispatchChannel } from "@workspace/db";
import { and, eq, lte, inArray, desc, sql } from "drizzle-orm";
import { logger } from "../logger";
import { isMonthLocked } from "../closingEngine";

export type DispatchSendInput = {
  buildingId: number | null;
  channel: DispatchChannel | string;
  target: string;
  payload: Record<string, unknown>;
  // T9 마감 게이트 — 미마감 월의 발송은 enqueue 거부.
  relatedMonth?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: number | null;
  triggerSource?: string | null;
  scheduledAt?: Date;
  maxAttempts?: number;
  createdBy?: number | null;
};

export interface ChannelAdapter {
  channel: string;
  // 실 외부 호출. 성공 시 providerJobId/providerResponse 를 채워 반환.
  send: (
    job: DispatchJob,
  ) => Promise<{ ok: boolean; providerJobId?: string | null; providerResponse?: Record<string, unknown>; error?: string }>;
  // 외부 발신번호/계좌/대상 사전검증(미구현 채널은 ok 반환).
  verify?: (target: string, meta?: Record<string, unknown>) => Promise<{ ok: boolean; reason?: string }>;
  // 외부 잡 상태 조회(미구현 채널은 stored 상태 그대로).
  status?: (providerJobId: string) => Promise<{ status: string; raw?: Record<string, unknown> }>;
}

const REGISTRY = new Map<string, ChannelAdapter>();

export function registerChannel(adapter: ChannelAdapter): void {
  REGISTRY.set(adapter.channel, adapter);
}

export function getChannel(channel: string): ChannelAdapter | null {
  return REGISTRY.get(channel) ?? null;
}

export function listChannels(): string[] {
  return Array.from(REGISTRY.keys());
}

// ─── enqueue ─────────────────────────────────────────────────────────────────
export async function enqueueDispatch(input: DispatchSendInput): Promise<DispatchJob> {
  // 채널 슬롯 확인 — 등록되지 않은 채널은 거부(자리만 만든 슬롯도 dummy 어댑터 등록 필요).
  const adapter = REGISTRY.get(input.channel);
  if (!adapter) {
    throw new Error(`unknown_dispatch_channel: ${input.channel}`);
  }
  // T9 마감 게이트.
  if (input.buildingId && input.relatedMonth) {
    if (await isMonthLocked(input.buildingId, input.relatedMonth)) {
      // 마감된 월은 sent/closed 모두 OK — 차단되는 건 "미마감(open)" 월.
    } else {
      // 미마감이면 차단 — 마감 후에만 외부 발송 허용.
      // 단, 결재/공지처럼 부과월과 무관한 발송은 relatedMonth 를 비워두면 통과.
      throw new Error(`closing_required:${input.relatedMonth}`);
    }
  }
  const values: InsertDispatchJob = {
    buildingId: input.buildingId ?? null,
    channel: input.channel,
    target: input.target,
    payload: input.payload ?? {},
    status: "queued",
    attempts: 0,
    maxAttempts: input.maxAttempts ?? 5,
    relatedMonth: input.relatedMonth ?? null,
    relatedEntityType: input.relatedEntityType ?? null,
    relatedEntityId: input.relatedEntityId ?? null,
    triggerSource: input.triggerSource ?? null,
    scheduledAt: input.scheduledAt ?? new Date(),
    createdBy: input.createdBy ?? null,
  };
  const [row] = await db.insert(dispatchJobsTable).values(values).returning();
  // 즉시 1회 시도(워커 주기를 기다리지 않도록). 실패는 큐에 남고 워커가 재시도.
  void runJobNow(row.id).catch((err) => logger.warn({ err, jobId: row.id }, "[dispatch] immediate run failed"));
  return row;
}

// ─── 워커: 단건 / 일괄 ───────────────────────────────────────────────────────
const BACKOFF_BASE_MS = 2 * 60 * 1000;
const BACKOFF_CAP_MS = 2 * 60 * 60 * 1000;

function nextBackoff(attempts: number): number {
  return Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * Math.pow(2, attempts));
}

export async function runJobNow(jobId: number): Promise<DispatchJob | null> {
  // 단순 락 — status='queued' or 'failed' 인 행만 sending 으로 마킹 후 처리.
  const [claimed] = await db
    .update(dispatchJobsTable)
    .set({ status: "sending", updatedAt: new Date() })
    .where(and(eq(dispatchJobsTable.id, jobId), inArray(dispatchJobsTable.status, ["queued", "failed"])))
    .returning();
  if (!claimed) return null;
  const adapter = REGISTRY.get(claimed.channel);
  if (!adapter) {
    const [u] = await db
      .update(dispatchJobsTable)
      .set({ status: "dead", lastError: `unknown_channel:${claimed.channel}` })
      .where(eq(dispatchJobsTable.id, claimed.id))
      .returning();
    return u;
  }
  try {
    const result = await adapter.send(claimed);
    if (result.ok) {
      const [u] = await db
        .update(dispatchJobsTable)
        .set({
          status: "sent",
          attempts: claimed.attempts + 1,
          lastError: null,
          providerJobId: result.providerJobId ?? null,
          providerResponse: result.providerResponse ?? null,
          sentAt: new Date(),
        })
        .where(eq(dispatchJobsTable.id, claimed.id))
        .returning();
      return u;
    }
    return await markFailureAndSchedule(claimed, result.error ?? "send_failed");
  } catch (err) {
    return await markFailureAndSchedule(claimed, (err as Error)?.message ?? "exception");
  }
}

async function markFailureAndSchedule(job: DispatchJob, error: string): Promise<DispatchJob> {
  const nextAttempts = job.attempts + 1;
  const reachedDead = nextAttempts >= job.maxAttempts;
  const nextSchedule = new Date(Date.now() + nextBackoff(nextAttempts));
  const [u] = await db
    .update(dispatchJobsTable)
    .set({
      status: reachedDead ? "dead" : "failed",
      attempts: nextAttempts,
      lastError: error.slice(0, 500),
      scheduledAt: reachedDead ? job.scheduledAt : nextSchedule,
    })
    .where(eq(dispatchJobsTable.id, job.id))
    .returning();
  if (reachedDead) {
    logger.error({ jobId: job.id, channel: job.channel, error }, "[dispatch] reached max attempts");
  }
  return u;
}

export async function processDueJobs(limit = 25): Promise<number> {
  const now = new Date();
  const due = await db
    .select({ id: dispatchJobsTable.id })
    .from(dispatchJobsTable)
    .where(and(inArray(dispatchJobsTable.status, ["queued", "failed"]), lte(dispatchJobsTable.scheduledAt, now)))
    .orderBy(dispatchJobsTable.scheduledAt)
    .limit(limit);
  let processed = 0;
  for (const r of due) {
    await runJobNow(r.id);
    processed++;
  }
  return processed;
}

export async function retryJob(jobId: number): Promise<DispatchJob | null> {
  // 실패/dead 잡이라도 운영자 의지로 한 번 더. dead 는 attempts 카운터를 리셋해 주지는 않음.
  await db
    .update(dispatchJobsTable)
    .set({ status: "queued", scheduledAt: new Date() })
    .where(and(eq(dispatchJobsTable.id, jobId), inArray(dispatchJobsTable.status, ["failed", "dead", "queued"])));
  return await runJobNow(jobId);
}

// 채널 적재용 — 어플리케이션 부트 시 한 번만 호출.
export function registerDefaultChannels(): void {
  // popbill 채널은 ./popbillChannel 에서 자기등록.
  // 후속 슬롯(자리만) — 등록 호출은 있지만 send 는 not_implemented 반환.
  const slots: DispatchChannel[] = ["openbanking", "nts_verify", "pg", "kyc"];
  for (const ch of slots) {
    if (REGISTRY.has(ch)) continue;
    registerChannel({
      channel: ch,
      async send() {
        return { ok: false, error: `${ch}_not_implemented_yet` };
      },
    });
  }
}
// [Task #781] 외부 발송 통계용 — 미해결/실패 잡 카운트.
export async function dispatchStats(buildingId: number | null): Promise<{
  queued: number;
  sending: number;
  sent: number;
  failed: number;
  dead: number;
}> {
  const where = buildingId ? eq(dispatchJobsTable.buildingId, buildingId) : sql`true`;
  const rows = await db
    .select({ status: dispatchJobsTable.status, c: sql<number>`count(*)::int` })
    .from(dispatchJobsTable)
    .where(where)
    .groupBy(dispatchJobsTable.status);
  const out = { queued: 0, sending: 0, sent: 0, failed: 0, dead: 0 };
  for (const r of rows) {
    if (r.status in out) (out as Record<string, number>)[r.status] = r.c;
  }
  return out;
}

export async function listJobs(buildingId: number | null, opts: { limit?: number; status?: string; channel?: string } = {}): Promise<DispatchJob[]> {
  const conds = [] as ReturnType<typeof eq>[];
  if (buildingId) conds.push(eq(dispatchJobsTable.buildingId, buildingId));
  if (opts.status) conds.push(eq(dispatchJobsTable.status, opts.status as DispatchJob["status"]));
  if (opts.channel) conds.push(eq(dispatchJobsTable.channel, opts.channel));
  return db
    .select()
    .from(dispatchJobsTable)
    .where(conds.length ? and(...conds) : sql`true`)
    .orderBy(desc(dispatchJobsTable.createdAt))
    .limit(opts.limit ?? 100);
}
