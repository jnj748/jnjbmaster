import { pgTable, text, serial, integer, real, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rfqsTable = pgTable("rfqs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  serviceType: text("service_type"),
  description: text("description"),
  buildingName: text("building_name").notNull(),
  buildingId: integer("building_id"),
  desiredDate: date("desired_date"),
  deadline: date("deadline").notNull(),
  status: text("status").notNull().default("open"),
  vendorIds: text("vendor_ids"),
  sido: text("sido"),
  sigungu: text("sigungu"),
  geoScope: text("geo_scope"),
  closeUpPhotoUrl: text("close_up_photo_url"),
  widePhotoUrl: text("wide_photo_url"),
  estimatedAmount: real("estimated_amount"),
  isPremium: boolean("is_premium").notNull().default(false),
  premiumSlotLimit: integer("premium_slot_limit"),
  // [Task #612] 현장방문 견적 워크플로우 — 매니저가 RFQ 생성 시 "현장방문 견적 필요"
  //   체크박스를 켜면 파트너 카드/상세에 뱃지가 표시되고, 일정 조율 위젯이 활성화된다.
  requiresSiteVisit: boolean("requires_site_visit").notNull().default(false),
  // [Task #612] 채택된 견적 ID + 마감 시각. 매니저가 견적 채택 시 RFQ 가 closed 로 전환되며
  //   다른 견적은 자동 reject. closedQuoteId 로 전체 타임라인을 단번에 추적할 수 있다.
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closedQuoteId: integer("closed_quote_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRfqSchema = createInsertSchema(rfqsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRfq = z.infer<typeof insertRfqSchema>;
export type Rfq = typeof rfqsTable.$inferSelect;
