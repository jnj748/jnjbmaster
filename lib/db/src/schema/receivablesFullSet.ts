// [Task #800] 수납·미납 관리 풀세트 — 5종 테이블.
//
// 기존 bills/bill_payments/bank_transactions/delinquency_stages 위에서 동작하며,
// 본 풀세트는 "월말 미납 스냅샷·독촉장 발송 대장·통장 비교(이의) 대장·자동이체 결과"
// 처럼 운영 과정에서 생기는 "스냅샷·결과 행"을 보존한다.
//
// 1) receivable_overdue_snapshots : 월말/임의 시점의 호실별 미납 스냅샷.
// 2) dunning_letters              : 독촉장 1건(차수·본문·발송 채널/결과).
// 3) payment_receipts             : 영수증(개별 수납 1건당 1행, PDF/SMS/이메일 발송 이력).
// 4) bank_reconciliations         : 통장 이의/차이 대장 (입금-고지 차액 분류).
// 5) auto_debit_results           : 자동이체 의뢰 결과(성공/실패 사유, 재시도 이력).

import {
  pgTable, text, serial, integer, real, boolean, timestamp, jsonb, unique, date,
} from "drizzle-orm/pg-core";
import { buildingsTable } from "./buildings";
import { unitsTable } from "./units";
import { usersTable } from "./users";
import { billsTable, billPaymentsTable, bankTransactionsTable } from "./billsLedger";

// ── 1. 미납 스냅샷 ─────────────────────────────────────────────
// 동일 (building, snapshotDate, unit, billingMonth) 조합 1행. 월말 / 수동 캡처 모두 보존.
export const receivableOverdueSnapshotsTable = pgTable("receivable_overdue_snapshots", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
  snapshotDate: date("snapshot_date").notNull(),
  // 어떤 부과월에 대한 스냅샷인지 (호실별 합산도 가능 — billingMonth NULL = 호실 합계).
  billingMonth: text("billing_month"),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id, { onDelete: "cascade" }),
  unitNumber: text("unit_number").notNull(),
  billId: integer("bill_id").references(() => billsTable.id, { onDelete: "set null" }),
  totalAmount: real("total_amount").notNull().default(0),
  paidAmount: real("paid_amount").notNull().default(0),
  remainingAmount: real("remaining_amount").notNull().default(0),
  overdueDays: integer("overdue_days").notNull().default(0),
  agingBucket: text("aging_bucket", {
    enum: ["d0_30", "d31_60", "d61_90", "d91_plus"],
  }).notNull().default("d0_30"),
  lateFeeAmount: real("late_fee_amount").notNull().default(0),
  // AI 메모 — "OO호 3개월 누적 90만원" 같은 한 줄 요약.
  aiSummary: text("ai_summary"),
  capturedById: integer("captured_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("recv_overdue_snap_uniq").on(t.buildingId, t.snapshotDate, t.unitId, t.billingMonth),
]);

