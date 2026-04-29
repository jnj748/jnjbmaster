import { pgTable, text, serial, integer, timestamp, date, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// [Task #610] 통합 문서 레지스트리.
//   - 모든 문서 산출물(일지/주보/월보/기안 임시·상신/알림 처리 산출물/견적확정 묶음 기안서/
//     공고문 산출물/외부 업로드/RFQ)을 단일 인덱스로 통합한다.
//   - DB 트리거(1층)가 원본 테이블 INSERT/UPDATE 시 (kind, source_table, source_id)
//     기준으로 upsert를 보장한다. 트리거는 최소 키만 채우고, 표시 필드(title/subtitle)
//     와 메타는 서비스 단일 통로(2층 registerDocument)가 채운다.
//   - 같은 source 의 임시저장→상신 전환은 같은 행의 state 만 갱신한다.
export const documentKinds = [
  "journal",
  "weekly_report",
  "monthly_report",
  "draft",
  "approval",
  "quote_bundle",
  "rfq",
  "notice_output",
  "alert_action_output",
  "external",
  "quote",
  "contract",
  "announcement",
] as const;
export type DocumentKind = (typeof documentKinds)[number];

export const documentStates = [
  "draft",
  "active",
  "submitted",
  "completed",
  "archived",
  "rejected",
] as const;
export type DocumentState = (typeof documentStates)[number];

export const documentAuthorRoles = [
  "manager",
  "accountant",
  "facility_staff",
  "custodian",
  "hq_executive",
  "platform_admin",
  "partner",
  "tenant",
  "system",
] as const;
export type DocumentAuthorRole = (typeof documentAuthorRoles)[number];

export const documentsTable = pgTable(
  "documents",
  {
    id: serial("id").primaryKey(),
    kind: text("kind", { enum: documentKinds }).notNull(),
    sourceTable: text("source_table").notNull(),
    sourceId: integer("source_id").notNull(),
    state: text("state", { enum: documentStates }).notNull().default("active"),
    title: text("title"),
    subtitle: text("subtitle"),
    authorId: integer("author_id"),
    authorRole: text("author_role", { enum: documentAuthorRoles }),
    buildingId: integer("building_id"),
    periodStart: date("period_start"),
    periodEnd: date("period_end"),
    href: text("href"),
    thumbnailUrl: text("thumbnail_url"),
    // metadata jsonb — 후속 태스크(#611, #612)에서 본문 자동 생성/결재선 추천을 위해
    //   미리 비워둔 키들: { rejectedQuoteIds: number[], formats: string[],
    //   alertActionId: number, sourceContext: string, ... }
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    sourceUnique: uniqueIndex("documents_source_unique").on(t.sourceTable, t.sourceId),
    byKindCreatedAt: index("documents_kind_created_at_idx").on(t.kind, t.createdAt),
    byBuildingKind: index("documents_building_kind_idx").on(t.buildingId, t.kind),
    byAuthor: index("documents_author_idx").on(t.authorId),
    byPeriod: index("documents_period_idx").on(t.periodStart, t.periodEnd),
  }),
);

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type DocumentRow = typeof documentsTable.$inferSelect;
