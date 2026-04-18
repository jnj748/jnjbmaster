import { useState, useEffect } from "react";
import {
  useGetDashboardSummary,
  useGetDashboardAlerts,
  useGetDashboardAnalytics,
  useListTenants,
  useListVehicles,
  useGetUnitsSummary,
  useCreateAlertAction,
  useCreateRfq,
  useGetDelinquencySummary,
  useListApprovals,
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
import { formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
} from "recharts";
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
  Calculator,
  Coins,
  TrendingUp,
  Activity,
  Users,
  Car,
  HardHat,
  ClipboardCheck,
  Wrench,
  Send,
  CheckCircle,
  CalendarClock,
  FileText,
  Building2,
  Trash2,
} from "lucide-react";
import { PhotoUploadField } from "@/components/photo-upload-field";
import { CompletionNotice } from "@/components/completion-notice";
import { RfqRequestDocument, type RfqDocumentData } from "@/components/rfq-request-document";
import { Printer } from "lucide-react";

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

const ACTIONABLE_ALERT_TYPES = ["inspection_due", "tax_due", "task_overdue"] as const;

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
  createdAt: string;
}

function PendingApprovalsCard() {
  const { data: pending, isLoading } = useListApprovals({ status: "pending" });
  const items = pending ?? [];
  const visible = items.slice(0, 3);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-chart-1" />
            결재
            {items.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground ml-1">
                대기 {items.length}건
              </span>
            )}
          </h2>
          <p className="text-[10px] text-muted-foreground mt-1">
            나의 결재 대기 항목입니다
          </p>
        </div>
        <Link href="/approvals">
          <button className="text-xs text-primary hover:underline font-medium">전체 보기 →</button>
        </Link>
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground">결재 대기 중인 항목이 없습니다</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((a: any) => (
            <Link key={a.id} href="/approvals">
              <div className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {a.requesterName ? `요청자: ${a.requesterName} · ` : ""}
                    {a.createdAt ? formatDate(a.createdAt) : ""}
                  </p>
                </div>
                {typeof a.estimatedAmount === "number" && (
                  <span className="text-xs font-semibold shrink-0">
                    {"\u20A9"}{a.estimatedAmount.toLocaleString()}
                  </span>
                )}
                <Badge variant="outline" className="text-[10px] shrink-0">대기</Badge>
              </div>
            </Link>
          ))}
          {items.length > visible.length && (
            <p className="text-xs text-center text-muted-foreground pt-1">
              외 {items.length - visible.length}건 더 있음
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { building } = useBuilding();
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: alerts, isLoading: alertsLoading } = useGetDashboardAlerts();
  const { data: analytics } = useGetDashboardAnalytics({ query: { staleTime: 5 * 60 * 1000 } });
  const [showDestructionDialog, setShowDestructionDialog] = useState(false);
  const summaryReady = !summaryLoading && !!summary;
  const { data: tenants } = useListTenants({ status: "active" }, { query: { enabled: summaryReady, staleTime: 5 * 60 * 1000 } });
  const { data: vehicles } = useListVehicles(undefined, { query: { enabled: summaryReady, staleTime: 5 * 60 * 1000 } });
  const { data: unitsSummary } = useGetUnitsSummary({ query: { enabled: summaryReady, staleTime: 5 * 60 * 1000 } });
  const { data: delinquencySummary } = useGetDelinquencySummary({ query: { enabled: summaryReady, staleTime: 5 * 60 * 1000 } });

  const [alertPage, setAlertPage] = useState(0);

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
    setCompleteDate(new Date().toISOString().split("T")[0]);
    setPostponeDays("7");
    setPostponeReason("");
    setActionNotes("");
    setRfqTitle(alert.title);
    const twoWeeks = new Date();
    twoWeeks.setDate(twoWeeks.getDate() + 14);
    setRfqDeadline(twoWeeks.toISOString().split("T")[0]);
    setNextCycleDate("");
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
      default: return "task";
    }
  }

  async function handleComplete() {
    if (!selectedAlert) return;
    const isOverdue = selectedAlert.dueDate && getDdayLabel(selectedAlert.dueDate).isOverdue;
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

  const alertPages = alerts ? Array.from({ length: Math.ceil(alerts.length / 3) }, (_, i) => alerts.slice(i * 3, i * 3 + 3)) : [];
  const totalAlertPages = alertPages.length;

  return (
    <div className="space-y-6">
      <div>
        {building ? (
          <>
            <h1 className="text-2xl font-bold">{building.name}</h1>
            <p className="text-muted-foreground text-sm mt-1">
              오늘의 관리 현황을 한눈에 확인하세요
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold">대시보드</h1>
            <p className="text-muted-foreground text-sm mt-1">
              <Link href="/building-setup" className="text-primary hover:underline">
                건물 정보를 등록하면
              </Link>{" "}
              더 정확한 관리 현황을 확인할 수 있습니다
            </p>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="관리비회계업무"
          value={summary?.pendingTaskCount ?? 0}
          icon={Calculator}
          color="bg-accent"
          subtitle={`세무 ${summary?.pendingTaxCount ?? 0}건 대기`}
          href="/accounting"
        />
        <StatCard
          title="시설업무"
          value={summary?.upcomingInspectionCount ?? 0}
          icon={HardHat}
          color="bg-chart-2"
          subtitle="점검/보수 대기"
          href="/facility"
        />
        <StatCard
          title="기한지난업무"
          value={summary?.overdueTaskCount ?? 0}
          icon={AlertTriangle}
          color="bg-destructive"
          subtitle="즉시 처리 필요"
          href="/tasks"
        />
        <StatCard
          title="예정점검"
          value={summary?.upcomingInspectionCount ?? 0}
          icon={Shield}
          color="bg-chart-4"
          subtitle="30일 이내"
          href="/inspections"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-chart-3" />
              필수업무현황
              {alerts && alerts.length > 0 && (
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  총 {alerts.length}건
                </span>
              )}
            </h2>
            <p className="text-[10px] text-muted-foreground mt-1">
              본 알림(점검 · 하자담보 · 계약 만료 등)은 정보 제공 서비스이며, 실제 이행·보증을 담보하지 않습니다.
            </p>
          </div>
          {totalAlertPages > 1 && (
            <div className="flex items-center gap-1">
              {alertPages.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setAlertPage(i)}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === alertPage ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
        {alertsLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : alerts && alerts.length > 0 ? (
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
                if (diff > 0 && alertPage < totalAlertPages - 1) setAlertPage(alertPage + 1);
                if (diff < 0 && alertPage > 0) setAlertPage(alertPage - 1);
              }
            }}
          >
            <div
              className="flex transition-transform duration-300 ease-in-out"
              style={{ transform: `translateX(-${alertPage * 100}%)` }}
            >
              {alertPages.map((pageAlerts, pi) => (
                <div key={pi} className="w-full shrink-0 space-y-2 px-0.5">
                  {pageAlerts.map((alert) => {
                    const dday = getDdayLabel(alert.dueDate ?? null);
                    const trafficColor = dday.isOverdue
                      ? "red"
                      : dday.days !== null && dday.days <= 30
                      ? "yellow"
                      : "green";
                    return (
                      <div
                        key={alert.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors border-l-4 ${
                          trafficColor === "red"
                            ? "border-l-red-500 bg-red-50/40"
                            : trafficColor === "yellow"
                            ? "border-l-yellow-400 bg-yellow-50/30"
                            : "border-l-green-500 bg-green-50/20"
                        }`}
                        onClick={() =>
                          alert.relatedId &&
                          (ACTIONABLE_ALERT_TYPES as readonly string[]).includes(alert.type) &&
                          openAlertAction(alert)
                        }
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
            {totalAlertPages > 1 && (
              <div className="flex justify-center gap-4 mt-3">
                <button
                  onClick={() => setAlertPage(Math.max(0, alertPage - 1))}
                  disabled={alertPage === 0}
                  className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                >
                  ← 이전
                </button>
                <span className="text-xs text-muted-foreground">{alertPage + 1} / {totalAlertPages}</span>
                <button
                  onClick={() => setAlertPage(Math.min(totalAlertPages - 1, alertPage + 1))}
                  disabled={alertPage === totalAlertPages - 1}
                  className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                >
                  다음 →
                </button>
              </div>
            )}
          </div>
        ) : (
          <Card>
            <CardContent className="py-6 text-center">
              <p className="text-sm text-muted-foreground">현재 처리할 필수업무가 없습니다</p>
            </CardContent>
          </Card>
        )}
      </div>

      <PendingApprovalsCard />

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

      {delinquencySummary && delinquencySummary.totalOverdue > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span className="text-sm font-semibold text-red-800">
                  연체 세대 현황
                </span>
                <Badge variant="destructive" className="text-[10px] h-5">
                  {delinquencySummary.totalOverdue}건
                </Badge>
              </div>
              <Link href="/accounting">
                <span className="text-xs text-red-600 hover:underline font-medium cursor-pointer">관리 →</span>
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white rounded-lg p-2 text-center border border-red-100">
                <p className="text-lg font-bold text-red-700">{delinquencySummary.totalOverdue - delinquencySummary.notified - delinquencySummary.parkingSuspended}</p>
                <p className="text-[10px] text-red-600">감지됨</p>
              </div>
              <div className="bg-white rounded-lg p-2 text-center border border-orange-100">
                <p className="text-lg font-bold text-orange-600">{delinquencySummary.notified}</p>
                <p className="text-[10px] text-orange-500">독촉 발송</p>
              </div>
              <div className="bg-white rounded-lg p-2 text-center border border-red-100">
                <p className="text-lg font-bold text-red-800">{delinquencySummary.parkingSuspended}</p>
                <p className="text-[10px] text-red-600">주차 정지</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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

      {analytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Coins className="w-4 h-4 text-chart-4" />
                미납 관리비 현황
              </h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics.unpaidByCategory}
                      dataKey="amount"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                    >
                      {analytics.unpaidByCategory.map((_, index) => (
                        <Cell key={index} fill={["#0ea5e9", "#10b981", "#f59e0b", "#94a3b8"][index % 4]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => `${(value / 10000).toFixed(0)}만원`} />
                    <Legend
                      formatter={(value: string) => <span className="text-xs">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="text-center mt-1">
                <p className="text-lg font-bold">{(analytics.unpaidSummary.totalUnpaid / 10000).toFixed(0)}만원</p>
                <p className="text-xs text-muted-foreground">{analytics.unpaidSummary.unpaidCount}세대 미납</p>
              </div>
            </CardContent>
          </Card>

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
                  ...(["inspection_due", "task_overdue"].includes(selectedAlert.type) ? [{ key: "rfq" as AlertActionTab, label: "견적요청", icon: FileText }] : []),
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
                      <Label>다음 점검 예정일 (선택 — 미입력 시 법정 주기 자동 계산)</Label>
                      <Input
                        type="date"
                        value={nextCycleDate}
                        onChange={(e) => setNextCycleDate(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        비워두면 해당 점검의 법정 주기에 따라 서버에서 자동 계산됩니다.
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
                  <Button className="w-full" onClick={handleComplete}>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    처리완료
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
                  <Button className="w-full" variant="secondary" onClick={handlePostpone}>
                    <CalendarClock className="w-4 h-4 mr-2" />
                    일정 연기
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
                  <Button className="w-full" variant="default" onClick={handleRfqRequest}>
                    <FileText className="w-4 h-4 mr-2" />
                    견적 요청 생성
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
    </div>
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
