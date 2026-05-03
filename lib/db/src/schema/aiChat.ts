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

// [Task #761] 비용 회계용 메타. tier/model/cost 를 jsonb 한 컬럼에 모아 향후
// 분석 쿼리에서 jsonb 인덱스로 추출한다. 새 컬럼을 매번 추가하지 않기 위해
// 자유 schema 로 두되, 라우터가 채워넣는 필드는 아래 타입에 명세화한다.
export type AiChatMessageMetadata = {
  tier?: "tier0" | "tier1" | "tier2";
  model?: string;
  costEstimateUsd?: number;
  /** OCR 호출 등 채팅이 아닌 호출원도 동일 jsonb 를 재사용. */
  caller?: string;
};

export const aiChatMessagesTable = pgTable("ai_chat_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => aiChatSessionsTable.id, { onDelete: "cascade" }),
  role: text("role", { enum: aiChatRoles }).notNull(),
  content: text("content").notNull(),
  citations: jsonb("citations").$type<AiChatCitation[]>().default([]),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  metadata: jsonb("metadata").$type<AiChatMessageMetadata>().default({}),
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
