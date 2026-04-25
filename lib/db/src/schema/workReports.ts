import { pgTable, text, serial, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const workReportsTable = pgTable("work_reports", {
  id: serial("id").primaryKey(),
  rfqId: integer("rfq_id").notNull(),
  quoteId: integer("quote_id").notNull(),
  vendorId: integer("vendor_id").notNull(),
  vendorName: text("vendor_name").notNull(),
  buildingId: integer("building_id"),
  contractId: integer("contract_id"),
  title: text("title").notNull(),
  description: text("description"),
  completionDate: date("completion_date").notNull(),
  photoUrls: text("photo_urls"),
  status: text("status").notNull().default("submitted"),
  reviewNotes: text("review_notes"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  // [Task #339] 검수자(승인자) 사용자 ID — 별점 등록 시 본인 검증에 사용한다.
  reviewerUserId: integer("reviewer_user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWorkReportSchema = createInsertSchema(workReportsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWorkReport = z.infer<typeof insertWorkReportSchema>;
export type WorkReport = typeof workReportsTable.$inferSelect;
