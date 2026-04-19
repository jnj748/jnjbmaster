import { pgTable, text, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const socialProviders = ["naver", "kakao", "google"] as const;
export type SocialProvider = (typeof socialProviders)[number];

export const userSocialAccountsTable = pgTable(
  "user_social_accounts",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    provider: text("provider", { enum: socialProviders }).notNull(),
    providerUserId: text("provider_user_id").notNull(),
    email: text("email"),
    displayName: text("display_name"),
    connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerUserUnique: uniqueIndex("user_social_provider_user_uq").on(t.provider, t.providerUserId),
    userProviderUnique: uniqueIndex("user_social_user_provider_uq").on(t.userId, t.provider),
  }),
);

export const insertUserSocialAccountSchema = createInsertSchema(userSocialAccountsTable).omit({
  id: true,
  connectedAt: true,
});
export type InsertUserSocialAccount = z.infer<typeof insertUserSocialAccountSchema>;
export type UserSocialAccount = typeof userSocialAccountsTable.$inferSelect;
