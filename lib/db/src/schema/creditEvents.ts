import { pgTable, serial, integer, text, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// [Task #734] 파트너 이벤트 크레딧 일괄 지급.
//   credit_events: 한 번의 일괄 지급 작업(이름·사유·1인당 금액·대상수·합계).
//   credit_event_recipients: 이벤트별 수령 vendor — (eventId, vendorId) UNIQUE 로 멱등 보장.
//   ledgerId 는 동일 트랜잭션에서 발행한 credit_ledger 행에 대한 역참조(감사용).
// [Task #734 — 3차 리뷰 후속] SQL 마이그레이션(0049) 에 있는 인덱스를 Drizzle 스키마에도
//   명시 — schema/migration drift 방지 (db:push diff 가 깨끗하게 유지되도록).
export const creditEventsTable = pgTable(
  "credit_events",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    reason: text("reason"),
    creditsPerVendor: integer("credits_per_vendor").notNull().default(0),
    pointsPerVendor: integer("points_per_vendor").notNull().default(0),
    recipientCount: integer("recipient_count").notNull().default(0),
    totalCredits: integer("total_credits").notNull().default(0),
    totalPoints: integer("total_points").notNull().default(0),
    actorId: integer("actor_id"),
    actorName: text("actor_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // 인덱스 이름은 SQL 마이그레이션(0049) 과 정확히 일치시켜야 schema drift 가
    // 생기지 않는다 (drizzle-kit diff 가 깨끗하게 유지됨).
    uxName: uniqueIndex("credit_events_name_unique").on(t.name),
  }),
);

export const creditEventRecipientsTable = pgTable(
  "credit_event_recipients",
  {
    id: serial("id").primaryKey(),
    eventId: integer("event_id").notNull(),
    vendorId: integer("vendor_id").notNull(),
    ledgerId: integer("ledger_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // 이름은 마이그레이션 0049 와 정확히 매칭 (이전엔 ux_/ix_ prefix 로
    // 달랐는데 drift 회피 위해 통일).
    uxEventVendor: uniqueIndex("credit_event_recipients_event_vendor_unique").on(t.eventId, t.vendorId),
    ixEvent: index("credit_event_recipients_event_id_idx").on(t.eventId),
  }),
);

export const insertCreditEventSchema = createInsertSchema(creditEventsTable).omit({ id: true, createdAt: true });
export type InsertCreditEvent = z.infer<typeof insertCreditEventSchema>;
export type CreditEvent = typeof creditEventsTable.$inferSelect;

export const insertCreditEventRecipientSchema = createInsertSchema(creditEventRecipientsTable).omit({ id: true, createdAt: true });
export type InsertCreditEventRecipient = z.infer<typeof insertCreditEventRecipientSchema>;
export type CreditEventRecipient = typeof creditEventRecipientsTable.$inferSelect;
