import { pgTable, text, serial, integer, numeric, timestamp, boolean, date } from "drizzle-orm/pg-core";
import { buildingsTable } from "./buildings";
import { unitsTable } from "./units";

export const meterReadingsTable = pgTable("meter_readings", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id),
  unitId: integer("unit_id").references(() => unitsTable.id),
  unitNumber: text("unit_number").notNull(),
  meterType: text("meter_type", { enum: ["water", "electricity", "gas", "heating"] }).notNull(),
  readingDate: date("reading_date").notNull(),
  previousReading: numeric("previous_reading"),
  currentReading: numeric("current_reading").notNull(),
  usage: numeric("usage"),
  isAnomaly: boolean("is_anomaly").notNull().default(false),
  anomalyNote: text("anomaly_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
