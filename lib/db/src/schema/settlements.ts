import { pgTable, text, serial, integer, real, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settlementsTable = pgTable("settlements", {
  id: serial("id").primaryKey(),
  rfqId: integer("rfq_id").notNull(),
  quoteId: integer("quote_id").notNull(),
  vendorId: integer("vendor_id").notNull(),
  vendorName: text("vendor_name").notNull(),
  contractId: integer("contract_id"),
  contractAmount: real("contract_amount").notNull(),
  feeRate: real("fee_rate").notNull().default(0),
  feeAmount: real("fee_amount").notNull().default(0),
  paymentAmount: real("payment_amount").notNull(),
  status: text("status").notNull().default("pending"),
  paidAt: date("paid_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSettlementSchema = createInsertSchema(settlementsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSettlement = z.infer<typeof insertSettlementSchema>;
export type Settlement = typeof settlementsTable.$inferSelect;
