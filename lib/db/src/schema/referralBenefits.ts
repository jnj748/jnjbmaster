import { pgTable, serial, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// [Task #582] 추천인 베네핏 지급 이력.
//   회원가입 시 사용자가 입력한 referrer_phone(정규화된 11자리 휴대폰) 기준으로
//   본사(platform_admin)가 수동으로 지급한 보상을 기록한다. 자동 적립이 아닌
//   "기록" 단계 — 실제 크레딧 적립이나 현금 송금은 본 작업의 out-of-scope.
export const referralBenefitKinds = ["credit", "cash", "other"] as const;
export type ReferralBenefitKind = (typeof referralBenefitKinds)[number];

export const referralBenefitsTable = pgTable(
  "referral_benefits",
  {
    id: serial("id").primaryKey(),
    // 추천인을 식별하는 정규화된 11자리 휴대폰 번호 (예: 01012345678).
    //   가입자 record 의 users.referrer_phone 과 동일 형식.
    referrerPhone: text("referrer_phone").notNull(),
    // 지급을 기록한 platform_admin 사용자 id.
    grantedByUserId: integer("granted_by_user_id").notNull(),
    // 'credit' | 'cash' | 'other'.
    kind: text("kind", { enum: referralBenefitKinds }).notNull(),
    // 금액(원) 또는 수량(크레딧). 음수는 차감 — 다만 UI 는 양수 입력만 받음.
    amount: integer("amount").notNull(),
    memo: text("memo"),
    grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    referrerPhoneIdx: index("referral_benefits_referrer_phone_idx").on(t.referrerPhone),
  }),
);

export const insertReferralBenefitSchema = createInsertSchema(referralBenefitsTable).omit({
  id: true,
  grantedAt: true,
});
export type InsertReferralBenefit = z.infer<typeof insertReferralBenefitSchema>;
export type ReferralBenefit = typeof referralBenefitsTable.$inferSelect;
