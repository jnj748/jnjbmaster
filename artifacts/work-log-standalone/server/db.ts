import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import {
  sqliteTable,
  text,
  integer,
} from "drizzle-orm/sqlite-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, "..", "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "work-log.sqlite");

export const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const dailyJournals = sqliteTable("daily_journals", {
  date: text("date").primaryKey(),
  securityStatus: text("security_status"),
  securityMemo: text("security_memo"),
  securityPhotoUrl: text("security_photo_url"),
  cleaningStatus: text("cleaning_status"),
  cleaningMemo: text("cleaning_memo"),
  cleaningPhotoUrl: text("cleaning_photo_url"),
  facilityStatus: text("facility_status"),
  facilityMemo: text("facility_memo"),
  facilityPhotoUrl: text("facility_photo_url"),
  complaintStatus: text("complaint_status"),
  complaintMemo: text("complaint_memo"),
  complaintPhotoUrl: text("complaint_photo_url"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const workLogEntries = sqliteTable("work_log_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  occurredDate: text("occurred_date").notNull(),
  occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
  category: text("category").notNull(),
  memo: text("memo").notNull(),
  photoUrl: text("photo_url"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const db = drizzle(sqlite, {
  schema: { dailyJournals, workLogEntries },
});

export function runMigrations() {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS daily_journals (
      date TEXT PRIMARY KEY,
      security_status TEXT,
      security_memo TEXT,
      security_photo_url TEXT,
      cleaning_status TEXT,
      cleaning_memo TEXT,
      cleaning_photo_url TEXT,
      facility_status TEXT,
      facility_memo TEXT,
      facility_photo_url TEXT,
      complaint_status TEXT,
      complaint_memo TEXT,
      complaint_photo_url TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS work_log_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      occurred_date TEXT NOT NULL,
      occurred_at INTEGER NOT NULL,
      category TEXT NOT NULL,
      memo TEXT NOT NULL,
      photo_url TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_work_log_entries_date
      ON work_log_entries(occurred_date);
    CREATE INDEX IF NOT EXISTS idx_work_log_entries_category
      ON work_log_entries(category);
  `);
}
