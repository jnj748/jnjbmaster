import { pgTable, text, serial, integer, boolean, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const documentChecklistsTable = pgTable("document_checklists", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  documentName: text("document_name").notNull(),
  isSubmitted: boolean("is_submitted").notNull().default(false),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("doc_checklist_entity_doc_idx").on(table.entityType, table.entityId, table.documentName),
]);

export const insertDocumentChecklistSchema = createInsertSchema(documentChecklistsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocumentChecklist = z.infer<typeof insertDocumentChecklistSchema>;
export type DocumentChecklist = typeof documentChecklistsTable.$inferSelect;
