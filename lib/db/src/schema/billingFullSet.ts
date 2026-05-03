// [Task #799] 부과관리 풀세트 — 항목 마스터 / 연체율 / 부과월 / 별도 부과 / 발송 확인.
//
// XpBIZ ERP 부과관리 메뉴를 우리 ERP 흐름으로 통합하기 위해 5종 테이블을 신설.
// 기존 billing_runs / billing_lines / bills / bill_items 와 함께 동작한다.
//
// 1) billing_items            : 부과항목 마스터 (코드/명칭/기준/카테고리)
// 2) billing_late_fee_rates   : 연체율 정책 (기간 × 일수 범위 × 누진)
// 3) billing_months           : 부과월 카드 (생성→부과→마감 단계 + 마감일/출력의뢰)
// 4) billing_extra_charges    : 호실별 일회성 별도 부과 (CSV 붙여넣기)
// 5) notice_deliveries        : 고지서 발송 결과 (이메일/문자/우편/카카오)

import {
  pgTable, text, serial, integer, real, boolean, timestamp, jsonb, unique, date,
} from "drizzle-orm/pg-core";
import { buildingsTable } from "./buildings";
import { unitsTable } from "./units";
import { usersTable } from "./users";
import { billingRunsTable } from "./billingEngine";
import { billsTable } from "./billsLedger";

// ── 1. 부과항목 마스터 ───────────────────────────────────────
// XpBIZ 의 "부과항목등록" 화면 데이터를 1:1 보존. 산출 엔진(T7)은 코드 기반 조회.
//   basis: 'area' | 'unit_count' | 'fixed' | 'meter' | 'usage'
//   category: 'maintenance' | 'heating' | 'gas' | 'meter' | 'separate'
//   parentCode: 상하위 항목 트리 (NULL = 최상위).
export const billingItemsTable = pgTable("billing_items", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
  code: text("code").notNull(),
  name: text("name").notNull(),
  parentCode: text("parent_code"),
  category: text("category", {
    enum: ["maintenance", "heating", "gas", "meter", "separate"],
  }).notNull().default("maintenance"),
  basis: text("basis", {
    enum: ["area", "unit_count", "fixed", "meter", "usage"],
  }).notNull().default("area"),
  // 정액 단가/㎡단가 — basis 가 area / fixed 일 때 사용.
  unitPrice: real("unit_price").notNull().default(0),
  // 누진/일수 계산 / 면제율 — XpBIZ 폼의 토글들을 그대로 보존.
  isProgressive: boolean("is_progressive").notNull().default(false),
  isDailyBased: boolean("is_daily_based").notNull().default(false),
  exemptionRate: real("exemption_rate").notNull().default(0),
  // 부과 제외 신청 가능 (세대가 거부할 수 있는 항목인가).
  optOutAllowed: boolean("opt_out_allowed").notNull().default(false),
  isTaxable: boolean("is_taxable").notNull().default(false),
  // 출력 토글 — 고지서/조정대장 출력 여부.
  printOnNotice: boolean("print_on_notice").notNull().default(true),
  printOnAdjustment: boolean("print_on_adjustment").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(100),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("billing_items_building_code").on(t.buildingId, t.code),
]);

