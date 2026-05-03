import { pgTable, text, serial, integer, boolean, timestamp, real, date } from "drizzle-orm/pg-core";
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
  // [Task #707 review fix] 긴급집행 라인은 두 개의 사후업무를 만든다 — 본부장/관리인
  //   서명본 첨부(=urgentTaskId, 오프라인 단계 마감 시 자동 종결) 와 계약·증빙
  //   사후등록(=urgentEvidenceTaskId, register-contract-evidence 호출 시 종결).
  urgentEvidenceTaskId: integer("urgent_evidence_task_id"),
  // [Task #611] 결재선 스냅샷 — 임계 금액·본부장 배정이 사후에 바뀌어도 진행 중인
  //   라인의 라우팅은 변하지 않게 결정 시점의 값을 박제한다.
  hqThresholdSnapshot: real("hq_threshold_snapshot"),
  hqApproverId: integer("hq_approver_id"),
  custodianApproverId: integer("custodian_approver_id"),
  // [Task #707] 결재 최종 승인 후 "계약·증빙 등록 대기" 상태.
  //   true 인 동안은 지출결의서·입금요청서가 발행되지 않는다(긴급집행 예외).
  //   계약·증빙 등록이 완료되면 false 로 내려가고 발행이 트리거된다.
  awaitingContractEvidence: boolean("awaiting_contract_evidence").notNull().default(false),
  contractEvidenceRegisteredAt: timestamp("contract_evidence_registered_at", { withTimezone: true }),
  contractEvidenceRegisteredById: integer("contract_evidence_registered_by_id"),
  contractEvidenceRegisteredByName: text("contract_evidence_registered_by_name"),
  // 계약서 / 세금계산서 첨부.
  contractFileUrl: text("contract_file_url"),
  contractFileName: text("contract_file_name"),
  taxInvoiceFileUrl: text("tax_invoice_file_url"),
  taxInvoiceFileName: text("tax_invoice_file_name"),
  // 세금계산서 추후 첨부 옵션 + 사유 메모.
  taxInvoicePending: boolean("tax_invoice_pending").notNull().default(false),
  taxInvoicePendingReason: text("tax_invoice_pending_reason"),
  // 계약 기간.
  contractStartDate: date("contract_start_date"),
  contractEndDate: date("contract_end_date"),
  // [Task #707] 분리부과 스케줄 — 부속명세서 자리표시. 1월에 1년치 1,200만원으로
  //   결재된 보험료가 매월 100만원씩 분리부과될 때 그 달의 100만원이 어떤 지출결의서
  //   로부터 어떤 기간/방식으로 분리부과되는지를 설명할 근거를 보관한다. 본 태스크
  //   범위에선 컬럼·표시까지만 하고, 부속명세서 자체의 발행/관리는 후속 작업에서 다룬다.
  // [용어 주의] 본 컬럼은 "분납(installment)" 이 아니라 "분리부과(split allocation)"
  //   에 해당한다. 컬럼 식별자의 `installment` 접두사는 레거시 명칭이며, 의미상으로는
  //   분리부과 스케줄을 보관한다 (replit.md 의 "부속명세서" 섹션 참조).
  installmentTotalAmount: real("installment_total_amount"),
  installmentMonths: integer("installment_months"),
  installmentMonthlyAmount: real("installment_monthly_amount"),
  installmentStartDate: date("installment_start_date"),
  installmentEndDate: date("installment_end_date"),
  // [Task #775] 정기지출 라인 표식 — issueDownstreamDocuments 가 voucher 로 그대로 전파.
  isRecurring: boolean("is_recurring").notNull().default(false),
  recurrenceCycle: text("recurrence_cycle"),
  parentApprovalId: integer("parent_approval_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertApprovalSchema = createInsertSchema(approvalsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertApproval = z.infer<typeof insertApprovalSchema>;
export type Approval = typeof approvalsTable.$inferSelect;
