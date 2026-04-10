import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const approvalStepStatuses = ["pending", "approved", "rejected", "skipped"] as const;

export const approvalStepsTable = pgTable("approval_steps", {
  id: serial("id").primaryKey(),
  approvalId: integer("approval_id").notNull(),
  stepOrder: integer("step_order").notNull(),
  approverId: integer("approver_id").notNull(),
  approverName: text("approver_name").notNull(),
  approverRole: text("approver_role").notNull(),
  status: text("status", { enum: approvalStepStatuses }).notNull().default("pending"),
  comment: text("comment"),
  signatureId: integer("signature_id"),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertApprovalStepSchema = createInsertSchema(approvalStepsTable).omit({ id: true, createdAt: true });
export type InsertApprovalStep = z.infer<typeof insertApprovalStepSchema>;
export type ApprovalStep = typeof approvalStepsTable.$inferSelect;
