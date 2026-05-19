// [Task #495] dashboard-manager-legacy.tsx 의 후계 — Phase 1 에서는 핵심 위젯만 노출.
//   registry.tsx 의 ManagerMainWidget 이 이 파일을 lazy import 한다.

import { useState } from "react";
import { useGetDashboardAlerts } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/auth-context";
import { useBuilding } from "@/contexts/building-context";
import { ListChecks } from "lucide-react";
import { AlertActionDialog } from "@/components/alert-action-dialog";
import { type DashboardAlert } from "@/lib/alert-utils";
import { splitDashboardAlerts } from "@/lib/dashboard-alert-filters";
import { useAlertClickHandler } from "@/hooks/use-alert-click-handler";
import {
  MobileOnly,
  DesktopOnly,
} from "@/components/dashboard-widgets/mobile-compact";
import SubmittedQuotesWidget from "@/components/dashboard-widgets/widgets/submitted-quotes-widget";
import RequestQuoteCtaWidget from "@/components/dashboard-widgets/widgets/request-quote-cta-widget";
import { AlertSection } from "./alert-section-widget";
import { TodayWorkLogEntry } from "./today-work-log-entry-widget";
import FacilityLeftColumnStackWidget from "./facility-left-column-stack-widget";
import AiAssistantEntryWidget from "./ai-assistant-entry-widget";
import WeeklyReportEntryWidget from "./weekly-report-entry-widget";

// Phase 2 — 법정·시설·회계·연체·입주민 관련 (주석 처리)
// import { ClipboardCheck } from "lucide-react";
// import SiteVisitConfirmSectionWidget from "./site-visit-confirm-section-widget";
// import NoticeTemplatesEntryWidget from "./notice-templates-entry-widget";
// import BuildingContractsSummaryWidget from "./building-contracts-summary-widget";
// import AccountantMemberSearchWidget from "./accountant-member-search-widget";
// import { FeesSummaryWidget } from "./fees-summary-widget";
// import { DataDestructionSection } from "./data-destruction-section";
// import { StatCard } from "./stat-card";

export default function ManagerMainWidget() {
  const { user } = useAuth();
  const { building } = useBuilding();
  const { data: alerts, isLoading: alertsLoading } = useGetDashboardAlerts();

  const [selectedAlert, setSelectedAlert] = useState<DashboardAlert | null>(null);
  const handleAlertClick = useAlertClickHandler(setSelectedAlert);

  const { proposedAlerts } = splitDashboardAlerts(
    alerts as DashboardAlert[] | null | undefined,
  );

  if (alertsLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <>
      <MobileOnly>
        <div className="space-y-3">
          <AlertSection
            title="알림"
            description="지금 챙기면 좋은 업무"
            icon={ListChecks}
            iconClassName="text-chart-2"
            alerts={proposedAlerts}
            loading={alertsLoading}
            placeholderZero={"제안 업무를 모두 완료하셨습니다.\n아래 업무일지를 작성해 두는건 어떨까요? 🙂"}
            placeholderOne={"업무가 1개 남았습니다.\n남은 업무를 처리해보세요 소장님!"}
            onAlertClick={handleAlertClick}
          />
          <TodayWorkLogEntry />
          <RequestQuoteCtaWidget />
          <SubmittedQuotesWidget />
          <FacilityLeftColumnStackWidget />
          <div className="grid grid-cols-1 gap-2">
            <AiAssistantEntryWidget />
            <WeeklyReportEntryWidget />
          </div>
        </div>
      </MobileOnly>

      <DesktopOnly>
        <div className="space-y-3">
          <AlertSection
            title="알림"
            description="지금 챙기면 좋은 업무"
            icon={ListChecks}
            iconClassName="text-chart-2"
            alerts={proposedAlerts}
            loading={alertsLoading}
            placeholderZero={"제안 업무를 모두 완료하셨습니다.\n아래 업무일지를 작성해 두는건 어떨까요? 🙂"}
            placeholderOne={"업무가 1개 남았습니다.\n남은 업무를 처리해보세요 소장님!"}
            onAlertClick={handleAlertClick}
            pageSize={3}
          />
          <RequestQuoteCtaWidget />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start">
            <FacilityLeftColumnStackWidget />
            <TodayWorkLogEntry />
          </div>
          <SubmittedQuotesWidget />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <AiAssistantEntryWidget />
            <WeeklyReportEntryWidget />
          </div>
          <AlertActionDialog
            alert={selectedAlert}
            onClose={() => setSelectedAlert(null)}
            building={building}
            user={user}
          />
        </div>
      </DesktopOnly>

      <MobileOnly>
        <AlertActionDialog
          alert={selectedAlert}
          onClose={() => setSelectedAlert(null)}
          building={building}
          user={user}
        />
      </MobileOnly>
    </>
  );
}
