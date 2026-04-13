import { useState } from "react";
import {
  useGetDashboardSummary,
  useGetDashboardAlerts,
  useGetRecentActivity,
  useGetUpcomingInspections,
  useListTenants,
  useListVehicles,
  useListMaintenanceLogs,
  useListSafetyChecklists,
  useCreateAlertAction,
  useCreateRfq,
  getGetDashboardAlertsQueryKey,
  getListRfqsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
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
  MapPin,
} from "lucide-react";
import { sidoList, getSigunguList } from "@workspace/shared/korean-districts";

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
}) {
  return (
    <Card>
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
  createdAt: string;
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: alerts, isLoading: alertsLoading } = useGetDashboardAlerts();
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity();
  const { data: upcoming, isLoading: upcomingLoading } = useGetUpcomingInspections();
  const { data: tenants } = useListTenants({ status: "active" });
  const { data: vehicles } = useListVehicles();
  const { data: recentMaintenanceLogs } = useListMaintenanceLogs();
  const { data: recentChecklists } = useListSafetyChecklists();

  const [selectedAlert, setSelectedAlert] = useState<DashboardAlert | null>(null);
  const [actionTab, setActionTab] = useState<AlertActionTab>("complete");
  const [completeDate, setCompleteDate] = useState(new Date().toISOString().split("T")[0]);
  const [nextCycleDate, setNextCycleDate] = useState("");
  const [postponeDays, setPostponeDays] = useState("7");
  const [postponeReason, setPostponeReason] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [rfqTitle, setRfqTitle] = useState("");
  const [rfqDeadline, setRfqDeadline] = useState("");
  const [buildingSido, setBuildingSido] = useState(user?.buildingSido || "");
  const [buildingSigungu, setBuildingSigungu] = useState(user?.buildingSigungu || "");
  const [savingRegion, setSavingRegion] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createActionMutation = useCreateAlertAction();
  const createRfqMutation = useCreateRfq();

  const buildingSigunguOptions = buildingSido ? getSigunguList(buildingSido) : [];

  async function handleSaveBuildingRegion() {
    if (!buildingSido) return;
    setSavingRegion(true);
    try {
      const BASE = import.meta.env.BASE_URL ?? "/";
      const apiBase = `${BASE}api`.replace(/\/+/g, "/");
      const token = localStorage.getItem("token");
      const res = await fetch(`${apiBase}/auth/building-region`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ buildingSido, buildingSigungu }),
      });
      if (res.ok) {
        toast({ title: "건물 지역이 설정되었습니다" });
        window.location.reload();
      }
    } finally {
      setSavingRegion(false);
    }
  }

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
    await createActionMutation.mutateAsync({
      data: {
        alertType: selectedAlert.type,
        relatedEntityType: getEntityType(selectedAlert.type),
        relatedEntityId: selectedAlert.relatedId!,
        actionType: "completed",
        completedDate: completeDate || null,
        nextCycleDate: nextCycleDate || null,
        notes: actionNotes || null,
      },
    });
    queryClient.invalidateQueries({ queryKey: getGetDashboardAlertsQueryKey() });
    toast({ title: "처리 완료되었습니다" });
    setSelectedAlert(null);
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

    const rfqData: Record<string, unknown> = {
      title: rfqTitle,
      category: catMap[selectedAlert.type] || "other",
      buildingName: "관리 건물",
      deadline: rfqDeadline,
      description: `${selectedAlert.title} - ${selectedAlert.message}`,
    };
    if (user?.buildingSido) {
      rfqData.sido = user.buildingSido;
      rfqData.sigungu = user.buildingSigungu || null;
      rfqData.geoScope = user.buildingSigungu ? "sigungu" : "sido";
    }
    const createdRfq = await createRfqMutation.mutateAsync({ data: rfqData as any });

    await createActionMutation.mutateAsync({
      data: {
        alertType: selectedAlert.type,
        relatedEntityType: getEntityType(selectedAlert.type),
        relatedEntityId: selectedAlert.relatedId!,
        actionType: "rfq_requested",
        rfqId: createdRfq?.id ?? null,
        notes: `견적 요청 생성: ${rfqTitle}`,
      },
    });

    queryClient.invalidateQueries({ queryKey: getGetDashboardAlertsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListRfqsQueryKey() });
    toast({ title: "견적 요청이 생성되었습니다" });
    setSelectedAlert(null);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">대시보드</h1>
        <p className="text-muted-foreground text-sm mt-1">
          오늘의 건물 관리 현황을 한눈에 확인하세요
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="오늘 할 일"
          value={summary?.todayTaskCount ?? 0}
          icon={CheckSquare}
          color="bg-accent"
          subtitle={`대기 중 ${summary?.pendingTaskCount ?? 0}건`}
        />
        <StatCard
          title="기한 초과"
          value={summary?.overdueTaskCount ?? 0}
          icon={AlertTriangle}
          color="bg-destructive"
          subtitle="즉시 처리 필요"
        />
        <StatCard
          title="예정 점검"
          value={summary?.upcomingInspectionCount ?? 0}
          icon={Shield}
          color="bg-chart-2"
          subtitle="30일 이내"
        />
        <StatCard
          title="업무 완료율"
          value={`${summary?.completionRate ?? 0}%`}
          icon={TrendingUp}
          color="bg-primary"
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          title="세무 일정"
          value={summary?.pendingTaxCount ?? 0}
          icon={Calculator}
          color="bg-chart-3"
          subtitle="처리 대기"
        />
        <StatCard
          title="입주 현황"
          value={tenants?.length ?? 0}
          icon={Users}
          color="bg-chart-4"
          subtitle="현재 입주중"
        />
        <StatCard
          title="등록 차량"
          value={vehicles?.length ?? 0}
          icon={Car}
          color="bg-chart-5"
          subtitle="전체 등록"
        />
        <StatCard
          title="대기 업무"
          value={summary?.pendingTaskCount ?? 0}
          icon={Activity}
          color="bg-muted-foreground"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-chart-3" />
              알림 및 경고
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alertsLoading ? (
              <Skeleton className="h-20" />
            ) : alerts && alerts.length > 0 ? (
              alerts.slice(0, 5).map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border cursor-pointer hover:bg-muted/80 transition-colors"
                  onClick={() => alert.relatedId && (ACTIONABLE_ALERT_TYPES as readonly string[]).includes(alert.type) && openAlertAction(alert)}
                >
                  <Badge
                    variant={
                      alert.severity === "critical"
                        ? "destructive"
                        : alert.severity === "warning"
                        ? "secondary"
                        : "outline"
                    }
                    className="shrink-0 mt-0.5"
                  >
                    {alert.severity === "critical"
                      ? "긴급"
                      : alert.severity === "warning"
                      ? "주의"
                      : "정보"}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{alert.title}</p>
                      {alert.hasDraft && (
                        <Badge variant="outline" className="text-xs">
                          기안서 생성됨
                        </Badge>
                      )}
                      {alert.actionStatus === "postponed" && (
                        <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                          연기됨
                        </Badge>
                      )}
                      {alert.actionStatus === "rfq_requested" && (
                        <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
                          견적 요청됨
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                      {alert.message}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                현재 알림이 없습니다
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4 text-chart-2" />
              다가오는 법정 점검
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {upcomingLoading ? (
              <Skeleton className="h-20" />
            ) : upcoming && upcoming.length > 0 ? (
              upcoming.slice(0, 5).map((inspection) => (
                <div
                  key={inspection.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
                >
                  <div>
                    <p className="text-sm font-medium">{inspection.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {categoryLabel(inspection.category)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {formatDate(inspection.nextDueDate)}
                    </p>
                    <Badge variant="outline" className="text-xs">
                      {inspection.status === "upcoming" ? "예정" : inspection.status === "overdue" ? "초과" : "완료"}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                30일 내 예정된 점검이 없습니다
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="w-4 h-4 text-accent" />
            최근 활동
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <Skeleton className="h-20" />
          ) : activity && activity.length > 0 ? (
            <div className="space-y-2">
              {activity.slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <p className="text-sm">{item.description}</p>
                  <p className="text-xs text-muted-foreground shrink-0 ml-4">
                    {new Date(item.timestamp).toLocaleDateString("ko-KR")}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              최근 활동이 없습니다
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <HardHat className="w-4 h-4 text-chart-4" />
              시설관리 보고서
            </CardTitle>
            <Link href="/manager/facility">
              <span className="text-xs text-primary hover:underline cursor-pointer">전체보기</span>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <ClipboardCheck className="w-3.5 h-3.5" />
                최근 안전점검
              </p>
              {recentChecklists && recentChecklists.length > 0 ? (
                <div className="space-y-1.5">
                  {recentChecklists.slice(0, 3).map((cl) => (
                    <div key={cl.id} className="flex items-center justify-between text-sm py-1">
                      <span>{cl.title}</span>
                      <Badge
                        variant={cl.status === "completed" ? "default" : cl.status === "issue_found" ? "destructive" : "outline"}
                        className="text-xs"
                      >
                        {cl.status === "completed" ? "완료" : cl.status === "issue_found" ? "이상" : "대기"}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">최근 점검 내역 없음</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5" />
                최근 기전 업무
              </p>
              {recentMaintenanceLogs && recentMaintenanceLogs.length > 0 ? (
                <div className="space-y-1.5">
                  {recentMaintenanceLogs.slice(0, 3).map((log) => (
                    <div key={log.id} className="flex items-center justify-between text-sm py-1">
                      <span>{log.title}</span>
                      {log.reportSent ? (
                        <Badge variant="default" className="text-xs">
                          <Send className="w-3 h-3 mr-0.5" />보고
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">미보고</Badge>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">최근 업무 내역 없음</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MapPin className="w-4 h-4 text-chart-2" />
            건물 지역 설정
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            건물 지역을 설정하면 견적 요청 시 해당 지역 업체가 자동 매칭됩니다.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">시/도</Label>
              <Select value={buildingSido} onValueChange={(v) => { setBuildingSido(v); setBuildingSigungu(""); }}>
                <SelectTrigger className="h-9"><SelectValue placeholder="시/도 선택" /></SelectTrigger>
                <SelectContent>
                  {sidoList.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">시/군/구</Label>
              <Select value={buildingSigungu} onValueChange={setBuildingSigungu} disabled={!buildingSido}>
                <SelectTrigger className="h-9"><SelectValue placeholder="시/군/구 선택" /></SelectTrigger>
                <SelectContent>
                  {buildingSigunguOptions.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {user?.buildingSido && (
            <p className="text-xs text-muted-foreground mt-2">
              현재 설정: {user.buildingSido} {user.buildingSigungu || ""}
            </p>
          )}
          <Button size="sm" className="mt-3" onClick={handleSaveBuildingRegion} disabled={!buildingSido || savingRegion}>
            {savingRegion ? "저장 중..." : "지역 저장"}
          </Button>
        </CardContent>
      </Card>

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

              {actionTab === "complete" && (
                <div className="space-y-3">
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
                        비워두면 해당 점검의 법정 주기(legalCycleMonths/intervalDays)에 따라 서버에서 자동 계산됩니다.
                      </p>
                    </div>
                  )}
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
              )}

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
    </div>
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
    other: "기타",
  };
  return labels[cat] || cat;
}
