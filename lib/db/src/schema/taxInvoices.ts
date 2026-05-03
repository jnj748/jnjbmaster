// [Task #803] 결산·세무 모듈 — 세금계산서 도메인.
//   tax_vendors:      세금계산서 거래처 마스터(공급자/공급받는자).
//   tax_items:        품목 마스터(코드·명·규격·기본 단가).
//   tax_invoices:     세금계산서 헤더(매출/매입, 과세/영세, 청구/수금, 상태 흐름).
//   tax_invoice_lines: 라인(년/월/일/품목/수량/단가/공급가액/세액/비고).
//   tax_invoice_transmissions: 거래처 발송 + 국세청 전송 이력.
//
// 상태 흐름(헤더):
//   draft -> issued -> transmitted -> nts_approved
//                                  \-> nts_failed (재전송)
//   any   -> cancelled (수정 발행 시 원본은 cancelled, 신규 행은 corrected)
//
// 외부 연동(Popbill 등)은 #781 dispatch_jobs / 외부 어댑터 재사용. 본 도메인은
// 화면·데이터 모델·검증·요약 집계까지만 책임진다.

import {
  pgTable, text, serial, integer, real, timestamp, jsonb, boolean, index, unique, date,
} from "drizzle-orm/pg-core";
import { buildingsTable } from "./buildings";

export const taxInvoiceTypes = ["sales", "purchase"] as const;
export const taxInvoiceTaxTypes = ["taxable", "zero_rated", "exempt"] as const;
export const taxInvoiceStatuses = [
  "draft",
  "issued",
  "transmitted",
  "nts_approved",
  "nts_failed",
  "cancelled",
  "corrected",
] as const;
export const taxInvoiceBillTypes = ["billed", "received"] as const; // 청구·수금
// 국세청 수정세금계산서 사유 코드(요약). 화면/검증/감사 추적용.
//   supply_change          공급가액 변동(증액·감액)
//   return                 환입(반품)
//   contract_termination   계약 해지
//   misentry               기재사항 착오·정정
//   duplicate              착오에 의한 이중발급
//   local_lc               내국신용장 사후 개설
//   other                  기타
export const taxInvoiceCorrectionTypes = [
  "supply_change",
  "return",
  "contract_termination",
  "misentry",
  "duplicate",
  "local_lc",
  "other",
] as const;

export type TaxInvoiceType = typeof taxInvoiceTypes[number];
export type TaxInvoiceTaxType = typeof taxInvoiceTaxTypes[number];
export type TaxInvoiceStatus = typeof taxInvoiceStatuses[number];
export type TaxInvoiceBillType = typeof taxInvoiceBillTypes[number];
export type TaxInvoiceCorrectionType = typeof taxInvoiceCorrectionTypes[number];

export const taxVendorsTable = pgTable(
  "tax_vendors",
  {
    id: serial("id").primaryKey(),
    buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["supplier", "buyer", "both"] }).notNull().default("both"),
    bizNo: text("biz_no").notNull(),       // 사업자등록번호 (10자리, 하이픈 제거)
    companyName: text("company_name").notNull(),
    representative: text("representative"),
    address: text("address"),
    bizType: text("biz_type"),             // 업태
    bizItem: text("biz_item"),              // 종목
    contactName: text("contact_name"),
    phone: text("phone"),
    email: text("email"),
    smsTo: text("sms_to"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("tax_vendors_building_idx").on(t.buildingId),
    unique("tax_vendors_building_bizno_uk").on(t.buildingId, t.bizNo),
  ],
);

export const taxItemsTable = pgTable(
  "tax_items",
  {
    id: serial("id").primaryKey(),
    buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    spec: text("spec"),
    unitPrice: real("unit_price").notNull().default(0),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("tax_items_building_idx").on(t.buildingId),
    unique("tax_items_building_code_uk").on(t.buildingId, t.code),
  ],
);

