import { pgTable, text, serial, integer, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const taskTemplateCategories = ["mandatory", "suggested"] as const;
export type TaskTemplateCategory = (typeof taskTemplateCategories)[number];

// [Task #221, deprecated by #297] 분류(법정/내부)는 UI 에서 제거되고 새 모델에서는
// 카테고리(mandatory=법정업무 / suggested=제안업무)로 의미가 통합된다.
// 컬럼은 backward-compat 을 위해 남겨두지만 신규 입력에는 사용되지 않는다.
export const taskTemplateClassifications = ["legal", "internal"] as const;
export type TaskTemplateClassification = (typeof taskTemplateClassifications)[number];

export const taskTemplateFrequencyTypes = [
  "one_time",
  "daily",
  "weekly",
  // [Task #302] 격주(2주 1회). weekdays 에 단일 요일, startDate 에 기준일을 저장.
  "biweekly",
  "monthly",
  // [Task #302] 매월 N째 X요일. nthWeek(1~5, -1=마지막) + nthWeekday(0~6) 사용.
  "monthly_nth_weekday",
  "quarterly",
  "semiannual",
  "annual",
  // [Task #304] 사용승인일 + N년 으로 만료 시점이 결정되는 1회성 점검(예: 하자담보).
  // 빌딩별로 anchorDate 가 있어야 의미가 있으며 ResolveActiveTemplateAlerts 에서
  // building 컨텍스트로 계산한다.
  "anchored",
] as const;
export type TaskTemplateFrequencyType = (typeof taskTemplateFrequencyTypes)[number];

// [Task #304] anchored frequency 의 기준일 종류. 현재는 빌딩 사용승인일만 지원.
export const taskTemplateAnchorTypes = ["building_approval_date"] as const;
export type TaskTemplateAnchorType = (typeof taskTemplateAnchorTypes)[number];

// [Task #305] 법정 선임 의무 자격 기준. 빌딩 속성과 비교해 알림 노출 여부를 결정한다.
//   - field: 비교할 빌딩 속성 (numeric)
//   - op:    비교 연산자
//   - value: 임계값 (number)
//   AND 조건의 배열로 사용한다. 빈 배열 = 자격 기준 없음(모든 빌딩 적용).
export const taskTemplateEligibilityFields = [
  "electricCapacityKw",
  "totalArea",
  "totalUnits",
  "fireGrade",
  "gasUsageMonthly",
] as const;
export type TaskTemplateEligibilityField = (typeof taskTemplateEligibilityFields)[number];

export const taskTemplateEligibilityOps = [">=", ">", "<=", "<", "=", "!="] as const;
export type TaskTemplateEligibilityOp = (typeof taskTemplateEligibilityOps)[number];

export interface TaskTemplateEligibilityRule {
  field: TaskTemplateEligibilityField;
  op: TaskTemplateEligibilityOp;
  value: number;
}

// [Task #297] 업무유형 — 관리소장 운영 분류. 신규 입력의 필수값.
export const taskTemplateTaskTypes = [
  "facility",       // 시설
  "fee",            // 관리비
  "accounting",     // 회계
  "security",       // 경비
  "cleaning",       // 미화
  "etc",            // 기타
] as const;
export type TaskTemplateTaskType = (typeof taskTemplateTaskTypes)[number];

// [Task #297] 적용 건물 — 표제부 주용도 코드(텍스트). UI 에서 다중 선택.
// 빈 배열은 "전체 건물(주용도 무관)" 로 해석한다.
export const taskTemplateBuildingUsageScopes = [
  "공동주택",
  "업무시설",
  "근린생활시설",
  "판매시설",
  "교육연구시설",
  "의료시설",
  "숙박시설",
  "문화및집회시설",
  "복합건축물",
  "기타",
] as const;
export type TaskTemplateBuildingUsageScope = (typeof taskTemplateBuildingUsageScopes)[number];

// [Task #221] 적용 대상(scope) 종류.
// - all: 모든 건물·사용자에게 노출 (기본)
// - building_ids: scopeValues 에 포함된 건물 ID 에 소속된 사용자에게만 노출
// - user_ids: scopeValues 에 포함된 사용자 ID 에게만 직접 노출
// (건물 유형/HQ 본부 등 추가 차원은 해당 도메인 필드가 도입되는 후속 작업에서
// 같은 scopeType 모델을 확장해 추가한다 — Followup #229 참고.)
export const taskTemplateScopeTypes = [
  "all",
  "building_ids",
  "user_ids",
] as const;
export type TaskTemplateScopeType = (typeof taskTemplateScopeTypes)[number];

export const taskTemplatesTable = pgTable("task_templates", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull(),
  // [#297] deprecated — 보존만 함.
  classification: text("classification").notNull().default("internal"),
  // [#297] 업무유형(시설/관리비/회계/경비/미화/기타). NULL 인 레거시 행은
  //   화면에서 "기타"로 표시된다.
  taskType: text("task_type"),
  iconName: text("icon_name"),
  color: text("color"),
  frequencyType: text("frequency_type").notNull().default("one_time"),
  intervalValue: integer("interval_value"),
  // [#297, deprecated] fixedMonth/fixedDay/startDate 는 신규 다이얼로그에서 입력하지
  //   않는다. 기존 데이터는 그대로 보존되며 cycle 계산 폴백으로만 사용된다.
  fixedMonth: integer("fixed_month"),
  fixedDay: integer("fixed_day"),
  startDate: text("start_date"),
  // [#297] 신규 반복주기 보조 입력값.
  //   - weekly: weekdays = 0(일)~6(토) 의 다중 선택
  //   - monthly: dayOfMonth = 1~31
  //   - annual: yearInterval = N (N년마다)
  weekdays: jsonb("weekdays").$type<number[]>(),
  dayOfMonth: integer("day_of_month"),
  yearInterval: integer("year_interval"),
  // [Task #302] monthly_nth_weekday 보조 입력값.
  //   nthWeek: 1~5 (첫째~다섯째), -1 = 마지막 주
  //   nthWeekday: 0(일)~6(토)
  nthWeek: integer("nth_week"),
  nthWeekday: integer("nth_weekday"),
  // [Task #304] anchored frequency 보조 입력값.
  //   anchorType: 기준일 종류(현재 building_approval_date)
  //   anchorOffsetYears: 기준일 + N년 시점이 만료/점검 예정일
  anchorType: text("anchor_type"),
  anchorOffsetYears: integer("anchor_offset_years"),
  // [Task #305] 자격 기준(AND 조건). 빈 배열 = 모든 빌딩 적용.
  eligibility: jsonb("eligibility").$type<TaskTemplateEligibilityRule[]>().notNull().default([]),
  scopeType: text("scope_type").notNull().default("all"),
  scopeValues: jsonb("scope_values").$type<string[]>().notNull().default([]),
  // [#297] 표제부 주용도 기준 적용 건물(다중). 빈 배열 = 전체.
  buildingUsageScopes: jsonb("building_usage_scopes").$type<string[]>().notNull().default([]),
  // [Task #283] 역할별 적용 대상. NULL/빈 배열은 "전체 공통",
  //   값이 있으면 ?role= 컨텍스트와 일치하는 역할에서만 노출/필터된다.
  targetRoles: text("target_roles").array(),
  priority: integer("priority").notNull().default(50),
  advanceAlertDays: integer("advance_alert_days").notNull().default(7),
  isActive: boolean("is_active").notNull().default(true),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdBy: integer("created_by"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTaskTemplateSchema = createInsertSchema(taskTemplatesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertTaskTemplate = z.infer<typeof insertTaskTemplateSchema>;
export type TaskTemplate = typeof taskTemplatesTable.$inferSelect;

export const taskTemplateAuditActions = ["create", "update", "delete", "toggle"] as const;
export type TaskTemplateAuditAction = (typeof taskTemplateAuditActions)[number];

export const taskTemplateAuditLogsTable = pgTable("task_template_audit_logs", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id"),
  templateTitle: text("template_title"),
  action: text("action").notNull(),
  changes: jsonb("changes").$type<Record<string, unknown>>().notNull().default({}),
  changedBy: integer("changed_by").references(() => usersTable.id, { onDelete: "set null" }),
  changedByName: text("changed_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TaskTemplateAuditLog = typeof taskTemplateAuditLogsTable.$inferSelect;
