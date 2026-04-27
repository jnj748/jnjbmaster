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
//   - [Task #184/#331/#380/#429/#437/#491] AlertSection → alert-section-widget
//   - [Task #413] AlertActionDialog 자체도 별도 컴포넌트로 분리 완료
//   - [Task #437] (테스트업무) 호실데이터 불러오기 카드 → /units 라우팅
//
//   registry.tsx 의 ManagerMainWidget 은 이 파일을 lazy import 한다.

import { useState } from "react";
import {
  useGetDashboardSummary,
  useGetDashboardAlerts,
  useGetDashboardAnalytics,
  useListTenants,
  useListVehicles,
  useGetUnitsSummary,
} from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useLocation } from "wouter";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { useBuilding } from "@/contexts/building-context";
import {
  AlertTriangle,
  Coins,
  ClipboardCheck,
  ListChecks,
  FileText,
  Building2,
  Trash2,
  FolderOpen,
  Car,
} from "lucide-react";
import { CATEGORY_ICON_CLASS } from "@/lib/category-colors";
import { AlertActionDialog } from "@/components/alert-action-dialog";
import {
  type DashboardAlert,
  ACTIONABLE_ALERT_TYPES,
  ALERT_FALLBACK_ROUTES,
  getTestTaskCardOverride,
} from "@/lib/alert-utils";
import {
  MobileOnly,
  DesktopOnly,
} from "@/components/dashboard-widgets/mobile-compact";
import SubmittedQuotesWidget from "@/components/dashboard-widgets/widgets/submitted-quotes-widget";

import { StatCard } from "./stat-card";
import { AlertSection } from "./alert-section-widget";
import { TodayWorkLogEntry } from "./today-work-log-entry-widget";
import { FeesSummaryWidget } from "./fees-summary-widget";
import { SeasonalSuggestionsCard } from "./seasonal-suggestions-widget";

