import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const externalDocumentsTable = pgTable("external_documents", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id"),
  title: text("title").notNull(),
  fileUrl: text("file_url").notNull(),
  mimeType: text("mime_type"),
  uploadedBy: integer("uploaded_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertExternalDocumentSchema = createInsertSchema(externalDocumentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertExternalDocument = z.infer<typeof insertExternalDocumentSchema>;
export type ExternalDocument = typeof externalDocumentsTable.$inferSelect;
