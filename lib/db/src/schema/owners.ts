import { pgTable, text, serial, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ownersTable = pgTable("owners", {
  id: serial("id").primaryKey(),
  unit: text("unit").notNull(),
  ownerName: text("owner_name").notNull(),
  birthDate: date("birth_date"),
  phone: text("phone"),
  interiorStartDate: date("interior_start_date"),
  moveInDate: date("move_in_date"),
  moveOutDate: date("move_out_date"),
  companyName: text("company_name"),
  businessNumber: text("business_number"),
  email: text("email"),
  registeredAddress: text("registered_address"),
  vehicleNumber: text("vehicle_number"),
  vehicleType: text("vehicle_type"),
  hasTv: boolean("has_tv").notNull().default(false),
  notes: text("notes"),
  status: text("status").notNull().default("active"),
  privacyConsentDate: timestamp("privacy_consent_date", { withTimezone: true }),
  businessRegDoc: boolean("business_reg_doc").notNull().default(false),
  idDoc: boolean("id_doc").notNull().default(false),
  propertyDoc: boolean("property_doc").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOwnerSchema = createInsertSchema(ownersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOwner = z.infer<typeof insertOwnerSchema>;
export type Owner = typeof ownersTable.$inferSelect;
