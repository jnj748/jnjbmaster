// [Task #681] 시설담당(facility_staff) 대시보드 본문 위젯.
//   세 역할(소장/경리/시설) 의 "필수업무현황" 카드를 동일한 패턴(AlertSection
//   pageSize=5 + 페이지네이션 + 모두보기 + D-day 신호등 + 액션 모달) 으로
//   통일하고, 데스크톱 그리드는 `md:grid-cols-2` 를 직접 사용해 1024~1279px
//   구간에서도 항상 2열로 보이게 한다(shell 의 xl:grid-cols-4 만으로는 lg
//   구간에서 half 위젯이 풀폭으로 떨어지는 회귀가 있었다 — 매니저 본문이
//   같은 이유로 manager-main-widget 안에서 `md:grid-cols-2` 를 사용한다).
//
//   레이아웃(데스크톱):
//     1행: 필수업무현황(AlertSection role=facility_staff)  | 금주 안전점검(WeeklyInspectionsWidget)
//     2행: 최근문서함 + 처리내역(FacilityLeftColumnStack)   | 오늘 업무일지(prominent)
//     3행: 공고문 템플릿(NoticeTemplatesEntryWidget)        | 우리 건물 계약업체(BuildingContractsSummaryWidget)
//
//   모바일은 단일 칼럼으로 펼쳐 보여 세로 스크롤로 동일한 정보를 노출한다.

import { useState } from "react";
import {
  useGetDashboardAlerts,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { useBuilding } from "@/contexts/building-context";
import { ClipboardCheck } from "lucide-react";
import { AlertActionDialog } from "@/components/alert-action-dialog";
import { type DashboardAlert } from "@/lib/alert-utils";
import { splitDashboardAlerts } from "@/lib/dashboard-alert-filters";
import { useAlertClickHandler } from "@/hooks/use-alert-click-handler";
import {
  MobileOnly,
  DesktopOnly,
} from "@/components/dashboard-widgets/mobile-compact";

import { AlertSection } from "./alert-section-widget";
import { TodayWorkLogEntry } from "./today-work-log-entry-widget";
import WeeklyInspectionsWidget from "./weekly-inspections-widget";
import FacilityLeftColumnStackWidget from "./facility-left-column-stack-widget";
import NoticeTemplatesEntryWidget from "./notice-templates-entry-widget";
import BuildingContractsSummaryWidget from "./building-contracts-summary-widget";

export default function FacilityMainWidget() {
  const { user } = useAuth();
  const { building } = useBuilding();
  const { data: alerts, isLoading: alertsLoading } = useGetDashboardAlerts();

  const [selectedAlert, setSelectedAlert] = useState<DashboardAlert | null>(
    null,
  );
  const handleAlertClick = useAlertClickHandler(setSelectedAlert);

  // [Task #681] 시설담당용 알림 분류 — splitDashboardAlerts 가 facility_staff
  //   필터(점검·하자·시설/보안/청소 템플릿 + targetRoles 매칭) 를 적용한다.
  const { legalAlerts } = splitDashboardAlerts(
    alerts as DashboardAlert[] | null | undefined,
    "facility_staff",
  );

  return (
    <>
      <MobileOnly>
        <div className="space-y-3">
          <AlertSection
            title="필수업무"
            description="법적으로 반드시 해야하는 업무"
            icon={ClipboardCheck}
            iconClassName="text-chart-3"
            alerts={legalAlerts}
            loading={alertsLoading}
            placeholderZero="현재 60일 내 예정된 시설 필수업무가 없습니다"
            placeholderOne="30일 내 예정된 시설 필수업무가 없습니다"
            onAlertClick={handleAlertClick}
            sectionKind="mandatory"
          />
          <WeeklyInspectionsWidget />
          <FacilityLeftColumnStackWidget />
          <TodayWorkLogEntry variant="prominent" />
          <NoticeTemplatesEntryWidget />
          <BuildingContractsSummaryWidget />
        </div>
      </MobileOnly>

      <DesktopOnly>
        <div className="space-y-6">
          {/* 1행: 필수업무현황 / 금주 안전점검.
              매니저 본문과 동일하게 `md:grid-cols-2` 를 직접 사용해 900~1279px
              구간(DesktopOnly = .dash-desktop-only ≥900px) 에서도 2열을 유지한다. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            <AlertSection
              title="필수업무현황"
              description="법적으로 반드시 해야하는 업무"
              icon={ClipboardCheck}
              iconClassName="text-chart-3"
              alerts={legalAlerts}
              loading={alertsLoading}
              placeholderZero="현재 60일 내 예정된 시설 필수업무가 없습니다"
              placeholderOne="30일 내 예정된 시설 필수업무가 없습니다"
              onAlertClick={handleAlertClick}
              sectionKind="mandatory"
              pageSize={5}
            />
            <WeeklyInspectionsWidget />
          </div>

          {/* 2행: 최근문서함 + 처리내역(좌, 한 셀 안 세로 스택) /
              오늘 업무일지(우, prominent 강조). */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            <FacilityLeftColumnStackWidget />
            <TodayWorkLogEntry variant="prominent" />
          </div>

          {/* 3행: 공고문 템플릿 / 우리 건물 계약업체 연락망. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            <NoticeTemplatesEntryWidget />
            <BuildingContractsSummaryWidget />
          </div>

          {/* [Task #413] 알림 처리 다이얼로그 — 매니저 본문과 동일하게
              AlertActionDialog 를 마운트해 처리완료/연기/견적요청 흐름을 공유한다. */}
          <AlertActionDialog
            alert={selectedAlert}
            onClose={() => setSelectedAlert(null)}
            building={building}
            user={user}
          />
        </div>
      </DesktopOnly>
    </>
  );
}
