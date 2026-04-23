import { pgTable, text, serial, integer, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const menuOverrideRoles = [
  "manager",
  "accountant",
  "facility_staff",
  "hq_executive",
  "partner",
] as const;
export type MenuOverrideRole = (typeof menuOverrideRoles)[number];

export const roleMenuOverridesTable = pgTable(
  "role_menu_overrides",
  {
    id: serial("id").primaryKey(),
    role: text("role", { enum: menuOverrideRoles }).notNull(),
    blockId: text("block_id").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    updatedBy: integer("updated_by"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqRoleBlock: uniqueIndex("ux_role_menu_overrides_role_block").on(t.role, t.blockId),
  }),
);

export const insertRoleMenuOverrideSchema = createInsertSchema(roleMenuOverridesTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertRoleMenuOverride = z.infer<typeof insertRoleMenuOverrideSchema>;
export type RoleMenuOverride = typeof roleMenuOverridesTable.$inferSelect;
