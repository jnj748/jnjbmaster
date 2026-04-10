import { pgTable, text, serial, timestamp, integer, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const attendanceTable = pgTable("attendance", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  checkDate: date("check_date").notNull(),
  checkInTime: timestamp("check_in_time", { withTimezone: true }),
  checkOutTime: timestamp("check_out_time", { withTimezone: true }),
  checkType: text("check_type", { enum: ["check_in", "check_out"] }).notNull(),
  status: text("status", { enum: ["normal", "late", "early_leave", "absent"] }).notNull().default("normal"),
  deviceType: text("device_type"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAttendanceSchema = createInsertSchema(attendanceTable).omit({ id: true, createdAt: true });
export type InsertAttendance = z.infer<typeof insertAttendanceSchema>;
export type Attendance = typeof attendanceTable.$inferSelect;
