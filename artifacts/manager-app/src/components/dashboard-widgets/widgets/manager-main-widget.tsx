// [Task #495] dashboard-manager-legacy.tsx (1,166줄) 의 후계.
//   하위 5개 시각 컴포넌트(StatCard / AlertSection / TodayWorkLogEntry /
//   FeesSummaryWidget / SeasonalSuggestionsCard) 가 별도 파일로 분리된 후
//   매니저 대시보드의 합성/오케스트레이션만 남긴다.
//
//   원본 파일에 존재하던 다음 주석들의 맥락은 분리된 위젯/lib 파일들로 옮겨
//   유지된다. 이 파일은 "역할 가드 + 데이터 패칭 훅 + 위젯 마운트" 만 담당.
//   - [Task #142] PendingApprovalsCard / BuildingInfoCard / DelinquencySummary
//     는 catalog 의 별도 위젯으로 추출 완료.
//   - [Task #205] TodayWorkLogEntry → today-work-log-entry-widget
//   - [Task #246] FeesSummaryWidget → fees-summary-widget
//   - [Task #184/#331/#380/#429/#437/#491/#567] AlertSection → alert-section-widget
//   - [Task #413] AlertActionDialog 자체도 별도 컴포넌트로 분리 완료
//   - [Task #567] (테스트업무) 호실데이터 불러오기 카드 자체가 시드에서 제거됨
//
//   registry.tsx 의 ManagerMainWidget 은 이 파일을 lazy import 한다.
//
//   [Task #503] 데스크톱 본문을 2열 × 3행 그리드로 재구성:
//     1행: 필수업무현황 / 제안업무현황 (페이지당 5개)
//     2행: (최근 문서함 + 처리 내역 세로 스택) / 오늘 업무일지 자동 작성하기(강조)
//     3행: 공지문 템플릿 보기 / 우리 건물 계약업체 연락망
//   이후 영역(전체 폭)은 기존 순서 — 관리비 요약 → 입주자카드 알림 → KPI 4종 →
//   개인정보 파기 대상. 함께 챙길 연체 세대 / 우리 건물 한눈에는 레지스트리에서
//   manager-main 다음 슬롯으로 이어 붙는다.
//   "4월 계절별 영선업무 제안" / "제안업무 · 호실정보 불러오기" 카드는 더 이상
//   노출되지 않는다.

import { useState } from "react";
import {
  useGetDashboardSummary,
  useGetDashboardAlerts,
  useGetDashboardAnalytics,
  useListTenants,
  useListVehicles,
  useGetUnitsSummary,
} from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";
import { useBuilding } from "@/contexts/building-context";
import {
  AlertTriangle,
  Coins,
  ClipboardCheck,
  ListChecks,
  FileText,
  Building2,
  Car,
} from "lucide-react";
import { AlertActionDialog } from "@/components/alert-action-dialog";
import { type DashboardAlert } from "@/lib/alert-utils";
import { splitDashboardAlerts } from "@/lib/dashboard-alert-filters";
import { useAlertClickHandler } from "@/hooks/use-alert-click-handler";
import {
  MobileOnly,
  DesktopOnly,
} from "@/components/dashboard-widgets/mobile-compact";
import SubmittedQuotesWidget from "@/components/dashboard-widgets/widgets/submitted-quotes-widget";

