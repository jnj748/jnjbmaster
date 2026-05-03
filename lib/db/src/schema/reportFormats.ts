// [Task #801] 보고서 형식 — 재무상태표/손익계산서 등 표준 보고서의 행 구조 정의.
//   각 행은 표시 순서(sortOrder), 라벨, 계정코드 매핑(쉼표 구분)을 가진다.
//   합계행(isSummary=true)은 자식 행의 합으로 계산.
import { pgTable, serial, integer, text, boolean, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

export const reportFormatKinds = ["balance_sheet", "income_statement", "trial_balance", "custom"] as const;
export type ReportFormatKind = typeof reportFormatKinds[number];

export const reportFormatsTable = pgTable(
  "report_formats",
  {
    id: serial("id").primaryKey(),
    buildingId: integer("building_id"), // null = 전사 표준
    code: text("code").notNull(),
    name: text("name").notNull(),
    kind: text("kind", { enum: reportFormatKinds }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    memo: text("memo"),
    createdById: integer("created_by_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (t) => [
    index("report_formats_building_idx").on(t.buildingId),
    uniqueIndex("report_formats_code_unique_idx").on(t.buildingId, t.code),
  ],
);

export const reportFormatLinesTable = pgTable(
  "report_format_lines",
  {
    id: serial("id").primaryKey(),
    formatId: integer("format_id").notNull().references(() => reportFormatsTable.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").notNull().default(0),
    label: text("label").notNull(),
    accountCodes: text("account_codes"), // "1010,1020,1100" 형태
    isSummary: boolean("is_summary").notNull().default(false),
    indent: integer("indent").notNull().default(0),
    memo: text("memo"),
  },
  (t) => [index("report_format_lines_format_idx").on(t.formatId)],
);

export type ReportFormat = typeof reportFormatsTable.$inferSelect;
export type ReportFormatLine = typeof reportFormatLinesTable.$inferSelect;
