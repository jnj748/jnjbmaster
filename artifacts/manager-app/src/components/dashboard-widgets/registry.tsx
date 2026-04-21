import { lazy } from "react";
import type { Role } from "@/lib/permissions";
import type { WidgetDefinition } from "./types";

// Widget catalog and per-role layout. Shared widgets (building-info,
// pending-approvals, delinquency-summary) render the same component for
// every role that has the metric; *-main entries wrap the legacy role
// page bodies pending further decomposition under #146.

// Shared widgets
const PendingApprovalsWidget = lazy(
  () => import("./widgets/pending-approvals-widget"),
);
const BuildingInfoWidget = lazy(
  () => import("./widgets/building-info-widget"),
);
const DelinquencySummaryWidget = lazy(
  () => import("./widgets/delinquency-summary-widget"),
);
const WarrantyDdayWidget = lazy(
  () => import("./widgets/warranty-dday-widget"),
);

// Role-specific main wrappers (legacy page bodies)
const ManagerMainWidget = lazy(
  () => import("@/pages/dashboard-manager-legacy"),
);
const HqMainWidget = lazy(() => import("@/pages/hq-dashboard"));
const AccountantMainWidget = lazy(() => import("@/pages/accountant-dashboard"));
const FacilityMainWidget = lazy(() => import("@/pages/facility-worktool"));
const PartnerMainWidget = lazy(() => import("@/pages/partner-dashboard"));
const AdminMainWidget = lazy(() => import("@/pages/admin-dashboard"));

export const WIDGETS = {
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
  "warranty-dday": {
    key: "warranty-dday",
    component: WarrantyDdayWidget,
    span: "full",
    label: "하자담보책임 D-Day",
  },
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

export type CatalogWidgetKey = keyof typeof WIDGETS;

export const ROLE_LAYOUTS: Record<Role, { widgets: CatalogWidgetKey[] }> = {
  manager: {
    widgets: [
      "warranty-dday",
      "manager-main",
      "pending-approvals",
      "delinquency-summary",
      "building-info",
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

// Falls back to the manager layout for unknown roles so we never blank out.
export function getWidgetsForRole(role: Role): WidgetDefinition[] {
  const layout = ROLE_LAYOUTS[role] ?? ROLE_LAYOUTS.manager;
  return layout.widgets
    .map((key) => WIDGETS[key] as WidgetDefinition | undefined)
    .filter((w): w is WidgetDefinition => Boolean(w));
}
