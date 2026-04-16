import { pgTable, text, serial, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const inspectionsTable = pgTable("inspections", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id"),
  name: text("name").notNull(),
  category: text("category").notNull(),
  inspectionType: text("inspection_type").notNull().default("legal"),
  frequencyPerYear: integer("frequency_per_year").notNull(),
  legalCycleMonths: integer("legal_cycle_months"),
  intervalDays: integer("interval_days"),
  fixedDay: integer("fixed_day"),
  recommendedMonths: text("recommended_months"),
  lastInspectionDate: date("last_inspection_date"),
  nextDueDate: date("next_due_date").notNull(),
  status: text("status").notNull().default("upcoming"),
  notes: text("notes"),
  legalBasis: text("legal_basis"),
  advanceAlertDays: integer("advance_alert_days").notNull().default(30),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInspectionSchema = createInsertSchema(inspectionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInspection = z.infer<typeof insertInspectionSchema>;
export type Inspection = typeof inspectionsTable.$inferSelect;

export const legalInspectionPresetsTable = pgTable("legal_inspection_presets", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  inspectionType: text("inspection_type").notNull().default("legal"),
  legalCycleMonths: integer("legal_cycle_months").notNull(),
  defaultAlertDays: integer("default_alert_days").notNull().default(30),
  description: text("description"),
  legalBasis: text("legal_basis"),
  recommendedMonths: text("recommended_months"),
  subItems: text("sub_items"),
  seasonalNotes: text("seasonal_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertLegalInspectionPresetSchema = createInsertSchema(legalInspectionPresetsTable).omit({ id: true, createdAt: true });
export type InsertLegalInspectionPreset = z.infer<typeof insertLegalInspectionPresetSchema>;
export type LegalInspectionPreset = typeof legalInspectionPresetsTable.$inferSelect;

export const inspectionLogsTable = pgTable("inspection_logs", {
  id: serial("id").primaryKey(),
  inspectionId: integer("inspection_id").notNull(),
  inspectionDate: date("inspection_date").notNull(),
  result: text("result").notNull(),
  memo: text("memo"),
  inspector: text("inspector"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertInspectionLogSchema = createInsertSchema(inspectionLogsTable).omit({ id: true, createdAt: true });
export type InsertInspectionLog = z.infer<typeof insertInspectionLogSchema>;
export type InspectionLog = typeof inspectionLogsTable.$inferSelect;
