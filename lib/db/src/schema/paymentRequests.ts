import { pgTable, text, serial, integer, real, timestamp, boolean, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// [Task #611] 입금요청서 — 결재 라인 최종 승인(또는 긴급집행 표시) 시 자동 발행되어
//   관리인(custodian) 받은함으로 라우팅된다(관리인 미가입이면 관리소장 화면의
//   "관리인에게 전달" 을 통해 출력/공유). 관리인이 "송금완료 처리" 를 누르면
//   라인이 종결되고, 가능하면 관련 settlements/contracts 의 지급 상태도 동기화한다.
export const paymentRequestStatuses = [
  "pending", // 발행 직후 — 관리인 송금 대기
  "remitted", // 송금완료 처리됨 (라인 종결)
  "void",
] as const;

export const paymentRequestsTable = pgTable(
  "payment_requests",
  {
    id: serial("id").primaryKey(),
    approvalId: integer("approval_id").notNull(),
    expenseVoucherId: integer("expense_voucher_id"),
    buildingId: integer("building_id"),
    title: text("title").notNull(),
    description: text("description"),
    vendorName: text("vendor_name"),
    amount: real("amount").notNull(),
    status: text("status", { enum: paymentRequestStatuses }).notNull().default("pending"),
    awaitingPostApproval: boolean("awaiting_post_approval").notNull().default(false),
    // 관리인 송금완료 메타.
    remittedAt: date("remitted_at"),
    remittanceReceiptUrl: text("remittance_receipt_url"),
    remittedByUserId: integer("remitted_by_user_id"),
    remittedByName: text("remitted_by_name"),
    remittanceMemo: text("remittance_memo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    byApproval: index("payment_requests_approval_idx").on(t.approvalId),
    byBuilding: index("payment_requests_building_idx").on(t.buildingId),
  }),
);

export const insertPaymentRequestSchema = createInsertSchema(paymentRequestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPaymentRequest = z.infer<typeof insertPaymentRequestSchema>;
export type PaymentRequest = typeof paymentRequestsTable.$inferSelect;
