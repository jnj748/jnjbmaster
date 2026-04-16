import { pgTable, text, serial, integer, real, timestamp, date, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const quotesTable = pgTable("quotes", {
  id: serial("id").primaryKey(),
  rfqId: integer("rfq_id").notNull(),
  vendorId: integer("vendor_id").notNull(),
  vendorName: text("vendor_name").notNull(),
  totalAmount: real("total_amount").notNull(),
  itemBreakdown: text("item_breakdown"),
  scope: text("scope"),
  estimatedDays: integer("estimated_days"),
  availableDate: date("available_date"),
  notes: text("notes"),
  status: text("status").notNull().default("submitted"),
  contractFilePath: text("contract_file_path"),
  contractUploadedAt: timestamp("contract_uploaded_at", { withTimezone: true }),
  requiredDocsComplete: boolean("required_docs_complete").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  rfqVendorUnique: uniqueIndex("quotes_rfq_vendor_unique").on(t.rfqId, t.vendorId),
}));

export const insertQuoteSchema = createInsertSchema(quotesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotesTable.$inferSelect;
