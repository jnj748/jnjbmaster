import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// [Task #323] 관리소장 공지문 템플릿.
//   플랫폼이 관리하는 사전 정의 템플릿(예: "불조심 안내", "분리수거 안내").
//   매니저는 템플릿을 선택 → 건물정보가 자동 채워진 미리보기를 이미지/PDF/문서/인쇄로 출력.
//
//   bodyHtml 안의 placeholder 토큰:
//     {{buildingName}}, {{addressFull}}, {{managementOfficePhone}}, {{date}},
//     {{customA}}, {{customB}}, {{customC}}  (사용자 입력)
export const buildingNoticeTemplatesTable = pgTable("building_notice_templates", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull().default("일반"),
  // 화면 카드 썸네일 emoji (예: "🔥", "♻️"). 미설정 시 카테고리별 기본값 사용.
  icon: text("icon"),
  // 본문 HTML (placeholder 토큰 포함).
  bodyHtml: text("body_html").notNull(),
  // 사용자 정의 입력 필드 라벨 (json 배열 string[]). 예: ["기간","장소"]. null/[] 이면 입력칸 없음.
  customFieldLabels: text("custom_field_labels"),
  sortOrder: integer("sort_order").notNull().default(100),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertBuildingNoticeTemplateSchema = createInsertSchema(buildingNoticeTemplatesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBuildingNoticeTemplate = z.infer<typeof insertBuildingNoticeTemplateSchema>;
export type BuildingNoticeTemplate = typeof buildingNoticeTemplatesTable.$inferSelect;
