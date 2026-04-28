import { pgTable, text, serial, integer, numeric, timestamp, unique, boolean, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { buildingsTable } from "./buildings";

export const unitsTable = pgTable("units", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id),
  // [Task #516] 집합건축물(아파트·오피스텔)에서 동(棟). 단일 동 건물은 빈 문자열 유지.
  // 매칭 키 (buildingId + dong + unitNumber) 의 일부로, 동 A 101 / 동 B 101 을 별도 레코드로 보존한다.
  dong: text("dong").notNull().default(""),
  unitNumber: text("unit_number").notNull(),
  floor: text("floor").notNull(),
  exclusiveArea: numeric("exclusive_area"),
  commonArea: numeric("common_area"),
  usage: text("usage"),
  notes: text("notes"),
  status: text("status").notNull().default("vacant"),
  ownerName: text("owner_name"),
  ownerPhone: text("owner_phone"),
  // [Task #516] 부동산종합공부조회(국토부) 등 외부 API 로 받아 둔 소유자 주소.
  // 사용자가 수기로 채워 두었으면 자동 가져오기에서 절대 덮어쓰지 않는다.
  ownerAddress: text("owner_address"),
  // [Task #516] 소유자 컬럼이 채워진 출처. 'auto' = 부동산공부조회 등 외부 API,
  // 'manual' = 사용자 수기 입력, 'csv' = CSV 업로드. 출처 뱃지로 노출하는 단일 소스.
  ownerSource: text("owner_source").$type<"auto" | "manual" | "csv">(),
  residentName: text("resident_name"),
  residentPhone: text("resident_phone"),
  supplyArea: numeric("supply_area").default("0"),
  entryDate: date("entry_date"),
  buildingSection: text("building_section"),
  apiGenerated: boolean("api_generated").notNull().default(false),
  // [Task #348] 호실 데이터의 출처. 'register' = 건축물대장 자동 가져오기,
  // 'csv' = CSV 업로드, 'manual' = 수기 입력. 출처 뱃지/마지막 동기화 표시,
  // 그리고 가져오기 idempotency 처리에 사용한다.
  source: text("source").notNull().default("manual").$type<"register" | "manual" | "csv">(),
  // [Task #348] 마지막으로 건축물대장에서 동기화된 시각.
  lastRegisterSyncedAt: timestamp("last_register_synced_at", { withTimezone: true }),
  // [Task #348] 동기화에 사용한 관리건축물대장PK (층+호실번호 매칭과 함께 부가 키로 보관).
  mgmBldrgstPk: text("mgm_bldrgst_pk"),
  occupancyStatus: text("occupancy_status").notNull().default("미등록"),
  businessNumber: text("business_number"),
  hasOnboardingCard: boolean("has_onboarding_card").notNull().default(false),
  onboardingSignedAt: timestamp("onboarding_signed_at", { withTimezone: true }),
  delinquentMonths: integer("delinquent_months").notNull().default(0),
  delinquentAmount: integer("delinquent_amount").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  // [Task #516] 단일 동 건물(빈 dong)은 기존과 동일한 (buildingId, unitNumber) 유니크,
  // 다동 건물은 동을 포함해 유니크. 빈 dong 으로 row 들이 머무는 한 기존 데이터와 호환.
  unique("units_building_dong_unit_number").on(table.buildingId, table.dong, table.unitNumber),
]);

export const insertUnitSchema = createInsertSchema(unitsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUnit = z.infer<typeof insertUnitSchema>;
export type Unit = typeof unitsTable.$inferSelect;
