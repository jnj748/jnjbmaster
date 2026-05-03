// [Task #801] 회계 기초·전표 — 개시잔액(전월/전기말 이월 입력).
//   회계기수(fiscal_period) 시작 시점에 각 계정의 차/대 잔액을 입력해 둔다.
//   posted=true 이면 자동분개로 1회성 개시 전표(source_event='manual')가 발행된 상태.
import { pgTable, serial, integer, text, real, boolean, timestamp, date, index, uniqueIndex } from "drizzle-orm/pg-core";

export const openingBalancesTable = pgTable(
  "opening_balances",
  {
    id: serial("id").primaryKey(),
    buildingId: integer("building_id").notNull(),
    fiscalPeriodId: integer("fiscal_period_id").notNull(),
    asOfDate: date("as_of_date").notNull(),
    accountCode: text("account_code").notNull(),
    accountName: text("account_name").notNull(),
    debit: real("debit").notNull().default(0),
    credit: real("credit").notNull().default(0),
    memo: text("memo"),
    posted: boolean("posted").notNull().default(false),
    postedJournalEntryId: integer("posted_journal_entry_id"),
    createdById: integer("created_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("opening_balances_building_idx").on(t.buildingId),
    uniqueIndex("opening_balances_unique_idx").on(t.buildingId, t.fiscalPeriodId, t.accountCode),
  ],
);

export type OpeningBalance = typeof openingBalancesTable.$inferSelect;
