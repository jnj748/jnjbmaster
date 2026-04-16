import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { unitsTable } from "./units";
import { tenantsTable } from "./tenants";

export const delinquencyActionsTable = pgTable("delinquency_actions", {
  id: serial("id").primaryKey(),
  unitId: integer("unit_id").references(() => unitsTable.id),
  unitNumber: text("unit_number").notNull(),
  tenantId: integer("tenant_id").references(() => tenantsTable.id),
  tenantName: text("tenant_name"),
  overdueMonths: integer("overdue_months").notNull().default(0),
  totalOverdueAmount: integer("total_overdue_amount").notNull().default(0),
  actionType: text("action_type").notNull(),
  status: text("status").notNull().default("active"),
  actionDate: timestamp("action_date", { withTimezone: true }).notNull().defaultNow(),
  resolvedDate: timestamp("resolved_date", { withTimezone: true }),
  notes: text("notes"),
  performedBy: text("performed_by").notNull().default("system"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDelinquencyActionSchema = createInsertSchema(delinquencyActionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDelinquencyAction = z.infer<typeof insertDelinquencyActionSchema>;
export type DelinquencyAction = typeof delinquencyActionsTable.$inferSelect;
