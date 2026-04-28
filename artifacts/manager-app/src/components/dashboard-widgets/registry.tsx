import { lazy } from "react";
import type { Role } from "@/lib/permissions";
import { ROLE_LABELS } from "@workspace/shared/role-labels";
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
// [Task #348] 호실 일괄 가져오기 제안업무 카드. 자체 노출 조건 판단(0건/미동기화)을
// 갖고 있으며 조건이 안 맞으면 null 을 반환하므로 항상 매니저 레이아웃에 포함해도 안전.
const UnitsImportSuggestionWidget = lazy(
  () => import("./widgets/units-import-suggestion-widget"),
);
// [Task #450] "건물관련 계약현황" 카운터 위젯을 "우리 건물 계약업체 연락망" 단일 진입 버튼으로 교체.
//   레지스트리 키는 기존 ROLE_LAYOUTS 호환을 위해 유지하고, 라벨/용도만 새 의미로 정리.
const BuildingContractsSummaryWidget = lazy(
  () => import("./widgets/building-contracts-summary-widget"),
);

// Role-specific main wrappers (legacy page bodies)
// [Task #495] manager-main 은 페이지 파일이 아니라 dashboard-widgets/widgets/
//   manager-main-widget.tsx 에서 직접 합성된다. 하위 5개 시각 컴포넌트는 같은
//   디렉터리의 *-widget 파일들로 분리되어 있다.
const ManagerMainWidget = lazy(
  () => import("./widgets/manager-main-widget"),
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
    label: `${ROLE_LABELS.hq_executive} 운영 한눈 보기`,
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
    label: `${ROLE_LABELS.platform_admin} 안전 관리실`,
  },
  "campaign-banner": {
    key: "campaign-banner",
    component: CampaignBannerWidget,
    span: "full",
    label: "이벤트 · 안내",
  },
  "units-import-suggestion": {
    key: "units-import-suggestion",
    component: UnitsImportSuggestionWidget,
    span: "full",
    label: "제안업무 · 호실정보 불러오기",
  },
  "building-contracts-summary": {
    key: "building-contracts-summary",
    component: BuildingContractsSummaryWidget,
    span: "full",
    label: "우리 건물 계약업체 연락망",
  },
} as const satisfies Record<string, WidgetDefinition>;

export type CatalogWidgetKey = keyof typeof WIDGETS;

export const ROLE_LAYOUTS: Record<Role, { widgets: CatalogWidgetKey[] }> = {
  // [Task #184] pending-approvals 위젯은 매니저 대시보드에서 숨긴다.
  // 결재 권한이 있는 다른 역할(accountant, platform_admin)에는 영향 없음.
  // [Task #503] 매니저 데스크톱 본문은 manager-main 안에서 2열 × 3행 그리드로
  //   재구성된다.
  //   - "building-contracts-summary"(우리 건물 계약업체 연락망) 위젯은 manager-main
  //     본문 3행 우측 셀로 이동했으므로 레지스트리 단일 출처를 유지하기 위해 매니저
  //     레이아웃에서 제거한다(중복 노출 방지). 다른 역할(accountant) 레이아웃에는
  //     그대로 남는다.
  //   - "units-import-suggestion"(호실·소유자 마스터 세팅 카드) 는
  //     필수업무현황 안의 "호실데이터 불러오기" 항목과 화면상 중복되어
  //     사용자 요청으로 매니저 레이아웃에서 제거한다. 위젯 컴포넌트 자체는
  //     레지스트리 카탈로그에는 그대로 남겨, 다른 진입(설정 → 단계별 보기)
  //     이나 향후 다른 역할에서 재사용할 수 있게 한다. 호실 셋업 마법사
  //     자체(/onboarding/units-master) 도 그대로 유지된다.
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
      // [Task #450] 경리도 협력업체 주소록 진입 버튼을 상단에 노출.
      "building-contracts-summary",
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
