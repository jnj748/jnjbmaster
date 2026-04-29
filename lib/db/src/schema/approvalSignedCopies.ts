import { pgTable, text, serial, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// [Task #611] 결재 단계별 서명본(스캔/사진/전자결재 결과 PDF) 첨부.
//   각 단계마다 다중 페이지를 묶을 수 있고, 잘못 올린 파일은 사유와 함께
//   교체할 수 있다 — 교체 이력도 같은 테이블의 새 row 로 누적된다.
//
//   uploadMethod: 입력 방법(드래그앤드랍/파일선택/카메라/갤러리). 모든 화면이
//   같은 업로더 컴포넌트로 흐르도록 하고, 메타에 어떤 방식으로 들어왔는지 박는다.
export const signedCopyUploadMethods = ["drag_drop", "file_picker", "camera", "gallery"] as const;
export const signedCopyKinds = ["offline_scan", "electronic_pdf"] as const;

export const approvalSignedCopiesTable = pgTable(
  "approval_signed_copies",
  {
    id: serial("id").primaryKey(),
    approvalId: integer("approval_id").notNull(),
    stepId: integer("step_id").notNull(),
    pageNumber: integer("page_number").notNull().default(1),
    fileName: text("file_name").notNull(),
    fileUrl: text("file_url").notNull(),
    mimeType: text("mime_type"),
    fileHash: text("file_hash"),
    uploadMethod: text("upload_method", { enum: signedCopyUploadMethods }).notNull().default("file_picker"),
    kind: text("kind", { enum: signedCopyKinds }).notNull().default("offline_scan"),
    uploadedBy: integer("uploaded_by").notNull(),
    uploadedByName: text("uploaded_by_name").notNull(),
    // 교체된 경우 사유와 직전 첨부 id 를 적어 둔다 (감사 흔적).
    replacedById: integer("replaced_by_id"),
    replaceReason: text("replace_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byStep: index("approval_signed_copies_step_idx").on(t.stepId),
    byApproval: index("approval_signed_copies_approval_idx").on(t.approvalId),
  }),
);

export const insertApprovalSignedCopySchema = createInsertSchema(approvalSignedCopiesTable).omit({ id: true, createdAt: true });
export type InsertApprovalSignedCopy = z.infer<typeof insertApprovalSignedCopySchema>;
export type ApprovalSignedCopy = typeof approvalSignedCopiesTable.$inferSelect;
