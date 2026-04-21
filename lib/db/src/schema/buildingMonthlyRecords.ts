import { pgTable, text, serial, integer, json, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { buildingsTable } from "./buildings";

export type EnergyEntry = {
  usage: number;
  unit: string;
  amount: number;          // 청구금액 (원)
  avgPerUnit: number;      // 세대당 평균 사용량
  basicCharge?: number;    // 기본료 (가용 시)
  usageCharge?: number;    // 사용량 요금 (가용 시)
};

export type EnergySection = {
  electricity: EnergyEntry | null;
  water: EnergyEntry | null;
  heating: EnergyEntry | null;
  gas: EnergyEntry | null;
};

export type DiscountSection = {
  energyVoucher: { count: number; amount: number } | null;
  tvFeeExemption: { count: number; amount: number } | null;
  socialDiscount: { count: number; amount: number } | null;
  notes: string | null;
};

export type OneTimeChargeSection = {
  elevatorUsage: { count: number; amount: number } | null;
  moveInOut: { count: number; amount: number } | null;
  foodWaste: { weightKg: number; amount: number } | null;
  notes: string | null;
};

export type CollectionSection = {
  billedAmount: number;
  collectedAmount: number;
  collectionRate: number;
  overdueAmount: number;
  overdueCount: number;
  bankMatched: number;
  bankUnmatched: number;
  autoTransferCount: number;
  autoTransferAmount: number;
  lateFeeAmount: number;
  // 은행 매칭 세부 (일치/부족/초과)
  matchExactCount: number;
  matchExactAmount: number;
  matchShortageCount: number;
  matchShortageAmount: number;
  matchOverCount: number;
  matchOverAmount: number;
  externalDepositMemo: string | null;
};

export type PartnerPayoutEntry = { vendorName: string; amount: number };

export type TransparencySection = {
  cleaning: number;
  disinfection: number;
  maintenance: number;
  longTermRepairFund: number;
  partnerPayoutTotal: number;
  partnerPayoutCount: number;
  partnerPayouts: PartnerPayoutEntry[];
  taxInvoiceCount: number;       // 협력업체 전자세금계산서 수신 건수
  notes: string | null;
};

export type EvidenceLink = { label: string; href: string };
export type EvidenceLinks = {
  energy?: EvidenceLink[];
  discounts?: EvidenceLink[];
  oneTimeCharges?: EvidenceLink[];
  collection?: EvidenceLink[];
  transparency?: EvidenceLink[];
};

export const buildingMonthlyRecordsTable = pgTable("building_monthly_records", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id")
    .references(() => buildingsTable.id, { onDelete: "cascade" })
    .notNull(),
  billingMonth: text("billing_month").notNull(),
  energy: json("energy").$type<EnergySection | null>(),
  discounts: json("discounts").$type<DiscountSection | null>(),
  oneTimeCharges: json("one_time_charges").$type<OneTimeChargeSection | null>(),
  collection: json("collection").$type<CollectionSection | null>(),
  transparency: json("transparency").$type<TransparencySection | null>(),
  manualOverrides: json("manual_overrides").$type<Record<string, unknown>>().notNull().default({}),
  evidenceLinks: json("evidence_links").$type<EvidenceLinks>().notNull().default({}),
  summaryDraft: text("summary_draft"),
  lastEditedById: integer("last_edited_by_id"),
  lastEditedAt: timestamp("last_edited_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => [
  unique().on(t.buildingId, t.billingMonth),
]);

export const buildingMonthlyRecordAuditsTable = pgTable("building_monthly_record_audits", {
  id: serial("id").primaryKey(),
  recordId: integer("record_id")
    .references(() => buildingMonthlyRecordsTable.id, { onDelete: "cascade" })
    .notNull(),
  buildingId: integer("building_id").notNull(),
  billingMonth: text("billing_month").notNull(),
  userId: integer("user_id").notNull(),
  userRole: text("user_role").notNull(),
  action: text("action", { enum: ["view", "update", "summary"] }).notNull(),
  changes: json("changes").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBuildingMonthlyRecordSchema = createInsertSchema(buildingMonthlyRecordsTable).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type InsertBuildingMonthlyRecord = z.infer<typeof insertBuildingMonthlyRecordSchema>;
export type BuildingMonthlyRecord = typeof buildingMonthlyRecordsTable.$inferSelect;
export type BuildingMonthlyRecordAudit = typeof buildingMonthlyRecordAuditsTable.$inferSelect;
