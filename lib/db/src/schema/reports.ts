import { pgTable, text, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reportStatuses = ["draft", "submitted", "reviewed", "forwarded"] as const;
export const dailyReportTypes = ["expense", "cleaning", "maintenance", "security", "other"] as const;

export const dailyReportsTable = pgTable("daily_reports", {
  id: serial("id").primaryKey(),
  reportDate: text("report_date").notNull(),
  reportType: text("report_type", { enum: dailyReportTypes }).notNull().default("other"),
  title: text("title").notNull(),
  content: text("content").notNull(),
  photos: text("photos"),
  authorId: integer("author_id").notNull(),
  authorName: text("author_name").notNull(),
  status: text("status", { enum: reportStatuses }).notNull().default("draft"),
  reviewerId: integer("reviewer_id"),
  reviewerName: text("reviewer_name"),
  reviewComment: text("review_comment"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const weeklySummaryReportsTable = pgTable("weekly_summary_reports", {
  id: serial("id").primaryKey(),
  weekStart: text("week_start").notNull(),
  weekEnd: text("week_end").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  dailyReportIds: text("daily_report_ids"),
  totalDailyReports: integer("total_daily_reports").notNull().default(0),
  authorId: integer("author_id").notNull(),
  authorName: text("author_name").notNull(),
  status: text("status", { enum: reportStatuses }).notNull().default("draft"),
  reviewerId: integer("reviewer_id"),
  reviewerName: text("reviewer_name"),
  reviewComment: text("review_comment"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const monthlySummaryReportsTable = pgTable("monthly_summary_reports", {
  id: serial("id").primaryKey(),
  reportMonth: text("report_month").notNull(),
  buildingId: integer("building_id"),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  weeklyReportIds: text("weekly_report_ids"),
  totalWeeklyReports: integer("total_weekly_reports").notNull().default(0),
  totalBilled: real("total_billed"),
  totalCollected: real("total_collected"),
  collectionRate: real("collection_rate"),
  unpaidAmount: real("unpaid_amount"),
  unpaidUnits: integer("unpaid_units"),
  occupantCardCount: integer("occupant_card_count"),
  totalUnits: integer("total_units"),
  vehicleCardCount: integer("vehicle_card_count"),
  momChangePct: real("mom_change_pct"),
  authorId: integer("author_id").notNull(),
  authorName: text("author_name").notNull(),
  status: text("status", { enum: reportStatuses }).notNull().default("draft"),
  reviewerId: integer("reviewer_id"),
  reviewerName: text("reviewer_name"),
  reviewComment: text("review_comment"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDailyReportSchema = createInsertSchema(dailyReportsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDailyReport = z.infer<typeof insertDailyReportSchema>;
export type DailyReport = typeof dailyReportsTable.$inferSelect;

export const insertWeeklySummaryReportSchema = createInsertSchema(weeklySummaryReportsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWeeklySummaryReport = z.infer<typeof insertWeeklySummaryReportSchema>;
export type WeeklySummaryReport = typeof weeklySummaryReportsTable.$inferSelect;

export const insertMonthlySummaryReportSchema = createInsertSchema(monthlySummaryReportsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMonthlySummaryReport = z.infer<typeof insertMonthlySummaryReportSchema>;
export type MonthlySummaryReport = typeof monthlySummaryReportsTable.$inferSelect;
