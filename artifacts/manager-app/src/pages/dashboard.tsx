import {
  useGetDashboardSummary,
  useGetDashboardAlerts,
  useGetRecentActivity,
  useGetUpcomingInspections,
  useListTenants,
  useListVehicles,
  useListMaintenanceLogs,
  useListSafetyChecklists,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
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
} from "lucide-react";

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

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: alerts, isLoading: alertsLoading } = useGetDashboardAlerts();
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity();
  const { data: upcoming, isLoading: upcomingLoading } = useGetUpcomingInspections();
  const { data: tenants } = useListTenants({ status: "active" });
  const { data: vehicles } = useListVehicles();
  const { data: recentMaintenanceLogs } = useListMaintenanceLogs();
  const { data: recentChecklists } = useListSafetyChecklists();

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
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border"
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
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{alert.title}</p>
                      {alert.hasDraft && (
                        <Badge variant="outline" className="text-xs">
                          기안서 생성됨
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
