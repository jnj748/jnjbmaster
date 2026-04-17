import { pgTable, text, serial, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { buildingsTable } from "./buildings";

export const aiChatRoles = ["user", "assistant", "system"] as const;

export const aiChatSessionsTable = pgTable("ai_chat_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  buildingId: integer("building_id").references(() => buildingsTable.id),
  title: text("title").notNull().default("새 대화"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const aiChatMessagesTable = pgTable("ai_chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => aiChatSessionsTable.id, { onDelete: "cascade" }),
  role: text("role", { enum: aiChatRoles }).notNull(),
  content: text("content").notNull(),
  citations: jsonb("citations").$type<AiChatCitation[]>().default([]),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AiChatCitation = {
  type: string;
  id: number | string;
  label: string;
};

export const insertAiChatSessionSchema = createInsertSchema(aiChatSessionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAiChatSession = z.infer<typeof insertAiChatSessionSchema>;
export type AiChatSession = typeof aiChatSessionsTable.$inferSelect;

export const insertAiChatMessageSchema = createInsertSchema(aiChatMessagesTable).omit({ id: true, createdAt: true });
export type InsertAiChatMessage = z.infer<typeof insertAiChatMessageSchema>;
export type AiChatMessage = typeof aiChatMessagesTable.$inferSelect;
