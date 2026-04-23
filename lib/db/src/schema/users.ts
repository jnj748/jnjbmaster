import { pgTable, text, serial, integer, timestamp, varchar, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoles = ["manager", "partner", "platform_admin", "hq_executive", "accountant", "facility_staff"] as const;
export const portalTypes = ["building", "partner", "hq"] as const;
// [Task #106] 관리소장 첫 로그인 모달 선택값. NULL = 미선택, 'started' = 위저드로 진행, 'browsing' = 둘러보기 모드.
export const onboardingPreferences = ["started", "browsing"] as const;
// [Task #132] facility_staff 가입 승인 흐름. 'active' = 정상, 'pending' = 승인 대기, 'rejected' = 반려.
export const userApprovalStatuses = ["active", "pending", "rejected"] as const;

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"),
  name: text("name").notNull(),
  role: text("role", { enum: userRoles }).notNull(),
  phone: text("phone"),
  vendorId: integer("vendor_id"),
  buildingId: integer("building_id"),
  buildingSido: text("building_sido"),
  buildingSigungu: text("building_sigungu"),
  portalType: text("portal_type", { enum: portalTypes }).notNull(),
  onboardingPreference: varchar("onboarding_preference", { length: 16, enum: onboardingPreferences }),
  // [Task #132] 가입 승인 상태(주로 facility_staff). 다른 역할은 'active' 기본값.
  approvalStatus: varchar("approval_status", { length: 16, enum: userApprovalStatuses }).notNull().default("active"),
  // [Task #132] 통합 가입 흐름: 가입 시 역할 미정으로 들어와도 역할 선택 화면에서 확정.
  roleSelected: boolean("role_selected").notNull().default(true),
  // [카테고리 메뉴 제어] 플랫폼 관리자가 사용자별로 끌 수 있는 메뉴 카테고리 목록.
  //   permissions.ts 의 Group 값(residents/facility/accounting/reports/marketplace/settings)을
  //   JSON 배열 문자열로 저장. NULL 또는 빈 배열이면 모든 카테고리가 활성.
  //   "dashboard" 는 끌 수 없음(홈 진입 보장).
  disabledCategories: text("disabled_categories"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true, passwordHash: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
