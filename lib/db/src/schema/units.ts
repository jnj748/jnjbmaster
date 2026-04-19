import { pgTable, text, serial, integer, numeric, timestamp, unique, boolean, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { buildingsTable } from "./buildings";

export const unitsTable = pgTable("units", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id),
  unitNumber: text("unit_number").notNull(),
  floor: text("floor").notNull(),
  exclusiveArea: numeric("exclusive_area"),
  commonArea: numeric("common_area"),
  usage: text("usage"),
  notes: text("notes"),
  status: text("status").notNull().default("vacant"),
  ownerName: text("owner_name"),
  ownerPhone: text("owner_phone"),
  residentName: text("resident_name"),
  residentPhone: text("resident_phone"),
  supplyArea: numeric("supply_area").default("0"),
  entryDate: date("entry_date"),
  buildingSection: text("building_section"),
  apiGenerated: boolean("api_generated").notNull().default(false),
  occupancyStatus: text("occupancy_status").notNull().default("미등록"),
  businessNumber: text("business_number"),
  hasOnboardingCard: boolean("has_onboarding_card").notNull().default(false),
  onboardingSignedAt: timestamp("onboarding_signed_at", { withTimezone: true }),
  delinquentMonths: integer("delinquent_months").notNull().default(0),
  delinquentAmount: integer("delinquent_amount").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  unique("units_building_unit_number").on(table.buildingId, table.unitNumber),
]);

export const insertUnitSchema = createInsertSchema(unitsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUnit = z.infer<typeof insertUnitSchema>;
export type Unit = typeof unitsTable.$inferSelect;
