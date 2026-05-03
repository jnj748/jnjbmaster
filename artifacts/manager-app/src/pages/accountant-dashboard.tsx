// [Task #660] 경리 대시보드 — 손스케치 기반 2칼럼 레이아웃 (데스크톱).
//
// 모바일(KPI 4 + 캘린더/미납 탭)은 기존 동작 그대로 유지하고,
// 데스크톱만 두 칼럼으로 재구성한다.
//
// - 왼쪽 칼럼: 필수업무 / 최근문서함 / 처리내역 / 세무·회계 캘린더 / 지출결의서 처리
// - 오른쪽 칼럼: 중간정산 / 회원정보조회 / 오늘 업무일지 / 미납관리비 / 우리 건물 계약업체 / 이번달 관리비 부과 시작
//
// 각 카드는 "요약 위젯 + 진입" 깊이로 구현하고, 카드 내 인라인 액션은
// 미납관리비(문자 발송)와 회원정보조회(검색 결과) 두 곳에만 둔다.

import { lazy, Suspense, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListApprovals,
  useGetBillingList,
  useGetDashboardAlerts,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { useBuilding } from "@/contexts/building-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CalendarDays,
  AlertTriangle,
  Clock,
  CheckCircle,
  Send,
  Bell,
  ClipboardCheck,
  FolderOpen,
  ListChecks,
  Receipt,
  ChevronRight,
  Calculator,
  PlayCircle,
} from "lucide-react";
import {
  MobileOnly,
  DesktopOnly,
  MobileKpiStrip,
  MobileTabPanels,
  type KpiItem,
} from "@/components/dashboard-widgets/mobile-compact";
import { TodayWorkLogEntry } from "@/components/dashboard-widgets/widgets/today-work-log-entry-widget";
import BuildingContractsSummaryWidget from "@/components/dashboard-widgets/widgets/building-contracts-summary-widget";
// [Task #681] 경리 필수업무 카드도 매니저/시설과 동일한 AlertSection 패턴으로 통일.
import { AlertSection } from "@/components/dashboard-widgets/widgets/alert-section-widget";
import { AlertActionDialog } from "@/components/alert-action-dialog";
import { type DashboardAlert } from "@/lib/alert-utils";
import { splitDashboardAlerts } from "@/lib/dashboard-alert-filters";
import { useAlertClickHandler } from "@/hooks/use-alert-click-handler";

// 무거운 위젯은 lazy 로드해 첫 렌더 비용을 분산한다.
const AccountantMemberSearchWidget = lazy(
  () =>
    import(
      "@/components/dashboard-widgets/widgets/accountant-member-search-widget"
    ),
);
const AccountantDelinquencyListWidget = lazy(
  () =>
    import(
      "@/components/dashboard-widgets/widgets/accountant-delinquency-list-widget"
    ),
);

const today = new Date();
const currentMonth = today.getMonth() + 1;

interface TaxEvent {
  day: number;
  title: string;
  type: "tax" | "insurance" | "invoice" | "deadline";
  done: boolean;
  daysUntil: number;
}

function buildTaxEvents(): TaxEvent[] {
  const dayOfMonth = today.getDate();

  const monthly: TaxEvent[] = [
    { day: 5, title: "세무사 자료 마감", type: "deadline", done: dayOfMonth > 5, daysUntil: 5 - dayOfMonth },
    { day: 10, title: "원천세 신고·납부", type: "tax", done: dayOfMonth > 10, daysUntil: 10 - dayOfMonth },
    { day: 10, title: "전자세금계산서 발급", type: "invoice", done: dayOfMonth > 10, daysUntil: 10 - dayOfMonth },
    { day: 10, title: "4대보험료 고지분 납부", type: "insurance", done: dayOfMonth > 10, daysUntil: 10 - dayOfMonth },
    { day: 25, title: "관리비 고지서 발송", type: "deadline", done: dayOfMonth > 25, daysUntil: 25 - dayOfMonth },
    { day: 28, title: "세무사 자료 요청 (익월분)", type: "deadline", done: dayOfMonth > 28, daysUntil: 28 - dayOfMonth },
  ];

  const vatDueMonths = [1, 4, 7, 10];
  if (vatDueMonths.includes(currentMonth)) {
    monthly.push({
      day: 25,
      title: "부가가치세 신고·납부",
      type: "tax",
      done: dayOfMonth > 25,
      daysUntil: 25 - dayOfMonth,
    });
  }

  const vatPrepMonths = [3, 6, 9, 12];
  if (vatPrepMonths.includes(currentMonth)) {
    monthly.push({
      day: 28,
      title: "부가세 신고 자료 준비",
      type: "tax",
      done: dayOfMonth > 28,
      daysUntil: 28 - dayOfMonth,
    });
  }

  return monthly.sort((a, b) => a.day - b.day);
}

