import { pgTable, text, serial, integer, timestamp, date, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// [Task #610] 공고문 템플릿 export 시점 등록.
//   - 미리보기에서 외부공유 / 이미지로 저장(PNG) / 문서로 저장(DOCX/PDF) 중 어떤 버튼을
//     눌러도 이 테이블 1행을 upsert 한다.
//   - 같은 (template_id, building_id, output_date) 묶음은 동일 행으로 합치고
//     formats 배열에 'png' | 'docx' | 'pdf' | 'share' 만 누적 → 문서함이 폭증하지 않는다.
//   - DB 트리거(1층) 가 INSERT/UPDATE 시 documents 레지스트리에 1행 보장한다.
export const noticeOutputFormats = ["png", "docx", "pdf", "share"] as const;
export type NoticeOutputFormat = (typeof noticeOutputFormats)[number];

export const noticeOutputsTable = pgTable(
  "notice_outputs",
  {
    id: serial("id").primaryKey(),
    templateId: integer("template_id").notNull(),
    buildingId: integer("building_id").notNull(),
    authorId: integer("author_id").notNull(),
    authorRole: text("author_role").notNull(),
    title: text("title").notNull(),
    // text[] of NoticeOutputFormat — drizzle 표현은 text + jsonb 사이에서 .array() 사용.
    formats: text("formats").array().notNull().default([]),
    outputDate: date("output_date").notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => ({
    bundleUnique: uniqueIndex("notice_outputs_bundle_unique").on(t.templateId, t.buildingId, t.outputDate),
    byBuilding: index("notice_outputs_building_idx").on(t.buildingId),
  }),
);

export const insertNoticeOutputSchema = createInsertSchema(noticeOutputsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertNoticeOutput = z.infer<typeof insertNoticeOutputSchema>;
export type NoticeOutput = typeof noticeOutputsTable.$inferSelect;
