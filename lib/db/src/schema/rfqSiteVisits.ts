import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// [Task #612] 현장방문 견적 일정 조율.
//   - 파트너가 방문 가능 일시 후보(여러 개) 를 제안 → 매니저가 그 중 하나를 확정한다.
//   - status: proposed (파트너 제안 직후) → confirmed (매니저 확정) → completed (방문 종료) | cancelled
//   - proposedSlots: ISO datetime 문자열 배열의 JSON 직렬화. 예: ["2026-05-04T10:00:00+09:00", ...]
//   - confirmedSlot: 매니저가 확정한 단일 시각.
//   - 양측 캘린더에는 confirmed/completed 만 노출.
export const rfqSiteVisitsTable = pgTable(
  "rfq_site_visits",
  {
    id: serial("id").primaryKey(),
    rfqId: integer("rfq_id").notNull(),
    vendorId: integer("vendor_id").notNull(),
    status: text("status").notNull().default("proposed"),
    proposedSlots: text("proposed_slots").notNull().default("[]"),
    confirmedSlot: timestamp("confirmed_slot", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    rfqVendorIdx: index("rfq_site_visits_rfq_vendor_idx").on(t.rfqId, t.vendorId),
  }),
);

export const insertRfqSiteVisitSchema = createInsertSchema(rfqSiteVisitsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertRfqSiteVisit = z.infer<typeof insertRfqSiteVisitSchema>;
export type RfqSiteVisit = typeof rfqSiteVisitsTable.$inferSelect;
