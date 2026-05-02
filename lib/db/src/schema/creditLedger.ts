import { pgTable, text, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const creditLedgerKinds = [
  "consumption",
  "refund",
  "manual_credit",
  "manual_debit",
  "package_purchase",
  "rebate",
  "adjustment",
  "bonus_points",
  // [Task #734] 파트너 가입 시 자동 지급되는 기본 크레딧/포인트.
  //   동일 vendorId 에 대해 1행만 존재해야 한다(애플리케이션 단에서 멱등 보장).
  "signup_bonus",
  // [Task #734] 플랫폼 운영자가 일괄 지급한 이벤트 크레딧.
  //   credit_events / credit_event_recipients 와 짝을 이루며,
  //   같은 (eventId, vendorId) 조합은 단 1행 — credit_event_recipients UNIQUE 로 보장.
  "event_grant",
] as const;

export const creditLedgerSources = [
  "manual",
  "package_purchase",
  "refund",
  "rebate",
  "consumption",
  "adjustment",
  "system",
] as const;

export const creditLedgerTable = pgTable(
  "credit_ledger",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id").notNull(),
    amount: integer("amount").notNull(),
    kind: text("kind", { enum: creditLedgerKinds }).notNull(),
    source: text("source", { enum: creditLedgerSources }).notNull().default("system"),
    pointsAmount: integer("points_amount").notNull().default(0),
    rfqId: integer("rfq_id"),
    quoteId: integer("quote_id"),
    relatedLedgerId: integer("related_ledger_id"),
    notes: text("notes"),
    actorId: integer("actor_id"),
    actorName: text("actor_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    // [Task #734] vendor 당 가입축하 지급 1회 보장 (race-safe).
    //   SQL 마이그레이션 0049 의 부분 unique 인덱스를 Drizzle 메타데이터에도
    //   명시 — 이름 일치 (credit_ledger_signup_bonus_unique_vendor) + WHERE 절
    //   동일 (kind = 'signup_bonus') 으로 schema drift 방지.
    uxSignupBonusVendor: uniqueIndex("credit_ledger_signup_bonus_unique_vendor")
      .on(t.vendorId)
      .where(sql`${t.kind} = 'signup_bonus'`),
  }),
);

export const insertCreditLedgerSchema = createInsertSchema(creditLedgerTable).omit({ id: true, createdAt: true });
export type InsertCreditLedger = z.infer<typeof insertCreditLedgerSchema>;
export type CreditLedger = typeof creditLedgerTable.$inferSelect;
