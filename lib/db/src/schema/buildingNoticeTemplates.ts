import { pgTable, serial, text, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// [Task #323] 관리소장 공지문 템플릿.
//   플랫폼이 관리하는 사전 정의 템플릿(예: "불조심 안내", "분리수거 안내").
//   매니저는 템플릿을 선택 → 건물정보가 자동 채워진 미리보기를 이미지/PDF/문서/인쇄로 출력.
//
//   bodyHtml 안의 placeholder 토큰:
//     {{buildingName}}, {{addressFull}}, {{managementOfficePhone}}, {{date}},
//     {{customA}}, {{customB}}, {{customC}}  (사용자 입력)
//
// [Task #389] 정기 게시 스케줄.
//   scheduleType:
//     - "none": 자동 알림 없음(기존 동작).
//     - "yearly": scheduleConfig = { month: 1-12, day: 1-31 } 매년 동일일.
//     - "monthly": scheduleConfig = { day: 1-31 } 매월 동일일.
//     - "before_inspection": scheduleConfig = { inspectionName: string }.
//        해당 점검명 inspections.nextDueDate 를 앵커로 leadDays 일 이전 알림.
//   leadDays: 발생일 기준 며칠 전부터 매니저 대시보드 "제안업무"에 노출.
//   requiresReport: true 이면 처리완료 시 CompletionNotice 의 기본 양식이
//     "보고서"(report) 로 열린다 (예: 입주민 공지 + 보고서 의무 게시).
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
  // [Task #389] 정기 게시 스케줄 (none/yearly/monthly/before_inspection).
  scheduleType: text("schedule_type").notNull().default("none"),
  scheduleConfig: jsonb("schedule_config"),
  leadDays: integer("lead_days").notNull().default(7),
  requiresReport: boolean("requires_report").notNull().default(false),
  // [공지 양식 개편] 이달의 추천 양식 — 현재 월(1-12) 이 배열에 포함되면 추천 섹션 노출.
  //   예: [3,9] = 3월·9월 추천 (불조심·황사 등 계절성).
  recommendedMonths: jsonb("recommended_months").$type<number[]>(),
  // [공지 양식 개편] 양식 유형 — "document" 작성형(편집 후 출력) / "infographic" 바로출력 인쇄형.
  type: text("type").notNull().default("document"),
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
