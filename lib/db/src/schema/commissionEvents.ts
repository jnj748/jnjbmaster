import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const commissionStatuses = ["pending", "billed", "collected", "completed", "cancelled"] as const;

export const commissionEventsTable = pgTable("commission_events", {
  id: serial("id").primaryKey(),
  commissionId: integer("commission_id").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status", { enum: commissionStatuses }).notNull(),
  reason: text("reason"),
  actorId: integer("actor_id"),
  actorName: text("actor_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCommissionEventSchema = createInsertSchema(commissionEventsTable).omit({ id: true, createdAt: true });
export type InsertCommissionEvent = z.infer<typeof insertCommissionEventSchema>;
export type CommissionEvent = typeof commissionEventsTable.$inferSelect;
