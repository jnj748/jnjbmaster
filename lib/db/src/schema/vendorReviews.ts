import { pgTable, serial, integer, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vendorReviewsTable = pgTable(
  "vendor_reviews",
  {
    id: serial("id").primaryKey(),
    vendorId: integer("vendor_id").notNull(),
    workReportId: integer("work_report_id").notNull(),
    rfqId: integer("rfq_id"),
    quoteId: integer("quote_id"),
    buildingId: integer("building_id"),
    reviewerUserId: integer("reviewer_user_id"),
    rating: real("rating").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    workReportUnique: uniqueIndex("vendor_reviews_work_report_unique").on(table.workReportId),
  }),
);

export const insertVendorReviewSchema = createInsertSchema(vendorReviewsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertVendorReview = z.infer<typeof insertVendorReviewSchema>;
export type VendorReview = typeof vendorReviewsTable.$inferSelect;
