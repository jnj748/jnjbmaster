import { pgTable, text, serial, integer, real, boolean, timestamp, json, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { buildingsTable } from "./buildings";

export const monthlyBillSummariesTable = pgTable("monthly_bill_summaries", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").references(() => buildingsTable.id, { onDelete: "cascade" }).notNull(),
  billingMonth: text("billing_month").notNull(),
  totalAmount: real("total_amount").notNull().default(0),
  unitCount: integer("unit_count"),
  dueDate: text("due_date"),
  lineItems: json("line_items").$type<Record<string, number>>().notNull().default({}),
  fieldConfidence: json("field_confidence").$type<Record<string, number>>().notNull().default({}),
  ocrRawText: text("ocr_raw_text"),
  sourceFileUrl: text("source_file_url"),
  sourceFileName: text("source_file_name"),
  confirmed: boolean("confirmed").notNull().default(false),
  uploadedById: integer("uploaded_by_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique().on(t.buildingId, t.billingMonth),
]);

export const insertMonthlyBillSummarySchema = createInsertSchema(monthlyBillSummariesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMonthlyBillSummary = z.infer<typeof insertMonthlyBillSummarySchema>;
export type MonthlyBillSummary = typeof monthlyBillSummariesTable.$inferSelect;
