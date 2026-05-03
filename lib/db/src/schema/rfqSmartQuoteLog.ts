import { pgTable, serial, integer, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// [S1 스마트견적] 자동 제출 시도 이력.
//   - status: 'sent' | 'skipped' | 'failed'.
//   - creditsUsed: 실제 차감 금액(일반 대비 0.9배). skipped/failed 는 0.
//   - skipReason: 'daily_budget'|'daily_max'|'requires_site_visit'|'no_pricing'|... 등.
//   - quoteId: sent 일 때만 채워짐 (quotes 행에 대한 역참조).
//   - 인덱스 이름은 lib/db/drizzle/0051_s1_smart_quote.sql 와 정확히 매칭.
export const rfqSmartQuoteLogTable = pgTable(
  "rfq_smart_quote_log",
  {
    id: serial("id").primaryKey(),
    rfqId: integer("rfq_id").notNull(),
    vendorId: integer("vendor_id").notNull(),
    quoteId: integer("quote_id"),
    status: text("status").notNull(),
    creditsUsed: integer("credits_used").notNull().default(0),
    skipReason: text("skip_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ixRfq: index("rfq_smart_quote_log_rfq_id_idx").on(t.rfqId),
    ixVendor: index("rfq_smart_quote_log_vendor_id_idx").on(t.vendorId),
    ixVendorCreated: index("rfq_smart_quote_log_vendor_created_idx").on(t.vendorId, t.createdAt),
  }),
);

export const insertRfqSmartQuoteLogSchema = createInsertSchema(rfqSmartQuoteLogTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRfqSmartQuoteLog = z.infer<typeof insertRfqSmartQuoteLogSchema>;
export type RfqSmartQuoteLog = typeof rfqSmartQuoteLogTable.$inferSelect;
