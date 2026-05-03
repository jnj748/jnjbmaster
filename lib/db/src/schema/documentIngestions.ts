import { pgTable, text, serial, integer, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// [Task #774] OCR/문서엔진 v01 — 횡단 자료처리 엔진의 단일 보관함.
//   영수증·청구서·통장내역·계약서·의결문·세금계산서를 한 파이프라인으로 받아
//   원본 파일 + 표준화된 추출 JSON + 후속 도메인 객체 참조를 같이 저장한다.
//
//   기존 documents 테이블(#610)은 "산출물 레지스트리(일지·기안 등)"용이라
//   의미가 다르므로 별도 테이블로 둔다. 같은 파일이 다시 올라오면
//   contentHash + buildingId 콤보로 즉시 중복 검출한다.

export const documentIngestionKinds = [
  "receipt",          // 영수증
  "bill",             // 청구서(전기/수도/가스/관리)
  "bank_statement",   // 통장 거래내역(이미지/CSV)
  "contract",         // 용역 계약서
  "resolution",       // 의결문
  "tax_invoice",      // 세금계산서
  "business_reg",     // 사업자등록증 (보조)
  "memo",             // 현장 메모 (보조)
  "meter_photo",      // 계량기 사진 (보조)
  "unknown",
] as const;
export type DocumentIngestionKind = (typeof documentIngestionKinds)[number];

export const documentIngestionStatuses = [
  "extracted", // OCR 완료 / 사용자 확인 대기
  "confirmed", // 사용자가 확정해 후속 엔진으로 넘어감
  "rejected",  // 사용자가 추출 결과를 폐기
  "failed",    // OCR 자체가 실패
] as const;
export type DocumentIngestionStatus = (typeof documentIngestionStatuses)[number];

/**
 * 표준 추출 JSON 스키마. 모든 종류의 추출기가 이 형태로 결과를 돌려준다.
 * 후속 엔진(지출결의·부과·수납·회계)은 오직 이 스키마만 알면 된다.
 */
export const standardExtractionSchema = z.object({
  kind: z.enum(documentIngestionKinds),
  vendor: z.string().nullable().default(null),
  amount: z.number().nullable().default(null),
  date: z.string().nullable().default(null), // YYYY-MM-DD
  items: z.array(z.object({
    name: z.string(),
    amount: z.number().nullable().default(null),
    quantity: z.number().nullable().default(null),
  })).default([]),
  categoryCandidates: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1).default(0),
  rawText: z.string().default(""),
  pages: z.array(z.string()).default([]), // 페이지별 원문 (PDF 다중 페이지)
  /** 종류별 고유 필드 — 호출처가 종류별 어댑터를 통해 해석. */
  kindSpecific: z.record(z.string(), z.unknown()).default({}),
}).passthrough();
export type StandardExtraction = z.infer<typeof standardExtractionSchema>;

export const documentIngestionsTable = pgTable(
  "document_ingestions",
  {
    id: serial("id").primaryKey(),
    buildingId: integer("building_id"),
    uploadedBy: integer("uploaded_by"),
    kind: text("kind", { enum: documentIngestionKinds }).notNull(),
    status: text("status", { enum: documentIngestionStatuses }).notNull().default("extracted"),
    objectPath: text("object_path").notNull(),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    contentHash: text("content_hash").notNull(),
    extraction: jsonb("extraction").$type<StandardExtraction>().notNull(),
    /** 후속 도메인 객체 참조 — { expenseVoucherId, monthlyBillSummaryId, paymentId, journalEntryId, contractId, ... } */
    linkedRefs: jsonb("linked_refs").$type<Record<string, number | string>>().notNull().default({}),
    /** LLM 라우터 회계 — { tier, model, inputTokens, outputTokens, costEstimateUsd } */
    llmAccounting: jsonb("llm_accounting").$type<Record<string, unknown>>().notNull().default({}),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    byHash: index("document_ingestions_hash_idx").on(t.buildingId, t.contentHash),
    byKindCreated: index("document_ingestions_kind_created_idx").on(t.kind, t.createdAt),
    byBuildingCreated: index("document_ingestions_building_created_idx").on(t.buildingId, t.createdAt),
    dedup: uniqueIndex("document_ingestions_dedup_idx").on(t.buildingId, t.contentHash, t.kind),
  }),
);

export const insertDocumentIngestionSchema = createInsertSchema(documentIngestionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDocumentIngestion = z.infer<typeof insertDocumentIngestionSchema>;
export type DocumentIngestion = typeof documentIngestionsTable.$inferSelect;
