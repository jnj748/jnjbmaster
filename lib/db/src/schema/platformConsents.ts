import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const platformConsentTypes = [
  "intermediary_terms",
  "privacy_policy",
  "partner_terms",
  "contract_disclaimer",
  "inspection_completion_disclaimer",
] as const;

export const platformConsentsTable = pgTable("platform_consents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  consentType: text("consent_type", { enum: platformConsentTypes }).notNull(),
  version: text("version").notNull().default("1.0"),
  contextRef: text("context_ref"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  consentedAt: timestamp("consented_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPlatformConsentSchema = createInsertSchema(platformConsentsTable).omit({
  id: true,
  consentedAt: true,
});
export type InsertPlatformConsent = z.infer<typeof insertPlatformConsentSchema>;
export type PlatformConsent = typeof platformConsentsTable.$inferSelect;
