import { pgTable, text, serial, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const taskTemplateCategories = ["mandatory", "suggested"] as const;
export type TaskTemplateCategory = (typeof taskTemplateCategories)[number];

export const taskTemplateClassifications = ["legal", "internal"] as const;
export type TaskTemplateClassification = (typeof taskTemplateClassifications)[number];

export const taskTemplateFrequencyTypes = [
  "one_time",
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
] as const;
export type TaskTemplateFrequencyType = (typeof taskTemplateFrequencyTypes)[number];

// [Task #221] 적용 대상(scope) 종류.
// - all: 모든 건물·사용자에게 노출 (기본)
// - building_ids: scopeValues 에 포함된 건물 ID 에 소속된 사용자에게만 노출
// - user_ids: scopeValues 에 포함된 사용자 ID 에게만 직접 노출
// (건물 유형/HQ 본부 등 추가 차원은 해당 도메인 필드가 도입되는 후속 작업에서
// 같은 scopeType 모델을 확장해 추가한다 — Followup #229 참고.)
export const taskTemplateScopeTypes = [
  "all",
  "building_ids",
  "user_ids",
] as const;
export type TaskTemplateScopeType = (typeof taskTemplateScopeTypes)[number];

export const taskTemplatesTable = pgTable("task_templates", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  classification: text("classification").notNull().default("internal"),
  iconName: text("icon_name"),
  color: text("color"),
  frequencyType: text("frequency_type").notNull().default("one_time"),
  intervalValue: integer("interval_value"),
  fixedMonth: integer("fixed_month"),
  fixedDay: integer("fixed_day"),
  startDate: text("start_date"),
  scopeType: text("scope_type").notNull().default("all"),
  scopeValues: jsonb("scope_values").$type<string[]>().notNull().default([]),
  priority: integer("priority").notNull().default(50),
  advanceAlertDays: integer("advance_alert_days").notNull().default(7),
  isActive: boolean("is_active").notNull().default(true),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdBy: integer("created_by"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTaskTemplateSchema = createInsertSchema(taskTemplatesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTaskTemplate = z.infer<typeof insertTaskTemplateSchema>;
export type TaskTemplate = typeof taskTemplatesTable.$inferSelect;

export const taskTemplateAuditActions = ["create", "update", "delete", "toggle"] as const;
export type TaskTemplateAuditAction = (typeof taskTemplateAuditActions)[number];

export const taskTemplateAuditLogsTable = pgTable("task_template_audit_logs", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id"),
  templateTitle: text("template_title"),
  action: text("action").notNull(),
  changes: jsonb("changes").$type<Record<string, unknown>>().notNull().default({}),
  changedBy: integer("changed_by").references(() => usersTable.id, { onDelete: "set null" }),
  changedByName: text("changed_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TaskTemplateAuditLog = typeof taskTemplateAuditLogsTable.$inferSelect;
