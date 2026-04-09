import { pgTable, text, serial, integer, timestamp, date, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const safetyChecklistsTable = pgTable("safety_checklists", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  inspectionDate: date("inspection_date").notNull(),
  inspector: text("inspector").notNull(),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSafetyChecklistSchema = createInsertSchema(safetyChecklistsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSafetyChecklist = z.infer<typeof insertSafetyChecklistSchema>;
export type SafetyChecklist = typeof safetyChecklistsTable.$inferSelect;

export const safetyChecklistItemsTable = pgTable("safety_checklist_items", {
  id: serial("id").primaryKey(),
  checklistId: integer("checklist_id").notNull(),
  itemName: text("item_name").notNull(),
  checked: boolean("checked").notNull().default(false),
  result: text("result"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSafetyChecklistItemSchema = createInsertSchema(safetyChecklistItemsTable).omit({ id: true, createdAt: true });
export type InsertSafetyChecklistItem = z.infer<typeof insertSafetyChecklistItemSchema>;
export type SafetyChecklistItem = typeof safetyChecklistItemsTable.$inferSelect;
