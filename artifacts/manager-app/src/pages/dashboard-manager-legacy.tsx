import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useGetDashboardSummary,
  useGetDashboardAlerts,
  useGetDashboardAnalytics,
  useListTenants,
  useListVehicles,
  useGetUnitsSummary,
  useCreateAlertAction,
  useCreateRfq,
  // [Task #142] useGetDelinquencySummary, useListApprovals 는 공유 위젯
  // (delinquency-summary-widget / pending-approvals-widget)으로 분리되어
  // 이 페이지에서는 더 이상 사용하지 않는다.
  // [Task #327] 모바일 컴팩트 KPI 에서는 같은 useGetDelinquencySummary 를
  // 다시 사용한다 — React Query 가 cache 공유로 중복 호출을 dedupe.
  useGetDelinquencySummary,
  getGetDashboardAlertsQueryKey,
  getListRfqsQueryKey,
  type CreateRfqBody,
  type CreateRfqBodyCategory,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
// [Task #142] formatDate 는 추출된 pending-approvals-widget 에서 사용.
import { Skeleton } from "@/components/ui/skeleton";
import { Link, useLocation } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  CheckSquare,
  AlertTriangle,
  Clock,
  Shield,
  Coins,
  TrendingUp,
  Activity,
  Users,
  Car,
  ClipboardCheck,
  ListChecks,
  Wrench,
  Send,
  CheckCircle,
  CalendarClock,
  FileText,
  Building2,
  Trash2,
  NotebookPen,
  FolderOpen,
  BarChart3,
} from "lucide-react";
import { PhotoUploadField } from "@/components/photo-upload-field";
// [Task #256] 5색 카테고리 팔레트 단일 출처 — 화면별 하드코딩 색 클래스 대신 사용
import { CATEGORY_ICON_CLASS, CATEGORY_BG_CLASS } from "@/lib/category-colors";
import { CompletionNotice } from "@/components/completion-notice";
import { RfqRequestDocument, type RfqDocumentData } from "@/components/rfq-request-document";
// [Task #142] BuildingInfoCard 는 building-info-widget 으로 추출되어
// 위젯 카탈로그를 통해 렌더링된다.
import { Printer } from "lucide-react";
// [Task #327] 모바일 컴팩트 KPI/탭 위젯 — ≤899px 한 화면 압축
import {
  MobileOnly,
  DesktopOnly,
  MobileKpiStrip,
  MobileTabPanels,
  type KpiItem,
} from "@/components/dashboard-widgets/mobile-compact";

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
  href,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
  href?: string;
}) {
  const content = (
    <Card className={href ? "hover:bg-muted/50 transition-colors cursor-pointer" : ""}>
      <CardContent className="p-3 sm:p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-muted-foreground font-medium truncate">{title}</p>
            <p className="text-xl sm:text-2xl font-bold mt-0.5 sm:mt-1">{value}</p>
            {subtitle && (
              <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">{subtitle}</p>
            )}
          </div>
          <div className={`p-2 sm:p-2.5 rounded-lg ${color} shrink-0`}>
            <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

function getDdayLabel(dueDate: string | null): { label: string; days: number | null; isOverdue: boolean } {
  if (!dueDate) return { label: "기한없음", days: null, isOverdue: false };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { label: `기한초과 +${Math.abs(diff)}일`, days: diff, isOverdue: true };
  if (diff === 0) return { label: "D-Day", days: 0, isOverdue: false };
  return { label: `D-${diff}`, days: diff, isOverdue: false };
}

type AlertActionTab = "complete" | "postpone" | "rfq";

const ACTIONABLE_ALERT_TYPES = ["inspection_due", "tax_due", "task_overdue", "task_followup", "warranty_expiry"] as const;

const ALERT_FALLBACK_ROUTES: Record<string, string> = {
  inspection_due: "/inspections",
  tax_due: "/tax-schedules",
  task_overdue: "/tasks",
  task_followup: "/tasks",
  warranty_expiry: "/settings?tab=building",
};

interface DashboardAlert {
  id: number;
  type: string;
  title: string;
  message: string;
  severity: string;
  relatedId?: number | null;
  hasDraft?: boolean;
  actionStatus?: string | null;
  dueDate?: string | null;
  penaltyInfo?: string | null;
  inspectionType?: string | null;
  cycleMonths?: number | null;
  intervalDays?: number | null;
  createdAt: string;
}

// [Task #184] Renders one alert section (필수업무현황/제안업무현황). The
// pagination, swipe and click-to-action behavior is identical between
// the two sections; only the source array and copy differ. Keep the
// page size at 2 — task spec narrows the previous "3 per page" layout.
function AlertSection({
  title,
  icon: Icon,
  iconClassName,
  alerts,
  loading,
  emptyMessage,
  onAlertClick,
}: {
  title: string;
  icon: React.ElementType;
  iconClassName: string;
  alerts: DashboardAlert[];
  loading: boolean;
  emptyMessage: string;
  onAlertClick: (alert: DashboardAlert) => void;
}) {
  const PAGE_SIZE = 2;
  const [page, setPage] = useState(0);
  const pages = Array.from(
    { length: Math.ceil(alerts.length / PAGE_SIZE) },
    (_, i) => alerts.slice(i * PAGE_SIZE, i * PAGE_SIZE + PAGE_SIZE),
  );
  const totalPages = pages.length;
  // Reset to first page when alert count changes (e.g. after action).
  useEffect(() => {
    if (page > 0 && page >= totalPages) setPage(0);
  }, [page, totalPages]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <Icon className={`w-4 h-4 ${iconClassName}`} />
            {title}
            {alerts.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground ml-1">
                총 {alerts.length}건
              </span>
            )}
          </h2>
        </div>
      </div>
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : alerts.length > 0 ? (
        <div
          className="overflow-hidden relative"
          onTouchStart={(e) => {
            const el = e.currentTarget;
            (el as any)._touchStartX = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            const el = e.currentTarget;
            const startX = (el as any)._touchStartX;
            if (startX == null) return;
            const diff = startX - e.changedTouches[0].clientX;
            if (Math.abs(diff) > 50) {
              if (diff > 0 && page < totalPages - 1) setPage(page + 1);
              if (diff < 0 && page > 0) setPage(page - 1);
            }
          }}
        >
          <div
            className="flex transition-transform duration-300 ease-in-out"
            style={{ transform: `translateX(-${page * 100}%)` }}
          >
            {pages.map((pageAlerts, pi) => (
              <div key={pi} className="w-full shrink-0 space-y-2 px-0.5">
                {pageAlerts.map((alert) => {
                  const dday = getDdayLabel(alert.dueDate ?? null);
                  const trafficColor = dday.isOverdue
                    ? "red"
                    : dday.days !== null && dday.days <= 30
                    ? "yellow"
                    : "green";
                  const isInteractive =
                    (ACTIONABLE_ALERT_TYPES as readonly string[]).includes(alert.type) ||
                    alert.type === "data_destruction" ||
                    alert.type === "task_template_mandatory" ||
                    alert.type === "task_template_suggested";
                  return (
                    <div
                      key={alert.id}
                      role={isInteractive ? "button" : undefined}
                      tabIndex={isInteractive ? 0 : undefined}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors border-l-4 ${
                        isInteractive ? "cursor-pointer hover:bg-muted/50" : "cursor-default"
                      } ${
                        trafficColor === "red"
                          ? "border-l-red-500 bg-red-50/40"
                          : trafficColor === "yellow"
                          ? "border-l-yellow-400 bg-yellow-50/30"
                          : "border-l-green-500 bg-green-50/20"
                      }`}
                      onClick={() => isInteractive && onAlertClick(alert)}
                      onKeyDown={(e) => {
                        if (!isInteractive) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onAlertClick(alert);
                        }
                      }}
                    >
                      <div className="flex flex-col items-center gap-0.5 shrink-0">
                        <span className={`w-3 h-3 rounded-full ${
                          trafficColor === "red" ? "bg-red-500 animate-pulse" :
                          trafficColor === "yellow" ? "bg-yellow-400" :
                          "bg-green-500"
                        }`} />
                        <span className={`text-[10px] font-bold whitespace-nowrap ${
                          trafficColor === "red" ? "text-red-700" :
                          trafficColor === "yellow" ? "text-yellow-700" :
                          "text-green-700"
                        }`}>
                          {dday.label}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{alert.title}</p>
                        <p className="text-xs text-muted-foreground truncate">{alert.message}</p>
                        {trafficColor === "red" && alert.penaltyInfo && (
                          <p className="text-[10px] text-red-600 font-medium mt-0.5">⚠ {alert.penaltyInfo}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {alert.hasDraft && (
                          <Badge variant="outline" className="text-[10px] h-5">기안서</Badge>
                        )}
                        {alert.actionStatus === "postponed" && (
                          <Badge variant="outline" className="text-[10px] h-5 text-amber-600 border-amber-300">연기</Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 mt-3">
              {pages.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`페이지 ${i + 1}`}
                  onClick={() => setPage(i)}
                  style={{ width: 6, height: 6, minWidth: 0, minHeight: 0, padding: 0, border: 0 }}
                  className={`rounded-full transition-colors ${
                    i === page ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// [Task #205] 대시보드의 "제안업무현황" 바로 아래에서 오늘 업무일지 자동 작성 진입점.
// 당일 일지 존재 여부에 따라 안내 문구/색을 달리해 시니어 사용자 인지를 돕는다.
function TodayWorkLogEntry() {
  const { token } = useAuth();
  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");
  const todayKst = (() => {
    const ms = Date.now() + 9 * 60 * 60 * 1000;
    return new Date(ms).toISOString().split("T")[0];
  })();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-today-journal", todayKst],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/daily-journals/${todayKst}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) return null;
      if (res.status === 204) return null;
      return (await res.json()) as null | { id: number };
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
    enabled: !!token,
  });

  const hasJournal = !!data;
  const message = hasJournal
    ? "금일 업무일지가 생성완료되었습니다"
    : "금일 업무일지 생성 전입니다. 자동으로 생성해보세요";
  const messageClass = hasJournal ? "text-emerald-600" : "text-red-600";

  // [Task #246] 컴팩트 가로 레이아웃: 왼쪽 아이콘 + 오른쪽 2줄 텍스트.
  // 화면 점유율을 줄이기 위해 아이콘/폰트 크기를 절반 수준으로 축소했다.
  return (
    <Card>
      <CardContent className="p-3">
        <Link href="/work-log?openDaily=1">
          <button
            type="button"
            data-testid="dashboard-today-worklog"
            className="w-full flex items-center gap-3 py-1 px-1 hover-elevate active-elevate-2 rounded-lg text-left"
          >
            {/* [Task #256] reports 카테고리 — category-colors.ts 단일 토큰 참조 */}
            <span className={`w-8 h-8 rounded-full ${CATEGORY_BG_CLASS.reports} flex items-center justify-center shrink-0`}>
              <NotebookPen className={`w-4 h-4 ${CATEGORY_ICON_CLASS.reports}`} />
            </span>
            <span className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-semibold">오늘 업무일지 자동 작성하기</span>
              <span
                className={`text-[11px] font-medium ${messageClass}`}
                data-testid="dashboard-today-worklog-status"
              >
                {isLoading ? "확인 중..." : message}
              </span>
            </span>
          </button>
        </Link>
      </CardContent>
    </Card>
  );
}

// [Task #246] 관리소장 대시보드 전용 "관리비 요약" 2×2 위젯.
// 기존 4-카드(관리비회계업무·시설업무·기한지난업무·예정점검) 그리드를 대체한다.
// 데이터 출처:
//   - /fees/bill-summaries → 최신 청구월의 totalAmount (당월 부과액)
//   - /fees/arrears-summary → 누적 미수금 / 미납 건수
//   - useGetDashboardAnalytics → 미납률
// 데이터가 없을 때는 "—" 로 비어있는 상태를 표시한다.
function FeesSummaryWidget({
  unpaidRate,
}: {
  unpaidRate: number | null;
}) {
  const { token } = useAuth();
  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");

  const { data: latestBill, isLoading: billLoading } = useQuery({
    queryKey: ["dashboard-fees-summary-latest-bill"],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/fees/bill-summaries`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) return null;
      const rows = (await res.json()) as Array<{ billingMonth: string; totalAmount: number }>;
      const valid = (Array.isArray(rows) ? rows : []).filter(
        (b) => !b.billingMonth.startsWith("failed-"),
      );
      // /fees/bill-summaries 는 billingMonth desc 로 내려옴 — 첫 항목이 최신.
      return valid[0] ?? null;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!token,
  });

  const { data: arrears, isLoading: arrearsLoading } = useQuery({
    queryKey: ["dashboard-fees-summary-arrears"],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/fees/arrears-summary`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) return null;
      return (await res.json()) as {
        totalArrears: number;
        unpaidCount: number;
        overdueCount: number;
        oldestUnpaidMonth: string | null;
      } | null;
    },
    staleTime: 5 * 60 * 1000,
    enabled: !!token,
  });

  const isLoading = billLoading || arrearsLoading;

  const billingMonthLabel = latestBill?.billingMonth
    ? `${latestBill.billingMonth.slice(5)}월 청구`
    : "최근 청구 자료 없음";

  const billAmount = latestBill?.totalAmount
    ? `₩${Math.round(latestBill.totalAmount).toLocaleString()}`
    : "—";

  const arrearsAmount = arrears && arrears.totalArrears > 0
    ? `₩${arrears.totalArrears.toLocaleString()}`
    : arrears
    ? "₩0"
    : "—";

  const unpaidCountLabel = arrears
    ? `${arrears.unpaidCount}건 미납`
    : "데이터 없음";

  const collectionRate = unpaidRate !== null ? `${100 - unpaidRate}%` : "—";

  return (
    <Card data-testid="dashboard-fees-summary-widget">
      <CardContent className="p-4">
        <Link href="/erp/fees-summary">
          <button
            type="button"
            data-testid="dashboard-fees-summary-header"
            className="w-full flex items-center justify-between mb-3 hover-elevate active-elevate-2 rounded-md px-1 py-1 text-left"
          >
            <span className="flex items-center gap-2">
              {/* [Task #256] 회계 카테고리 색 — category-colors.ts 단일 토큰 참조 */}
              <BarChart3 className={`w-4 h-4 ${CATEGORY_ICON_CLASS.accounting}`} />
              <span className="text-sm font-semibold">관리비 요약</span>
            </span>
            <span className="text-xs text-muted-foreground">자세히 →</span>
          </button>
        </Link>
        <div className="grid grid-cols-2 gap-2">
          <Link href="/erp/fees-summary">
            <div className="rounded-lg border bg-card p-3 hover:bg-muted/50 transition-colors cursor-pointer">
              <p className="text-[11px] text-muted-foreground">당월 부과액</p>
              <p className="text-sm font-bold mt-1 truncate">
                {isLoading ? "..." : billAmount}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {billingMonthLabel}
              </p>
            </div>
          </Link>
          <Link href="/erp/fees-summary">
            <div className="rounded-lg border bg-card p-3 hover:bg-muted/50 transition-colors cursor-pointer">
              <p className="text-[11px] text-muted-foreground">수납률</p>
              <p className="text-sm font-bold mt-1">{collectionRate}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                전체 세대 기준
              </p>
            </div>
          </Link>
          <Link href="/erp/fees-summary">
            <div className="rounded-lg border bg-card p-3 hover:bg-muted/50 transition-colors cursor-pointer">
              <p className="text-[11px] text-muted-foreground">누적 미수금</p>
              <p
                className={`text-sm font-bold mt-1 truncate ${
                  arrears && arrears.totalArrears > 0 ? "text-red-600" : ""
                }`}
              >
                {isLoading ? "..." : arrearsAmount}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {unpaidCountLabel}
              </p>
            </div>
          </Link>
          <Link href="/erp/fees-summary">
            <div className="rounded-lg border bg-card p-3 hover:bg-muted/50 transition-colors cursor-pointer">
              <p className="text-[11px] text-muted-foreground">연체 건수</p>
              <p
                className={`text-sm font-bold mt-1 ${
                  arrears && arrears.overdueCount > 0 ? "text-red-600" : ""
                }`}
              >
                {arrears ? `${arrears.overdueCount}건` : "—"}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                {arrears && arrears.oldestUnpaidMonth
                  ? `최장 ${arrears.oldestUnpaidMonth}부터`
                  : "기한 초과 없음"}
              </p>
            </div>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// [Task #142] PendingApprovalsCard 는 components/dashboard-widgets/widgets/
// pending-approvals-widget.tsx 로 추출되어 결재 권한이 있는 모든 역할이
// 동일한 컴포넌트를 공유한다.

export default function Dashboard() {
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
  // [Task #142] 연체 요약은 delinquency-summary-widget 으로 추출되어
  // 카탈로그가 별도 위젯으로 렌더링한다.
  // [Task #327] 모바일 컴팩트 KPI 에서 연체 합계가 필요해 같은 hook 을 다시
  // 호출한다. React Query 가 같은 query key 로 응답을 캐시 → 추가 fetch 없음.
  const { data: delinquencySummary } = useGetDelinquencySummary();

  const [selectedAlert, setSelectedAlert] = useState<DashboardAlert | null>(null);
  const [actionTab, setActionTab] = useState<AlertActionTab>("complete");
  const [completeDate, setCompleteDate] = useState(new Date().toISOString().split("T")[0]);
  const [nextCycleDate, setNextCycleDate] = useState("");
  const [postponeDays, setPostponeDays] = useState("7");
  const [postponeReason, setPostponeReason] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [rfqTitle, setRfqTitle] = useState("");
  const [rfqDeadline, setRfqDeadline] = useState("");
  const [closeUpPhotoUrl, setCloseUpPhotoUrl] = useState<string | null>(null);
  const [widePhotoUrl, setWidePhotoUrl] = useState<string | null>(null);
  const [rfqCloseUpPhotoUrl, setRfqCloseUpPhotoUrl] = useState<string | null>(null);
  const [rfqWidePhotoUrl, setRfqWidePhotoUrl] = useState<string | null>(null);
  const [showCompletionNotice, setShowCompletionNotice] = useState(false);
  const [completionNoticeData, setCompletionNoticeData] = useState<{
    alertTitle: string; alertMessage: string; completedDate: string;
    notes: string | null; closeUpPhotoUrl: string | null; widePhotoUrl: string | null;
  } | null>(null);
  const [showRfqDocument, setShowRfqDocument] = useState(false);
  const [rfqDocumentData, setRfqDocumentData] = useState<RfqDocumentData | null>(null);
  const [delayReason, setDelayReason] = useState("");
  const [delayReasonDetail, setDelayReasonDetail] = useState("");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createActionMutation = useCreateAlertAction();
  const createRfqMutation = useCreateRfq();

  function openAlertAction(alert: DashboardAlert) {
    setSelectedAlert(alert);
    setActionTab("complete");
    const todayStr = new Date().toISOString().split("T")[0];
    setCompleteDate(todayStr);
    setPostponeDays("7");
    setPostponeReason("");
    setActionNotes("");
    setRfqTitle(alert.title);
    const twoWeeks = new Date();
    twoWeeks.setDate(twoWeeks.getDate() + 14);
    setRfqDeadline(twoWeeks.toISOString().split("T")[0]);
    let prefilledNextCycle = "";
    if (alert.type === "inspection_due") {
      const base = new Date(todayStr);
      if (alert.cycleMonths) {
        base.setMonth(base.getMonth() + alert.cycleMonths);
      } else if (alert.intervalDays) {
        base.setDate(base.getDate() + alert.intervalDays);
      } else {
        base.setMonth(base.getMonth() + 6);
      }
      prefilledNextCycle = base.toISOString().split("T")[0];
    }
    setNextCycleDate(prefilledNextCycle);
    setCloseUpPhotoUrl(null);
    setWidePhotoUrl(null);
    setRfqCloseUpPhotoUrl(null);
    setRfqWidePhotoUrl(null);
    setDelayReason("");
    setDelayReasonDetail("");
  }

  function getEntityType(alertType: string): string {
    switch (alertType) {
      case "inspection_due": return "inspection";
      case "tax_due": return "tax";
      case "task_overdue": return "task";
      case "task_followup": return "task";
      case "warranty_expiry": return "warranty";
      case "task_template_mandatory": return "task_template";
      case "task_template_suggested": return "task_template";
      default: return "task";
    }
  }

  const [, navigate] = useLocation();

  function handleAlertClick(alert: DashboardAlert) {
    if ((ACTIONABLE_ALERT_TYPES as readonly string[]).includes(alert.type)) {
      if (alert.relatedId) {
        openAlertAction(alert);
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

    if (alert.type === "task_template_mandatory" || alert.type === "task_template_suggested") {
      if (!alert.relatedId) {
        toast({ title: "처리할 항목 정보를 찾을 수 없습니다", description: alert.title });
        return;
      }
      openAlertAction(alert);
      return;
    }

    toast({
      title: "이 항목은 별도 처리 화면이 없습니다",
      description: alert.title,
    });
  }

  async function handleComplete() {
    if (!selectedAlert) return;
    if (!completeDate) {
      toast({ title: "완료일을 입력해주세요", variant: "destructive" });
      return;
    }
    const isOverdue = selectedAlert.dueDate && getDdayLabel(selectedAlert.dueDate).isOverdue;
    if (isOverdue && !delayReason) {
      toast({ title: "기한 초과 항목입니다. 지연 사유를 선택해주세요", variant: "destructive" });
      return;
    }
    if (isOverdue && delayReason === "기타" && !delayReasonDetail.trim()) {
      toast({ title: "지연 사유의 상세 내용을 입력해주세요", variant: "destructive" });
      return;
    }
    await createActionMutation.mutateAsync({
      data: {
        alertType: selectedAlert.type,
        relatedEntityType: getEntityType(selectedAlert.type),
        relatedEntityId: selectedAlert.relatedId!,
        actionType: "completed",
        completedDate: completeDate || null,
        nextCycleDate: nextCycleDate || null,
        notes: actionNotes || null,
        closeUpPhotoUrl: closeUpPhotoUrl || null,
        widePhotoUrl: widePhotoUrl || null,
        delayReason: isOverdue && delayReason ? delayReason : null,
        delayReasonDetail: isOverdue && delayReasonDetail ? delayReasonDetail : null,
      },
    });
    queryClient.invalidateQueries({ queryKey: getGetDashboardAlertsQueryKey() });
    toast({ title: "처리 완료되었습니다" });
    setCompletionNoticeData({
      alertTitle: selectedAlert.title,
      alertMessage: selectedAlert.message,
      completedDate: completeDate,
      notes: actionNotes || null,
      closeUpPhotoUrl,
      widePhotoUrl,
    });
    setSelectedAlert(null);
    setShowCompletionNotice(true);
  }

  async function handlePostpone() {
    if (!selectedAlert) return;
    if (!postponeDays) {
      toast({ title: "연기 일수를 선택해주세요", variant: "destructive" });
      return;
    }
    if (!postponeReason) {
      toast({ title: "연기 사유를 선택해주세요", variant: "destructive" });
      return;
    }
    await createActionMutation.mutateAsync({
      data: {
        alertType: selectedAlert.type,
        relatedEntityType: getEntityType(selectedAlert.type),
        relatedEntityId: selectedAlert.relatedId!,
        actionType: "postponed",
        postponeDays: parseInt(postponeDays) || null,
        postponeReason: postponeReason || null,
        notes: actionNotes || null,
      },
    });
    queryClient.invalidateQueries({ queryKey: getGetDashboardAlertsQueryKey() });
    toast({ title: "일정이 연기되었습니다" });
    setSelectedAlert(null);
  }

  async function handleRfqRequest() {
    if (!selectedAlert) return;
    if (!rfqTitle.trim()) {
      toast({ title: "견적 요청 제목을 입력해주세요", variant: "destructive" });
      return;
    }
    if (!rfqDeadline) {
      toast({ title: "견적 마감일을 선택해주세요", variant: "destructive" });
      return;
    }
    const catMap: Record<string, string> = {
      inspection_due: "elevator",
    };

    const rfqData: CreateRfqBody = {
      title: rfqTitle,
      category: (catMap[selectedAlert.type] || "other") as CreateRfqBodyCategory,
      buildingName: building?.name || "관리 건물",
      deadline: rfqDeadline,
      description: `${selectedAlert.title} - ${selectedAlert.message}`,
      sido: building?.sido || null,
      sigungu: building?.sigungu || null,
      geoScope: building?.sido
        ? (building?.sigungu ? "sigungu" : "sido")
        : null,
      closeUpPhotoUrl: rfqCloseUpPhotoUrl || null,
      widePhotoUrl: rfqWidePhotoUrl || null,
    };
    const createdRfq = await createRfqMutation.mutateAsync({ data: rfqData });

    await createActionMutation.mutateAsync({
      data: {
        alertType: selectedAlert.type,
        relatedEntityType: getEntityType(selectedAlert.type),
        relatedEntityId: selectedAlert.relatedId!,
        actionType: "rfq_requested",
        rfqId: createdRfq?.id ?? null,
        notes: `견적 요청 생성: ${rfqTitle}`,
        closeUpPhotoUrl: rfqCloseUpPhotoUrl || null,
        widePhotoUrl: rfqWidePhotoUrl || null,
      },
    });

    queryClient.invalidateQueries({ queryKey: getGetDashboardAlertsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListRfqsQueryKey() });
    toast({ title: "견적 요청이 생성되었습니다" });
    setRfqDocumentData({
      ...rfqData,
      createdAt: new Date().toISOString(),
    });
    setSelectedAlert(null);
    setShowRfqDocument(true);
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

  const activeTenantCount = tenants?.length ?? 0;
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
  // 필수업무현황 = 법정 점검(inspection_due+legal) + 기존 비점검 알림(세무/
  // 보증/데이터파기 등) + task_template_mandatory. (제안업무로 분류된
  // task_template_suggested 와 자체점검 계열만 제외해 회귀를 방지한다.)
  const legalAlerts = alertList.filter((a) => {
    if (a.type === "task_template_suggested") return false;
    if (a.type === "inspection_due") {
      return a.inspectionType === "legal" || !a.inspectionType;
    }
    return true;
  });
  const proposedAlerts = alertList.filter((a) => {
    if (a.type === "task_template_suggested") return true;
    if (a.type === "inspection_due") {
      return (
        !!a.inspectionType && PROPOSED_INSPECTION_TYPES.has(a.inspectionType)
      );
    }
    return false;
  });

  // [Task #327] 모바일 컴팩트 KPI 4개 — 관리소장이 첫 화면에서 봐야 하는 핵심.
  const managerKpis: KpiItem[] = [
    {
      key: "mandatory",
      label: "필수업무",
      value: legalAlerts.length,
      hint: legalAlerts.length > 0 ? "탭에서 처리" : "처리할 항목 없음",
      icon: ClipboardCheck,
      iconClass: "text-white",
      iconBg: "bg-chart-3",
      highlight: legalAlerts.length > 0 ? "warn" : "default",
    },
    {
      key: "delinquency",
      label: "연체 세대",
      value: delinquencySummary?.totalOverdue ?? 0,
      hint:
        delinquencySummary && delinquencySummary.parkingSuspended > 0
          ? `주차 정지 ${delinquencySummary.parkingSuspended}`
          : "관리비 미납",
      icon: AlertTriangle,
      iconClass: "text-white",
      iconBg: "bg-rose-500",
      href: "/erp/accounting",
      highlight: (delinquencySummary?.totalOverdue ?? 0) > 0 ? "danger" : "default",
    },
    {
      key: "unpaid",
      label: "미수금률",
      value: analytics ? `${analytics.unpaidSummary.unpaidRate}%` : "-",
      hint: analytics
        ? `${(analytics.unpaidSummary.totalUnpaid / 10000).toFixed(0)}만원`
        : "데이터 준비중",
      icon: Coins,
      iconClass: "text-white",
      iconBg: "bg-chart-4",
      href: "/erp/fees-summary",
      highlight: analytics && analytics.unpaidSummary.unpaidRate > 10 ? "warn" : "default",
    },
    {
      key: "occupancy",
      label: "입주율",
      value: totalUnits > 0 ? `${occupancyRate}%` : "-",
      hint: totalUnits > 0 ? `${occupiedUnits}/${totalUnits}` : "건물 등록 필요",
      icon: Building2,
      iconClass: "text-white",
      iconBg: "bg-chart-5",
      href: "/units",
    },
  ];

  return (
    <>
      {/* [Task #327] 모바일 컴팩트 — KPI 4개 + 탭(긴급/관리비/건물) */}
      <MobileOnly>
        <div className="space-y-3">
          <MobileKpiStrip items={managerKpis} />
          <MobileTabPanels
            sections={[
              {
                key: "urgent",
                label: "긴급",
                badge:
                  legalAlerts.length + proposedAlerts.length > 0 ? (
                    <Badge variant="destructive" className="text-[9px] h-4 px-1">
                      {legalAlerts.length + proposedAlerts.length}
                    </Badge>
                  ) : undefined,
                content: (
                  <div className="space-y-3">
                    <AlertSection
                      title="필수업무"
                      icon={ClipboardCheck}
                      iconClassName="text-chart-3"
                      alerts={legalAlerts}
                      loading={alertsLoading}
                      emptyMessage="처리할 필수업무가 없습니다"
                      onAlertClick={handleAlertClick}
                    />
                    <AlertSection
                      title="제안업무"
                      icon={ListChecks}
                      iconClassName="text-chart-2"
                      alerts={proposedAlerts}
                      loading={alertsLoading}
                      emptyMessage="제안할 업무가 없습니다"
                      onAlertClick={handleAlertClick}
                    />
                  </div>
                ),
              },
              {
                key: "fees",
                label: "관리비",
                content: (
                  <div className="space-y-3">
                    <TodayWorkLogEntry />
                    <FeesSummaryWidget unpaidRate={analytics?.unpaidSummary.unpaidRate ?? null} />
                  </div>
                ),
              },
              {
                key: "building",
                label: "건물",
                content: (
                  <div className="space-y-2">
                    <Link href="/units">
                      <div className="flex items-center justify-between p-2.5 rounded-lg border bg-card hover:bg-muted/30 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 rounded bg-chart-5">
                            <Building2 className="w-3.5 h-3.5 text-white" />
                          </span>
                          <div>
                            <p className="text-[10px] text-muted-foreground">세대수 / 입주율</p>
                            <p className="text-xs font-bold">
                              {totalUnits > 0 ? `${totalUnits}세대 · ${occupancyRate}%` : "건물 등록 필요"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Link>
                    <Link href="/vehicles">
                      <div className="flex items-center justify-between p-2.5 rounded-lg border bg-card hover:bg-muted/30 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 rounded bg-chart-3">
                            <Car className="w-3.5 h-3.5 text-white" />
                          </span>
                          <div>
                            <p className="text-[10px] text-muted-foreground">등록 차량 / 세대당</p>
                            <p className="text-xs font-bold">
                              {vehicleCount}대 · {totalUnits > 0 ? `${vehiclesPerUnit}대` : "-"}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Link>
                    {pendingCardCount > 0 && (
                      <Link href="/tenants">
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-2.5 cursor-pointer hover:bg-orange-100/50">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <FileText className="w-3.5 h-3.5 text-orange-600" />
                              <span className="text-xs text-orange-800 font-medium">
                                입주자카드 처리: {pendingCardCount}건
                              </span>
                            </div>
                          </div>
                          <div className="text-[10px] text-orange-700 ml-5 mt-1 space-y-0.5">
                            {unverifiedTenantCount > 0 && <p>• 서류 확인 대기 {unverifiedTenantCount}</p>}
                            {unitsMissingCard > 0 && <p>• 카드 미작성 {unitsMissingCard}</p>}
                          </div>
                        </div>
                      </Link>
                    )}
                    {analytics && analytics.dataDestructionCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowDestructionDialog(true)}
                        className="w-full text-left bg-red-50 border border-red-200 rounded-lg p-2.5 hover:bg-red-100/50"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Trash2 className="w-3.5 h-3.5 text-red-600" />
                            <span className="text-xs text-red-800 font-medium">
                              개인정보 파기 대상: {analytics.dataDestructionCount}건
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] text-red-700 ml-5 mt-1">
                          보유기간 만료 데이터 — 즉시 파기 절차 진행
                        </p>
                      </button>
                    )}
                    <Link href="/recent-documents">
                      <div className="flex items-center justify-between p-2.5 rounded-lg border bg-card hover:bg-muted/30 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <FolderOpen className={`w-3.5 h-3.5 ${CATEGORY_ICON_CLASS.system}`} />
                          <span className="text-xs font-medium">최근 문서함</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">열기 →</span>
                      </div>
                    </Link>
                    <Link href="/work-log?tab=activity">
                      <div className="flex items-center justify-between p-2.5 rounded-lg border bg-card hover:bg-muted/30 cursor-pointer">
                        <div className="flex items-center gap-2">
                          <ListChecks className={`w-3.5 h-3.5 ${CATEGORY_ICON_CLASS.reports}`} />
                          <span className="text-xs font-medium">처리 내역</span>
                        </div>
                        <span className="text-[10px] text-muted-foreground">열기 →</span>
                      </div>
                    </Link>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </MobileOnly>

      <DesktopOnly>
        <div className="space-y-6">
      {/* [Task #142] 페이지 헤더는 DashboardShell 이 일괄 렌더링한다.
          건물 미등록 시 안내 링크는 building-info-widget 이 담당한다. */}

      {/* [Task #184] 필수업무현황 — legal 점검 + 비점검 알림 */}
      <AlertSection
        title="필수업무현황"
        icon={ClipboardCheck}
        iconClassName="text-chart-3"
        alerts={legalAlerts}
        loading={alertsLoading}
        emptyMessage="현재 처리할 필수업무가 없습니다"
        onAlertClick={handleAlertClick}
      />

      {/* [Task #184] 제안업무현황 — 자체/격주/계절/행정 점검 */}
      <AlertSection
        title="제안업무현황"
        icon={ListChecks}
        iconClassName="text-chart-2"
        alerts={proposedAlerts}
        loading={alertsLoading}
        emptyMessage="현재 제안할 업무가 없습니다"
        onAlertClick={handleAlertClick}
      />

      {/* [Task #205] 오늘 업무일지 진입점 */}
      <TodayWorkLogEntry />

      {/* [Task #250] 문서 산출물 진입(최근 문서함) + 처리 내역 진입을 한 묶음으로 그룹핑.
          위/아래 다른 섹션과 시각적으로 분리하기 위해 외곽은 부모의 space-y-6 를 그대로
          쓰되, 두 카드 사이는 space-y-2(모바일) / sm:space-y-2.5 로 좁혀 가독성 + 페어
          관계를 명확히 한다. 카드 내부 여백·타이포는 모바일에서도 한 줄에 깔끔히 들어가도록
          정돈. */}
      <div className="space-y-2 sm:space-y-2.5">
        <Link href="/recent-documents">
          <button
            type="button"
            data-testid="btn-recent-documents"
            className="w-full flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 sm:py-3.5 text-left hover:bg-muted/50 transition"
          >
            <span className="flex items-center gap-3 min-w-0">
              {/* [Task #256] system 카테고리 — 처리 내역(reports)과 색으로 구분 */}
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
              {/* [Task #256] reports 카테고리 — 업무일지 화면과 동일 토큰 */}
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

      {/* [Task #246] 최근 문서함과 아래 위젯 사이 시각적 분리를 위해 추가 여백을 둔다.
          기존 관리비회계업무/시설업무/기한지난업무/예정점검 4-카드 그리드는 다른 화면
          (시설/업무관리/회계 허브)으로 진입 가능하므로 중복 제거하고, 그 자리에
          관리소장이 매일 확인할 "관리비 요약" 4지표(2×2)를 노출한다. */}
      <div className="pt-2">
        <FeesSummaryWidget unpaidRate={analytics?.unpaidSummary.unpaidRate ?? null} />
      </div>

      {/* [Task #142] <PendingApprovalsCard /> 는 카탈로그의 pending-approvals
          위젯으로 분리되어 셸이 렌더링한다. */}

      {pendingCardCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-1">
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

      {/* [Task #142] 연체 세대 현황 카드는 delinquency-summary-widget 으로
          추출되어 카탈로그의 별도 위젯으로 렌더링된다. */}

      {analytics && analytics.dataDestructionCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
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

      <ResponsiveDialog open={!!selectedAlert} onOpenChange={(o) => { if (!o) setSelectedAlert(null); }}>
        <ResponsiveDialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>알림 처리</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>

          {selectedAlert && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                <p className="font-medium">{selectedAlert.title}</p>
                <p className="text-muted-foreground text-xs">{selectedAlert.message}</p>
              </div>

              <div className="flex gap-1 border-b">
                {[
                  { key: "complete" as AlertActionTab, label: "처리완료", icon: CheckCircle },
                  { key: "postpone" as AlertActionTab, label: "연기", icon: CalendarClock },
                  ...(["inspection_due", "task_overdue", "warranty_expiry"].includes(selectedAlert.type) ? [{ key: "rfq" as AlertActionTab, label: "견적요청", icon: FileText }] : []),
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActionTab(tab.key)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                      actionTab === tab.key
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                ))}
              </div>

              {actionTab === "complete" && (() => {
                const isOverdue = selectedAlert.dueDate && getDdayLabel(selectedAlert.dueDate).isOverdue;
                return (
                <div className="space-y-3">
                  {isOverdue && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                      <p className="text-sm font-semibold text-red-800 flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4" />
                        기한 초과 항목 — 지연 사유를 기록해주세요
                      </p>
                      {selectedAlert.penaltyInfo && (
                        <p className="text-xs text-red-600">⚠ {selectedAlert.penaltyInfo}</p>
                      )}
                      <div>
                        <Label className="text-xs">지연 사유</Label>
                        <Select value={delayReason || undefined} onValueChange={setDelayReason}>
                          <SelectTrigger><SelectValue placeholder="사유 선택" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="업체 일정 미확보">업체 일정 미확보</SelectItem>
                            <SelectItem value="예산 미확보">예산 미확보</SelectItem>
                            <SelectItem value="우천/기상 악화">우천/기상 악화</SelectItem>
                            <SelectItem value="자재 미입고">자재 미입고</SelectItem>
                            <SelectItem value="관리주체 일정 미조율">관리주체 일정 미조율</SelectItem>
                            <SelectItem value="코로나/감염병 대응">코로나/감염병 대응</SelectItem>
                            <SelectItem value="인력 부족">인력 부족</SelectItem>
                            <SelectItem value="기타">기타</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {delayReason === "기타" && (
                        <div>
                          <Label className="text-xs">상세 사유</Label>
                          <Input
                            value={delayReasonDetail}
                            onChange={(e) => setDelayReasonDetail(e.target.value)}
                            placeholder="구체적인 지연 사유를 입력하세요"
                          />
                        </div>
                      )}
                    </div>
                  )}
                  <div>
                    <Label>완료일</Label>
                    <Input
                      type="date"
                      value={completeDate}
                      onChange={(e) => setCompleteDate(e.target.value)}
                    />
                  </div>
                  {selectedAlert.type === "inspection_due" && (
                    <div>
                      <Label>다음 점검 예정일</Label>
                      <Input
                        type="date"
                        value={nextCycleDate}
                        onChange={(e) => setNextCycleDate(e.target.value)}
                      />
                      <p className="text-xs mt-1">
                        다음 주기가 자동입력 되었습니다. <span className="text-blue-600 font-medium">입력</span>
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <PhotoUploadField label="근경 사진" value={closeUpPhotoUrl} onChange={setCloseUpPhotoUrl} />
                    <PhotoUploadField label="원경 사진" value={widePhotoUrl} onChange={setWidePhotoUrl} />
                  </div>
                  <div>
                    <Label>비고</Label>
                    <Textarea
                      value={actionNotes}
                      onChange={(e) => setActionNotes(e.target.value)}
                      placeholder="처리 내용을 기록하세요"
                    />
                  </div>
                  <Button className="w-full" onClick={handleComplete} disabled={createActionMutation.isPending}>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {createActionMutation.isPending ? "처리 중..." : "처리완료"}
                  </Button>
                </div>
                );
              })()}

              {actionTab === "postpone" && (
                <div className="space-y-3">
                  <div>
                    <Label>연기 일수</Label>
                    <Select value={postponeDays} onValueChange={setPostponeDays}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="3">3일</SelectItem>
                        <SelectItem value="7">7일 (1주)</SelectItem>
                        <SelectItem value="14">14일 (2주)</SelectItem>
                        <SelectItem value="30">30일 (1개월)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>연기 사유</Label>
                    <Select value={postponeReason} onValueChange={setPostponeReason}>
                      <SelectTrigger><SelectValue placeholder="사유 선택" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="업체 일정 조율 중">업체 일정 조율 중</SelectItem>
                        <SelectItem value="예산 확보 대기">예산 확보 대기</SelectItem>
                        <SelectItem value="우천/기상 악화">우천/기상 악화</SelectItem>
                        <SelectItem value="자재 입고 대기">자재 입고 대기</SelectItem>
                        <SelectItem value="기타">기타</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>비고</Label>
                    <Textarea
                      value={actionNotes}
                      onChange={(e) => setActionNotes(e.target.value)}
                      placeholder="연기 관련 상세 내용"
                    />
                  </div>
                  <Button className="w-full" variant="secondary" onClick={handlePostpone} disabled={createActionMutation.isPending}>
                    <CalendarClock className="w-4 h-4 mr-2" />
                    {createActionMutation.isPending ? "처리 중..." : "일정 연기"}
                  </Button>
                </div>
              )}

              {actionTab === "rfq" && (
                <div className="space-y-3">
                  <div>
                    <Label>견적 요청 제목</Label>
                    <Input
                      value={rfqTitle}
                      onChange={(e) => setRfqTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>견적 마감일</Label>
                    <Input
                      type="date"
                      value={rfqDeadline}
                      onChange={(e) => setRfqDeadline(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <PhotoUploadField label="근경 사진" value={rfqCloseUpPhotoUrl} onChange={setRfqCloseUpPhotoUrl} />
                    <PhotoUploadField label="원경 사진" value={rfqWidePhotoUrl} onChange={setRfqWidePhotoUrl} />
                  </div>
                  <div>
                    <Label>비고</Label>
                    <Textarea
                      value={actionNotes}
                      onChange={(e) => setActionNotes(e.target.value)}
                      placeholder="견적 요청 시 참고사항"
                    />
                  </div>
                  <Button className="w-full" variant="default" onClick={handleRfqRequest} disabled={createActionMutation.isPending || createRfqMutation.isPending}>
                    <FileText className="w-4 h-4 mr-2" />
                    {createActionMutation.isPending || createRfqMutation.isPending ? "처리 중..." : "견적 요청 생성"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {completionNoticeData && (
        <CompletionNotice
          open={showCompletionNotice}
          onOpenChange={setShowCompletionNotice}
          alertTitle={completionNoticeData.alertTitle}
          alertMessage={completionNoticeData.alertMessage}
          completedDate={completionNoticeData.completedDate}
          notes={completionNoticeData.notes}
          closeUpPhotoUrl={completionNoticeData.closeUpPhotoUrl}
          widePhotoUrl={completionNoticeData.widePhotoUrl}
          buildingName={building?.name}
          officeContact={building?.managementOfficePhone ? `관리사무소 ☎ ${building.managementOfficePhone}` : undefined}
          logoUrl={building?.logoUrl ?? null}
          authorName={user?.name ?? null}
        />
      )}

      {rfqDocumentData && (
        <RfqRequestDocument
          open={showRfqDocument}
          onOpenChange={setShowRfqDocument}
          rfq={rfqDocumentData}
          officeContact={building?.managementOfficePhone ? `관리사무소 ☎ ${building.managementOfficePhone}` : undefined}
          logoUrl={building?.logoUrl ?? null}
        />
      )}

      <SeasonalSuggestionsCard />

      {/* [Task #142] <BuildingInfoCard /> 는 building-info-widget 으로
          추출되어 셸의 위젯 그리드 상단에서 렌더링된다. */}
        </div>
      </DesktopOnly>
    </>
  );
}

function SeasonalSuggestionsCard() {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createRfqMutation = useCreateRfq();

  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${apiBase}/dashboard/seasonal-suggestions`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setSuggestions(Array.isArray(data) ? data : []);
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  if (loading || suggestions.length === 0) return null;

  const monthNames = ["", "1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
  const currentMonth = new Date().getMonth() + 1;

  const priorityColors: Record<string, string> = {
    high: "border-orange-300 bg-orange-50/50",
    normal: "border-blue-200 bg-blue-50/30",
    low: "border-gray-200",
  };

  const priorityBadge: Record<string, string> = {
    high: "bg-orange-100 text-orange-700",
    normal: "bg-blue-100 text-blue-700",
    low: "bg-gray-100 text-gray-700",
  };

  async function createRfqFromSuggestion(s: any) {
    try {
      const twoWeeks = new Date();
      twoWeeks.setDate(twoWeeks.getDate() + 14);
      await createRfqMutation.mutateAsync({
        data: {
          title: `[계절업무] ${s.title}`,
          category: (s.rfqCategory || s.category) as any,
          buildingName: "관리 건물",
          deadline: twoWeeks.toISOString().split("T")[0],
          description: s.description || "",
        },
      });
      queryClient.invalidateQueries({ queryKey: getListRfqsQueryKey() });
      toast({ title: "견적 요청이 생성되었습니다" });
    } catch {
      toast({ title: "견적 요청 생성 중 오류가 발생했습니다", variant: "destructive" });
    }
  }

  return (
    <Card className="border-green-200 bg-green-50/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <Wrench className="w-5 h-5 text-green-600" />
          <h3 className="font-semibold text-sm">{monthNames[currentMonth]} 계절별 영선 업무 제안</h3>
        </div>
        <div className="space-y-2">
          {suggestions.map((s: any) => (
            <div key={s.id} className={`p-3 rounded-lg border ${priorityColors[s.priority] || priorityColors.normal}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{s.title}</span>
                    <Badge variant="outline" className={`text-[10px] h-4 ${priorityBadge[s.priority] || ""}`}>
                      {s.priority === "high" ? "긴급" : s.priority === "normal" ? "일반" : "참고"}
                    </Badge>
                  </div>
                  {s.description && (
                    <p className="text-xs text-muted-foreground">{s.description}</p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs shrink-0"
                  onClick={() => createRfqFromSuggestion(s)}
                >
                  견적요청
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    elevator: "승강기",
    water_tank: "저수조",
    fire_safety: "소방",
    electrical: "전기",
    gas: "가스",
    septic: "정화조",
    playground: "놀이터",
    safety_check: "안전점검",
    waterproofing: "방수",
    maintenance_repair: "영선/수선유지",
    defect_diagnosis: "하자진단",
    building_maintenance: "건물관리",
    mechanical: "기계설비",
    other: "기타",
  };
  return labels[cat] || cat;
}
