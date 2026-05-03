// [Task #801] 자동분개 규칙 — 이벤트(부과확정/수납/지출 등)에 대해 차/대 라인을 정해 둔다.
//   ruleLines 의 amountSource: 'event' (이벤트 금액) 또는 'fixed' (고정금액).
import { pgTable, serial, integer, text, boolean, real, timestamp, index } from "drizzle-orm/pg-core";

export const autoJournalEvents = [
  "billing.finalized",
  "payment.received",
  "voucher.confirmed",
  "voucher.recorded",
  "manual",
] as const;
export type AutoJournalEvent = typeof autoJournalEvents[number];

export const autoJournalRulesTable = pgTable(
  "auto_journal_rules",
  {
    id: serial("id").primaryKey(),
    buildingId: integer("building_id"), // null = 전사 표준
    code: text("code").notNull(),       // 예: "BILL_FINAL"
    name: text("name").notNull(),
    event: text("event", { enum: autoJournalEvents }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    memo: text("memo"),
    createdById: integer("created_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [index("auto_journal_rules_building_idx").on(t.buildingId)],
);

export const autoJournalLineKinds = ["debit", "credit"] as const;
export const autoJournalAmountSources = ["event", "fixed"] as const;

export const autoJournalRuleLinesTable = pgTable(
  "auto_journal_rule_lines",
  {
    id: serial("id").primaryKey(),
    ruleId: integer("rule_id").notNull().references(() => autoJournalRulesTable.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: autoJournalLineKinds }).notNull(),
    accountCode: text("account_code").notNull(),
    accountName: text("account_name").notNull(),
    amountSource: text("amount_source", { enum: autoJournalAmountSources }).notNull().default("event"),
    fixedAmount: real("fixed_amount"),
    ratio: real("ratio").notNull().default(1), // event 금액 × ratio
    memo: text("memo"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("auto_journal_rule_lines_rule_idx").on(t.ruleId)],
);

export type AutoJournalRule = typeof autoJournalRulesTable.$inferSelect;
export type AutoJournalRuleLine = typeof autoJournalRuleLinesTable.$inferSelect;