export const taxInvoicesTable = pgTable(
  "tax_invoices",
  {
    id: serial("id").primaryKey(),
    buildingId: integer("building_id").notNull().references(() => buildingsTable.id, { onDelete: "cascade" }),
    invoiceType: text("invoice_type", { enum: taxInvoiceTypes }).notNull(),
    taxType: text("tax_type", { enum: taxInvoiceTaxTypes }).notNull().default("taxable"),
    billType: text("bill_type", { enum: taxInvoiceBillTypes }).notNull().default("billed"),
    status: text("status", { enum: taxInvoiceStatuses }).notNull().default("draft"),
    // 발급일자(작성일자). yyyy-mm-dd.
    issueDate: date("issue_date").notNull(),
    // 승인번호(국세청 전송 후 채워짐).
    approvalNumber: text("approval_number"),
    // 공급자 / 공급받는자 — 발행 시점 스냅샷(거래처 변경에도 흔들리지 않도록).
    supplierVendorId: integer("supplier_vendor_id").references(() => taxVendorsTable.id, { onDelete: "set null" }),
    supplierBizNo: text("supplier_biz_no").notNull(),
    supplierName: text("supplier_name").notNull(),
    supplierRepresentative: text("supplier_representative"),
    supplierAddress: text("supplier_address"),
    supplierBizType: text("supplier_biz_type"),
    supplierBizItem: text("supplier_biz_item"),
    supplierEmail: text("supplier_email"),
    buyerVendorId: integer("buyer_vendor_id").references(() => taxVendorsTable.id, { onDelete: "set null" }),
    buyerBizNo: text("buyer_biz_no").notNull(),
    buyerName: text("buyer_name").notNull(),
    buyerRepresentative: text("buyer_representative"),
    buyerAddress: text("buyer_address"),
    buyerBizType: text("buyer_biz_type"),
    buyerBizItem: text("buyer_biz_item"),
    buyerEmail: text("buyer_email"),
    // 합계.
    supplyAmount: real("supply_amount").notNull().default(0),
    taxAmount: real("tax_amount").notNull().default(0),
    totalAmount: real("total_amount").notNull().default(0),
    cashAmount: real("cash_amount").notNull().default(0),
    checkAmount: real("check_amount").notNull().default(0),
    noteAmount: real("note_amount").notNull().default(0),
    creditAmount: real("credit_amount").notNull().default(0),
    note: text("note"),
    // 수정 발행 시 원본 참조 + 사유.
    correctedFromId: integer("corrected_from_id"),
    correctionType: text("correction_type", { enum: taxInvoiceCorrectionTypes }),
    correctionReason: text("correction_reason"),
    // 메타: AI 추천 채움 / 일괄 업로드 배치 식별 등.
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdById: integer("created_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("tax_invoices_building_idx").on(t.buildingId),
    index("tax_invoices_status_idx").on(t.status),
    index("tax_invoices_issue_date_idx").on(t.issueDate),
    index("tax_invoices_buyer_idx").on(t.buyerBizNo),
    index("tax_invoices_supplier_idx").on(t.supplierBizNo),
  ],
);

export const taxInvoiceLinesTable = pgTable(
  "tax_invoice_lines",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id").notNull().references(() => taxInvoicesTable.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    lineDate: date("line_date"),
    itemCode: text("item_code"),
    itemName: text("item_name").notNull(),
    spec: text("spec"),
    quantity: real("quantity").notNull().default(0),
    unitPrice: real("unit_price").notNull().default(0),
    supplyAmount: real("supply_amount").notNull().default(0),
    taxAmount: real("tax_amount").notNull().default(0),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tax_invoice_lines_invoice_idx").on(t.invoiceId)],
);

export const taxInvoiceTransmissionsTable = pgTable(
  "tax_invoice_transmissions",
  {
    id: serial("id").primaryKey(),
    invoiceId: integer("invoice_id").notNull().references(() => taxInvoicesTable.id, { onDelete: "cascade" }),
    // 'email' | 'sms' | 'kakao' | 'nts'  (#781 dispatch_jobs 채널과 매핑).
    kind: text("kind").notNull(),
    target: text("target").notNull(),
    status: text("status", { enum: ["queued", "sent", "failed", "approved", "rejected", "cancelled"] }).notNull().default("queued"),
    dispatchJobId: integer("dispatch_job_id"),
    response: jsonb("response").$type<Record<string, unknown>>().notNull().default({}),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tax_invoice_tx_invoice_idx").on(t.invoiceId),
    index("tax_invoice_tx_status_idx").on(t.status),
  ],
);

export type TaxVendor = typeof taxVendorsTable.$inferSelect;
export type InsertTaxVendor = typeof taxVendorsTable.$inferInsert;
export type TaxItem = typeof taxItemsTable.$inferSelect;
export type InsertTaxItem = typeof taxItemsTable.$inferInsert;
export type TaxInvoice = typeof taxInvoicesTable.$inferSelect;
export type InsertTaxInvoice = typeof taxInvoicesTable.$inferInsert;
export type TaxInvoiceLine = typeof taxInvoiceLinesTable.$inferSelect;
export type InsertTaxInvoiceLine = typeof taxInvoiceLinesTable.$inferInsert;
export type TaxInvoiceTransmission = typeof taxInvoiceTransmissionsTable.$inferSelect;
export type InsertTaxInvoiceTransmission = typeof taxInvoiceTransmissionsTable.$inferInsert;
