import { pgTable, text, serial, integer, real, timestamp, date, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const contractStatuses = [
  "draft",
  "in_approval",
  "active",
  "in_progress",
  "completed",
  "terminated",
  "renewal_due",
] as const;

export const contractsTable = pgTable("contracts", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id"),
  buildingName: text("building_name"),
  vendorId: integer("vendor_id").notNull(),
  vendorName: text("vendor_name").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  rfqId: integer("rfq_id"),
  quoteId: integer("quote_id"),
  approvalId: integer("approval_id"),
  contractAmount: real("contract_amount"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  status: text("status", { enum: contractStatuses }).notNull().default("draft"),
  isRecurring: boolean("is_recurring").notNull().default(false),
  notes: text("notes"),
  renewalAlertSent: timestamp("renewal_alert_sent", { withTimezone: true }),
  partnerAgreedAt: timestamp("partner_agreed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertContractSchema = createInsertSchema(contractsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertContract = z.infer<typeof insertContractSchema>;
export type Contract = typeof contractsTable.$inferSelect;

export const contractDocumentTypes = [
  "contract",
  "business_registration",
  "id_card",
  "insurance",
  "tax_invoice",
  "other",
] as const;

export const contractDocumentsTable = pgTable("contract_documents", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull(),
  docType: text("doc_type", { enum: contractDocumentTypes }).notNull().default("other"),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  version: integer("version").notNull().default(1),
  uploadedBy: integer("uploaded_by"),
  uploadedByName: text("uploaded_by_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertContractDocumentSchema = createInsertSchema(contractDocumentsTable).omit({ id: true, createdAt: true });
export type InsertContractDocument = z.infer<typeof insertContractDocumentSchema>;
export type ContractDocument = typeof contractDocumentsTable.$inferSelect;
