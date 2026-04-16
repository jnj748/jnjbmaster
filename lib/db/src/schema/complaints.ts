import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { buildingsTable } from "./buildings";
import { unitsTable } from "./units";

export const complaintCategories = [
  "noise", "parking", "maintenance", "cleaning", "security",
  "contract_legal", "management_dispute", "accounting_issue",
  "water_leak", "elevator", "floor_noise", "other"
] as const;

export const complaintSensitivities = ["normal", "caution", "sensitive", "urgent"] as const;

export const SENSITIVE_CATEGORIES: string[] = ["contract_legal", "management_dispute", "accounting_issue"];

export const RISK_KEYWORDS = [
  "계약 해지", "고소", "고발", "관리인 해임", "횡령", "배임",
  "소송", "형사", "민사", "법적 조치", "손해배상", "사기"
];

export const complaintsTable = pgTable("complaints", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id),
  unitId: integer("unit_id").references(() => unitsTable.id),
  unitNumber: text("unit_number").notNull(),
  complainantName: text("complainant_name").notNull(),
  complainantPhone: text("complainant_phone"),
  category: text("category", { enum: complaintCategories }).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status", { enum: ["received", "assigned", "in_progress", "completed"] }).notNull().default("received"),
  assigneeName: text("assignee_name"),
  resolution: text("resolution"),
  sensitivity: text("sensitivity", { enum: complaintSensitivities }).notNull().default("normal"),
  isRecurring: boolean("is_recurring").notNull().default(false),
  recurringCount: integer("recurring_count").notNull().default(0),
  hasRiskKeyword: boolean("has_risk_keyword").notNull().default(false),
  photoUrls: jsonb("photo_urls").$type<string[]>().default([]),
  escalatedToHq: boolean("escalated_to_hq").notNull().default(false),
  escalatedAt: timestamp("escalated_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