import { StatCard } from "./stat-card";
import { AlertSection } from "./alert-section-widget";
import { TodayWorkLogEntry } from "./today-work-log-entry-widget";
import { FeesSummaryWidget } from "./fees-summary-widget";
import { DataDestructionSection } from "./data-destruction-section";
// [요청] 관리소장 2행 좌측을 시설/경리와 동일한 두 진입 카드(최근문서함 +
//   처리 내역) 세로 스택으로 통일. 이전에는 DocumentsLinkPair(한 박스 안에 두
//   행을 욱여넣은 페어 카드) 를 썼는데, 보조 설명 텍스트가 truncate 되어
//   "기안·견적·공지·일지 보고서·외부..." 처럼 잘려 보였다. 시설 화면이 이미
//   사용 중인 FacilityLeftColumnStackWidget 을 그대로 재사용해 같은 두 카드를
//   분리된 형태로 노출한다(컴포넌트 이름은 facility- 로 시작하지만 내부는 두
//   범용 진입 위젯의 세로 스택일 뿐이다).
import FacilityLeftColumnStackWidget from "./facility-left-column-stack-widget";
import NoticeTemplatesEntryWidget from "./notice-templates-entry-widget";
import BuildingContractsSummaryWidget from "./building-contracts-summary-widget";
// [요청] 관리소장 화면에도 호실정보조회 카드를 추가. 경리·시설과 동일한 위젯을
//   재사용해 "오늘 업무일지 자동 작성하기" 카드 아래 세로 스택으로 노출한다.
import AccountantMemberSearchWidget from "./accountant-member-search-widget";

