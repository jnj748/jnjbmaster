import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { buildingsTable } from "./buildings";

export const complaintsTable = pgTable("complaints", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id),
  unitNumber: text("unit_number").notNull(),
  complainantName: text("complainant_name").notNull(),
  complainantPhone: text("complainant_phone"),
  category: text("category", { enum: ["noise", "parking", "maintenance", "cleaning", "security", "other"] }).notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: text("status", { enum: ["received", "assigned", "in_progress", "completed"] }).notNull().default("received"),
  assigneeName: text("assignee_name"),
  resolution: text("resolution"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
