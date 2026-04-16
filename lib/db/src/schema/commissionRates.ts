import { pgTable, text, serial, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const commissionRateTypes = ["fixed", "sliding"] as const;

export const commissionRatesTable = pgTable("commission_rates", {
  id: serial("id").primaryKey(),
  category: text("category").notNull().unique(),
  rateType: text("rate_type", { enum: commissionRateTypes }).notNull().default("fixed"),
  fixedRate: real("fixed_rate").notNull().default(5),
  slidingRules: text("sliding_rules"),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCommissionRateSchema = createInsertSchema(commissionRatesTable).omit({ id: true, updatedAt: true });
export type InsertCommissionRate = z.infer<typeof insertCommissionRateSchema>;
export type CommissionRate = typeof commissionRatesTable.$inferSelect;

export type SlidingRule = { minAmount: number; maxAmount: number | null; ratePercent: number };
