// [Task #780] T9 마감·보고엔진 v01 — period_closings / closing_snapshots / carry_forward_balances.
//
// 핵심 모델:
//   - period_closings:        건물 × 월 1행. status: open / locked / reopened.
//   - closing_snapshots:      마감 시점에 굳혀 둔 보고용 집계. 사후 변경에 영향 없음.
//   - carry_forward_balances: 자산·부채 계정의 다음 달 기초잔액 이월.

import { pgTable, text, serial, integer, real, timestamp, jsonb, unique, index } from "drizzle-orm/pg-core";
import { buildingsTable } from "./buildings";

export type ClosingStatus = "open" | "locked" | "reopened";

export type ClosingGateResult = {
  key: "meters_missing" | "payments_unjournaled" | "journal_unbalanced" | "bank_unmatched" | "installments_pending";
  label: string;
  passed: boolean;
  detail: string;
  count: number;
  fixHref?: string;
};

export type ClosingSnapshotSummary = {
  buildingId: number;
  month: string;
  generatedAt: string;
  totals: {
    billed: number;
    collected: number;
    overdue: number;
    expense: number;
    revenue: number;
    netIncome: number;
  };
  collection: { rate: number; billed: number; collected: number; overdue: number; overdueCount: number };
  energy?: Record<string, { usage: number; amount: number; unit: string } | null>;
  partnerPayoutTotal?: number;
  comments?: string[]; // AI/자연어 변동 요약
  balanceSheet?: { assets: Array<{ code: string; name: string; balance: number }>; liabilities: Array<{ code: string; name: string; balance: number }>; equity: Array<{ code: string; name: string; balance: number }> };
  operations?: { revenue: Array<{ code: string; name: string; amount: number }>; expense: Array<{ code: string; name: string; amount: number }>; netIncome: number };
  // [Task #780 review] 호실별 부과·수납·미수 — 마감 시 함께 굳혀 둬서 사후
  //   bills 변경(잠금 해제 후 정정 등)에도 보고서가 흔들리지 않도록 한다.
  residentReport?: {
    items: Array<{ unitId: number | null; unitNumber: string | null; billed: number; paid: number; overdue: number; status: string | null; dueDate: string | null }>;
    totals: { billed: number; paid: number; overdue: number };
  };
};

export const closingSnapshotsTable = pgTable("closing_snapshots", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
  month: text("month").notNull(),
  summary: jsonb("summary").$type<ClosingSnapshotSummary>().notNull(),
  totals: jsonb("totals").$type<Record<string, number>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("closing_snapshots_bm_idx").on(t.buildingId, t.month),
]);

export const periodClosingsTable = pgTable("period_closings", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
  month: text("month").notNull(), // 'YYYY-MM'
  status: text("status", { enum: ["open", "locked", "reopened"] }).notNull().default("open"),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedById: integer("locked_by_id"),
  lockReason: text("lock_reason"),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true }),
  unlockedById: integer("unlocked_by_id"),
  unlockReason: text("unlock_reason"),
  // [Task #780 review] 이중승인 — 1차 요청자/사유. 2차 승인자가 확인하면 비워지고 unlocked_* 가 채워진다.
  unlockRequestedAt: timestamp("unlock_requested_at", { withTimezone: true }),
  unlockRequestedById: integer("unlock_requested_by_id"),
  unlockRequestReason: text("unlock_request_reason"),
  snapshotId: integer("snapshot_id").references(() => closingSnapshotsTable.id, { onDelete: "set null" }),
  gateResults: jsonb("gate_results").$type<ClosingGateResult[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("period_closings_bm").on(t.buildingId, t.month),
]);

export const carryForwardBalancesTable = pgTable("carry_forward_balances", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
  fromMonth: text("from_month").notNull(),
  toMonth: text("to_month").notNull(),
  accountCode: text("account_code").notNull(),
  accountName: text("account_name").notNull(),
  partyName: text("party_name"),
  unitId: integer("unit_id"),
  debit: real("debit").notNull().default(0),
  credit: real("credit").notNull().default(0),
  balance: real("balance").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("carry_forward_bm_idx").on(t.buildingId, t.toMonth),
  index("carry_forward_account_idx").on(t.accountCode),
]);

export type PeriodClosing = typeof periodClosingsTable.$inferSelect;
export type InsertPeriodClosing = typeof periodClosingsTable.$inferInsert;
export type ClosingSnapshot = typeof closingSnapshotsTable.$inferSelect;
export type InsertClosingSnapshot = typeof closingSnapshotsTable.$inferInsert;
export type CarryForwardBalance = typeof carryForwardBalancesTable.$inferSelect;
export type InsertCarryForwardBalance = typeof carryForwardBalancesTable.$inferInsert;
