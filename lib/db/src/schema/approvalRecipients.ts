import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const recipientTypes = ["recipient", "cc"] as const;

export const approvalRecipientsTable = pgTable("approval_recipients", {
  id: serial("id").primaryKey(),
  approvalId: integer("approval_id").notNull(),
  userId: integer("user_id").notNull(),
  userName: text("user_name").notNull(),
  type: text("type", { enum: recipientTypes }).notNull().default("recipient"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertApprovalRecipientSchema = createInsertSchema(approvalRecipientsTable).omit({ id: true, createdAt: true });
export type InsertApprovalRecipient = z.infer<typeof insertApprovalRecipientSchema>;
export type ApprovalRecipient = typeof approvalRecipientsTable.$inferSelect;
