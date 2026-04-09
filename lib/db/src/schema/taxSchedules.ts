import { pgTable, text, serial, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const taxSchedulesTable = pgTable("tax_schedules", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  scheduleType: text("schedule_type").notNull(),
  dueDate: date("due_date").notNull(),
  recurrence: text("recurrence").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTaxScheduleSchema = createInsertSchema(taxSchedulesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTaxSchedule = z.infer<typeof insertTaxScheduleSchema>;
export type TaxSchedule = typeof taxSchedulesTable.$inferSelect;
