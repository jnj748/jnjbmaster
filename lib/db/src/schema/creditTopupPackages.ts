import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// [Task #319] 파트너가 토스페이먼츠로 충전할 때 노출되는 패키지 카탈로그.
//   기존 partner-credits.tsx 의 하드코딩 5종을 DB로 이전 → 플랫폼이 가격/보너스를 편집한다.
export const creditTopupPackagesTable = pgTable("credit_topup_packages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  credits: integer("credits").notNull(),
  priceKrw: integer("price_krw").notNull(),
  bonusPoints: integer("bonus_points").notNull().default(0),
  highlight: text("highlight"),
  sortOrder: integer("sort_order").notNull().default(100),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCreditTopupPackageSchema = createInsertSchema(creditTopupPackagesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCreditTopupPackage = z.infer<typeof insertCreditTopupPackageSchema>;
export type CreditTopupPackage = typeof creditTopupPackagesTable.$inferSelect;