const TAX_EVENTS = buildTaxEvents();

// [Task #660] 모바일 탭은 기존 동작 유지를 위해 mock 데이터를 그대로 사용한다.
//   데스크톱 미납 카드는 실데이터(useListDelinquencies) 기반의 별도 위젯을 쓴다.
const MOBILE_DELINQUENT_UNITS = [
  { unit: "301호", months: 3, amount: 540000, lastAction: "문자 발송 (04/01)", lastActionType: "sms" },
  { unit: "502호", months: 2, amount: 380000, lastAction: "미조치", lastActionType: "none" },
  { unit: "704호", months: 1, amount: 195000, lastAction: "유선 연락 (04/10)", lastActionType: "call" },
];

const typeColors: Record<string, string> = {
  tax: "bg-blue-500/10 text-blue-600 border-blue-200",
  insurance: "bg-purple-500/10 text-purple-600 border-purple-200",
  invoice: "bg-green-500/10 text-green-600 border-green-200",
  deadline: "bg-amber-500/10 text-amber-600 border-amber-200",
};

const typeLabels: Record<string, string> = {
  tax: "세무",
  insurance: "보험",
  invoice: "세금계산서",
  deadline: "마감",
};

function thisMonthIso(): string {
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// ─────────────────────────────────────────────────────────────────────────
// 인라인 카드들
// ─────────────────────────────────────────────────────────────────────────

// [Task #707] 경리는 결재 결정권자가 아니다 — "결재 대기 처리" 라벨은 더 이상
//   맞지 않다. 본 카드는 "내가 (경리로서) 직접 상신한 기안의 진행 현황" 으로
//   재정의된다. 카운트는 본인 상신 + 진행 중(in_progress) + 대기(pending) 합.
function PendingApprovalsEntryCard({
  pendingCount,
  loading,
}: {
  pendingCount: number;
  loading: boolean;
}) {
  if (loading) {
    return <Skeleton className="h-14 rounded-lg" />;
  }
  return (
    <Link href="/approvals">
      <Card
        className="hover-elevate active-elevate-2 cursor-pointer"
        data-testid="accountant-pending-approvals-entry"
      >
        <CardContent className="py-3 px-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
            <ClipboardCheck className="w-4 h-4 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">내가 상신한 기안 진행 현황</p>
            <p className="text-xs text-muted-foreground truncate">
              {pendingCount > 0
                ? `진행 중 ${pendingCount}건`
                : "진행 중인 기안이 없습니다"}
            </p>
          </div>
          {pendingCount > 0 && (
            <Badge
              variant="secondary"
              className="text-[10px] shrink-0"
              data-testid="accountant-pending-approvals-badge"
            >
              {pendingCount}건
            </Badge>
          )}
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}

function RecentDocumentsEntryCard() {
  return (
    <Link href="/recent-documents">
      <Card
        className="hover-elevate active-elevate-2 cursor-pointer"
        data-testid="accountant-recent-docs-entry"
      >
        <CardContent className="py-3 px-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
            <FolderOpen className="w-4 h-4 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">최근문서함</p>
            <p className="text-xs text-muted-foreground truncate">
              일지·기안서·공고문·외부문서를 한 곳에서 다시 봅니다
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}

function ActivityEntryCard() {
  return (
    <Link href="/work-log?tab=activity">
      <Card
        className="hover-elevate active-elevate-2 cursor-pointer"
        data-testid="accountant-activity-entry"
      >
        <CardContent className="py-3 px-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
            <ListChecks className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">처리내역</p>
            <p className="text-xs text-muted-foreground truncate">
              내가 최근에 처리한 결재·문서·일지를 시간순으로 확인합니다
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}

function TaxCalendarCard() {
  return (
    <Card data-testid="accountant-tax-calendar">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <CalendarDays className="w-4 h-4" />
          {currentMonth}월 세무·회계 캘린더
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {TAX_EVENTS.map((event, i) => {
          const isUrgent =
            !event.done && event.daysUntil >= 0 && event.daysUntil <= 3;
          return (
            <div
              key={i}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                event.done ? "opacity-60" : ""
              } ${isUrgent ? "border-red-300 bg-red-50/50" : ""}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm font-mono font-bold w-8 text-center shrink-0">
                  {event.day}일
                </span>
                {event.done ? (
                  <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
                ) : isUrgent ? (
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                ) : (
                  <Clock className="w-4 h-4 text-amber-500 shrink-0" />
                )}
                <span className="text-sm font-medium truncate">
                  {event.title}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isUrgent && (
                  <Badge variant="destructive" className="text-[10px]">
                    {event.daysUntil === 0 ? "D-Day" : `D-${event.daysUntil}`}
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={`text-[10px] ${typeColors[event.type]}`}
                >
                  {typeLabels[event.type]}
                </Badge>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ExpenseVoucherEntryCard({
  pendingCount,
  loading,
}: {
  pendingCount: number;
  loading: boolean;
}) {
  return (
    <Link href="/expense-vouchers">
      <Card
        className="hover-elevate active-elevate-2 cursor-pointer"
        data-testid="accountant-expense-voucher-entry"
      >
        <CardContent className="py-3 px-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-violet-50 flex items-center justify-center shrink-0">
            <Receipt className="w-4 h-4 text-violet-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">지출결의서 처리</p>
            <p className="text-xs text-muted-foreground truncate">
              결재 라인 통과 후 출납 기록을 진행합니다
            </p>
          </div>
          {loading ? (
            <Skeleton className="h-5 w-10" />
          ) : pendingCount > 0 ? (
            <Badge variant="destructive" className="text-[10px] shrink-0">
              대기 {pendingCount}건
            </Badge>
          ) : null}
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}

function InterimSettlementEntryCard() {
  return (
    <Link href="/erp/building-records">
      <Card
        className="hover-elevate active-elevate-2 cursor-pointer"
        data-testid="accountant-interim-entry"
      >
        <CardContent className="py-3 px-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-cyan-50 flex items-center justify-center shrink-0">
            <Calculator className="w-4 h-4 text-cyan-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">중간정산</p>
            <p className="text-xs text-muted-foreground truncate">
              퇴거 세대의 일할 관리비·장기수선충당금 환급액을 계산합니다
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1 shrink-0"
            data-testid="accountant-interim-cta"
          >
            정산 시작
          </Button>
        </CardContent>
      </Card>
    </Link>
  );
}

function BillingStatusEntryCard({
  status,
  loading,
}: {
  status: "not_started" | "in_progress" | "complete";
  loading: boolean;
}) {
  const statusMeta = {
    not_started: {
      label: "미시작",
      variant: "destructive" as const,
      hint: "이번 달 부과 자료가 아직 없습니다",
    },
    in_progress: {
      label: "진행중",
      variant: "outline" as const,
      hint: "이번 달 부과가 진행 중입니다",
    },
    complete: {
      label: "완료",
      variant: "default" as const,
      hint: "이번 달 부과가 완료되었습니다",
    },
  }[status];

  return (
    <Link href="/erp/billing">
      <Card
        className="hover-elevate active-elevate-2 cursor-pointer"
        data-testid="accountant-billing-entry"
      >
        <CardContent className="py-3 px-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
            <PlayCircle className="w-4 h-4 text-orange-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">이번달 관리비 부과</p>
            <p className="text-xs text-muted-foreground truncate">
              {loading ? "확인 중..." : statusMeta.hint}
            </p>
          </div>
          {!loading && (
            <Badge
              variant={statusMeta.variant}
              className="text-[10px] shrink-0"
              data-testid="billing-status-badge"
            >
              {statusMeta.label}
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px] gap-1 shrink-0"
            data-testid="accountant-billing-cta"
          >
            부과 시작
          </Button>
        </CardContent>
      </Card>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 페이지 본체
// ─────────────────────────────────────────────────────────────────────────

export default function AccountantDashboard() {
  const { token, user } = useAuth();
  const { building } = useBuilding();

  // [Task #707] 본인이 상신한 기안의 진행 중·대기 합계.
  //   결재 결정권자가 아니므로 "결재 대기" 카운트가 아니라, 본인이 올린 기안 중
  //   pending/in_progress 상태의 라인을 본다. 생성된 client 의 status enum 은
  //   pending/approved/rejected 만 허용하므로, status 필터 없이 전체를 받아
  //   client-side 에서 requesterId + status 로 거른다.
  const { data: allApprovals, isLoading: approvalsLoading } = useListApprovals();
  const pendingApprovalsCount = useMemo(() => {
    return (allApprovals ?? []).filter((a) => {
      const r = a as { requesterId?: number; status?: string };
      return (
        r.requesterId === user?.id &&
        (r.status === "pending" || r.status === "in_progress")
      );
    }).length;
  }, [allApprovals, user?.id]);

  // [Task #703] 지출결의서 처리 카드의 "대기 N건" 은 결재 대기 기안서가 아니라
  //   이미 발행되어 출납기록을 기다리는 지출결의서(status === "pending") 의
  //   건수를 보여줘야 한다. 지출결의서함(/expense-vouchers) 과 동일한
  //   엔드포인트(GET /api/expense-vouchers?status=pending) 를 사용해 두 화면의
  //   숫자가 항상 일치하도록 한다.
  const apiBase = useMemo(() => {
    const base = (import.meta.env.BASE_URL ?? "/") as string;
    return `${base}api`.replace(/\/+/g, "/");
  }, []);
  const {
    data: pendingVouchers,
    isLoading: pendingVouchersLoading,
  } = useQuery<unknown[]>({
    // user.id 를 키에 포함시켜, 같은 SPA 세션에서 계정이 바뀌었을 때
    // 이전 사용자의 캐시가 잠시라도 남아 잘못된 건수가 보이는 일을 막는다.
    queryKey: ["expense-vouchers", "pending", user?.id ?? null],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch(`${apiBase}/expense-vouchers?status=pending`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) throw new Error(`지출결의서 로드 실패 (${res.status})`);
      return (await res.json()) as unknown[];
    },
  });
  const pendingVouchersCount = (pendingVouchers ?? []).length;

  // [Task #681] 매니저/시설과 동일한 단일 출처(/api/dashboard/alerts) 에서
  //   알림을 가져오고, splitDashboardAlerts(role:"accountant") 가 회계
  //   카테고리(tax_due, accounting/tax/finance task, accounting/fee 템플릿,
  //   targetRoles=accountant 템플릿) 만 골라낸다.
  const { data: alerts, isLoading: alertsLoading } = useGetDashboardAlerts();
  const { legalAlerts: accountantAlerts } = splitDashboardAlerts(
    alerts as DashboardAlert[] | null | undefined,
    "accountant",
  );
  const [selectedAlert, setSelectedAlert] = useState<DashboardAlert | null>(
    null,
  );
  const handleAlertClick = useAlertClickHandler(setSelectedAlert);

  // 이번 달 부과 상태 — /api/fees/billing?month=YYYY-MM
  const month = thisMonthIso();
  const { data: billingItems, isLoading: billingLoading } = useGetBillingList(
    { month },
    { query: { enabled: !!token, staleTime: 5 * 60 * 1000 } },
  );
  const billingStatus: "not_started" | "in_progress" | "complete" = useMemo(() => {
    if (!billingItems || billingItems.length === 0) return "not_started";
    const total = billingItems.length;
    const paid = billingItems.filter((b) => b.isPaid).length;
    if (paid === 0) return "in_progress";
    if (paid === total) return "complete";
    return "in_progress";
  }, [billingItems]);

  // 모바일 KPI
  const nextEvent = TAX_EVENTS.find((e) => !e.done);
  const daysUntilNext = nextEvent ? nextEvent.daysUntil : null;
  const totalDelinquent = MOBILE_DELINQUENT_UNITS.reduce(
    (s, u) => s + u.amount,
    0,
  );
  const urgentCount = TAX_EVENTS.filter(
    (e) => !e.done && e.daysUntil >= 0 && e.daysUntil <= 3,
  ).length;

  const mobileKpis: KpiItem[] = [
    {
      key: "next-tax",
      label: "다음 세무",
      value:
        daysUntilNext !== null && daysUntilNext > 0
          ? `D-${daysUntilNext}`
          : daysUntilNext === 0
            ? "D-Day"
            : "완료",
      hint: nextEvent?.title ?? "이번 달 완료",
      icon: CalendarDays,
      iconClass: "text-white",
      iconBg: "bg-accent",
      highlight: daysUntilNext !== null && daysUntilNext <= 3 ? "warn" : "default",
    },
    {
      key: "delinquent",
      label: "미납 세대",
      value: MOBILE_DELINQUENT_UNITS.length,
      hint: `₩${(totalDelinquent / 10000).toFixed(0)}만원`,
      icon: AlertTriangle,
      iconClass: "text-white",
      iconBg: "bg-destructive",
      highlight:
        MOBILE_DELINQUENT_UNITS.length > 0 ? "danger" : "default",
    },
    {
      key: "done",
      label: "완료 일정",
      value: `${TAX_EVENTS.filter((e) => e.done).length}/${TAX_EVENTS.length}`,
      hint: "이번 달 기준",
      icon: CheckCircle,
      iconClass: "text-white",
      iconBg: "bg-emerald-500",
    },
    {
      key: "urgent",
      label: "긴급 알림",
      value: urgentCount > 0 ? `${urgentCount}건` : "없음",
      hint: "D-3 이내",
      icon: Bell,
      iconClass: "text-white",
      iconBg: "bg-amber-500",
      highlight: urgentCount > 0 ? "warn" : "default",
    },
  ];

  const widgetFallback = <Skeleton className="h-40 rounded-lg" />;

  return (
    <>
      {/* [Task #327] 모바일 — KPI 4 + 캘린더/미납 탭. 본 작업에서는 변경하지 않는다. */}
      <MobileOnly>
        <div className="space-y-3">
          <MobileKpiStrip items={mobileKpis} />
          <MobileTabPanels
            sections={[
              {
                key: "calendar",
                label: `${currentMonth}월 캘린더`,
                content: (
                  <div className="space-y-1.5">
                    {TAX_EVENTS.map((event, i) => {
                      const isUrgent =
                        !event.done && event.daysUntil >= 0 && event.daysUntil <= 3;
                      return (
                        <div
                          key={i}
                          className={`flex items-center justify-between p-2 rounded-lg border text-xs ${
                            event.done ? "opacity-60" : ""
                          } ${isUrgent ? "border-red-300 bg-red-50/50" : ""}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[11px] font-mono font-bold w-7 text-center shrink-0">
                              {event.day}일
                            </span>
                            {event.done ? (
                              <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" />
                            ) : isUrgent ? (
                              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            ) : (
                              <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            )}
                            <span className="text-[11px] font-medium truncate">
                              {event.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {isUrgent && (
                              <Badge variant="destructive" className="text-[9px] h-4 px-1">
                                {event.daysUntil === 0 ? "D-Day" : `D-${event.daysUntil}`}
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className={`text-[9px] h-4 px-1 ${typeColors[event.type]}`}
                            >
                              {typeLabels[event.type]}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ),
              },
              {
                key: "delinquent",
                label: "미납 관리",
                badge:
                  MOBILE_DELINQUENT_UNITS.length > 0 ? (
                    <Badge variant="destructive" className="text-[9px] h-4 px-1">
                      {MOBILE_DELINQUENT_UNITS.length}
                    </Badge>
                  ) : undefined,
                content: (
                  <div className="space-y-2">
                    {MOBILE_DELINQUENT_UNITS.map((u) => (
                      <div key={u.unit} className="p-2 rounded-lg border space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-xs font-bold">{u.unit}</span>
                            <Badge variant="destructive" className="text-[9px] h-4 px-1">
                              {u.months}개월
                            </Badge>
                          </div>
                          <span className="text-xs font-bold">
                            ₩{u.amount.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] text-muted-foreground truncate">
                            {u.lastAction}
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-[10px] gap-1 shrink-0"
                          >
                            <Send className="w-3 h-3" />
                            문자
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ),
              },
            ]}
          />
        </div>
      </MobileOnly>

      {/* [Task #660 → #681] 데스크톱 — 2칼럼 레이아웃.
          [Task #681] "필수업무" 슬롯을 매니저/시설과 동일한 AlertSection 패턴으로
          교체(페이지당 5개 + 페이지네이션 + 모두보기 + D-day 신호등 + 액션 모달).
          그 외 카드 위치는 기존 #660 배치를 그대로 유지한다(코드 리뷰 반영 —
          BuildingContractsSummaryWidget 등 기존 카드의 우측 칼럼 위치는 변경하지
          않는다). "우리 건물 한눈에"(building-info) 만 ROLE_LAYOUTS 에서 페이지
          최하단으로 이동(목표 #2). */}
      <DesktopOnly>
        <div className="space-y-3">
          {urgentCount > 0 && (
            <div className="flex items-start justify-end">
              <Badge variant="destructive" className="text-xs gap-1 animate-pulse">
                <AlertTriangle className="w-3 h-3" />
                {urgentCount}건 D-3 이내
              </Badge>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
            {/* ─── 왼쪽 칼럼 ─── */}
            <div className="space-y-3">
              <AlertSection
                title="필수업무현황"
                description="법적으로 반드시 해야하는 업무"
                icon={ClipboardCheck}
                iconClassName="text-amber-600"
                alerts={accountantAlerts}
                loading={alertsLoading}
                placeholderZero="현재 60일 내 예정된 회계 필수업무가 없습니다"
                placeholderOne="30일 내 예정된 회계 필수업무가 없습니다"
                onAlertClick={handleAlertClick}
                sectionKind="mandatory"
                pageSize={3}
              />
              <PendingApprovalsEntryCard
                pendingCount={pendingApprovalsCount}
                loading={approvalsLoading}
              />
              <RecentDocumentsEntryCard />
              <ActivityEntryCard />
              <TaxCalendarCard />
              <ExpenseVoucherEntryCard
                pendingCount={pendingVouchersCount}
                loading={pendingVouchersLoading}
              />
            </div>

            {/* ─── 오른쪽 칼럼 ─── */}
            <div className="space-y-3">
              <InterimSettlementEntryCard />
              <Suspense fallback={widgetFallback}>
                <AccountantMemberSearchWidget />
              </Suspense>
              <TodayWorkLogEntry variant="compact" />
              <Suspense fallback={widgetFallback}>
                <AccountantDelinquencyListWidget />
              </Suspense>
              <BuildingContractsSummaryWidget />
              <BillingStatusEntryCard
                status={billingStatus}
                loading={billingLoading}
              />
            </div>
          </div>

          {/* [Task #681] 알림 처리 다이얼로그 — 매니저/시설 본문과 동일한 흐름. */}
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
