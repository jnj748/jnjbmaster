import { lazy } from "react";
import type { Role } from "@/lib/permissions";
import type { WidgetDefinition } from "./types";

/**
 * ─── Widget Catalog ──────────────────────────────────────────────
 *
 * Single source of truth for every dashboard widget the app knows
 * about. The shell page (pages/dashboard.tsx) only renders widgets
 * that appear in this catalog and the role layout below — there is
 * no other dispatch path.
 *
 * Today most roles map to a single "main" widget that wraps the old
 * per-role dashboard page (kept as legacy components). Sub-widget
 * extraction (so that e.g. "결재 대기", "미납률", "공지" are each their
 * own catalog entry shared across roles) is handled incrementally
 * under the large-page-decomposition task — the framework here is
 * what makes that work cheap.
 *
 * To add a widget:
 *   1. Define a component (lazy import recommended).
 *   2. Add an entry to WIDGETS below with a stable key + span hint.
 *   3. Reference its key in ROLE_LAYOUTS for the roles that need it.
 *
 * To share a widget across roles, list the same key under multiple
 * roles — the catalog will deduplicate the import via lazy().
 */

// ─── Per-role main widgets (legacy page wrappers) ───────────────
//
// Each existing dashboard page is treated as one "main" widget. The
// page already owns its own header / building context / sections.
// Future tasks will split these into smaller catalog entries.
const ManagerMainWidget = lazy(
  () => import("@/pages/dashboard-manager-legacy"),
);
const HqMainWidget = lazy(() => import("@/pages/hq-dashboard"));
const AccountantMainWidget = lazy(() => import("@/pages/accountant-dashboard"));
const FacilityMainWidget = lazy(() => import("@/pages/facility-worktool"));
const PartnerMainWidget = lazy(() => import("@/pages/partner-dashboard"));
const AdminMainWidget = lazy(() => import("@/pages/admin-dashboard"));

export const WIDGETS = {
  "manager-main": {
    key: "manager-main",
    component: ManagerMainWidget,
    span: "full",
    label: "관리소장 통합 대시보드",
  },
  "hq-main": {
    key: "hq-main",
    component: HqMainWidget,
    span: "full",
    label: "본사 운영 현황",
  },
  "accountant-main": {
    key: "accountant-main",
    component: AccountantMainWidget,
    span: "full",
    label: "경리/행정 대시보드",
  },
  "facility-main": {
    key: "facility-main",
    component: FacilityMainWidget,
    span: "full",
    label: "시설기사 일일 업무",
  },
  "partner-main": {
    key: "partner-main",
    component: PartnerMainWidget,
    span: "full",
    label: "파트너사 대시보드",
  },
  "admin-main": {
    key: "admin-main",
    component: AdminMainWidget,
    span: "full",
    label: "플랫폼 관리",
  },
} as const satisfies Record<string, WidgetDefinition>;

/** Catalog-derived widget key — typos in ROLE_LAYOUTS fail at compile time. */
export type CatalogWidgetKey = keyof typeof WIDGETS;

// ─── Role → widget layout ───────────────────────────────────────
export const ROLE_LAYOUTS: Record<Role, { widgets: CatalogWidgetKey[] }> = {
  manager: { widgets: ["manager-main"] },
  platform_admin: { widgets: ["admin-main"] },
  hq_executive: { widgets: ["hq-main"] },
  accountant: { widgets: ["accountant-main"] },
  facility_staff: { widgets: ["facility-main"] },
  partner: { widgets: ["partner-main"] },
};

/** Resolve the ordered widget definitions to render for a role.
 *  Falls back to the manager layout when the role is unknown so we never
 *  surface a fully blank dashboard for an unexpected role string. */
export function getWidgetsForRole(role: Role): WidgetDefinition[] {
  const layout = ROLE_LAYOUTS[role] ?? ROLE_LAYOUTS.manager;
  return layout.widgets
    .map((key) => WIDGETS[key] as WidgetDefinition | undefined)
    .filter((w): w is WidgetDefinition => Boolean(w));
}