// ── 2. 연체율 정책 ──────────────────────────────────────────
// XpBIZ 의 "연체율등록" 1행. periodStart~periodEnd (YYYY-MM-DD) 사이에 부과되는 고지서에 적용.
//   noticeKind: '관리비' | '난방비' | '가스비' | 'all'
//   tiers: [{ fromDay: 0, toDay: 30, rate: 1.5, isProgressive: false }, ...]
export const billingLateFeeRatesTable = pgTable("billing_late_fee_rates", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
  noticeKind: text("notice_kind").notNull().default("all"),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end"),
  baseRate: real("base_rate").notNull().default(0),
  tiers: jsonb("tiers").$type<Array<{ fromDay: number; toDay: number; rate: number; isProgressive: boolean }>>().notNull().default([]),
  applyCalculation: boolean("apply_calculation").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ── 3. 부과월 카드 ──────────────────────────────────────────
// XpBIZ 의 "부과월생성/마감" 한 행 = 한 부과월. billingRun (run.billingMonth) 과 1:1.
//   stage: 'created' → 'calculated' → 'noticed' → 'closed'
export const billingMonthsTable = pgTable("billing_months", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
  billingMonth: text("billing_month").notNull(), // 'YYYY-MM'
  // 산출 기간 (검침/입력 데이터 범위)
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  dueDate: date("due_date"),
  noticeFormat: text("notice_format").notNull().default("integrated"), // 'a4_separate' | 'integrated'
  stage: text("stage", { enum: ["created", "calculated", "noticed", "closed"] }).notNull().default("created"),
  autoClose: boolean("auto_close").notNull().default(false),
  autoDebitEnabled: boolean("auto_debit_enabled").notNull().default(false),
  printRequestedAt: timestamp("print_requested_at", { withTimezone: true }),
  noticeIssuedAt: timestamp("notice_issued_at", { withTimezone: true }),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedById: integer("closed_by_id").references(() => usersTable.id),
  runId: integer("run_id").references(() => billingRunsTable.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("billing_months_building_month").on(t.buildingId, t.billingMonth),
]);

// ── 4. 별도 금액 등록 ────────────────────────────────────────
// 호실별 일회성 부과(예: 충당금 추가/문서발급 수수료/이사비 등). billingMonth 단위로 묶임.
export const billingExtraChargesTable = pgTable("billing_extra_charges", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id, { onDelete: "cascade" }),
  unitNumber: text("unit_number").notNull(),
  billingMonth: text("billing_month").notNull(),
  itemCode: text("item_code"),
  label: text("label").notNull(),
  amount: real("amount").notNull().default(0),
  appliedToRun: boolean("applied_to_run").notNull().default(false),
  notes: text("notes"),
  createdById: integer("created_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ── 5. 발송 결과 ────────────────────────────────────────────
// 고지서별 채널×시도 단위 한 행. 외부 발송 인프라(T10) 의 dispatch_jobs 와 jobId 로 연결.
export const noticeDeliveriesTable = pgTable("notice_deliveries", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
  billId: integer("bill_id").references(() => billsTable.id, { onDelete: "set null" }),
  unitId: integer("unit_id").references(() => unitsTable.id, { onDelete: "set null" }),
  unitNumber: text("unit_number"),
  billingMonth: text("billing_month").notNull(),
  channel: text("channel", { enum: ["email", "sms", "kakao", "post"] }).notNull(),
  recipient: text("recipient"),
  status: text("status", {
    enum: ["queued", "sent", "delivered", "read", "failed"],
  }).notNull().default("queued"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  readAt: timestamp("read_at", { withTimezone: true }),
  resultCode: text("result_code"),
  errorMessage: text("error_message"),
  retryCount: integer("retry_count").notNull().default(0),
  jobId: integer("job_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type BillingItem = typeof billingItemsTable.$inferSelect;
export type InsertBillingItem = typeof billingItemsTable.$inferInsert;
export type BillingLateFeeRate = typeof billingLateFeeRatesTable.$inferSelect;
export type InsertBillingLateFeeRate = typeof billingLateFeeRatesTable.$inferInsert;
export type BillingMonthRow = typeof billingMonthsTable.$inferSelect;
export type InsertBillingMonthRow = typeof billingMonthsTable.$inferInsert;
export type BillingExtraCharge = typeof billingExtraChargesTable.$inferSelect;
export type InsertBillingExtraCharge = typeof billingExtraChargesTable.$inferInsert;
export type NoticeDelivery = typeof noticeDeliveriesTable.$inferSelect;
export type InsertNoticeDelivery = typeof noticeDeliveriesTable.$inferInsert;
