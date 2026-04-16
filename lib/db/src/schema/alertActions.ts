import { pgTable, text, serial, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const alertActionsTable = pgTable("alert_actions", {
  id: serial("id").primaryKey(),
  alertType: text("alert_type").notNull(),
  relatedEntityType: text("related_entity_type").notNull(),
  relatedEntityId: integer("related_entity_id").notNull(),
  actionType: text("action_type").notNull(),
  completedDate: date("completed_date"),
  nextCycleDate: date("next_cycle_date"),
  actedOnDueDate: date("acted_on_due_date"),
  postponeDays: integer("postpone_days"),
  postponeReason: text("postpone_reason"),
  rfqId: integer("rfq_id"),
  notes: text("notes"),
  closeUpPhotoUrl: text("close_up_photo_url"),
  widePhotoUrl: text("wide_photo_url"),
  delayReason: text("delay_reason"),
  delayReasonDetail: text("delay_reason_detail"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAlertActionSchema = createInsertSchema(alertActionsTable).omit({ id: true, createdAt: true });
export type InsertAlertAction = z.infer<typeof insertAlertActionSchema>;
export type AlertAction = typeof alertActionsTable.$inferSelect;
