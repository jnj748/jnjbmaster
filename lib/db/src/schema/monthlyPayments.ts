import { pgTable, text, serial, integer, real, boolean, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { unitsTable } from "./units";

export const monthlyPaymentsTable = pgTable("monthly_payments", {
  id: serial("id").primaryKey(),
  unitId: integer("unit_id").references(() => unitsTable.id, { onDelete: "cascade" }).notNull(),
  billingMonth: text("billing_month").notNull(),
  totalAmount: real("total_amount").notNull(),
  paidAmount: real("paid_amount").notNull().default(0),
  isPaid: boolean("is_paid").notNull().default(false),
  dueDate: text("due_date").notNull(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique().on(t.unitId, t.billingMonth),
]);

export const insertMonthlyPaymentSchema = createInsertSchema(monthlyPaymentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMonthlyPayment = z.infer<typeof insertMonthlyPaymentSchema>;
export type MonthlyPayment = typeof monthlyPaymentsTable.$inferSelect;
