// [Task #779] T8 고지·수납엔진 v01 — bills/bill_items/payments/bank_transactions/delinquency_stages.
//
// 핵심 모델:
//   - bills:                고지서(호실 × 월 1행). billing_run/line 으로부터 자동 생성.
//   - bill_items:           고지서 항목 라인(공용관리/검침/수선적립/분할/조정/기타).
//   - bill_payments:        수납 기록(전액/부분/가수금 포함). bill_id NULL = 가수금.
//   - bank_transactions:    통장 내역 업로드 후 매칭 큐. matched_bill_id 가 채워지면 매칭 완료.
//   - delinquency_stages:   고지서별 연체 단계(1차/2차/소장면담). dispatch.send 호출 이력 보존.
//
// 본 ledger 는 monthly_payments 의 후속 — 부과(T7) 확정 → 고지서 발행 → 수납.
// 마감엔진(T9) 잠금 후엔 bills.status='closed' 로 잠가 수정 차단.

import {
  pgTable, text, serial, integer, real, boolean, timestamp, jsonb, unique, date,
} from "drizzle-orm/pg-core";
import { buildingsTable } from "./buildings";
import { unitsTable } from "./units";
import { usersTable } from "./users";
import { billingRunsTable } from "./billingEngine";

// ── 1. 고지서 ────────────────────────────────────────────────
// 호실 × 월 1행. status 흐름: issued → partial → paid | overdue | closed.
// virtual_account: 가상계좌 메타(실 발급은 T10) — { bank, account, holder }.
export const billsTable = pgTable("bills", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id, { onDelete: "cascade" }),
  unitNumber: text("unit_number").notNull(),
  billingMonth: text("billing_month").notNull(), // 'YYYY-MM'
  runId: integer("run_id").references(() => billingRunsTable.id, { onDelete: "set null" }),
  totalAmount: real("total_amount").notNull().default(0),
  paidAmount: real("paid_amount").notNull().default(0),
  dueDate: date("due_date").notNull(),
  status: text("status", {
    enum: ["issued", "partial", "paid", "overdue", "closed", "void"],
  }).notNull().default("issued"),
  // 입주민 납부 링크용 토큰. 토큰 알면 비인증으로 조회·납부수단 선택 가능.
  publicToken: text("public_token").notNull().unique(),
  virtualAccount: jsonb("virtual_account").$type<{ bank: string; account: string; holder: string } | null>(),
  // AI 생성 본문(단지공지/체납안내 톤). null 이면 미생성.
  aiBodyText: text("ai_body_text"),
  notes: text("notes"),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("bills_unit_month").on(t.unitId, t.billingMonth),
]);

// ── 2. 고지서 항목 라인 ──────────────────────────────────────
// 카테고리: common(공용관리) / meter(검침) / repair(수선적립) / installment(분할) / adjustment / other.
export const billItemsTable = pgTable("bill_items", {
  id: serial("id").primaryKey(),
  billId: integer("bill_id").notNull().references(() => billsTable.id, { onDelete: "cascade" }),
  category: text("category", {
    enum: ["common", "meter", "repair", "installment", "adjustment", "other"],
  }).notNull(),
  label: text("label").notNull(),
  amount: real("amount").notNull().default(0),
  meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── 3. 수납 기록 ─────────────────────────────────────────────
// channel: virtual_account(가상계좌) / transfer(계좌이체) / card(PG·T10) / cash / suspense.
// suspense 는 호실 미상 가수금. matched_bill_id 가 NULL 이면 미배분.
export const billPaymentsTable = pgTable("bill_payments", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
  billId: integer("bill_id").references(() => billsTable.id, { onDelete: "set null" }),
  unitId: integer("unit_id").references(() => unitsTable.id, { onDelete: "set null" }),
  amount: real("amount").notNull(),
  channel: text("channel", {
    enum: ["virtual_account", "transfer", "card", "cash", "suspense"],
  }).notNull().default("transfer"),
  paidAt: timestamp("paid_at", { withTimezone: true }).notNull().defaultNow(),
  bankTxId: integer("bank_tx_id"), // bank_transactions.id (실 매칭된 경우)
  // 부분/전액 — 헤더에서 계산 가능하나 빠른 집계용으로 유지.
  isPartial: boolean("is_partial").notNull().default(false),
  memo: text("memo"),
  recordedById: integer("recorded_by_id").references(() => usersTable.id),
  reversedAt: timestamp("reversed_at", { withTimezone: true }), // 취소된 경우
  reversalReason: text("reversal_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── 4. 통장 내역(매칭 큐) ────────────────────────────────────
// CSV/OCR(T3) 입력 후 적재. 매칭 룰: virtual_account → bill_id, 금액·날짜 일치.
export const bankTransactionsTable = pgTable("bank_transactions", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
  txDate: date("tx_date").notNull(),
  amount: real("amount").notNull(),
  // 입금자명/적요 — 호실 후보 추출에 사용.
  counterpart: text("counterpart"),
  memo: text("memo"),
  // 가상계좌 식별자(있으면 100% 매칭). 형식 자유.
  virtualAccountKey: text("virtual_account_key"),
  matchedBillId: integer("matched_bill_id").references(() => billsTable.id, { onDelete: "set null" }),
  matchedPaymentId: integer("matched_payment_id"), // bill_payments.id
  matchStatus: text("match_status", {
    enum: ["unmatched", "auto", "manual", "suspense", "ignored"],
  }).notNull().default("unmatched"),
  rawData: jsonb("raw_data").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ── 5. 연체 단계 ─────────────────────────────────────────────
// stage: 1=1차안내, 2=2차독촉, 3=소장면담. dispatch_log: T10 발송 호출 이력 누적.
export const delinquencyStagesTable = pgTable("delinquency_stages", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
  billId: integer("bill_id").references(() => billsTable.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id, { onDelete: "cascade" }),
  unitNumber: text("unit_number").notNull(),
  stage: integer("stage").notNull().default(0), // 0=정상, 1=1차, 2=2차, 3=소장면담
  overdueDays: integer("overdue_days").notNull().default(0),
  overdueAmount: real("overdue_amount").notNull().default(0),
  // 자동 계산된 연체이자(부과환경의 연체율 룰 사용). 기본 룰은 월 1.5%.
  lateFeeAmount: real("late_fee_amount").notNull().default(0),
  lastDispatchAt: timestamp("last_dispatch_at", { withTimezone: true }),
  dispatchLog: jsonb("dispatch_log").$type<Array<{
    at: string; stage: number; channel: string; ok: boolean; messageId?: string;
    // [Task #781] T10 외부연동 — enqueue 결과 jobId / 실패 사유 보관.
    jobId?: number; reason?: string;
  }>>().notNull().default([]),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("delinquency_stages_bill").on(t.billId),
]);

export type Bill = typeof billsTable.$inferSelect;
export type InsertBill = typeof billsTable.$inferInsert;
export type BillItem = typeof billItemsTable.$inferSelect;
export type InsertBillItem = typeof billItemsTable.$inferInsert;
export type BillPayment = typeof billPaymentsTable.$inferSelect;
export type InsertBillPayment = typeof billPaymentsTable.$inferInsert;
export type BankTransaction = typeof bankTransactionsTable.$inferSelect;
export type InsertBankTransaction = typeof bankTransactionsTable.$inferInsert;
export type DelinquencyStage = typeof delinquencyStagesTable.$inferSelect;
export type InsertDelinquencyStage = typeof delinquencyStagesTable.$inferInsert;
