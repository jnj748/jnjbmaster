import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const dataDestructionLogsTable = pgTable("data_destruction_logs", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  unit: text("unit").notNull(),
  originalName: text("original_name").notNull(),
  destructionType: text("destruction_type").notNull().default("anonymization"),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  processedBy: text("processed_by").notNull().default("system"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDataDestructionLogSchema = createInsertSchema(dataDestructionLogsTable).omit({ id: true, createdAt: true });
export type InsertDataDestructionLog = z.infer<typeof insertDataDestructionLogSchema>;
export type DataDestructionLog = typeof dataDestructionLogsTable.$inferSelect;
