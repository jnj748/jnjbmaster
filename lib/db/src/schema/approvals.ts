import { pgTable, text, serial, integer, boolean, timestamp, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const approvalStatuses = ["pending", "approved", "rejected", "draft", "in_progress"] as const;
export const approvalCategories = ["maintenance", "inspection", "facility", "equipment", "other"] as const;
// [Task #611] 라인이 어떻게 시작됐는지 출처를 보존해 보드/감사용으로 표시한다.
export const approvalTriggerSources = [
  "manual",
  "quote_compare",
  "task_completed",
  "task_planned",
  "work_log_breakdown",
  "daily_journal_breakdown",
  "contract_renewal",
  "facility_breakdown",
  "accountant_renewal_review",
] as const;

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
  // [Task #611] 라인 컨텍스트 — 어느 건물의 어떤 사유로, 어디서 시작됐는지.
  buildingId: integer("building_id"),
  triggerSource: text("trigger_source", { enum: approvalTriggerSources }).notNull().default("manual"),
  // 견적/RFQ/계약/업무기록 등 원본 객체로의 역링크 (출처 카드).
  sourceEntityType: text("source_entity_type"),
  sourceEntityId: integer("source_entity_id"),
  // [Task #611] 긴급집행(사후결재) 표식 + 관리소장이 작성한 유선 동의 메모.
  //   urgentExecution = true 인 라인은 서명 단계가 비어 있어도 즉시 지출결의서·
  //   입금요청서를 발행하고, "서명 기안서 비어 있음" 경고 배지를 모든 화면에 노출한다.
  urgentExecution: boolean("urgent_execution").notNull().default(false),
  urgentConsentMemo: text("urgent_consent_memo"),
  urgentTaskId: integer("urgent_task_id"),
  // [Task #611] 결재선 스냅샷 — 임계 금액·본부장 배정이 사후에 바뀌어도 진행 중인
  //   라인의 라우팅은 변하지 않게 결정 시점의 값을 박제한다.
  hqThresholdSnapshot: real("hq_threshold_snapshot"),
  hqApproverId: integer("hq_approver_id"),
  custodianApproverId: integer("custodian_approver_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertApprovalSchema = createInsertSchema(approvalsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertApproval = z.infer<typeof insertApprovalSchema>;
export type Approval = typeof approvalsTable.$inferSelect;
