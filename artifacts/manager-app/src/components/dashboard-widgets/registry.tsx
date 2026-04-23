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
const CampaignBannerWidget = lazy(() =>
  import("./widgets/campaign-banner-widget").then((m) => ({ default: m.CampaignBannerWidget })),
);

export const WIDGETS = {
  "pending-approvals": {
    key: "pending-approvals",
    component: PendingApprovalsWidget,
    span: "half",
    label: "오늘 챙길 결재",
  },
  "building-info": {
    key: "building-info",
    component: BuildingInfoWidget,
    span: "full",
    label: "우리 건물 한눈에",
  },
  "delinquency-summary": {
    key: "delinquency-summary",
    component: DelinquencySummaryWidget,
    span: "half",
    label: "함께 챙길 연체 세대",
  },
  "warranty-dday": {
    key: "warranty-dday",
    component: WarrantyDdayWidget,
    span: "full",
    label: "놓치지 말 보증 D-Day",
  },
  "manager-main": {
    key: "manager-main",
    component: ManagerMainWidget,
    span: "full",
    label: "소장님 오늘의 종합 현황",
  },
  "hq-main": {
    key: "hq-main",
    component: HqMainWidget,
    span: "full",
    label: "본사 운영 한눈 보기",
  },
  "accountant-main": {
    key: "accountant-main",
    component: AccountantMainWidget,
    span: "full",
    label: "경리·회계 든든 대시보드",
  },
  "facility-main": {
    key: "facility-main",
    component: FacilityMainWidget,
    span: "full",
    label: "시설기사 오늘의 미션",
  },
  "partner-main": {
    key: "partner-main",
    component: PartnerMainWidget,
    span: "full",
    label: "파트너사 활약 보드",
  },
  "admin-main": {
    key: "admin-main",
    component: AdminMainWidget,
    span: "full",
    label: "플랫폼 안전 관리실",
  },
  "campaign-banner": {
    key: "campaign-banner",
    component: CampaignBannerWidget,
    span: "full",
    label: "이벤트 · 안내",
  },
} as const satisfies Record<string, WidgetDefinition>;

export type CatalogWidgetKey = keyof typeof WIDGETS;

export const ROLE_LAYOUTS: Record<Role, { widgets: CatalogWidgetKey[] }> = {
  // [Task #184] pending-approvals 위젯은 매니저 대시보드에서 숨긴다.
  // 결재 권한이 있는 다른 역할(accountant, platform_admin)에는 영향 없음.
  manager: {
    widgets: [
      "campaign-banner",
      "manager-main",
      "delinquency-summary",
      "building-info",
    ],
  },
  accountant: {
    widgets: [
      "campaign-banner",
      "building-info",
      "pending-approvals",
      "delinquency-summary",
      "accountant-main",
    ],
  },
  facility_staff: {
    widgets: ["campaign-banner", "building-info", "facility-main"],
  },
  // [Task #267] 통합 대시보드 단순화: 5역할 카드 + 파트너 크레딧 패널만 노출.
  //   admin-main 위젯이 ROLE_CARDS + VendorCreditsPanel 을 렌더하므로
  //   pending-approvals 등 부가 위젯은 제거한다.
  platform_admin: {
    widgets: ["admin-main"],
  },
  hq_executive: {
    // [Task #283] hq_executive 도 banner 채널 캠페인을 받아야 하므로 상단에 배너 슬롯 추가.
    widgets: ["campaign-banner", "hq-main"],
  },
  partner: {
    // [Task #283] partner 도 banner 채널 캠페인 노출 대상이므로 배너 슬롯 추가.
    widgets: ["campaign-banner", "partner-main"],
  },
};

// Falls back to the manager layout for unknown roles so we never blank out.
export function getWidgetsForRole(role: Role): WidgetDefinition[] {
  const layout = ROLE_LAYOUTS[role] ?? ROLE_LAYOUTS.manager;
  return layout.widgets
    .map((key) => WIDGETS[key] as WidgetDefinition | undefined)
    .filter((w): w is WidgetDefinition => Boolean(w));
}
