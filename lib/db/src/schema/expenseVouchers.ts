import { pgTable, text, serial, integer, real, timestamp, boolean, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// [Task #611] 지출결의서 — 결재 라인 최종 승인(또는 긴급집행 표시) 시 자동 발행되어
//   경리(accountant) 받은함으로 라우팅된다. 원본 기안서와 1:1 로 연결되며 같은
//   컨텍스트(건물·사유·업체·금액·근거 출처)를 보유한다. 경리는 항목을 열어
//   출납기록(지급일·지급방식·계좌/메모·증빙)을 입력하고 "출납등록 완료"로 전환한다.
export const expenseVoucherStatuses = [
  "pending", // 발행 직후 — 경리가 출납등록 대기
  "recorded", // 경리가 출납기록 입력 완료
  "void", // 라인 반려/취소
] as const;

export const expenseVouchersTable = pgTable(
  "expense_vouchers",
  {
    id: serial("id").primaryKey(),
    approvalId: integer("approval_id").notNull(),
    buildingId: integer("building_id"),
    title: text("title").notNull(),
    description: text("description"),
    vendorName: text("vendor_name"),
    amount: real("amount").notNull(),
    status: text("status", { enum: expenseVoucherStatuses }).notNull().default("pending"),
    // 긴급집행으로 사후결재 대기 중인 경우 true → 화면에 "서명 기안서 비어 있음" 배지 노출.
    awaitingPostApproval: boolean("awaiting_post_approval").notNull().default(false),
    // 경리 출납기록 (간단한 메타). 더 본격적인 cashbook 이 필요해지면 별도 테이블로 분리.
    paidAt: date("paid_at"),
    paymentMethod: text("payment_method"),
    accountMemo: text("account_memo"),
    receiptFileUrl: text("receipt_file_url"),
    recordedByUserId: integer("recorded_by_user_id"),
    recordedByName: text("recorded_by_name"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    byApproval: index("expense_vouchers_approval_idx").on(t.approvalId),
    byBuilding: index("expense_vouchers_building_idx").on(t.buildingId),
  }),
);

export const insertExpenseVoucherSchema = createInsertSchema(expenseVouchersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertExpenseVoucher = z.infer<typeof insertExpenseVoucherSchema>;
export type ExpenseVoucher = typeof expenseVouchersTable.$inferSelect;
