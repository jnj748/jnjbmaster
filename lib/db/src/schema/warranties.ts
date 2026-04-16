import { pgTable, text, serial, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const warrantyPresetsTable = pgTable("warranty_presets", {
  id: serial("id").primaryKey(),
  tradeCategory: text("trade_category").notNull(),
  tradeName: text("trade_name").notNull(),
  warrantyYears: integer("warranty_years").notNull(),
  description: text("description"),
  legalBasis: text("legal_basis"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWarrantyPresetSchema = createInsertSchema(warrantyPresetsTable).omit({ id: true, createdAt: true });
export type InsertWarrantyPreset = z.infer<typeof insertWarrantyPresetSchema>;
export type WarrantyPreset = typeof warrantyPresetsTable.$inferSelect;

export const buildingWarrantiesTable = pgTable("building_warranties", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull(),
  presetId: integer("preset_id"),
  tradeCategory: text("trade_category").notNull(),
  tradeName: text("trade_name").notNull(),
  warrantyYears: integer("warranty_years").notNull(),
  startDate: date("start_date").notNull(),
  expiryDate: date("expiry_date").notNull(),
  status: text("status").notNull().default("active"),
  contractorName: text("contractor_name"),
  notes: text("notes"),
  alertSent60: timestamp("alert_sent_60", { withTimezone: true }),
  alertSent30: timestamp("alert_sent_30", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBuildingWarrantySchema = createInsertSchema(buildingWarrantiesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBuildingWarranty = z.infer<typeof insertBuildingWarrantySchema>;
export type BuildingWarranty = typeof buildingWarrantiesTable.$inferSelect;

export const seasonalMaintenancePresetsTable = pgTable("seasonal_maintenance_presets", {
  id: serial("id").primaryKey(),
  month: integer("month").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  priority: text("priority").notNull().default("normal"),
  rfqCategory: text("rfq_category"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSeasonalMaintenancePresetSchema = createInsertSchema(seasonalMaintenancePresetsTable).omit({ id: true, createdAt: true });
export type InsertSeasonalMaintenancePreset = z.infer<typeof insertSeasonalMaintenancePresetSchema>;
export type SeasonalMaintenancePreset = typeof seasonalMaintenancePresetsTable.$inferSelect;
