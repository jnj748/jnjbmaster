import { pgTable, text, serial, integer, timestamp, date, numeric, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export type BuildingFeatures = {
  metering: boolean;
  accounting: boolean;
  complaint: boolean;
  vendor: boolean;
  aiAnomaly: boolean;
  eVoting: boolean;
};

export const BASIC_FEATURES: BuildingFeatures = {
  metering: true,
  accounting: true,
  complaint: true,
  vendor: true,
  aiAnomaly: false,
  eVoting: false,
};

export const PREMIUM_FEATURES: BuildingFeatures = {
  metering: true,
  accounting: true,
  complaint: true,
  vendor: true,
  aiAnomaly: true,
  eVoting: true,
};

export const buildingsTable = pgTable("buildings", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  addressFull: text("address_full"),
  addressJibun: text("address_jibun"),
  sido: text("sido"),
  sigungu: text("sigungu"),
  dong: text("dong"),
  zipCode: text("zip_code"),
  totalUnits: integer("total_units"),
  totalFloors: integer("total_floors"),
  basementFloors: integer("basement_floors"),
  totalArea: numeric("total_area"),
  buildingUsage: text("building_usage"),
  structureType: text("structure_type"),
  completionDate: date("completion_date"),
  elevatorCount: integer("elevator_count"),
  parkingSpaces: integer("parking_spaces"),
  hasPlayground: boolean("has_playground").default(false),
  hasGas: boolean("has_gas").default(true),
  hasSepticTank: boolean("has_septic_tank").default(true),
  safetyManagerRequired: boolean("safety_manager_required").default(false),
  safetyManagerType: text("safety_manager_type"),
  fireGrade: integer("fire_grade"),
  buildingRegisterPk: text("building_register_pk"),
  landArea: numeric("land_area"),
  buildingArea: numeric("building_area"),
  buildingCoverageRatio: numeric("building_coverage_ratio"),
  floorAreaRatio: numeric("floor_area_ratio"),
  managementOfficePhone: text("management_office_phone"),
  managementOfficeFax: text("management_office_fax"),
  logoUrl: text("logo_url"),
  electricCapacityKw: numeric("electric_capacity_kw"),
  gasUsageMonthly: numeric("gas_usage_monthly"),
  specialFundEnabled: boolean("special_fund_enabled").notNull().default(false),
  approvalDate: date("approval_date"),
  // [Task #132] 위저드 완료 후 주소 잠금. 잠긴 후엔 platform_admin만 변경 가능.
  addressLocked: boolean("address_locked").notNull().default(false),
  // [Task #132] 회계 부과면적 기준: standard(전용+공용) | exclusive(전용) | common(공용).
  areaBasis: text("area_basis"),
  normalizedAddress: text("normalized_address").notNull().default(""),
  pricePerUnit: integer("price_per_unit").notNull().default(200),
  plan: text("plan").notNull().default("basic").$type<"basic" | "premium" | "enterprise">(),
  featuresEnabled: jsonb("features_enabled").$type<BuildingFeatures>().notNull().default(BASIC_FEATURES),
  isActive: boolean("is_active").notNull().default(true),
  isReadOnly: boolean("is_read_only").notNull().default(false),
  billingDay: integer("billing_day").notNull().default(1),
  subscriptionStatus: text("subscription_status").notNull().default("trial").$type<"trial" | "active" | "overdue" | "suspended">(),
  lastPaidAt: timestamp("last_paid_at", { withTimezone: true }),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBuildingSchema = createInsertSchema(buildingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBuilding = z.infer<typeof insertBuildingSchema>;
export type Building = typeof buildingsTable.$inferSelect;
