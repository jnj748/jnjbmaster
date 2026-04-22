import { pgTable, text, serial, integer, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// 플랫폼 관리자가 업로드/입력하는 공통 지식 자료 (법령·개정안·운영 가이드 등).
// 모든 관리소장 AI 비서가 공통으로 참조한다.
//
// - bodyText: AI 가 실제로 사용하는 본문(직접 붙여넣기). 가장 중요한 필드.
// - fileUrl/fileName: 참조용 첨부 파일(원본 PDF/한글 등). UI 다운로드용이며
//                     AI 컨텍스트에는 포함되지 않는다.
// - category: 자유 텍스트(법령·개정안·가이드·기타). 검색·필터용.
// - effectiveDate/version: 개정안의 시행일·버전 표기에 사용.
// - isActive: false 면 AI 컨텍스트에서 제외.
export const platformKnowledgeDocsTable = pgTable(
  "platform_knowledge_docs",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    category: text("category").notNull().default("기타"),
    summary: text("summary"),
    bodyText: text("body_text").notNull().default(""),
    fileUrl: text("file_url"),
    fileName: text("file_name"),
    effectiveDate: text("effective_date"),
    version: text("version"),
    isActive: boolean("is_active").notNull().default(true),
    createdBy: integer("created_by"),
    createdByName: text("created_by_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    activeIdx: index("ix_platform_knowledge_docs_active").on(t.isActive),
  }),
);

export const insertPlatformKnowledgeDocSchema = createInsertSchema(
  platformKnowledgeDocsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPlatformKnowledgeDoc = z.infer<typeof insertPlatformKnowledgeDocSchema>;
export type PlatformKnowledgeDoc = typeof platformKnowledgeDocsTable.$inferSelect;
