import { pgTable, text, serial, integer, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { unitsTable } from "./units";

export const tenantsTable = pgTable("tenants", {
  id: serial("id").primaryKey(),
  unitId: integer("unit_id").references(() => unitsTable.id),
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
  guarantorResidentId: text("guarantor_resident_id"),
  status: text("status").notNull().default("active"),
  privacyConsentDate: timestamp("privacy_consent_date", { withTimezone: true }),
  contractDoc: boolean("contract_doc").notNull().default(false),
  businessRegDoc: boolean("business_reg_doc").notNull().default(false),
  idDoc: boolean("id_doc").notNull().default(false),
  contractDocUrl: text("contract_doc_url"),
  businessRegDocUrl: text("business_reg_doc_url"),
  idDocUrl: text("id_doc_url"),
  vehicleRegDocUrl: text("vehicle_reg_doc_url"),
  feeObligationConsent: boolean("fee_obligation_consent").notNull().default(false),
  penaltyConsent: boolean("penalty_consent").notNull().default(false),
  specialFundConsent: boolean("special_fund_consent").notNull().default(false),
  privacyRetentionConsent: boolean("privacy_retention_consent").notNull().default(false),
  guaranteeConsent: boolean("guarantee_consent").notNull().default(false),
  signatureName: text("signature_name"),
  signatureDate: timestamp("signature_date", { withTimezone: true }),
  billingStartDate: date("billing_start_date"),
  verificationStatus: text("verification_status").notNull().default("unverified"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedBy: text("verified_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  dataDestructionDate: date("data_destruction_date"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTenantSchema = createInsertSchema(tenantsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenantsTable.$inferSelect;
