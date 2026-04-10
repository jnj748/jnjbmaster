import { pgTable, text, serial, timestamp, integer, boolean, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const taxDeadlineChecklistsTable = pgTable("tax_deadline_checklists", {
  id: serial("id").primaryKey(),
  taxScheduleId: integer("tax_schedule_id").notNull(),
  itemName: text("item_name").notNull(),
  description: text("description"),
  isCompleted: boolean("is_completed").notNull().default(false),
  completedBy: integer("completed_by"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  dueDate: date("due_date").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTaxDeadlineChecklistSchema = createInsertSchema(taxDeadlineChecklistsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTaxDeadlineChecklist = z.infer<typeof insertTaxDeadlineChecklistSchema>;
export type TaxDeadlineChecklist = typeof taxDeadlineChecklistsTable.$inferSelect;
