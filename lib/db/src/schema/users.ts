import { pgTable, text, serial, integer, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userRoles = ["manager", "partner", "platform_admin", "hq_executive", "accountant", "facility_staff"] as const;
export const portalTypes = ["building", "partner", "hq"] as const;
// [Task #106] 관리소장 첫 로그인 모달 선택값. NULL = 미선택, 'started' = 위저드로 진행, 'browsing' = 둘러보기 모드.
export const onboardingPreferences = ["started", "browsing"] as const;

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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true, passwordHash: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
