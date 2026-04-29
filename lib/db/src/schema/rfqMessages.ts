import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// [Task #612] RFQ 단위 인앱 메시지 스레드.
//   - 관리소장(매니저) ↔ 매칭된 파트너 1:1. 본사 관리자(platform_admin)는 읽기 전용.
//   - 파트너가 "연락하기" 또는 견적 제출 시 자동 개설된다.
//   - vendorId 는 파트너 측 식별 키. 동일 RFQ 라도 파트너별 독립 스레드가 된다.
//   - attachments 는 [{name, url, size}] JSON 직렬화.
//   - readByManagerAt / readByPartnerAt 는 상대방이 마지막으로 본 시각 → 헤더 뱃지/스레드 미리보기에 사용.
export const rfqMessagesTable = pgTable(
  "rfq_messages",
  {
    id: serial("id").primaryKey(),
    rfqId: integer("rfq_id").notNull(),
    vendorId: integer("vendor_id").notNull(),
    senderUserId: integer("sender_user_id").notNull(),
    senderRole: text("sender_role").notNull(),
    body: text("body").notNull().default(""),
    attachments: text("attachments"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    rfqVendorIdx: index("rfq_messages_rfq_vendor_idx").on(t.rfqId, t.vendorId),
  }),
);

export const insertRfqMessageSchema = createInsertSchema(rfqMessagesTable).omit({ id: true, createdAt: true });
export type InsertRfqMessage = z.infer<typeof insertRfqMessageSchema>;
export type RfqMessage = typeof rfqMessagesTable.$inferSelect;

// 스레드 메타: 마지막으로 본 시각. RFQ × vendor 기준으로 단일 행.
export const rfqMessageThreadsTable = pgTable(
  "rfq_message_threads",
  {
    id: serial("id").primaryKey(),
    rfqId: integer("rfq_id").notNull(),
    vendorId: integer("vendor_id").notNull(),
    readByManagerAt: timestamp("read_by_manager_at", { withTimezone: true }),
    readByPartnerAt: timestamp("read_by_partner_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    rfqVendorIdx: index("rfq_message_threads_rfq_vendor_idx").on(t.rfqId, t.vendorId),
  }),
);

export type RfqMessageThread = typeof rfqMessageThreadsTable.$inferSelect;
