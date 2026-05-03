// [Task #778] T6 회계엔진 v01 — 계정과목(Chart of Accounts).
//   한국 관리사무소 표준 5대 분류(자산·부채·자본·수익·비용) 트리.
//   isStandard=true 행은 시드로 보장되며 사용자가 수정/삭제할 수 없다.
//   buildingId 가 NULL 이면 전 건물 공용(표준) 계정, 값이 있으면 해당 건물 전용.

import { pgTable, text, serial, integer, boolean, timestamp, unique, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const accountTypes = ["asset", "liability", "equity", "revenue", "expense"] as const;
export type AccountType = typeof accountTypes[number];

export const chartOfAccountsTable = pgTable(
  "chart_of_accounts",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(), // 표준 4자리 코드 (예: "1020")
    name: text("name").notNull(), // 예: "예금"
    type: text("type", { enum: accountTypes }).notNull(),
    parentCode: text("parent_code"), // 상위 헤더 코드 (예: "1000")
    isHeader: boolean("is_header").notNull().default(false), // 합계용 헤더(거래 불가)
    isStandard: boolean("is_standard").notNull().default(false), // 시드 보호
    buildingId: integer("building_id"), // null = 공용 표준
    sortOrder: integer("sort_order").notNull().default(0),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    unique("chart_of_accounts_code_building").on(t.code, t.buildingId),
    index("chart_of_accounts_type_idx").on(t.type),
    index("chart_of_accounts_building_idx").on(t.buildingId),
  ],
);

export const insertChartOfAccountSchema = createInsertSchema(chartOfAccountsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChartOfAccount = z.infer<typeof insertChartOfAccountSchema>;
export type ChartOfAccount = typeof chartOfAccountsTable.$inferSelect;
