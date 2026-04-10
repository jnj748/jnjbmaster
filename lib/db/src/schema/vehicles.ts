import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";

export const vehiclesTable = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
  unit: text("unit").notNull(),
  tenantRelation: text("tenant_relation"),
  vehicleNumber: text("vehicle_number").notNull(),
  vehicleType: text("vehicle_type"),
  vehicleColor: text("vehicle_color"),
  ownerName: text("owner_name"),
  ownerContact: text("owner_contact"),
  isPrimary: boolean("is_primary").notNull().default(true),
  ownershipType: text("ownership_type").notNull().default("owned"),
  registrationDoc: boolean("registration_doc").notNull().default(false),
  insuranceDoc: boolean("insurance_doc").notNull().default(false),
  leaseDoc: boolean("lease_doc").notNull().default(false),
  status: text("status").notNull().default("registered"),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVehicleSchema = createInsertSchema(vehiclesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehiclesTable.$inferSelect;
