import { pgTable, text, serial, integer, date, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const legalAppointeesTable = pgTable("legal_appointees", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull(),
  field: text("field").notNull(),
  name: text("name").notNull(),
  certificateNo: text("certificate_no"),
  certificateExpiry: date("certificate_expiry"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  buildingFieldUnique: uniqueIndex("legal_appointees_building_field_unique").on(t.buildingId, t.field),
}));

export const insertLegalAppointeeSchema = createInsertSchema(legalAppointeesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLegalAppointee = z.infer<typeof insertLegalAppointeeSchema>;
export type LegalAppointee = typeof legalAppointeesTable.$inferSelect;
