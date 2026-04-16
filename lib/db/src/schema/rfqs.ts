import { pgTable, text, serial, integer, real, boolean, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const rfqsTable = pgTable("rfqs", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull(),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertRfqSchema = createInsertSchema(rfqsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRfq = z.infer<typeof insertRfqSchema>;
export type Rfq = typeof rfqsTable.$inferSelect;
