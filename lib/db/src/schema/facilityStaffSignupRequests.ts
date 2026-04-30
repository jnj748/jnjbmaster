// [Task #132] 시설기사 가입 승인 요청.
// [Task #651] 경리(accountant) 가입 신청도 동일 테이블을 사용한다.
//   - requested_role: 'facility_staff' (default) | 'accountant'
//   - license_photo_url: 시설담당자 자격증 사진 (signed object path)
//   - decided_by_role: 마지막 결정자(승인/거절/재오픈)의 role.
//     hq_executive 가 결정한 건은 manager 가 되돌리지 못하게 막는 근거.
import { pgTable, text, serial, integer, timestamp, varchar } from "drizzle-orm/pg-core";

export const facilitySignupStatuses = ["pending", "approved", "rejected"] as const;
export const facilitySignupRequestedRoles = ["facility_staff", "accountant"] as const;

export const facilityStaffSignupRequestsTable = pgTable("facility_staff_signup_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  // [Task #651] 시설담당 / 경리 둘 다 같은 큐에서 처리하기 위해 역할을 컬럼으로 보관.
  requestedRole: varchar("requested_role", { length: 32, enum: facilitySignupRequestedRoles })
    .notNull()
    .default("facility_staff"),
  requestedAddress: text("requested_address").notNull(),
  sido: text("sido"),
  sigungu: text("sigungu"),
  targetBuildingId: integer("target_building_id"),
  targetManagerId: integer("target_manager_id"),
  // [Task #651] 시설담당자 자격증 사진. 경리는 사용하지 않음(NULL).
  licensePhotoUrl: text("license_photo_url"),
  status: varchar("status", { length: 16, enum: facilitySignupStatuses }).notNull().default("pending"),
  decidedBy: integer("decided_by"),
  // [Task #651] 마지막 결정자의 role 을 함께 영속화한다(매니저↔본부장 권한 위계 검증용).
  decidedByRole: varchar("decided_by_role", { length: 32 }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FacilityStaffSignupRequest = typeof facilityStaffSignupRequestsTable.$inferSelect;
