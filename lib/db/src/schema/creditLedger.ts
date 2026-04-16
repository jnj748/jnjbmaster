import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const creditLedgerKinds = [
  "consumption",
  "refund",
  "manual_credit",
  "manual_debit",
  "package_purchase",
  "rebate",
  "adjustment",
  "bonus_points",
] as const;

export const creditLedgerSources = [
  "manual",
  "package_purchase",
  "refund",
  "rebate",
  "consumption",
  "adjustment",
  "system",
] as const;

export const creditLedgerTable = pgTable("credit_ledger", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull(),
  amount: integer("amount").notNull(),
  kind: text("kind", { enum: creditLedgerKinds }).notNull(),
  source: text("source", { enum: creditLedgerSources }).notNull().default("system"),
  pointsAmount: integer("points_amount").notNull().default(0),
  rfqId: integer("rfq_id"),
  quoteId: integer("quote_id"),
  relatedLedgerId: integer("related_ledger_id"),
  notes: text("notes"),
  actorId: integer("actor_id"),
  actorName: text("actor_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCreditLedgerSchema = createInsertSchema(creditLedgerTable).omit({ id: true, createdAt: true });
export type InsertCreditLedger = z.infer<typeof insertCreditLedgerSchema>;
export type CreditLedger = typeof creditLedgerTable.$inferSelect;
