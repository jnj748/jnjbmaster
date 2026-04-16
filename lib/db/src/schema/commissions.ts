import { pgTable, text, serial, integer, real, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const commissionsTable = pgTable("commissions", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull(),
  vendorName: text("vendor_name").notNull(),
  contractAmount: real("contract_amount").notNull(),
  commissionRate: real("commission_rate").notNull(),
  commissionAmount: real("commission_amount").notNull(),
  status: text("status").notNull().default("pending"),
  matchedDate: date("matched_date").notNull(),
  notes: text("notes"),
  rfqId: integer("rfq_id"),
  quoteId: integer("quote_id"),
  category: text("category"),
  billedAt: timestamp("billed_at", { withTimezone: true }),
  collectedAt: timestamp("collected_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  invoiceNumber: text("invoice_number"),
  invoiceIssuedAt: timestamp("invoice_issued_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCommissionSchema = createInsertSchema(commissionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCommission = z.infer<typeof insertCommissionSchema>;
export type Commission = typeof commissionsTable.$inferSelect;
