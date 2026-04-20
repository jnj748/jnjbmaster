// [Task #132] 시설기사 가입 승인 요청.
import { pgTable, text, serial, integer, timestamp, varchar } from "drizzle-orm/pg-core";

export const facilitySignupStatuses = ["pending", "approved", "rejected"] as const;

export const facilityStaffSignupRequestsTable = pgTable("facility_staff_signup_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  requestedAddress: text("requested_address").notNull(),
  sido: text("sido"),
  sigungu: text("sigungu"),
  targetBuildingId: integer("target_building_id"),
  targetManagerId: integer("target_manager_id"),
  status: varchar("status", { length: 16, enum: facilitySignupStatuses }).notNull().default("pending"),
  decidedBy: integer("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type FacilityStaffSignupRequest = typeof facilityStaffSignupRequestsTable.$inferSelect;
