import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// [Task #707 review fix] 계약서 / 세금계산서는 다중 파일/페이지 첨부가 필요하다
//   (계약 본문 + 별첨 부속서, 세금계산서 PDF + 입금 증빙 등). 결재 본체에 단일
//   contractFileUrl/taxInvoiceFileUrl 컬럼은 첫 번째 파일을 보존하기 위한 백워드
//   호환용으로 유지하고, 추가 파일은 모두 본 자식 테이블에 들어간다.
export const approvalContractFileKinds = ["contract", "tax_invoice"] as const;

export const approvalContractFilesTable = pgTable(
  "approval_contract_files",
  {
    id: serial("id").primaryKey(),
    approvalId: integer("approval_id").notNull(),
    kind: text("kind", { enum: approvalContractFileKinds }).notNull(),
    fileUrl: text("file_url").notNull(),
    fileName: text("file_name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    uploadedById: integer("uploaded_by_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byApproval: index("approval_contract_files_approval_idx").on(t.approvalId),
    byApprovalKind: index("approval_contract_files_approval_kind_idx").on(t.approvalId, t.kind),
  }),
);

export const insertApprovalContractFileSchema = createInsertSchema(approvalContractFilesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertApprovalContractFile = z.infer<typeof insertApprovalContractFileSchema>;
export type ApprovalContractFile = typeof approvalContractFilesTable.$inferSelect;
