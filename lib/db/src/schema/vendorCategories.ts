// [Task #132] 파트너 분야 마스터 데이터.
import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const vendorCategoriesTable = pgTable("vendor_categories", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type VendorCategory = typeof vendorCategoriesTable.$inferSelect;

export const VENDOR_CATEGORY_SEED: { code: string; label: string; sortOrder: number }[] = [
  { code: "facility_maintenance", label: "시설 및 영선", sortOrder: 10 },
  { code: "consumables", label: "소모품 공급", sortOrder: 20 },
  { code: "cleaning", label: "청소", sortOrder: 30 },
  { code: "security", label: "경비", sortOrder: 40 },
  { code: "fire_safety", label: "소방", sortOrder: 50 },
  { code: "elevator", label: "승강기", sortOrder: 60 },
  { code: "electrical", label: "전기", sortOrder: 70 },
  { code: "mechanical", label: "기계설비", sortOrder: 80 },
  { code: "other", label: "기타", sortOrder: 999 },
];
