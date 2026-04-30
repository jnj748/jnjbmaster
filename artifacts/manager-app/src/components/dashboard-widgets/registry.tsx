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
// [Task #503] 매니저 본문 3행 좌측 진입 카드. 시설담당 대시보드(좌측 4행) 에서도 재사용.
const NoticeTemplatesEntryWidget = lazy(
  () => import("./widgets/notice-templates-entry-widget"),
);
// [Task #561] 오늘 업무일지 진입 카드(시설담당 우측 2행).
//   today-work-log-entry-widget 는 named export (TodayWorkLogEntry) 만 가지므로
//   lazy() 가 기대하는 { default } shape 으로 재포장한다.
const TodayWorkLogEntryWidget = lazy(() =>
  import("./widgets/today-work-log-entry-widget").then((m) => ({
    default: m.TodayWorkLogEntry,
  })),
);
// [Task #658] 시설담당 대시보드 진입 카드 4종 + 금주 안전점검 위젯.
const FacilityMandatoryTasksEntryWidget = lazy(
  () => import("./widgets/facility-mandatory-tasks-entry-widget"),
);
const RecentDocumentsEntryWidget = lazy(
  () => import("./widgets/recent-documents-entry-widget"),
);
const WorkLogActivityEntryWidget = lazy(
  () => import("./widgets/work-log-activity-entry-widget"),
);
const WeeklyInspectionsWidget = lazy(
  () => import("./widgets/weekly-inspections-widget"),
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
  // [Task #658] 동일한 BuildingContractsSummaryWidget 의 half-span 변형.
  //   시설담당 2열 그리드 우측 칸에 들어가야 하므로 span:"half" 가 필요하지만,
  //   다른 역할(accountant) 레이아웃의 기존 동작을 깨지 않으려고 별도 키로 등록한다.
  "building-contracts-summary-half": {
    key: "building-contracts-summary-half",
    component: BuildingContractsSummaryWidget,
    span: "half",
    label: "우리 건물 계약업체 연락망",
  },
  // [Task #658] 시설담당 대시보드(2열 + 하단 풀폭) 재구성에 사용되는 위젯들.
  //   - 좌/우 각 4행은 span:"half" 로 그리드의 한 칸만 차지.
  //   - "building-info" 는 기존 정의(span:"full") 그대로 마지막 풀폭 행으로 사용.
  "notice-templates-entry": {
    key: "notice-templates-entry",
    component: NoticeTemplatesEntryWidget,
    span: "half",
    label: "공고문 템플릿",
  },
  "today-work-log-entry": {
    key: "today-work-log-entry",
    component: TodayWorkLogEntryWidget,
    span: "half",
    label: "오늘 업무일지",
  },
  "facility-mandatory-tasks-entry": {
    key: "facility-mandatory-tasks-entry",
    component: FacilityMandatoryTasksEntryWidget,
    span: "half",
    label: "필수업무",
  },
  "recent-documents-entry": {
    key: "recent-documents-entry",
    component: RecentDocumentsEntryWidget,
    span: "half",
    label: "최근문서함",
  },
  "work-log-activity-entry": {
    key: "work-log-activity-entry",
    component: WorkLogActivityEntryWidget,
    span: "half",
    label: "처리 내역",
  },
  "weekly-inspections": {
    key: "weekly-inspections",
    component: WeeklyInspectionsWidget,
    span: "half",
    label: "금주 안전점검 작성",
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
  //   - "units-import-suggestion"(호실·소유자 마스터 세팅 카드) 는 사용자 요청으로
  //     매니저 레이아웃에서 제거한다(과거에는 필수업무현황의 "호실데이터 불러오기"
  //     카드와 화면상 중복돼서 제거했고, [Task #567] 그 시드 카드 자체도 제거됨).
  //     위젯 컴포넌트 자체는 레지스트리 카탈로그에는 그대로 남겨, 다른 진입(설정 →
  //     단계별 보기) 이나 향후 다른 역할에서 재사용할 수 있게 한다. 호실 셋업
  //     마법사 자체(/onboarding/units-master) 도 그대로 유지된다.
  manager: {
    widgets: [
      "campaign-banner",
      "manager-main",
      "delinquency-summary",
      "building-info",
    ],
  },
  accountant: {
    // [Task #660] 경리 대시보드는 accountant-main 페이지 자체가 2칼럼 레이아웃에서
    //   결재/연체/계약업체/협력업체 진입을 모두 담당한다. 같은 위젯이 위쪽에 다시
    //   노출되면 중복되므로 building-contracts-summary / pending-approvals /
    //   delinquency-summary 는 본 레이아웃에서 제거한다(다른 역할에는 영향 없음).
    widgets: ["campaign-banner", "building-info", "accountant-main"],
  },
  // [Task #658] 시설담당 대시보드를 2열 + 하단 풀폭 레이아웃으로 재구성.
  //   shell 의 데스크탑 그리드는 xl:grid-cols-4, span:"half" = col-span-2, span:"full" = col-span-4.
  //   따라서 half 두 개가 한 행을 채우고 full 한 개가 다음 행 전체를 차지한다.
  //   배치(스케치 그대로):
  //     행1  필수업무 (L)              | 금주 안전점검 (R)
  //     행2  최근문서함 (L)            | 오늘 업무일지 (R)
  //     행3  처리 내역 (L)             | 계약업체 연락망 (R)
  //     행4  공고문 템플릿 (L)         | (빈 칸)
  //     행5  건물정보 (full width)
  //   - building-contracts-summary 는 다른 역할의 풀폭 동작을 보존하기 위해 별도 half 키
  //     ("building-contracts-summary-half") 로 등록해 사용한다.
  //   - campaign-banner / facility-main 은 사용자 요구에 따라 시설담당에서만 제거.
  facility_staff: {
    widgets: [
      "facility-mandatory-tasks-entry",
      "weekly-inspections",
      "recent-documents-entry",
      "today-work-log-entry",
      "work-log-activity-entry",
      "building-contracts-summary-half",
      "notice-templates-entry",
      "building-info",
    ],
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
  // [Task #611] custodian (관리인) — 입금요청서함 + 결재함 진입을 다른 화면에서 별도로 제공.
  //   대시보드 본문은 캠페인 배너만 두고, 추후 전용 위젯이 추가되면 이 자리에 등록한다.
  custodian: {
    widgets: ["campaign-banner"],
  },
};

// Falls back to the manager layout for unknown roles so we never blank out.
export function getWidgetsForRole(role: Role): WidgetDefinition[] {
  const layout = ROLE_LAYOUTS[role] ?? ROLE_LAYOUTS.manager;
  return layout.widgets
    .map((key) => WIDGETS[key] as WidgetDefinition | undefined)
    .filter((w): w is WidgetDefinition => Boolean(w));
}
