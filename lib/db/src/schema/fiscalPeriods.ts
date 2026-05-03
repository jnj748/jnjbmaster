// [Task #801] 회계 기수 — 1년 단위 회계기간(예: 2026 회계기수: 2026-01-01 ~ 2026-12-31).
//   status: open(개시) / active(운영중) / closed(연마감 완료).
//   isCurrent=true 인 행은 건물당 1개. 기수 전환 시 carry_forward_balances 로 이월.
import { pgTable, serial, integer, text, boolean, timestamp, date, index, uniqueIndex } from "drizzle-orm/pg-core";

export const fiscalPeriodStatuses = ["open", "active", "closed"] as const;
export type FiscalPeriodStatus = typeof fiscalPeriodStatuses[number];

export const fiscalPeriodsTable = pgTable(
  "fiscal_periods",
  {
    id: serial("id").primaryKey(),
    buildingId: integer("building_id").notNull(),
    code: text("code").notNull(), // 예: "FY2026"
    name: text("name").notNull(), // 예: "2026 회계기수"
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: text("status", { enum: fiscalPeriodStatuses }).notNull().default("open"),
    isCurrent: boolean("is_current").notNull().default(false),
    memo: text("memo"),
    createdById: integer("created_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("fiscal_periods_building_idx").on(t.buildingId),
    uniqueIndex("fiscal_periods_code_unique_idx").on(t.buildingId, t.code),
  ],
);

export type FiscalPeriod = typeof fiscalPeriodsTable.$inferSelect;
