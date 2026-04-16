import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vendorCreditWalletsTable = pgTable("vendor_credit_wallets", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().unique(),
  balance: integer("balance").notNull().default(0),
  pointsBalance: integer("points_balance").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVendorCreditWalletSchema = createInsertSchema(vendorCreditWalletsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVendorCreditWallet = z.infer<typeof insertVendorCreditWalletSchema>;
export type VendorCreditWallet = typeof vendorCreditWalletsTable.$inferSelect;
