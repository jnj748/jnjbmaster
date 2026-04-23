import { pgTable, serial, text, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// [Task #319] 파트너 크레딧 충전 결제 주문.
//   pending → paid (토스 confirm 성공) | failed | cancelled. tossOrderId 는 멱등 보장용 UNIQUE.
// "processing" 는 pending 으로부터 단일 confirm 요청이 토스 API 호출 직전에
// 점유(claim)했음을 표시한다. 동시 confirm 요청 중 단 1건만 processing 으로
// 전환되며, 그 요청만 paid/failed 로 결말낸다 → 결제 손실 방지.
export const creditTopupOrderStatuses = ["pending", "processing", "paid", "failed", "cancelled"] as const;
export type CreditTopupOrderStatus = (typeof creditTopupOrderStatuses)[number];

export const creditTopupOrdersTable = pgTable(
  "credit_topup_orders",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id").notNull(),
    userId: integer("user_id"),
    packageId: integer("package_id"),
    packageName: text("package_name").notNull(),
    credits: integer("credits").notNull(),
    bonusPoints: integer("bonus_points").notNull().default(0),
    amountKrw: integer("amount_krw").notNull(),
    status: text("status", { enum: creditTopupOrderStatuses }).notNull().default("pending"),
    tossOrderId: text("toss_order_id").notNull(),
    tossPaymentKey: text("toss_payment_key"),
    tossMethod: text("toss_method"),
    failReason: text("fail_reason"),
    ledgerCreditId: integer("ledger_credit_id"),
    ledgerBonusId: integer("ledger_bonus_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
    paidAt: timestamp("paid_at", { withTimezone: true }),
  },
  (t) => ({
    uxTossOrderId: uniqueIndex("ux_credit_topup_orders_toss_order_id").on(t.tossOrderId),
  }),
);

export const insertCreditTopupOrderSchema = createInsertSchema(creditTopupOrdersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCreditTopupOrder = z.infer<typeof insertCreditTopupOrderSchema>;
export type CreditTopupOrder = typeof creditTopupOrdersTable.$inferSelect;
