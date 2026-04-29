import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const approvalStepStatuses = ["pending", "approved", "rejected", "skipped", "awaiting_offline"] as const;
// [Task #611] 결재 처리 경로. offline = 출력/SNS 전달·도장·서명 후 관리소장이
//   서명본 업로드, electronic = 본인이 시스템에서 직접 처리.
export const approvalStepPaths = ["offline", "electronic"] as const;

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
  // [Task #611] 결재 경로 — 기본은 offline. 본부장/관리인이 가입되어 있으면
  //   electronic 으로 자동 라우팅된다.
  path: text("path", { enum: approvalStepPaths }).notNull().default("offline"),
  // [Task #611] 처리 시점 누적 메타. 결재일 = 도장/서명일.
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  // [Task #611] 서명본 미보관 여부 — 긴급집행 등으로 비어 있는 단계 식별용.
  signedCopyMissing: boolean("signed_copy_missing").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertApprovalStepSchema = createInsertSchema(approvalStepsTable).omit({ id: true, createdAt: true });
export type InsertApprovalStep = z.infer<typeof insertApprovalStepSchema>;
export type ApprovalStep = typeof approvalStepsTable.$inferSelect;
