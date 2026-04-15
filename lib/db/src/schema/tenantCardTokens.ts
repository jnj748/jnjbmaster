import { pgTable, text, serial, integer, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { unitsTable } from "./units";
import { buildingsTable } from "./buildings";

export const tenantCardTokensTable = pgTable("tenant_card_tokens", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").references(() => buildingsTable.id).notNull(),
  unitId: integer("unit_id").references(() => unitsTable.id).notNull(),
  unitLabel: text("unit_label").notNull(),
  token: uuid("token").notNull().defaultRandom(),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: text("approved_by"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTenantCardTokenSchema = createInsertSchema(tenantCardTokensTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenantCardToken = z.infer<typeof insertTenantCardTokenSchema>;
export type TenantCardToken = typeof tenantCardTokensTable.$inferSelect;
