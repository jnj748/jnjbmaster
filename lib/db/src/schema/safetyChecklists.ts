import { pgTable, text, serial, integer, timestamp, date, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const safetyChecklistsTable = pgTable("safety_checklists", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id"),
  category: text("category").notNull(),
  title: text("title").notNull(),
  inspectionDate: date("inspection_date").notNull(),
  inspector: text("inspector").notNull(),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  closeUpPhotoUrl: text("close_up_photo_url"),
  widePhotoUrl: text("wide_photo_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSafetyChecklistSchema = createInsertSchema(safetyChecklistsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSafetyChecklist = z.infer<typeof insertSafetyChecklistSchema>;
export type SafetyChecklist = typeof safetyChecklistsTable.$inferSelect;

export const safetyChecklistItemsTable = pgTable("safety_checklist_items", {
  id: serial("id").primaryKey(),
  checklistId: integer("checklist_id").notNull(),
  itemName: text("item_name").notNull(),
  checked: boolean("checked").notNull().default(false),
  result: text("result"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSafetyChecklistItemSchema = createInsertSchema(safetyChecklistItemsTable).omit({ id: true, createdAt: true });
export type InsertSafetyChecklistItem = z.infer<typeof insertSafetyChecklistItemSchema>;
export type SafetyChecklistItem = typeof safetyChecklistItemsTable.$inferSelect;

// [Task #650] 본사 관리자가 관리하는 안전점검표 카테고리(전기설비/소방시설/...).
//   value 는 safety_checklists.category 값(slug). 기존 데이터와의 호환을 위해 텍스트 slug 를 유지한다.
export const safetyChecklistTemplateCategoriesTable = pgTable("safety_checklist_template_categories", {
  id: serial("id").primaryKey(),
  value: text("value").notNull().unique(),
  label: text("label").notNull(),
  sortOrder: integer("sort_order").notNull().default(100),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SafetyChecklistTemplateCategory = typeof safetyChecklistTemplateCategoriesTable.$inferSelect;

// [Task #650] 카테고리별 본사 기본 점검 항목.
export const safetyChecklistTemplateItemsTable = pgTable("safety_checklist_template_items", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").notNull(),
  itemName: text("item_name").notNull(),
  sortOrder: integer("sort_order").notNull().default(100),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SafetyChecklistTemplateItem = typeof safetyChecklistTemplateItemsTable.$inferSelect;

// [Task #650] 직원(개인)별 카테고리별 점검 항목 묶음.
//   같은 사용자 × 같은 카테고리는 한 행만 유지되며, items 는 항목 이름 배열 JSON.
//   본인이 저장한 적이 없는 카테고리는 본사 기본 템플릿이 자동으로 채워진다.
export const safetyChecklistUserTemplatesTable = pgTable("safety_checklist_user_templates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  category: text("category").notNull(),
  items: text("items").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type SafetyChecklistUserTemplate = typeof safetyChecklistUserTemplatesTable.$inferSelect;