export default function ManagerMainWidget() {
  const { user } = useAuth();
  const { building } = useBuilding();
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  // [Task #221] 본사 관리 업무 템플릿 알림은 서버 측에서 /api/dashboard/alerts
  // 에 포함되어 내려오므로 별도 fetch 가 필요하지 않다. (single source of truth)
  const { data: alerts, isLoading: alertsLoading } = useGetDashboardAlerts();
  const { data: analytics } = useGetDashboardAnalytics({ query: { staleTime: 5 * 60 * 1000 } });
  const summaryReady = !summaryLoading && !!summary;
  const { data: tenants } = useListTenants({ status: "active" }, { query: { enabled: summaryReady, staleTime: 5 * 60 * 1000 } });
  const { data: vehicles } = useListVehicles(undefined, { query: { enabled: summaryReady, staleTime: 5 * 60 * 1000 } });
  const { data: unitsSummary } = useGetUnitsSummary({ query: { enabled: summaryReady, staleTime: 5 * 60 * 1000 } });

  // [Task #413] 알림 처리 다이얼로그(처리완료/연기/견적요청) 의 폼 상태·핸들러는
  //   AlertActionDialog 로 이전. 이 페이지는 selectedAlert 만 관리하면 된다.
  const [selectedAlert, setSelectedAlert] = useState<DashboardAlert | null>(null);
  const handleAlertClick = useAlertClickHandler(setSelectedAlert);

  if (summaryLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 sm:h-28" />
          ))}
        </div>
      </div>
    );
  }

  const unverifiedTenantCount = tenants?.filter((t) => t.verificationStatus === "unverified" && t.signatureName).length ?? 0;
  const occupiedUnitNumbers = new Set(tenants?.filter((t) => t.status === "active" && t.verificationStatus === "verified").map((t) => t.unit));
  const unitsMissingCard = (unitsSummary?.occupied ?? 0) - occupiedUnitNumbers.size;
  const pendingCardCount = unverifiedTenantCount + Math.max(0, unitsMissingCard);
  const totalUnits = unitsSummary?.total ?? building?.totalUnits ?? 0;
  const occupiedUnits = unitsSummary?.occupied ?? 0;
  const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
  const vehicleCount = vehicles?.length ?? 0;
  const vehiclesPerUnit = totalUnits > 0 ? (vehicleCount / totalUnits).toFixed(1) : "-";

  // [Task #184/#221/#389] 알림을 필수/제안 섹션으로 분리. 함수는 lib 로 추출됨.
  const { legalAlerts, proposedAlerts } = splitDashboardAlerts(
    alerts as DashboardAlert[] | null | undefined,
  );

  // [Task #358 → #397] 모바일 첫 화면의 2×2 KPI(필수업무 / 연체 세대 / 미수금률 /
  // 입주율) 묶음은 다른 섹션과 정보가 중복되어 제거했다. 같은 자리에 "건물관련
  // 계약현황" 한 줄과 "파트너사 비교 견적" 위젯을 배치한다.
  return (
    <>
      {/* [Task #327 → #358 → 위젯 병합] 모바일 컴팩트 — 평탄 세로 스크롤.
          [Task #503] 매니저 모바일에서 종전 registry 단계에서 campaign-banner 직후
          렌더되던 "우리 건물 계약업체 연락망"(BuildingContractsSummaryWidget) 카드를
          여기 MobileOnly 안으로 옮긴다. 데스크톱은 본 위젯의 DesktopOnly 3행
          우측 셀에서만 렌더되므로 모바일·데스크톱 모두 단일 노출이 보장된다.
          [사장님 결정 — 위치 재조정] 모바일 진입 시 사장님(소장)이 가장 먼저
          확인해야 할 정보는 "오늘 처리해야 할 일(필수업무·제안업무·일지)" 과 그 다음
          "들어온 비교견적" 이고, 협력업체 연락처는 평소엔 빈번히 보지 않는 참조
          정보이므로 모바일 최하단으로 이동. 데스크톱은 한눈에 다 보이는 그리드
          구조라 별도 조정 없이 기존 3행 우측 위치 그대로 유지. */}
      <MobileOnly>
        <div className="space-y-3">
          <AlertSection
            title="필수업무"
            description="법적으로 반드시 해야하는 업무"
            icon={ClipboardCheck}
            iconClassName="text-chart-3"
            alerts={legalAlerts}
            loading={alertsLoading}
            placeholderZero="현재 60일 내 예정된 법정필수업무가 없습니다"
            placeholderOne="30일 내 예정된 법정필수업무가 없습니다"
            onAlertClick={handleAlertClick}
            sectionKind="mandatory"
          />
          <AlertSection
            title="제안업무"
            description="지금 시기 처리하면 좋아요"
            icon={ListChecks}
            iconClassName="text-chart-2"
            alerts={proposedAlerts}
            loading={alertsLoading}
            placeholderZero={"제안 업무를 모두 완료하셨습니다.\n아래 업무일지를 작성해 두는건 어떨까요? 🙂"}
            placeholderOne={"업무가 1개 남았습니다.\n남은 업무를 처리해보세요 소장님!"}
            onAlertClick={handleAlertClick}
          />
          <TodayWorkLogEntry />
          {/* [요청] 모바일에서도 오늘 업무일지 카드 다음에 호실정보조회 카드 노출. */}
          <AccountantMemberSearchWidget />
          <SubmittedQuotesWidget />
          <BuildingContractsSummaryWidget />
        </div>
      </MobileOnly>

      <DesktopOnly>
        <div className="space-y-6">
          {/* [Task #503] 1행: 필수업무현황 / 제안업무현황 — 2열 1×2.
              매니저 데스크톱에서는 한 페이지에 5개씩 노출(스크롤/스와이프 없이).
              breakpoint: DesktopOnly(.dash-desktop-only) 가 900px+ 에서 켜지므로
              Tailwind `md:`(768px+) 를 사용해 900~1023px 구간에서도 2열로 보이게 한다. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <AlertSection
              title="필수업무현황"
              description="법적으로 반드시 해야하는 업무"
              icon={ClipboardCheck}
              iconClassName="text-chart-3"
              alerts={legalAlerts}
              loading={alertsLoading}
              placeholderZero="현재 60일 내 예정된 법정필수업무가 없습니다"
              placeholderOne="30일 내 예정된 법정필수업무가 없습니다"
              onAlertClick={handleAlertClick}
              sectionKind="mandatory"
              pageSize={5}
            />

            <AlertSection
              title="제안업무현황"
              description="지금 시기 처리하면 좋아요"
              icon={ListChecks}
              iconClassName="text-chart-2"
              alerts={proposedAlerts}
              loading={alertsLoading}
              placeholderZero={"제안 업무를 모두 완료하셨습니다.\n아래 업무일지를 작성해 두는건 어떨까요? 🙂"}
              placeholderOne={"업무가 1개 남았습니다.\n남은 업무를 처리해보세요 소장님!"}
              onAlertClick={handleAlertClick}
              pageSize={5}
            />
          </div>

          {/* [Task #503] 2행: (최근 문서함 + 처리 내역 세로 스택) /
              오늘 업무일지 자동 작성하기(강조).
              [Task #706] 우측 "오늘 업무일지" 카드를 컴팩트 가로 카드로 축소했으므로
              우측 카드를 좌측 합산 높이만큼 늘려 맞추는 `items-stretch` 대신
              `items-start` 로 정렬해 우측 카드가 자연스럽게 짧게 보이도록 한다.
              [요청] 좌측 페어 카드(DocumentsLinkPair)를 시설/경리와 같은 분리된
              두 진입 카드로 환원. 한 박스 안에 두 행을 욱여넣어 보조 설명이
              잘리던 문제를 해결한다.
              breakpoint: 위 1행과 동일한 이유로 `md:` 사용. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <FacilityLeftColumnStackWidget />
            {/* [요청] 우측 셀에 오늘 업무일지 + 호실정보조회 세로 스택. 좌측의
                두 진입 카드(최근문서함 + 처리 내역) 와 시각적 균형도 맞춰진다. */}
            <div className="space-y-6">
              <TodayWorkLogEntry />
              <AccountantMemberSearchWidget />
            </div>
          </div>

          {/* [Task #503] 3행: 공지문 템플릿 보기 / 우리 건물 계약업체 연락망.
              breakpoint: 위 1·2행과 동일한 이유로 `md:` 사용. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            <NoticeTemplatesEntryWidget />
            <BuildingContractsSummaryWidget />
          </div>

          {/* [Task #246] 관리비 요약 위젯. */}
          <div className="pt-2">
            <FeesSummaryWidget unpaidRate={analytics?.unpaidSummary.unpaidRate ?? null} />
          </div>

          {pendingCardCount > 0 && (
            <div className="bg-card border border-orange-200 rounded-lg p-3 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-orange-600" />
                  <span className="text-sm text-orange-800 font-medium">
                    입주자카드 처리 필요: {pendingCardCount}건
                  </span>
                </div>
                <a href="/tenants" className="text-sm text-orange-600 hover:underline font-medium">확인하기 →</a>
              </div>
              <div className="text-xs text-orange-700 ml-6 space-y-0.5">
                {unverifiedTenantCount > 0 && <p>• 서류 확인 대기: {unverifiedTenantCount}건</p>}
                {unitsMissingCard > 0 && <p>• 입주자카드 미작성 호실: {unitsMissingCard}건</p>}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatCard
              title="세대수"
              value={totalUnits > 0 ? totalUnits : "-"}
              icon={Building2}
              color="bg-chart-5"
              subtitle={totalUnits > 0 ? `입주율 ${occupancyRate}%` : "건물 등록 필요"}
              href="/units"
            />
            <StatCard
              title="등록 차량"
              value={vehicleCount}
              icon={Car}
              color="bg-chart-3"
              subtitle={totalUnits > 0 ? `세대당 ${vehiclesPerUnit}대` : ""}
            />
            <StatCard
              title="미납 관리비"
              value={analytics ? `${(analytics.unpaidSummary.totalUnpaid / 10000).toFixed(0)}만원` : "0원"}
              icon={Coins}
              color="bg-chart-4"
              subtitle={analytics ? `미납율 ${analytics.unpaidSummary.unpaidRate}%` : "총 미납액"}
            />
            <StatCard
              title="미납 호실"
              value={analytics?.unpaidSummary.unpaidCount ?? 0}
              icon={AlertTriangle}
              color="bg-muted-foreground"
              subtitle={analytics ? `전체 ${analytics.unpaidSummary.totalUnits}세대 중` : "미납 세대 수"}
            />
          </div>

          <DataDestructionSection
            count={analytics?.dataDestructionCount ?? 0}
            targets={analytics?.dataDestructionTargets ?? null}
          />

          {/* [Task #413] 알림 처리 다이얼로그 — AlertActionDialog 로 추출됨. */}
          <AlertActionDialog
            alert={selectedAlert}
            onClose={() => setSelectedAlert(null)}
            building={building}
            user={user}
          />

          {/* [Task #503] "4월 계절별 영선업무 제안"(SeasonalSuggestionsCard) 카드는
              매니저 데스크톱 대시보드에서 더 이상 노출되지 않는다. */}
        </div>
      </DesktopOnly>
    </>
  );
}
