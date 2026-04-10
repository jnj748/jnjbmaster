import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const templateCategories = ["general", "certificate", "absence", "salary", "maintenance"] as const;

export const documentTemplatesTable = pgTable("document_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category", { enum: templateCategories }).notNull().default("general"),
  description: text("description"),
  fields: text("fields").notNull(),
  bodyTemplate: text("body_template").notNull(),
  isSystem: boolean("is_system").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDocumentTemplateSchema = createInsertSchema(documentTemplatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocumentTemplate = z.infer<typeof insertDocumentTemplateSchema>;
export type DocumentTemplate = typeof documentTemplatesTable.$inferSelect;
