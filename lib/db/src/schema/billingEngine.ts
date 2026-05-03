// [Task #777] 부과엔진 v01 — 부과 환경 / 분할부과 ledger / 부과 실행 / 호실별 라인 / 조정.
//
// 핵심 모델:
//   - billing_settings:    건물별 부과 환경 (면적기준·단가표·배분규칙). 버전 보관.
//   - billing_installments: 분할부과 ledger (T4) — 거액 1회 지출을 N개월 분할.
//   - billing_runs:        월별 부과 실행 헤더 (status: draft/finalized).
//   - billing_lines:       호실별 부과 라인 (commonCharge / 검침항목 / repairReserve / installment / total).
//   - billing_adjustments: 부과 후 조정 ledger (감면/환불/재부과). 사유·작성자 보존.
//
// finalize 시 status='finalized' 로 잠그고, 마감엔진(T9) 이후엔 조정만 가능.

import {
  pgTable, text, serial, integer, real, boolean, timestamp, json, jsonb, unique, date,
} from "drizzle-orm/pg-core";
import { buildingsTable } from "./buildings";
import { unitsTable } from "./units";
import { usersTable } from "./users";

// ── 1. 부과 환경 설정 ────────────────────────────────────────
// area_basis: 'supply' (공급면적) | 'exclusive' (전용면적). 신코드 데모 기본 supply.
// repairReserveUnitPrice: ㎡당 수선적립금 단가 (원).
// meterUnitPrices: { water: 850, electricity: 130, gas: 1100, heating: 90 } — 검침 단가.
// allocationRules: 비목별 배분 키 — { commonMaintenance: 'area' | 'unit_count' | 'usage', ... }.
// otherUnitPrices: ㎡당 단가 비목 추가표 (수선적립금 외 정액성).
export const billingSettingsTable = pgTable("billing_settings", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
  version: integer("version").notNull().default(1),
  areaBasis: text("area_basis", { enum: ["supply", "exclusive"] }).notNull().default("supply"),
  repairReserveUnitPrice: real("repair_reserve_unit_price").notNull().default(0),
  meterUnitPrices: jsonb("meter_unit_prices").$type<Record<string, number>>().notNull().default({}),
  otherUnitPrices: jsonb("other_unit_prices").$type<Record<string, number>>().notNull().default({}),
  allocationRules: jsonb("allocation_rules").$type<Record<string, "area" | "unit_count" | "usage">>().notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  createdById: integer("created_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("billing_settings_building_version").on(t.buildingId, t.version),
]);

// ── 2. 분할부과 ledger (T4) ──────────────────────────────────
// 예: 1,200만 원 옥상 방수공사를 12개월 분할 → 매월 100만 원씩 부과.
// startMonth ~ endMonth 사이의 부과월에서 monthlyAmount 만큼 commonMaintenance 와 별도로 합산.
export const billingInstallmentsTable = pgTable("billing_installments", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  totalAmount: real("total_amount").notNull(),
  amortizationMonths: integer("amortization_months").notNull(),
  monthlyAmount: real("monthly_amount").notNull(),
  startMonth: text("start_month").notNull(), // 'YYYY-MM'
  endMonth: text("end_month").notNull(),
  category: text("category").notNull().default("repair"), // 'repair' | 'long_term' | 'other'
  allocationKey: text("allocation_key").notNull().default("area"), // 'area' | 'unit_count'
  sourceVoucherId: integer("source_voucher_id"), // T6 지출결의서 연계 (선택)
  status: text("status", { enum: ["active", "paused", "closed"] }).notNull().default("active"),
  notes: text("notes"),
  createdById: integer("created_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

// ── 3. 부과 실행 헤더 ────────────────────────────────────────
// 월별 1행. 입력 스냅샷(검침 합계·분할부과 합계·환경 버전)을 함께 저장해
// 사후 검증·재현 가능성을 보장한다.
export const billingRunsTable = pgTable("billing_runs", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
  billingMonth: text("billing_month").notNull(), // 'YYYY-MM'
  status: text("status", { enum: ["draft", "finalized", "void"] }).notNull().default("draft"),
  settingsVersion: integer("settings_version").notNull().default(1),
  inputSnapshot: jsonb("input_snapshot").$type<{
    meterTotals?: Record<string, number>;
    installmentTotal?: number;
    commonMaintenance?: number;
    notes?: string;
  }>().notNull().default({}),
  totalAmount: real("total_amount").notNull().default(0),
  unitCount: integer("unit_count").notNull().default(0),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  finalizedById: integer("finalized_by_id").references(() => usersTable.id),
  calculatedById: integer("calculated_by_id").references(() => usersTable.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("billing_runs_building_month").on(t.buildingId, t.billingMonth),
]);

// ── 4. 호실별 부과 라인 ──────────────────────────────────────
// breakdown: 비목 → 금액 맵. UI 총괄표가 행/열 매트릭스로 직접 사용.
export const billingLinesTable = pgTable("billing_lines", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => billingRunsTable.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id, { onDelete: "cascade" }),
  unitNumber: text("unit_number").notNull(),
  area: real("area").notNull().default(0),
  areaRatio: real("area_ratio").notNull().default(0),
  commonCharge: real("common_charge").notNull().default(0),
  meterCharges: jsonb("meter_charges").$type<Record<string, { usage: number; rate: number; amount: number }>>().notNull().default({}),
  repairReserve: real("repair_reserve").notNull().default(0),
  installmentCharge: real("installment_charge").notNull().default(0),
  otherCharges: jsonb("other_charges").$type<Record<string, number>>().notNull().default({}),
  totalAmount: real("total_amount").notNull().default(0),
  manualOverride: real("manual_override"),
  manualReason: text("manual_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("billing_lines_run_unit").on(t.runId, t.unitId),
]);

// ── 5. 조정명세서 ledger ────────────────────────────────────
// 부과 확정 후의 감면/환불/재부과는 원장 보존을 위해 line 을 직접 수정하지 않고
// 별도 트랜잭션으로 누적한다. amount 양수=추가부과, 음수=감면/환불.
export const billingAdjustmentsTable = pgTable("billing_adjustments", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => billingRunsTable.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id, { onDelete: "cascade" }),
  unitNumber: text("unit_number").notNull(),
  adjustmentType: text("adjustment_type", {
    enum: ["discount", "refund", "rebill", "writeoff"],
  }).notNull(),
  amount: real("amount").notNull(),
  reason: text("reason").notNull(),
  reasonChip: text("reason_chip"), // 사유 칩(고지서 오류·세대 협의·민원)
  appliedAt: date("applied_at"),
  createdById: integer("created_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type BillingSettings = typeof billingSettingsTable.$inferSelect;
export type InsertBillingSettings = typeof billingSettingsTable.$inferInsert;
export type BillingInstallment = typeof billingInstallmentsTable.$inferSelect;
export type InsertBillingInstallment = typeof billingInstallmentsTable.$inferInsert;
export type BillingRun = typeof billingRunsTable.$inferSelect;
export type BillingLine = typeof billingLinesTable.$inferSelect;
export type BillingAdjustment = typeof billingAdjustmentsTable.$inferSelect;
export type InsertBillingAdjustment = typeof billingAdjustmentsTable.$inferInsert;
