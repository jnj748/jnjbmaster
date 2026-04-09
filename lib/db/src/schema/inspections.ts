import { pgTable, text, serial, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const inspectionsTable = pgTable("inspections", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  frequencyPerYear: integer("frequency_per_year").notNull(),
  lastInspectionDate: date("last_inspection_date"),
  nextDueDate: date("next_due_date").notNull(),
  status: text("status").notNull().default("upcoming"),
  notes: text("notes"),
  advanceAlertDays: integer("advance_alert_days").notNull().default(30),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInspectionSchema = createInsertSchema(inspectionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInspection = z.infer<typeof insertInspectionSchema>;
export type Inspection = typeof inspectionsTable.$inferSelect;
