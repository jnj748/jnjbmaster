import { pgTable, text, serial, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const creditCategoryPricingTable = pgTable("credit_category_pricing", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  sido: text("sido"),
  sigungu: text("sigungu"),
  tier: integer("tier").notNull().default(1),
  creditCost: integer("credit_cost").notNull().default(1),
  description: text("description"),
  // [Task #226] 변경 이력 표시용 — 마지막 저장한 어드민의 표시 이름.
  updatedBy: text("updated_by"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  // [Task #226] (category, sido, sigungu) 조합으로 단가 행을 식별한다.
  // sido/sigungu가 NULL인 행은 "기본 단가"이며, 시군구 → 시도 → 기본 순으로 fallback 한다.
  // 런타임 ensure 마이그레이션 (artifacts/api-server/src/lib/ensureRfqMatchSchema.ts) 에서
  // 동일 컬럼 조합으로 NULLS NOT DISTINCT UNIQUE INDEX 를 생성하기 때문에 (Postgres 15+),
  // Drizzle 측 제약도 nullsNotDistinct() 로 맞춘다 — drizzle 0.45 에서는 uniqueIndex 가 아닌
  // unique constraint 에서만 옵션이 노출된다.
  categoryRegionUnique: unique("credit_category_pricing_cat_region_unique")
    .on(t.category, t.sido, t.sigungu)
    .nullsNotDistinct(),
}));

export const insertCreditCategoryPricingSchema = createInsertSchema(creditCategoryPricingTable).omit({ id: true, updatedAt: true });
export type InsertCreditCategoryPricing = z.infer<typeof insertCreditCategoryPricingSchema>;
export type CreditCategoryPricing = typeof creditCategoryPricingTable.$inferSelect;
