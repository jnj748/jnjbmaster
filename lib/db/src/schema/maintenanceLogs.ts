import { pgTable, text, serial, integer, timestamp, date, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const maintenanceLogsTable = pgTable("maintenance_logs", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  workDate: date("work_date").notNull(),
  worker: text("worker").notNull(),
  status: text("status").notNull().default("completed"),
  reportSent: boolean("report_sent").notNull().default(false),
  reportSentAt: timestamp("report_sent_at", { withTimezone: true }),
  notes: text("notes"),
  sourceType: text("source_type"),
  checklistItemId: integer("checklist_item_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMaintenanceLogSchema = createInsertSchema(maintenanceLogsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMaintenanceLog = z.infer<typeof insertMaintenanceLogSchema>;
export type MaintenanceLog = typeof maintenanceLogsTable.$inferSelect;
