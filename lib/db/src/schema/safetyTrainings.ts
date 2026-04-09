import { pgTable, text, serial, integer, timestamp, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const safetyTrainingsTable = pgTable("safety_trainings", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  trainingDate: date("training_date").notNull(),
  trainingMonth: integer("training_month").notNull(),
  trainingYear: integer("training_year").notNull(),
  trainer: text("trainer").notNull(),
  attendees: text("attendees"),
  attendeeCount: integer("attendee_count").notNull().default(0),
  duration: text("duration"),
  content: text("content"),
  status: text("status").notNull().default("scheduled"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSafetyTrainingSchema = createInsertSchema(safetyTrainingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSafetyTraining = z.infer<typeof insertSafetyTrainingSchema>;
export type SafetyTraining = typeof safetyTrainingsTable.$inferSelect;
