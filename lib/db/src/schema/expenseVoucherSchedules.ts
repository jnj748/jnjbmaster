// [Task #775] 분할부과(분납) 스케줄 ledger.
//
// 결재 라인의 "계약·증빙 등록" 단계에서 분납 입력이 있으면 자동으로 1건이 생성된다.
// 부과엔진(T7) 의 `GET /voucher-schedules/installments?month=YYYY-MM` 가 이 ledger 를
// 보고 당월 분할부과 금액을 산출하며, 분납 만기 임박/종료 알림도 본 테이블의
// `current_round` 와 `months` 비교로 구동된다.
//
// [용어] `installment_*` 컬럼명은 #707 부터 사용된 레거시. 의미상 "분리부과/분납".

import { pgTable, text, serial, integer, real, timestamp, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const expenseVoucherScheduleStatuses = [
  "active", // 진행 중
  "completed", // 모든 회차 종료
  "void", // 취소
] as const;

export const expenseVoucherSchedulesTable = pgTable(
  "expense_voucher_schedules",
  {
    id: serial("id").primaryKey(),
    voucherId: integer("voucher_id").notNull(),
    approvalId: integer("approval_id"),
    buildingId: integer("building_id"),
    totalAmount: real("total_amount").notNull(),
    months: integer("months").notNull(),
    currentRound: integer("current_round").notNull().default(0),
    monthlyAmount: real("monthly_amount").notNull(),
    startMonth: text("start_month").notNull(), // YYYY-MM
    endMonth: text("end_month").notNull(), // YYYY-MM
    status: text("status", { enum: expenseVoucherScheduleStatuses }).notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    byVoucher: index("expense_voucher_schedules_voucher_idx").on(t.voucherId),
    byBuilding: index("expense_voucher_schedules_building_idx").on(t.buildingId),
    byStatus: index("expense_voucher_schedules_status_idx").on(t.status),
  }),
);

export const insertExpenseVoucherScheduleSchema = createInsertSchema(expenseVoucherSchedulesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertExpenseVoucherSchedule = z.infer<typeof insertExpenseVoucherScheduleSchema>;
export type ExpenseVoucherSchedule = typeof expenseVoucherSchedulesTable.$inferSelect;

// 정기지출 주기 — 새 결재 라인의 reuse 단서.
// 단순 텍스트로 두되 클라이언트 검증은 enum 으로 잠근다.
export const recurrenceCycles = ["monthly", "quarterly", "semiannual", "annual"] as const;
export type RecurrenceCycle = (typeof recurrenceCycles)[number];
