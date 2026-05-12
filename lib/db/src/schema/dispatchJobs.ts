// [Task #781] T10 외부연동 엔진 v01 — 발송 잡 큐.
//
// channel/target/payload 단일 인터페이스로 외부 발송을 표준화한다. Popbill 외에도
// 오픈뱅킹·국세청·PG·본인인증 등 후속 채널은 channel 슬러그만 추가하면 같은 큐에
// 적재된다(슬롯).
//
// status 흐름: queued -> sending -> sent | failed -> (재시도) sending -> ...
// scheduledAt 이 미래라면 워커가 건너뛴다. attempts 가 maxAttempts 에 도달하면
// dead 로 박제(워커가 더 이상 집지 않음).

import { pgTable, text, serial, integer, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { buildingsTable } from "./buildings";

export type DispatchChannel =
  // Aligo 카카오 알림톡 / SMS·LMS
  | "aligo_kakao"
  | "aligo_lms"
  | "aligo_sms"
  // 후속 슬롯(자리만 — 미실연동)
  | "openbanking"
  | "nts_verify"
  | "pg"
  | "kyc";

export type DispatchStatus = "queued" | "sending" | "sent" | "failed" | "dead" | "cancelled";

export const dispatchJobsTable = pgTable(
  "dispatch_jobs",
  {
    id: serial("id").primaryKey(),
    buildingId: integer("building_id").references(() => buildingsTable.id, { onDelete: "set null" }),
    // 채널 슬러그(예: aligo_kakao). 등록되지 않은 슬러그는 어댑터가 거부.
    channel: text("channel").notNull(),
    // 수신 대상(전화번호/이메일/계좌 등 채널별 의미). 검색용 평문 + 채널별 마스킹은 응답 직전에.
    target: text("target").notNull(),
    // 채널별 페이로드(템플릿 코드, 메시지 본문, 첨부, 메타).
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status", { enum: ["queued", "sending", "sent", "failed", "dead", "cancelled"] })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    lastError: text("last_error"),
    // 외부 채널이 돌려준 잡 식별자(메시지키 등).
    providerJobId: text("provider_job_id"),
    providerResponse: jsonb("provider_response"),
    // 마감 게이트가 사용 — 잠긴 월의 발송은 enqueue 단계에서 차단.
    relatedMonth: text("related_month"),
    // 관련 도메인 엔티티(연체단계/고지서/수납/결재 등).
    relatedEntityType: text("related_entity_type"),
    relatedEntityId: integer("related_entity_id"),
    // 트리거 출처 라벨 — fees.kakao.notify / bill.delinquency / payment.received 등.
    triggerSource: text("trigger_source"),
    // 비동기 처리 — 미래 시각이면 워커가 스킵.
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    byBuilding: index("dispatch_jobs_building_idx").on(t.buildingId),
    byStatus: index("dispatch_jobs_status_idx").on(t.status),
    byScheduled: index("dispatch_jobs_scheduled_idx").on(t.scheduledAt),
    byChannel: index("dispatch_jobs_channel_idx").on(t.channel),
  }),
);

export type DispatchJob = typeof dispatchJobsTable.$inferSelect;
export type InsertDispatchJob = typeof dispatchJobsTable.$inferInsert;
