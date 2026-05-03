import { pgTable, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// [S1 스마트견적] 파트너의 스마트견적 가입 정보. vendor 당 1행(vendor_id PK).
//   - status: 'active' | 'paused'. 신규 가입자는 paused — 직접 켜기 전에는 자동 제출 안 됨.
//   - dailyCreditBudget / dailyMaxCount: 하루 한도. 도달 시 자동 정지(엔진은 S3).
//   - targetCategories: 자동 제출 대상 분야 슬러그 (vendors.specialties 의 부분집합).
//   - targetRegions: NULL 이면 가입 시 등록한 지역 그대로 사용.
//   - 마이그레이션은 lib/db/drizzle/0051_s1_smart_quote.sql 와 정확히 매칭.
export const vendorSmartQuoteTable = pgTable("vendor_smart_quote", {
  vendorId: integer("vendor_id").primaryKey(),
  status: text("status").notNull().default("paused"),
  dailyCreditBudget: integer("daily_credit_budget").notNull().default(9000),
  dailyMaxCount: integer("daily_max_count").notNull().default(3),
  targetCategories: text("target_categories").array().notNull().default(sql`'{}'::text[]`),
  targetRegions: jsonb("target_regions"),
  pausedReason: text("paused_reason"),
  lastPausedAt: timestamp("last_paused_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertVendorSmartQuoteSchema = createInsertSchema(vendorSmartQuoteTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertVendorSmartQuote = z.infer<typeof insertVendorSmartQuoteSchema>;
export type VendorSmartQuote = typeof vendorSmartQuoteTable.$inferSelect;