export default function ManagerMainWidget() {
  const { user } = useAuth();
  const { building } = useBuilding();
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  // [Task #221] 본사 관리 업무 템플릿 알림은 서버 측에서 /api/dashboard/alerts
  // 에 포함되어 내려오므로 별도 fetch 가 필요하지 않다. (single source of truth)
  const { data: alerts, isLoading: alertsLoading } = useGetDashboardAlerts();
  const { data: analytics } = useGetDashboardAnalytics({ query: { staleTime: 5 * 60 * 1000 } });
  const [showDestructionDialog, setShowDestructionDialog] = useState(false);
  const summaryReady = !summaryLoading && !!summary;
  const { data: tenants } = useListTenants({ status: "active" }, { query: { enabled: summaryReady, staleTime: 5 * 60 * 1000 } });
  const { data: vehicles } = useListVehicles(undefined, { query: { enabled: summaryReady, staleTime: 5 * 60 * 1000 } });
  const { data: unitsSummary } = useGetUnitsSummary({ query: { enabled: summaryReady, staleTime: 5 * 60 * 1000 } });

  // [Task #413] 알림 처리 다이얼로그(처리완료/연기/견적요청) 의 폼 상태·핸들러는
  //   AlertActionDialog 로 이전. 이 페이지는 selectedAlert 만 관리하면 된다.
  const [selectedAlert, setSelectedAlert] = useState<DashboardAlert | null>(null);
  const { toast } = useToast();
  const [, navigate] = useLocation();

  function handleAlertClick(alert: DashboardAlert) {
    // [Task #437/#491] (테스트업무) 호실데이터 불러오기 카드(구 "소방점검")는
    //   처리 모달 대신 호실 관리 화면(/units) 으로 이동시켜 신규 매니저가
    //   호실 데이터 구성 동선을 자연스럽게 익히도록 한다. 정화조 청소 카드는
    //   navigateTo 가 없으므로 기존 처리 모달이 그대로 열린다.
    const testOverride = getTestTaskCardOverride(alert);
    if (testOverride?.navigateTo) {
      navigate(testOverride.navigateTo);
      return;
    }

    if ((ACTIONABLE_ALERT_TYPES as readonly string[]).includes(alert.type)) {
      if (alert.relatedId) {
        setSelectedAlert(alert);
        return;
      }
      const fallback = ALERT_FALLBACK_ROUTES[alert.type];
      if (fallback) {
        navigate(fallback);
        return;
      }
      toast({ title: "처리할 항목 정보를 찾을 수 없습니다", description: alert.title });
      return;
    }

    if (alert.type === "data_destruction") {
      if (!alert.relatedId) {
        toast({ title: "대상 정보를 찾을 수 없습니다", description: alert.title });
        return;
      }
      const isOwner = alert.title.includes("소유자");
      navigate(isOwner ? `/units?tab=owners&openOwner=${alert.relatedId}` : `/tenants?openTenant=${alert.relatedId}`);
      return;
    }

    // [Task #335] 견적 도착 카드 클릭 → /rfqs?openQuote={quoteId} 로 딥링크.
    if (alert.type === "quote_received") {
      if (!alert.relatedId) {
        toast({ title: "견적 정보를 찾을 수 없습니다", description: alert.title });
        return;
      }
      navigate(`/rfqs?openQuote=${alert.relatedId}`);
      return;
    }

    if (alert.type === "task_template_mandatory" || alert.type === "task_template_suggested") {
      if (!alert.relatedId) {
        toast({ title: "처리할 항목 정보를 찾을 수 없습니다", description: alert.title });
        return;
      }
      setSelectedAlert(alert);
      return;
    }

    // [Task #389] 공고문 게시 제안업무: 동일한 액션 모달을 열어 처리완료 → 양식 출력으로 이어진다.
    if (alert.type === "notice_posting") {
      if (!alert.relatedId) {
        toast({ title: "공고문 템플릿 정보를 찾을 수 없습니다", description: alert.title });
        return;
      }
      setSelectedAlert(alert);
      return;
    }

    toast({
      title: "이 항목은 별도 처리 화면이 없습니다",
      description: alert.title,
    });
  }

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

  // [Task #184] 점검 알림을 inspectionType 기준으로 분리한다.
  //  - 필수업무현황: legal 점검 + 비점검 알림(세무·기한초과·하자만료·자료파기 등)
  //  - 제안업무현황: self_regular / biweekly / seasonal / administrative 점검
  // 분류는 클라이언트에서 수행하며, 알림 발생 로직(주기/임계치)은 그대로다.
  const PROPOSED_INSPECTION_TYPES = new Set([
    "self_regular",
    "biweekly",
    "seasonal",
    "administrative",
  ]);
  const alertList: DashboardAlert[] = (alerts ?? []) as DashboardAlert[];
  // [Task #221] 본사 관리 업무 템플릿 알림은 type=task_template_mandatory/
  // task_template_suggested 로 동일 응답에 포함된다. 필수업무는 법정 점검과
  // task_template_mandatory 를, 제안업무는 자체점검 계열과 task_template_suggested
  // 를 같은 섹션에 노출한다.
  const legalAlerts = alertList.filter((a) => {
    if (a.type === "task_template_suggested") return false;
    if (a.type === "inspection_due") {
      return a.inspectionType === "legal" || !a.inspectionType;
    }
    return true;
  });
  const proposedAlerts = alertList.filter((a) => {
    if (a.type === "task_template_suggested") return true;
    // [Task #389] 공고문 게시 자동알림은 제안업무 섹션에 노출.
    if (a.type === "notice_posting") return true;
    if (a.type === "inspection_due") {
      return (
        !!a.inspectionType && PROPOSED_INSPECTION_TYPES.has(a.inspectionType)
      );
    }
    return false;
  });

  // [Task #358 → #397] 모바일 첫 화면의 2×2 KPI(필수업무 / 연체 세대 / 미수금률 /
  // 입주율) 묶음은 다른 섹션과 정보가 중복되어 제거했다. 같은 자리에 "건물관련
  // 계약현황" 한 줄과 "파트너사 비교 견적" 위젯을 배치한다.
  return (
    <>
      {/* [Task #327 → #358 → 위젯 병합] 모바일 컴팩트 — 평탄 세로 스크롤. */}
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
          <SubmittedQuotesWidget />
        </div>
      </MobileOnly>

      <DesktopOnly>
        <div className="space-y-6">
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
          />

          <TodayWorkLogEntry />

          {/* [Task #250] 문서 산출물 진입(최근 문서함) + 처리 내역 진입을 한 묶음으로 그룹핑. */}
          <div className="space-y-2 sm:space-y-2.5">
            <Link href="/recent-documents">
              <button
                type="button"
                data-testid="btn-recent-documents"
                className="w-full flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 sm:py-3.5 text-left hover:bg-muted/50 transition"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <FolderOpen className={`w-5 h-5 ${CATEGORY_ICON_CLASS.system} shrink-0`} />
                  <span className="flex flex-col min-w-0">
                    <span className="font-medium text-sm leading-tight">최근 문서함</span>
                    <span className="text-[11px] sm:text-xs text-muted-foreground leading-snug truncate">
                      기안·견적·공고·일지 보고서·외부 업로드
                    </span>
                  </span>
                </span>
                <span className="text-xs text-muted-foreground shrink-0">열기 →</span>
              </button>
            </Link>

            <Link href="/work-log?tab=activity">
              <button
                type="button"
                data-testid="btn-activity-log"
                className="w-full flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 sm:py-3.5 text-left hover:bg-muted/50 transition"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <ListChecks className={`w-5 h-5 ${CATEGORY_ICON_CLASS.reports} shrink-0`} />
                  <span className="flex flex-col min-w-0">
                    <span className="font-medium text-sm leading-tight">처리 내역</span>
                    <span className="text-[11px] sm:text-xs text-muted-foreground leading-snug truncate">
                      메모·처리완료·일지를 시간순으로
                    </span>
                  </span>
                </span>
                <span className="text-xs text-muted-foreground shrink-0">열기 →</span>
              </button>
            </Link>
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

          {analytics && analytics.dataDestructionCount > 0 && (
            <div className="bg-card border border-red-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trash2 className="w-4 h-4 text-red-600" />
                  <span className="text-sm text-red-800 font-medium">
                    개인정보 파기 대상: {analytics.dataDestructionCount}건
                  </span>
                  <Badge variant="destructive" className="text-[10px] h-5">{analytics.dataDestructionCount}</Badge>
                </div>
                <button
                  onClick={() => setShowDestructionDialog(true)}
                  className="text-sm text-red-600 hover:underline font-medium"
                >
                  처리하기 →
                </button>
              </div>
              <p className="text-xs text-red-700 ml-6 mt-1">
                퇴거 후 개인정보 보유기간이 만료된 데이터가 있습니다. 개인정보보호법에 따라 즉시 파기 절차를 진행해 주세요.
              </p>
            </div>
          )}

          <ResponsiveDialog open={showDestructionDialog} onOpenChange={setShowDestructionDialog}>
            <ResponsiveDialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <ResponsiveDialogHeader>
                <ResponsiveDialogTitle className="flex items-center gap-2">
                  <Trash2 className="w-5 h-5 text-red-600" />
                  개인정보 파기 대상 목록
                </ResponsiveDialogTitle>
              </ResponsiveDialogHeader>
              <div className="space-y-3">
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 space-y-1">
                  <p className="font-medium">파기 절차 안내</p>
                  <p>1. 아래 대상자의 개인정보 파기 여부를 확인합니다.</p>
                  <p>2. 관리규약 및 개인정보보호법에 따라 파기 대장을 작성합니다.</p>
                  <p>3. 전자적 파일은 복구 불가능하게 삭제하고, 종이 서류는 파쇄 처리합니다.</p>
                  <p>4. 파기 완료 후 파기 기록을 남기고 관리사무소장 확인을 받습니다.</p>
                </div>
                {analytics?.dataDestructionTargets.map((target) => (
                  <div key={`${target.type}-${target.id}`} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <p className="text-sm font-medium">{target.name} ({target.unit}호)</p>
                      <p className="text-xs text-muted-foreground">
                        {target.type === "tenant" ? "임차인" : "소유자"} · 퇴거일: {target.moveOutDate || "-"} · 파기기한: {target.destructionDate}
                      </p>
                    </div>
                    <Badge variant="destructive" className="text-[10px]">파기 필요</Badge>
                  </div>
                ))}
                {(!analytics?.dataDestructionTargets || analytics.dataDestructionTargets.length === 0) && (
                  <p className="text-sm text-muted-foreground text-center py-4">파기 대상이 없습니다</p>
                )}
              </div>
            </ResponsiveDialogContent>
          </ResponsiveDialog>

          {/* [Task #413] 알림 처리 다이얼로그 — AlertActionDialog 로 추출됨. */}
          <AlertActionDialog
            alert={selectedAlert}
            onClose={() => setSelectedAlert(null)}
            building={building}
            user={user}
          />

          <SeasonalSuggestionsCard />
        </div>
      </DesktopOnly>
    </>
  );
}
