import { pgTable, text, serial, boolean, real, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const vendorsTable = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  type: text("type").notNull().default("contracted"),
  contactName: text("contact_name"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  rating: real("rating"),
  isRecommended: boolean("is_recommended").notNull().default(false),
  notes: text("notes"),
  businessRegNumber: text("business_reg_number"),
  representativeName: text("representative_name"),
  serviceArea: text("service_area"),
  subCategories: text("sub_categories"),
  sido: text("sido"),
  sigungu: text("sigungu"),
  profileImageUrl: text("profile_image_url"),
  // [Task #661] 파트너 1줄 소개글(최대 30자, NULL 허용). 가입 위저드/내 정보에서 자유 수정.
  intro: text("intro"),
  joinedAt: timestamp("joined_at", { withTimezone: true }),
  contractBuildingName: text("contract_building_name"),
  contractStartDate: date("contract_start_date"),
  contractEndDate: date("contract_end_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertVendorSchema = createInsertSchema(vendorsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendorsTable.$inferSelect;
