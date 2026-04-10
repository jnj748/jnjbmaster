import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { vehiclesTable } from "./vehicles";

export const vehicleHistoryTable = pgTable("vehicle_history", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").references(() => vehiclesTable.id, { onDelete: "cascade" }).notNull(),
  action: text("action").notNull(),
  vehicleNumber: text("vehicle_number").notNull(),
  unit: text("unit").notNull(),
  performedBy: text("performed_by").notNull().default("system"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVehicleHistorySchema = createInsertSchema(vehicleHistoryTable).omit({ id: true, createdAt: true });
export type InsertVehicleHistory = z.infer<typeof insertVehicleHistorySchema>;
export type VehicleHistory = typeof vehicleHistoryTable.$inferSelect;
