import { pgTable, text, serial, integer, timestamp, varchar, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// [Task #611] custodian = 관리인(집합건물법상 예산집행 결정권자). hq_executive(본부장)와는
//   다른 경량 사용자 유형. 메뉴는 본인 결재함·입금요청함·송금완료 처리·서명본
//   업로드·본인 정보 정도로만 제한된다.
export const userRoles = ["manager", "partner", "platform_admin", "hq_executive", "accountant", "facility_staff", "custodian"] as const;
// [Task #611] custodian 포털을 hq/building 과 분리. 사이드/하단 네비 노출 폭을
//   결재함·입금요청함 위주로 좁히기 위함.
export const portalTypes = ["building", "partner", "hq", "custodian"] as const;
// [Task #106] 관리소장 첫 로그인 모달 선택값. NULL = 미선택, 'started' = 위저드로 진행, 'browsing' = 둘러보기 모드.
export const onboardingPreferences = ["started", "browsing"] as const;
// [Task #132] facility_staff 가입 승인 흐름. 'active' = 정상, 'pending' = 승인 대기, 'rejected' = 반려.
export const userApprovalStatuses = ["active", "pending", "rejected"] as const;

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  // [Username 가입] 신규 가입은 이메일이 아닌 username 으로 받는다.
  //   - 기존(이메일) 가입자/소셜 가입자는 email 이 채워지고 username 은 NULL.
  //   - 신규 가입자는 username 이 채워지고 email 은 NULL.
  //   - 둘 다 unique. PG 의 UNIQUE 는 다중 NULL 을 허용하므로 둘 다 nullable
  //     이어도 식별자 충돌 없이 안전하다. 마이그레이션 0026 참고.
  email: text("email").unique(),
  username: text("username").unique(),
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
  // [카테고리 메뉴 제어] 플랫폼이 사용자별로 끌 수 있는 메뉴 카테고리 목록.
  //   permissions.ts 의 Group 값(residents/facility/accounting/reports/marketplace/settings)을
  //   JSON 배열 문자열로 저장. NULL 또는 빈 배열이면 모든 카테고리가 활성.
  //   "dashboard" 는 끌 수 없음(홈 진입 보장).
  disabledCategories: text("disabled_categories"),
  // [Task #582] 가입 시 입력한 추천인 휴대폰 번호 (정규화된 11자리, 예: 01012345678).
  //   본사가 referrer_phone 별로 가입 현황·베네핏 지급 이력을 집계한다.
  //   해당 번호가 플랫폼 회원의 phone 과 일치하면 사이드 패널에서 매칭 정보가 보인다.
  referrerPhone: text("referrer_phone"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true, passwordHash: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
