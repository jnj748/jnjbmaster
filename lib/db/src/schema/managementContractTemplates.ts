import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { buildingsTable } from "./buildings";

export const managementContractTemplatesTable = pgTable("management_contract_templates", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").references(() => buildingsTable.id).notNull(),
  feeObligationClause: text("fee_obligation_clause").notNull(),
  penaltyClause: text("penalty_clause").notNull(),
  specialFundClause: text("special_fund_clause").notNull(),
  privacyRetentionClause: text("privacy_retention_clause").notNull(),
  additionalClauses: jsonb("additional_clauses"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertManagementContractTemplateSchema = createInsertSchema(managementContractTemplatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertManagementContractTemplate = z.infer<typeof insertManagementContractTemplateSchema>;
export type ManagementContractTemplate = typeof managementContractTemplatesTable.$inferSelect;
