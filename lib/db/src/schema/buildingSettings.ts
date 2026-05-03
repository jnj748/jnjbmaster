// [Task #796] 환경설정 5개 1:1 테이블 + 호실별 2개 테이블.
import { pgTable, serial, integer, text, boolean, jsonb, numeric, date, timestamp, unique, index } from "drizzle-orm/pg-core";
import { buildingsTable } from "./buildings";
import { unitsTable } from "./units";

export const meteringEnvironmentTable = pgTable("metering_environment", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().unique().references(() => buildingsTable.id),
  config: jsonb("config").notNull().default({}),
  kepcoTerms: jsonb("kepco_terms").notNull().default([]),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const meteringUsageSettingsTable = pgTable("metering_usage_settings", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().unique().references(() => buildingsTable.id),
  config: jsonb("config").notNull().default({}),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const noticeOutputSettingsTable = pgTable("notice_output_settings", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().unique().references(() => buildingsTable.id),
  showAlias: boolean("show_alias").notNull().default(false),
  aliasName: text("alias_name"),
  deliveryPostal: boolean("delivery_postal").notNull().default(true),
  deliveryDirect: boolean("delivery_direct").notNull().default(false),
  deliveryEmail: boolean("delivery_email").notNull().default(false),
  registeredNo: text("registered_no"),
  autoTransferOrg: text("auto_transfer_org"),
  vatIncluded: boolean("vat_included").notNull().default(false),
  positions: jsonb("positions").notNull().default({}),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const billingEnvironmentSettingsTable = pgTable("billing_environment_settings", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().unique().references(() => buildingsTable.id),
  categoryConfig: jsonb("category_config").notNull().default({}),
  vatThresholdM2: numeric("vat_threshold_m2").default("135"),
  escoConfig: jsonb("esco_config").notNull().default({}),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const yearEndTaxInfoTable = pgTable("year_end_tax_info", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().unique().references(() => buildingsTable.id),
  settlementYear: integer("settlement_year"),
  businessNumber: text("business_number"),
  companyName: text("company_name"),
  representative: text("representative"),
  businessAddress: text("business_address"),
  industryType: text("industry_type"),
  businessItem: text("business_item"),
  contactPerson: text("contact_person"),
  taxOfficeCode: text("tax_office_code"),
  deductionMethod: text("deduction_method"),
  quarterlyPay: boolean("quarterly_pay").notNull().default(false),
  invoiceStatus: jsonb("invoice_status").notNull().default([]),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const prepaidDepositsTable = pgTable("prepaid_deposits", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id),
  depositDate: date("deposit_date"),
  receiptPeriod: text("receipt_period"),
  supplyArea: numeric("supply_area"),
  moveInDate: date("move_in_date"),
  prepaidAmount: integer("prepaid_amount").notNull().default(0),
  receivedAmount: integer("received_amount").notNull().default(0),
  unpaidAmount: integer("unpaid_amount").notNull().default(0),
  paidAt: date("paid_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique("prepaid_deposits_building_unit").on(t.buildingId, t.unitId),
  index("prepaid_deposits_building_idx").on(t.buildingId),
]);

export const accessCardsTable = pgTable("access_cards", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id),
  unitId: integer("unit_id").references(() => unitsTable.id),
  serialNo: text("serial_no").notNull(),
  issuedAt: date("issued_at"),
  revokedAt: date("revoked_at"),
  cardRegistered: boolean("card_registered").notNull().default(true),
  depositAmount: integer("deposit_amount").notNull().default(0),
  issueFee: integer("issue_fee").notNull().default(0),
  recipientName: text("recipient_name"),
  recipientPhone: text("recipient_phone"),
  bankName: text("bank_name"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  index("access_cards_building_idx").on(t.buildingId),
  index("access_cards_unit_idx").on(t.unitId),
]);

export type MeteringEnvironment = typeof meteringEnvironmentTable.$inferSelect;
export type MeteringUsageSettings = typeof meteringUsageSettingsTable.$inferSelect;
export type NoticeOutputSettings = typeof noticeOutputSettingsTable.$inferSelect;
export type BillingEnvironmentSettings = typeof billingEnvironmentSettingsTable.$inferSelect;
export type YearEndTaxInfo = typeof yearEndTaxInfoTable.$inferSelect;
export type PrepaidDeposit = typeof prepaidDepositsTable.$inferSelect;
export type AccessCard = typeof accessCardsTable.$inferSelect;
