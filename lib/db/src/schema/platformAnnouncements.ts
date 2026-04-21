import { pgTable, text, serial, integer, timestamp, boolean, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const announcementAudienceRoles = [
  "all",
  "manager",
  "accountant",
  "facility_staff",
  "partner",
  "hq_executive",
] as const;

export type AnnouncementAudienceRole = (typeof announcementAudienceRoles)[number];

export const platformAnnouncementsTable = pgTable("platform_announcements", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  audience: jsonb("audience").$type<AnnouncementAudienceRole[]>().notNull().default(["all"]),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: integer("created_by"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPlatformAnnouncementSchema = createInsertSchema(platformAnnouncementsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPlatformAnnouncement = z.infer<typeof insertPlatformAnnouncementSchema>;
export type PlatformAnnouncement = typeof platformAnnouncementsTable.$inferSelect;

// Per-user read tracking for platform announcements (since one announcement
// fans out to many users, the existing notifications.is_read flag isn't enough).
export const platformAnnouncementReadsTable = pgTable(
  "platform_announcement_reads",
  {
    id: serial("id").primaryKey(),
    announcementId: integer("announcement_id")
      .notNull()
      .references(() => platformAnnouncementsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqAnnouncementUser: uniqueIndex("ux_announcement_reads_user").on(
      t.announcementId,
      t.userId,
    ),
  }),
);

export type PlatformAnnouncementRead = typeof platformAnnouncementReadsTable.$inferSelect;
