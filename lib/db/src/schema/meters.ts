import { pgTable, text, serial, integer, numeric, timestamp, boolean, date, jsonb } from "drizzle-orm/pg-core";
import { buildingsTable } from "./buildings";
import { unitsTable } from "./units";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

// [Task #630] meter_readings 컬럼 확장:
//   - readingType: 'regular' | 'interim'  — 정기 vs 중간(이사 시) 검침 구분.
//   - periodStart / periodEnd: 책임 구간(임대인/임차인 분할용).
//   - tenantId: 중간 검침일 때 책임자(현 임차인) 식별용.
//   - inputMethod: 'manual' | 'photo' | 'csv' — 출처 메타데이터.
//   - photoObjectPath: 사진 OCR 원본 경로.
//   - authorId / authorRole: 누가 입력했는지 영구 기록(가시성 정책 답변 #1·#6).
//     같은 건물 직원 누구나 입력 가능하지만 행마다 입력자가 명시된다.
export const meterReadingsTable = pgTable("meter_readings", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id),
  unitId: integer("unit_id").references(() => unitsTable.id),
  unitNumber: text("unit_number").notNull(),
  meterType: text("meter_type", { enum: ["water", "electricity", "gas", "heating"] }).notNull(),
  readingType: text("reading_type", { enum: ["regular", "interim"] }).notNull().default("regular"),
  readingDate: date("reading_date").notNull(),
  periodStart: date("period_start"),
  periodEnd: date("period_end"),
  tenantId: integer("tenant_id").references(() => tenantsTable.id),
  previousReading: numeric("previous_reading"),
  currentReading: numeric("current_reading").notNull(),
  usage: numeric("usage"),
  inputMethod: text("input_method", { enum: ["manual", "photo", "csv"] }).notNull().default("manual"),
  photoObjectPath: text("photo_object_path"),
  isAnomaly: boolean("is_anomaly").notNull().default(false),
  anomalyNote: text("anomaly_note"),
  authorId: integer("author_id").references(() => usersTable.id),
  authorRole: text("author_role"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// [Task #630] 검침 행의 모든 수정·삭제 이벤트를 영구 보관(가시성 정책 답변 #6).
//   회계 근거이므로 meter_readings 가 삭제되어도 감사 행은 남는다 (FK 미설정).
//   action='create' 행은 입력 시점 스냅샷, 'update' 는 before/after 양쪽,
//   'delete' 는 before 만 기록한다.
export const meterReadingAuditsTable = pgTable("meter_reading_audits", {
  id: serial("id").primaryKey(),
  meterReadingId: integer("meter_reading_id").notNull(),
  buildingId: integer("building_id").notNull().references(() => buildingsTable.id),
  action: text("action", { enum: ["create", "update", "delete"] }).notNull(),
  actorId: integer("actor_id").references(() => usersTable.id),
  actorRole: text("actor_role"),
  beforeJson: jsonb("before_json"),
  afterJson: jsonb("after_json"),
  diffSummary: text("diff_summary"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MeterReading = typeof meterReadingsTable.$inferSelect;
export type InsertMeterReading = typeof meterReadingsTable.$inferInsert;
export type MeterReadingAudit = typeof meterReadingAuditsTable.$inferSelect;
export type InsertMeterReadingAudit = typeof meterReadingAuditsTable.$inferInsert;
