import { pgTable, text, serial, integer, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const platformConsentTypes = [
  "intermediary_terms",
  "privacy_policy",
  "partner_terms",
  "marketing",
  "third_party_sharing",
  "contract_disclaimer",
  "inspection_completion_disclaimer",
] as const;

export const consentRoles = [
  "manager",
  "accountant",
  "facility_staff",
  "partner",
] as const;

export const consentStatuses = ["agreed", "declined"] as const;

export const platformConsentsTable = pgTable("platform_consents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  consentType: text("consent_type", { enum: platformConsentTypes }).notNull(),
  version: text("version").notNull().default("1.0"),
  status: text("status", { enum: consentStatuses }).notNull().default("agreed"),
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

// [Task #133] Platform-managed consent documents (role × type × version).
// Admins can edit and publish new versions; signup screens load the active
// version per (role, type).
export const platformConsentDocumentsTable = pgTable(
  "platform_consent_documents",
  {
    id: serial("id").primaryKey(),
    role: text("role", { enum: consentRoles }).notNull(),
    consentType: text("consent_type", { enum: platformConsentTypes }).notNull(),
    version: text("version").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    required: boolean("required").notNull().default(false),
    isPublished: boolean("is_published").notNull().default(false),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: integer("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqRoleTypeVersion: uniqueIndex("ux_consent_docs_role_type_version").on(
      t.role,
      t.consentType,
      t.version,
    ),
  }),
);

export const insertPlatformConsentDocumentSchema = createInsertSchema(
  platformConsentDocumentsTable,
).omit({ id: true, createdAt: true, publishedAt: true });
export type InsertPlatformConsentDocument = z.infer<typeof insertPlatformConsentDocumentSchema>;
export type PlatformConsentDocument = typeof platformConsentDocumentsTable.$inferSelect;
