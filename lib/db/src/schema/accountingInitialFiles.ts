// [Task #132] 경리/회계 위저드에서 업로드한 회계 초기 자료 메타데이터.
import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const accountingInitialFileCategories = [
  "monthly_bill",        // 최근 관리비 고지서
  "bank_transactions",   // 통장 거래내역
  "energy_meter",        // 에너지 검침자료
  "extra_service",       // 부가서비스자료
  "accounting_evidence", // 회계 증빙자료
  "other",               // 기타 행정자료
] as const;

export const accountingInitialFilesTable = pgTable("accounting_initial_files", {
  id: serial("id").primaryKey(),
  buildingId: integer("building_id").notNull(),
  category: text("category").notNull(),
  fileUrl: text("file_url").notNull(),
  originalName: text("original_name"),
  periodNote: text("period_note"),
  uploadedBy: integer("uploaded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AccountingInitialFile = typeof accountingInitialFilesTable.$inferSelect;
