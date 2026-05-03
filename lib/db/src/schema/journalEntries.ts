// [Task #778] T6 회계엔진 v01 — 분개(Journal) 헤더 + 라인.
//   복식부기: entry 1행 ↔ lines N행. 합계 차변 = 합계 대변 (대차일치).
//   sourceEvent: 'voucher.confirmed' | 'voucher.installment_recognized' |
//                'billing.finalized' | 'payment.received' | 'manual' | 'reversal'
//   locked=true 인 entry 는 마감(T9)으로 잠겨 수정/삭제 불가. 역분개만 허용.

import { pgTable, text, serial, integer, real, timestamp, boolean, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const journalSourceEvents = [
  "voucher.confirmed",
  "voucher.installment_recognized",
  // [Task #794] 출납 시 자금 출처 분기 — recorded 시점에 1020 → 실제 계좌 재분류.
  "voucher.recorded",
  "billing.finalized",
  "payment.received",
  "payment.partial",
  "manual",
  "reversal",
] as const;
export type JournalSourceEvent = typeof journalSourceEvents[number];

export const journalEntriesTable = pgTable(
  "journal_entries",
  {
    id: serial("id").primaryKey(),
    buildingId: integer("building_id"),
    entryDate: date("entry_date").notNull(),
    memo: text("memo").notNull(),
    sourceEvent: text("source_event", { enum: journalSourceEvents }).notNull().default("manual"),
    sourceRefType: text("source_ref_type"), // expense_voucher / billing_run / monthly_payment 등
    sourceRefId: integer("source_ref_id"),
    locked: boolean("locked").notNull().default(false), // 마감(T9) 잠금
    reversedEntryId: integer("reversed_entry_id"), // 역분개 원장 참조
    isReversal: boolean("is_reversal").notNull().default(false),
    totalDebit: real("total_debit").notNull().default(0),
    totalCredit: real("total_credit").notNull().default(0),
    isBalanced: boolean("is_balanced").notNull().default(true),
    createdById: integer("created_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("journal_entries_building_idx").on(t.buildingId),
    index("journal_entries_date_idx").on(t.entryDate),
    index("journal_entries_source_idx").on(t.sourceEvent, t.sourceRefId),
  ],
);

export const journalLinesTable = pgTable(
  "journal_lines",
  {
    id: serial("id").primaryKey(),
    entryId: integer("entry_id").notNull().references(() => journalEntriesTable.id, { onDelete: "cascade" }),
    accountCode: text("account_code").notNull(),
    accountName: text("account_name").notNull(),
    debit: real("debit").notNull().default(0),
    credit: real("credit").notNull().default(0),
    partyName: text("party_name"), // 거래처(보조부원장 키)
    unitId: integer("unit_id"), // 호실(보조부원장 키)
    memo: text("memo"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("journal_lines_entry_idx").on(t.entryId),
    index("journal_lines_account_idx").on(t.accountCode),
    index("journal_lines_party_idx").on(t.partyName),
    index("journal_lines_unit_idx").on(t.unitId),
  ],
);

export const insertJournalEntrySchema = createInsertSchema(journalEntriesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertJournalLineSchema = createInsertSchema(journalLinesTable).omit({ id: true, createdAt: true });
export type InsertJournalEntry = z.infer<typeof insertJournalEntrySchema>;
export type InsertJournalLine = z.infer<typeof insertJournalLineSchema>;
export type JournalEntry = typeof journalEntriesTable.$inferSelect;
export type JournalLine = typeof journalLinesTable.$inferSelect;
