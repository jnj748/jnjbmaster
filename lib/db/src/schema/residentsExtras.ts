// [Task #797] 입주자관리 부가 기능 6종 — 키 발급/회수, 중간 정산서, 개인정보 접근
//   이력, 장기수선충당금. 전입/전출 현황은 기존 tenants 데이터를 view-처럼
//   재구성해 노출하므로 별도 테이블을 두지 않는다. 차량 대량 등록도 vehicles
//   테이블을 그대로 쓰며, sticker/EV 등 컬럼만 보강한다.
import {
  pgTable,
  serial,
  integer,
  text,
  date,
  timestamp,
  numeric,
  boolean,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { buildingsTable } from "./buildings";
import { usersTable } from "./users";

export const keyIssuancesTable = pgTable(
  "key_issuances",
  {
    id: serial("id").primaryKey(),
    buildingId: integer("building_id")
      .notNull()
      .references(() => buildingsTable.id),
    unit: text("unit").notNull(),
    tenantName: text("tenant_name"),
    keyNumber: text("key_number").notNull(),
    issueReason: text("issue_reason"),
    issuedAt: date("issued_at"),
    returnedAt: date("returned_at"),
    // 발급중 / 회수 / 분실 / 폐기
    status: text("status").notNull().default("issued"),
    handlerName: text("handler_name"),
    handlerId: integer("handler_id").references(() => usersTable.id),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("key_issuances_building_idx").on(t.buildingId),
    index("key_issuances_status_idx").on(t.status),
  ],
);

export const interimSettlementsTable = pgTable(
  "interim_settlements",
  {
    id: serial("id").primaryKey(),
    buildingId: integer("building_id")
      .notNull()
      .references(() => buildingsTable.id),
    unit: text("unit").notNull(),
    billingMonth: text("billing_month").notNull(), // YYYY-MM
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    closingAmount: integer("closing_amount").notNull().default(0),
    monthAmount: integer("month_amount").notNull().default(0),
    supplyAmount: integer("supply_amount").notNull().default(0),
    vatAmount: integer("vat_amount").notNull().default(0),
    nonTaxAmount: integer("non_tax_amount").notNull().default(0),
    exemptAmount: integer("exempt_amount").notNull().default(0),
    occurredAmount: integer("occurred_amount").notNull().default(0),
    applyLateFee: boolean("apply_late_fee").notNull().default(false),
    notes: text("notes"),
    // draft / confirmed
    status: text("status").notNull().default("draft"),
    createdBy: integer("created_by").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("interim_settlements_building_idx").on(t.buildingId),
    index("interim_settlements_month_idx").on(t.billingMonth),
  ],
);

export const privacyAccessLogsTable = pgTable(
  "privacy_access_logs",
  {
    id: serial("id").primaryKey(),
    buildingId: integer("building_id").references(() => buildingsTable.id),
    userId: integer("user_id").references(() => usersTable.id),
    userName: text("user_name"),
    page: text("page").notNull(),
    purpose: text("purpose"), // 업무 구분
    reason: text("reason"), // 접근 사유
    ip: text("ip"),
    unmasked: boolean("unmasked").notNull().default(false),
    printed: boolean("printed").notNull().default(false),
    downloaded: boolean("downloaded").notNull().default(false),
    targetType: text("target_type"),
    targetId: integer("target_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("privacy_access_logs_building_idx").on(t.buildingId),
    index("privacy_access_logs_user_idx").on(t.userId),
    index("privacy_access_logs_created_idx").on(t.createdAt),
  ],
);

export const longTermRepairAllocationsTable = pgTable(
  "long_term_repair_allocations",
  {
    id: serial("id").primaryKey(),
    buildingId: integer("building_id")
      .notNull()
      .references(() => buildingsTable.id),
    // 산출 행목 구분 (예: 적립금 / 충당금 / 임시지출)
    itemCategory: text("item_category"),
    // 분양면적 / 전용면적 / 균등 등
    calcMethod: text("calc_method").notNull().default("supply_area"),
    calcDate: date("calc_date"),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    // 호실별 산출 결과 [{ unit, area, unitPrice, amount, note }]
    unitResults: jsonb("unit_results").notNull().default([]),
    // 단가 정보 [{ category, area, unitPrice }]
    unitPrices: jsonb("unit_prices").notNull().default([]),
    // 공시 사항(자유 입력 N건) [{ title, body }]
    disclosures: jsonb("disclosures").notNull().default([]),
    totalAmount: integer("total_amount").notNull().default(0),
    notes: text("notes"),
    // draft / confirmed
    status: text("status").notNull().default("draft"),
    createdBy: integer("created_by").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("ltr_allocations_building_idx").on(t.buildingId)],
);

export type KeyIssuance = typeof keyIssuancesTable.$inferSelect;
export type InsertKeyIssuance = typeof keyIssuancesTable.$inferInsert;
export type InterimSettlement = typeof interimSettlementsTable.$inferSelect;
export type InsertInterimSettlement = typeof interimSettlementsTable.$inferInsert;
export type PrivacyAccessLog = typeof privacyAccessLogsTable.$inferSelect;
export type InsertPrivacyAccessLog = typeof privacyAccessLogsTable.$inferInsert;
export type LongTermRepairAllocation = typeof longTermRepairAllocationsTable.$inferSelect;
export type InsertLongTermRepairAllocation = typeof longTermRepairAllocationsTable.$inferInsert;
