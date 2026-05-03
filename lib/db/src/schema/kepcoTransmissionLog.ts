// [Task #798] 한전 검침 송신 로그 — 송신 회차별 입력 + 외부 EMS 송신 기록.
//   외부 EMS 연동은 mock(메타데이터만 저장). meters 1~6별 세대 수/사용량/공통 사용량을
//   meters JSON 으로 보관해 추후 실제 송신 시 그대로 페이로드로 사용한다.
import { pgTable, serial, integer, text, jsonb, timestamp, date } from "drizzle-orm/pg-core";
import { buildingsTable } from "./buildings";
import { usersTable } from "./users";

export const kepcoTransmissionLogTable = pgTable("kepco_transmission_log", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id),
  // 부과월(YYYY-MM) — 어느 달의 검침을 송신했는지.
  billingMonth: text("billing_month").notNull(),
  readingDate: date("reading_date").notNull(),
  transmittedAt: timestamp("transmitted_at", { withTimezone: true }),
  // 송신 통수 = 송신한 검침 행 수.
  meterCount: integer("meter_count").notNull().default(0),
  workerName: text("worker_name"),
  // [{meterNo:1, units:int, usage:number, commonUsage:number}, ...]
  meters: jsonb("meters").notNull().default([]),
  totalUsage: text("total_usage"),
  unitsTotal: integer("units_total"),
  commonUsageTotal: text("common_usage_total"),
  status: text("status", { enum: ["draft", "transmitted", "failed"] }).notNull().default("draft"),
  notes: text("notes"),
  authorId: integer("author_id").references(() => usersTable.id),
  authorRole: text("author_role"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type KepcoTransmissionLog = typeof kepcoTransmissionLogTable.$inferSelect;
export type InsertKepcoTransmissionLog = typeof kepcoTransmissionLogTable.$inferInsert;
