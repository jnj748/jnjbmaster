import { pgTable, text, serial, integer, timestamp, date, uniqueIndex, index, jsonb } from "drizzle-orm/pg-core";
import { unitsTable } from "./units";

export const workLogEntriesTable = pgTable(
  "work_log_entries",
  {
    id: serial("id").primaryKey(),
    buildingId: integer("building_id"),
    authorId: integer("author_id").notNull(),
    authorName: text("author_name").notNull(),
    category: text("category").notNull(),
    memo: text("memo").notNull(),
    photoUrl: text("photo_url"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    occurredDate: date("occurred_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    byBuildingDate: index("work_log_entries_building_date_idx").on(t.buildingId, t.occurredDate),
  }),
);

export type WorkLogEntry = typeof workLogEntriesTable.$inferSelect;

/**
 * [Task #708] 업무기록 ↔ 호실 다대다 연결.
 *  - match_source: 'auto' (서버 파서) / 'manual' (작성자가 칩 UI 로 명시 선택).
 *  - occurredAt 은 work_log_entries.occurred_at 의 역정규화 사본. 호실 상세에서
 *    추가 JOIN 없이 인덱스(unit_id, occurred_at desc) 만으로 시간순 페이지네이션
 *    가능하도록 둔다. 입력 경로(POST/PATCH/backfill) 에서 entry 의 occurred_at 과
 *    동일한 값을 함께 적어야 한다.
 */
export const workLogEntryUnitsTable = pgTable(
  "work_log_entry_units",
  {
    id: serial("id").primaryKey(),
    workLogEntryId: integer("work_log_entry_id")
      .notNull()
      .references(() => workLogEntriesTable.id, { onDelete: "cascade" }),
    unitId: integer("unit_id")
      .notNull()
      .references(() => unitsTable.id, { onDelete: "cascade" }),
    buildingId: integer("building_id").notNull(),
    matchSource: text("match_source").notNull().default("auto").$type<"auto" | "manual">(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entryUnitUq: uniqueIndex("work_log_entry_units_entry_unit_uq").on(t.workLogEntryId, t.unitId),
    byUnitOccurred: index("work_log_entry_units_unit_occurred_idx").on(t.unitId, t.occurredAt),
    byEntry: index("work_log_entry_units_entry_idx").on(t.workLogEntryId),
    byBuildingUnit: index("work_log_entry_units_building_unit_idx").on(t.buildingId, t.unitId),
  }),
);
export type WorkLogEntryUnit = typeof workLogEntryUnitsTable.$inferSelect;

/**
 * 직책별 일보 분리. 한 건물에 (소장/경리/시설과장) 각자 자기 일보를 갖는다.
 * - role: 'manager' | 'accountant' | 'facility_staff'
 * - 4개 status/memo/photo 컬럼명은 공통(security/cleaning/facility/complaint) 으로 두고
 *   role 별로 화면에서 라벨만 다르게 매핑한다.
 *   • manager   : 보안 / 청소 / 시설 / 민원
 *   • accountant: 수납·연체 / 지출 / 결재·기안 / 민원
 *   • facility_staff: 소방 / 전기 / 기계설비 / 기타
 * - 유니크 (building_id, journal_date, role) 로 동일 건물·동일 일자에 직책당 1건 보장.
 */
export const dailyJournalsTable = pgTable(
  "daily_journals",
  {
    id: serial("id").primaryKey(),
    buildingId: integer("building_id").notNull(),
    journalDate: date("journal_date").notNull(),
    role: text("role").notNull().default("manager"),
    authorId: integer("author_id").notNull(),
    authorName: text("author_name").notNull(),
    securityStatus: text("security_status").notNull().default("ok"),
    securityMemo: text("security_memo"),
    securityPhotoUrl: text("security_photo_url"),
    cleaningStatus: text("cleaning_status").notNull().default("ok"),
    cleaningMemo: text("cleaning_memo"),
    cleaningPhotoUrl: text("cleaning_photo_url"),
    facilityStatus: text("facility_status").notNull().default("ok"),
    facilityMemo: text("facility_memo"),
    facilityPhotoUrl: text("facility_photo_url"),
    complaintStatus: text("complaint_status").notNull().default("ok"),
    complaintMemo: text("complaint_memo"),
    complaintPhotoUrl: text("complaint_photo_url"),
    snapshot: jsonb("snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => ({
    uniqByBuildingDateRole: uniqueIndex("daily_journals_building_date_role_uq").on(t.buildingId, t.journalDate, t.role),
  }),
);

export type DailyJournal = typeof dailyJournalsTable.$inferSelect;
