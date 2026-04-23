import {
  pgTable,
  text,
  serial,
  integer,
  timestamp,
  boolean,
  jsonb,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const campaignTargetRoles = [
  "manager",
  "accountant",
  "facility_staff",
  "hq_executive",
  "partner",
] as const;
export type CampaignTargetRole = (typeof campaignTargetRoles)[number];

export const campaignTypes = ["required", "suggested", "other"] as const;
export type CampaignType = (typeof campaignTypes)[number];

export const campaignChannels = ["modal", "banner", "bell", "push"] as const;
export type CampaignChannel = (typeof campaignChannels)[number];

export const campaignAudienceFilters = ["all", "active"] as const;
export type CampaignAudienceFilter = (typeof campaignAudienceFilters)[number];

export const campaignRecurrence = ["none", "daily", "weekly", "monthly"] as const;
export type CampaignRecurrence = (typeof campaignRecurrence)[number];

export const platformCampaignsTable = pgTable("platform_campaigns", {
  id: serial("id").primaryKey(),
  targetRole: text("target_role", { enum: campaignTargetRoles }).notNull(),
  type: text("type", { enum: campaignTypes }).notNull().default("other"),
  audienceFilter: text("audience_filter", { enum: campaignAudienceFilters })
    .notNull()
    .default("all"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  imageUrl: text("image_url"),
  channels: jsonb("channels").$type<CampaignChannel[]>().notNull().default(["modal"]),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull().defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  recurrence: text("recurrence", { enum: campaignRecurrence }).notNull().default("none"),
  recurrenceDays: jsonb("recurrence_days").$type<number[]>(), // weekly: 0-6, monthly: 1-31
  maxImpressionsPerUser: integer("max_impressions_per_user").notNull().default(3),
  ctaLabel: text("cta_label"),
  ctaUrl: text("cta_url"),
  achievementText: text("achievement_text"),
  isActive: boolean("is_active").notNull().default(true),
  isStopped: boolean("is_stopped").notNull().default(false),
  createdBy: integer("created_by"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type PlatformCampaign = typeof platformCampaignsTable.$inferSelect;

export const platformCampaignUserStatesTable = pgTable(
  "platform_campaign_user_states",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => platformCampaignsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    impressionCount: integer("impression_count").notNull().default(0),
    lastImpressionAt: timestamp("last_impression_at", { withTimezone: true }),
    dismissedUntil: timestamp("dismissed_until", { withTimezone: true }),
    dontShowAgain: boolean("dont_show_again").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    ctaClickedAt: timestamp("cta_clicked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqCampaignUser: uniqueIndex("ux_campaign_user_states").on(
      t.campaignId,
      t.userId,
    ),
  }),
);

export type PlatformCampaignUserState = typeof platformCampaignUserStatesTable.$inferSelect;
