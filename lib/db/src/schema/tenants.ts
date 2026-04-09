import { pgTable, text, serial, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tenantsTable = pgTable("tenants", {
  id: serial("id").primaryKey(),
  unit: text("unit").notNull(),
  tenantName: text("tenant_name").notNull(),
  residentId: text("resident_id"),
  phone: text("phone"),
  emergencyContact: text("emergency_contact"),
  interiorStartDate: date("interior_start_date"),
  moveInDate: date("move_in_date"),
  moveOutDate: date("move_out_date"),
  email: text("email"),
  companyName: text("company_name"),
  businessNumber: text("business_number"),
  hasTv: boolean("has_tv").notNull().default(false),
  registeredAddress: text("registered_address"),
  notes: text("notes"),
  guarantorName: text("guarantor_name"),
  guarantorPhone: text("guarantor_phone"),
  guarantorRelation: text("guarantor_relation"),
  status: text("status").notNull().default("active"),
  privacyConsentDate: timestamp("privacy_consent_date", { withTimezone: true }),
  contractDoc: boolean("contract_doc").notNull().default(false),
  businessRegDoc: boolean("business_reg_doc").notNull().default(false),
  idDoc: boolean("id_doc").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTenantSchema = createInsertSchema(tenantsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenantsTable.$inferSelect;
