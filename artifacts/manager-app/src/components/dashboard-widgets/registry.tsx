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
 * There are two kinds of entries:
 *
 *   1. **Shared widgets** (preferred). Small, single-responsibility
 *      components under `widgets/*` that any role can compose. The
 *      *same metric is the same component everywhere* — e.g. the
 *      pending-approvals widget renders identically for the manager,
 *      the accountant, and the platform admin.
 *
 *   2. **Per-role "main" widgets** that wrap a legacy role-specific
 *      page. These are transitional wrappers: as more pieces of those
 *      pages get extracted into shared widgets, the per-role main
 *      widget shrinks to only the genuinely role-unique bits.
 *
 * To add a widget:
 *   1. Define a component (lazy import recommended).
 *   2. Add an entry to WIDGETS below with a stable key + span hint.
 *   3. Reference its key in ROLE_LAYOUTS for the roles that need it.
 *
 * To share a widget across roles, list the same key under multiple
 * roles — the catalog deduplicates the import via lazy().
 */

// ─── Shared widgets (composed by multiple roles) ────────────────
const PendingApprovalsWidget = lazy(
  () => import("./widgets/pending-approvals-widget"),
);
const BuildingInfoWidget = lazy(
  () => import("./widgets/building-info-widget"),
);
const DelinquencySummaryWidget = lazy(
  () => import("./widgets/delinquency-summary-widget"),
);

// ─── Per-role main widgets (legacy page wrappers) ───────────────
//
// Each existing dashboard page is treated as one "main" widget. The
// page already owns its own header / building context / sections.
// Future tasks will continue to peel shared pieces off of these.
const ManagerMainWidget = lazy(
  () => import("@/pages/dashboard-manager-legacy"),
);
const HqMainWidget = lazy(() => import("@/pages/hq-dashboard"));
const AccountantMainWidget = lazy(() => import("@/pages/accountant-dashboard"));
const FacilityMainWidget = lazy(() => import("@/pages/facility-worktool"));
const PartnerMainWidget = lazy(() => import("@/pages/partner-dashboard"));
const AdminMainWidget = lazy(() => import("@/pages/admin-dashboard"));

export const WIDGETS = {
  // ── Shared ──
  "pending-approvals": {
    key: "pending-approvals",
    component: PendingApprovalsWidget,
    span: "half",
    label: "결재 대기",
  },
  "building-info": {
    key: "building-info",
    component: BuildingInfoWidget,
    span: "full",
    label: "건물 정보",
  },
  "delinquency-summary": {
    key: "delinquency-summary",
    component: DelinquencySummaryWidget,
    span: "half",
    label: "연체 세대 현황",
  },

  // ── Role-specific main wrappers ──
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
//
// Each role composes a small sequence of catalog keys. Shared keys
// (pending-approvals / building-info / delinquency-summary) appear
// for every role that legitimately sees that metric, and roles only
// diverge on their tail "main" widget.
export const ROLE_LAYOUTS: Record<Role, { widgets: CatalogWidgetKey[] }> = {
  manager: {
    widgets: [
      "building-info",
      "pending-approvals",
      "delinquency-summary",
      "manager-main",
    ],
  },
  accountant: {
    widgets: [
      "building-info",
      "pending-approvals",
      "delinquency-summary",
      "accountant-main",
    ],
  },
  facility_staff: {
    widgets: ["building-info", "facility-main"],
  },
  platform_admin: {
    widgets: ["pending-approvals", "admin-main"],
  },
  hq_executive: {
    widgets: ["hq-main"],
  },
  partner: {
    widgets: ["partner-main"],
  },
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
