import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const signatureTypes = ["text", "image"] as const;

export const digitalSignaturesTable = pgTable("digital_signatures", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  userName: text("user_name").notNull(),
  signatureType: text("signature_type", { enum: signatureTypes }).notNull().default("text"),
  signatureData: text("signature_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDigitalSignatureSchema = createInsertSchema(digitalSignaturesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDigitalSignature = z.infer<typeof insertDigitalSignatureSchema>;
export type DigitalSignature = typeof digitalSignaturesTable.$inferSelect;
