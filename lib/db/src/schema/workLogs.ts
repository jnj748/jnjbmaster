import { pgTable, text, serial, integer, timestamp, date, uniqueIndex, index, jsonb } from "drizzle-orm/pg-core";

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

export const dailyJournalsTable = pgTable(
  "daily_journals",
  {
    id: serial("id").primaryKey(),
    buildingId: integer("building_id").notNull(),
    journalDate: date("journal_date").notNull(),
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
    uniqByBuildingDate: uniqueIndex("daily_journals_building_date_uq").on(t.buildingId, t.journalDate),
  }),
);

export type DailyJournal = typeof dailyJournalsTable.$inferSelect;