// ── 2. 독촉장 ────────────────────────────────────────────────
// 차수(stage): 1 = 1차 안내, 2 = 2차 독촉, 3 = 최종 / 소장면담.
// 발송 채널은 dispatch_jobs(T10) 와 별개로 "어떤 본문이 누구에게 어떤 차수로 나갔는가"
// 의 사용자 측 대장. send 결과는 dispatchJobId 로 추적.
export const dunningLettersTable = pgTable("dunning_letters", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id, { onDelete: "cascade" }),
  unitNumber: text("unit_number").notNull(),
  billId: integer("bill_id").references(() => billsTable.id, { onDelete: "set null" }),
  // 묶음 발송 식별자(같은 batchId = 한 번에 일괄 생성된 독촉장 묶음).
  batchId: text("batch_id"),
  stage: integer("stage").notNull().default(1), // 1/2/3
  overdueAmount: real("overdue_amount").notNull().default(0),
  lateFeeAmount: real("late_fee_amount").notNull().default(0),
  recipientName: text("recipient_name"),
  recipientContact: text("recipient_contact"), // 휴대폰 또는 이메일
  channel: text("channel", {
    enum: ["post", "sms", "kakao", "email"],
  }).notNull().default("post"),
  // AI 가 생성한 본문(없으면 템플릿). 미리보기·재발송 시 이 컬럼만 다시 렌더.
  bodyText: text("body_text").notNull(),
  status: text("status", {
    enum: ["draft", "queued", "sent", "delivered", "failed", "cancelled"],
  }).notNull().default("draft"),
  dispatchJobId: integer("dispatch_job_id"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  createdById: integer("created_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ── 3. 영수증 ────────────────────────────────────────────────
// bill_payment 1건당 1행. 출력/SMS/이메일 발송 이력을 별도 보관.
export const paymentReceiptsTable = pgTable("payment_receipts", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
  paymentId: integer("payment_id").notNull().references(() => billPaymentsTable.id, { onDelete: "cascade" }),
  billId: integer("bill_id").references(() => billsTable.id, { onDelete: "set null" }),
  unitId: integer("unit_id").references(() => unitsTable.id, { onDelete: "set null" }),
  receiptNo: text("receipt_no").notNull(),
  amount: real("amount").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  channel: text("channel", {
    enum: ["print", "sms", "kakao", "email"],
  }).notNull().default("print"),
  recipient: text("recipient"),
  status: text("status", {
    enum: ["issued", "delivered", "failed", "void"],
  }).notNull().default("issued"),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidReason: text("void_reason"),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  issuedById: integer("issued_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("payment_receipts_no").on(t.buildingId, t.receiptNo),
]);

// ── 4. 통장 이의 / 차이 대장 ──────────────────────────────────
// bank_transactions 매칭 후 잔여 차액·이의·환불 등을 분류해서 누적.
export const bankReconciliationsTable = pgTable("bank_reconciliations", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
  bankTxId: integer("bank_tx_id").references(() => bankTransactionsTable.id, { onDelete: "set null" }),
  billId: integer("bill_id").references(() => billsTable.id, { onDelete: "set null" }),
  unitId: integer("unit_id").references(() => unitsTable.id, { onDelete: "set null" }),
  category: text("category", {
    enum: ["overpaid", "underpaid", "duplicate", "refund_due", "wrong_account", "dispute", "other"],
  }).notNull().default("dispute"),
  amount: real("amount").notNull().default(0), // 차이 금액(±)
  status: text("status", {
    enum: ["open", "investigating", "resolved", "wontfix"],
  }).notNull().default("open"),
  reason: text("reason"),
  resolution: text("resolution"),
  // AI 가 제안한 분류·조치(필요 시 우측 패널에 노출).
  aiSuggestion: text("ai_suggestion"),
  openedById: integer("opened_by_id").references(() => usersTable.id),
  resolvedById: integer("resolved_by_id").references(() => usersTable.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ── 5. 자동이체 결과 ─────────────────────────────────────────
// /billing/auto-debit 에서 의뢰한 건의 결과 행. 같은 (billingMonth, unitId) 의 재시도는
// attempt 컬럼으로 구분. PG 응답코드는 resultCode 로 보존.
export const autoDebitResultsTable = pgTable("auto_debit_results", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
  billingMonth: text("billing_month").notNull(),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id, { onDelete: "cascade" }),
  unitNumber: text("unit_number").notNull(),
  billId: integer("bill_id").references(() => billsTable.id, { onDelete: "set null" }),
  // 자동이체 의뢰 ID(외부 PG 또는 은행 — 없으면 NULL).
  requestRef: text("request_ref"),
  bankCode: text("bank_code"),
  accountMasked: text("account_masked"),
  amount: real("amount").notNull().default(0),
  attempt: integer("attempt").notNull().default(1),
  status: text("status", {
    enum: ["queued", "requested", "success", "failed", "cancelled"],
  }).notNull().default("queued"),
  resultCode: text("result_code"),
  resultMessage: text("result_message"),
  // 실패 시 다음 재시도 예정.
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  // 성공 시 bill_payments 로 자동 기록된 paymentId.
  paymentId: integer("payment_id"),
  requestedAt: timestamp("requested_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("auto_debit_uniq").on(t.buildingId, t.billingMonth, t.unitId, t.attempt),
]);

export type ReceivableOverdueSnapshot = typeof receivableOverdueSnapshotsTable.$inferSelect;
export type InsertReceivableOverdueSnapshot = typeof receivableOverdueSnapshotsTable.$inferInsert;
export type DunningLetter = typeof dunningLettersTable.$inferSelect;
export type InsertDunningLetter = typeof dunningLettersTable.$inferInsert;
export type PaymentReceipt = typeof paymentReceiptsTable.$inferSelect;
export type InsertPaymentReceipt = typeof paymentReceiptsTable.$inferInsert;
export type BankReconciliation = typeof bankReconciliationsTable.$inferSelect;
export type InsertBankReconciliation = typeof bankReconciliationsTable.$inferInsert;
export type AutoDebitResult = typeof autoDebitResultsTable.$inferSelect;
export type InsertAutoDebitResult = typeof autoDebitResultsTable.$inferInsert;
