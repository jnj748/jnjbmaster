import { pgTable, text, serial, integer, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const approvalStatuses = ["pending", "approved", "rejected", "draft", "in_progress"] as const;
export const approvalCategories = ["maintenance", "inspection", "facility", "equipment", "other"] as const;

export const approvalsTable = pgTable("approvals", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull().default("other"),
  status: text("status", { enum: approvalStatuses }).notNull().default("pending"),
  isDraft: boolean("is_draft").notNull().default(false),
  templateId: integer("template_id"),
  currentStep: integer("current_step").notNull().default(1),
  totalSteps: integer("total_steps").notNull().default(1),
  requesterId: integer("requester_id").notNull(),
  requesterName: text("requester_name").notNull(),
  approverId: integer("approver_id"),
  approverName: text("approver_name"),
  estimatedAmount: real("estimated_amount"),
  vendorName: text("vendor_name"),
  vendorQuoteDetails: text("vendor_quote_details"),
  relatedDraftId: integer("related_draft_id"),
  relatedInspectionId: integer("related_inspection_id"),
  rejectionReason: text("rejection_reason"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertApprovalSchema = createInsertSchema(approvalsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertApproval = z.infer<typeof insertApprovalSchema>;
export type Approval = typeof approvalsTable.$inferSelect;
