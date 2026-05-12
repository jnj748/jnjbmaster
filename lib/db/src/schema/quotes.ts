import { pgTable, text, serial, integer, real, timestamp, date, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const quotesTable = pgTable("quotes", {
  id: serial("id").primaryKey(),
  rfqId: integer("rfq_id").notNull(),
  vendorId: integer("vendor_id").notNull(),
  vendorName: text("vendor_name").notNull(),
  totalAmount: real("total_amount").notNull(),
  itemBreakdown: text("item_breakdown"),
  scope: text("scope"),
  estimatedDays: integer("estimated_days"),
  availableDate: date("available_date"),
  notes: text("notes"),
  status: text("status").notNull().default("submitted"),
  contractFilePath: text("contract_file_path"),
  contractUploadedAt: timestamp("contract_uploaded_at", { withTimezone: true }),
  requiredDocsComplete: boolean("required_docs_complete").notNull().default(false),
  // [Task #226] 관리소장이 견적을 처음 열람한 시각. 미열람 환불 잡 판정용.
  firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }),
  noViewRefundedAt: timestamp("no_view_refunded_at", { withTimezone: true }),
  // [Task #612] 표준 견적 양식 필드.
  //   lineItems: JSON 직렬화된 배열 [{ name, qty, unitPrice, amount, notes }]
  //   subtotal/vatAmount: 라인 합계와 부가세. 서버에서 subtotal+vatAmount≈totalAmount 일관성 검증.
  //   validUntil: 견적 유효기간 (만료일).
  //   warrantyTerms: 보증/A/S 조건 자유 서술.
  //   attachmentUrl: 첨부 PDF object storage 경로.
  lineItems: text("line_items"),
  subtotal: real("subtotal"),
  vatAmount: real("vat_amount"),
  validUntil: date("valid_until"),
  warrantyTerms: text("warranty_terms"),
  attachmentUrl: text("attachment_url"),
  // [Task #견적-첨부v2] 다중 첨부 (제안서/견적서 PDF 등) — JSON 직렬화된 string[].
  //   기존 attachmentUrl(단수) 은 호환성 유지, 신규 폼은 attachmentUrls(복수) 를 사용.
  attachmentUrls: text("attachment_urls"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  rfqVendorUnique: uniqueIndex("quotes_rfq_vendor_unique").on(t.rfqId, t.vendorId),
}));

export const insertQuoteSchema = createInsertSchema(quotesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type Quote = typeof quotesTable.$inferSelect;
