import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const creditCategoryPricingTable = pgTable("credit_category_pricing", {
  id: serial("id").primaryKey(),
  category: text("category").notNull().unique(),
  tier: integer("tier").notNull().default(1),
  creditCost: integer("credit_cost").notNull().default(1),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCreditCategoryPricingSchema = createInsertSchema(creditCategoryPricingTable).omit({ id: true, updatedAt: true });
export type InsertCreditCategoryPricing = z.infer<typeof insertCreditCategoryPricingSchema>;
export type CreditCategoryPricing = typeof creditCategoryPricingTable.$inferSelect;
