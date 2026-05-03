// [Task #776] 예산·집행통제 엔진 v01.
//
// 도메인:
//   - budgets: 건물 × 연도 단위 예산 헤더. 현재 적용 버전(activeVersionId) 추적.
//   - budget_versions: 관리단 의결 시점마다 새 버전 1행 — approvedAt/By 와 출처(의결문 id) 보존.
//   - budget_lines: (version × category × month) 매트릭스 — month 0 은 연단위 총액 보조.
//   - budget_executions: (budget × category × month) 별 누계 집행액. 회계엔진(T6)
//     `voucher.confirmed` 이벤트가 분개될 때 본 테이블이 자동 갱신된다.
//
// 카테고리 키는 8개 표준 항목으로 잠근다. 관리규약상 표준 비목과 동일.

import {
  pgTable,
  text,
  serial,
  integer,
  real,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const budgetCategories = [
  "electricity",
  "water",
  "elevator",
  "cleaning",
  "security",
  "insurance",
  "long_term_repair",
  "other",
] as const;
export type BudgetCategory = (typeof budgetCategories)[number];

export const BUDGET_CATEGORY_LABELS: Record<BudgetCategory, string> = {
  electricity: "전기",
  water: "수도",
  elevator: "승강기",
  cleaning: "청소",
  security: "경비",
  insurance: "보험",
  long_term_repair: "수선적립금",
  other: "기타",
};

export const budgetsTable = pgTable(
  "budgets",
  {
    id: serial("id").primaryKey(),
    buildingId: integer("building_id").notNull(),
    year: integer("year").notNull(),
    activeVersionId: integer("active_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    byBuildingYear: uniqueIndex("budgets_building_year_unique").on(t.buildingId, t.year),
  }),
);

export const budgetVersionsTable = pgTable(
  "budget_versions",
  {
    id: serial("id").primaryKey(),
    budgetId: integer("budget_id").notNull(),
    versionNo: integer("version_no").notNull(),
    note: text("note"),
    // 의결문 OCR(T3) 출처 — documents.id 또는 votes 결과 id 등.
    sourceType: text("source_type"), // 'vote' | 'document' | 'manual' | null
    sourceId: integer("source_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByUserId: integer("approved_by_user_id"),
    approvedByName: text("approved_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byBudget: index("budget_versions_budget_idx").on(t.budgetId),
    byBudgetVersionNo: uniqueIndex("budget_versions_budget_version_unique").on(
      t.budgetId,
      t.versionNo,
    ),
  }),
);

export const budgetLinesTable = pgTable(
  "budget_lines",
  {
    id: serial("id").primaryKey(),
    versionId: integer("version_id").notNull(),
    category: text("category", { enum: budgetCategories }).notNull(),
    /** 0 = 연 총액 보조행 (월 합산이 아닌 별도 입력값). 1~12 = 월 매트릭스. */
    month: integer("month").notNull(),
    amount: real("amount").notNull().default(0),
  },
  (t) => ({
    byVersion: index("budget_lines_version_idx").on(t.versionId),
    byVersionCategoryMonth: uniqueIndex("budget_lines_version_cat_month_unique").on(
      t.versionId,
      t.category,
      t.month,
    ),
  }),
);

export const budgetExecutionsTable = pgTable(
  "budget_executions",
  {
    id: serial("id").primaryKey(),
    budgetId: integer("budget_id").notNull(),
    buildingId: integer("building_id").notNull(),
    category: text("category", { enum: budgetCategories }).notNull(),
    month: integer("month").notNull(), // 1~12
    /** voucher.confirmed 이벤트 합계. 분개 단위 누계. */
    amount: real("amount").notNull().default(0),
    voucherCount: integer("voucher_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    byBudget: index("budget_executions_budget_idx").on(t.budgetId),
    byBuilding: index("budget_executions_building_idx").on(t.buildingId),
    byBudgetCatMonth: uniqueIndex("budget_executions_budget_cat_month_unique").on(
      t.budgetId,
      t.category,
      t.month,
    ),
  }),
);

export const insertBudgetSchema = createInsertSchema(budgetsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBudget = z.infer<typeof insertBudgetSchema>;
export type Budget = typeof budgetsTable.$inferSelect;

export type BudgetVersion = typeof budgetVersionsTable.$inferSelect;
export type BudgetLine = typeof budgetLinesTable.$inferSelect;
export type BudgetExecution = typeof budgetExecutionsTable.$inferSelect;
