import {
  useGetDashboardSummary,
  useGetDashboardAlerts,
  useGetRecentActivity,
  useGetUpcomingInspections,
  useListTenants,
  useListVehicles,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
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
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground font-medium">{title}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
          </div>
          <div className={`p-2.5 rounded-lg ${color}`}>
            <Icon className="w-5 h-5 text-white" />
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

  if (summaryLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28" />
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
