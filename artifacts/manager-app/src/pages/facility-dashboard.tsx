import {
  useGetFacilityDashboard,
  useGetFacilityDefectTrends,
} from "@workspace/api-client-react";
import { formatDate } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import WarrantyDdayWidget from "@/components/dashboard-widgets/widgets/warranty-dday-widget";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  Wrench,
  ClipboardCheck,
  GraduationCap,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Zap,
  Flame,
  Droplets,
  Activity,
  ShieldAlert,
  BarChart3,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

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
          <div className={`p-2.5 rounded-lg ${color}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const alertTypeIcons: Record<string, React.ElementType> = {
  generator_run: Activity,
  water_tank_cleaning: Droplets,
  fire_inspection: Flame,
  electrical_check: Zap,
  safety_training: GraduationCap,
};

const CATEGORY_LABELS: Record<string, string> = {
  electrical: "전기설비",
  fire_safety: "소방시설",
  generator: "비상발전기",
  water_tank: "저수조",
  other: "기타",
};

const PIE_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#6366f1"];

export default function FacilityDashboard() {
  const { data: dashboard, isLoading } = useGetFacilityDashboard();
  const { data: defectTrends } = useGetFacilityDefectTrends();

  if (isLoading) {
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

  const facilityMenuCards = [
    { path: "/inspections", label: "법정 점검", description: "법정점검 일정 및 관리", icon: ShieldAlert, color: "bg-blue-500" },
    { path: "/safety-checklists", label: "안전점검표", description: "일상 안전점검 체크리스트", icon: ClipboardCheck, color: "bg-emerald-500" },
    { path: "/maintenance-logs", label: "시설 업무일지", description: "설비 유지보수 업무 기록", icon: Wrench, color: "bg-orange-500" },
    { path: "/safety-training", label: "안전교육", description: "안전교육 이수 현황", icon: GraduationCap, color: "bg-violet-500" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">시설관리</h1>
        <p className="text-muted-foreground text-sm mt-1">
          설비 안전점검, 시설 업무, 안전교육 현황을 한눈에 확인하세요
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {facilityMenuCards.map((item) => (
          <Link key={item.path} href={item.path}>
            <Card className="hover:bg-muted/50 transition-colors cursor-pointer h-full">
              <CardContent className="p-3 sm:p-4 text-center">
                <div className={`inline-flex p-2 rounded-lg ${item.color} mb-2`}>
                  <item.icon className="w-5 h-5 text-white" />
                </div>
                <p className="font-semibold text-sm">{item.label}</p>
                <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5">{item.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          title="오늘 점검 예정"
          value={dashboard?.todayChecklistCount ?? 0}
          icon={ClipboardCheck}
          color="bg-accent"
          subtitle="금일 안전점검"
        />
        <StatCard
          title="대기중 점검"
          value={dashboard?.pendingChecklistCount ?? 0}
          icon={Clock}
          color="bg-chart-3"
          subtitle="미완료 점검표"
        />
        <StatCard
          title="이상 발견"
          value={dashboard?.issueFoundCount ?? 0}
          icon={AlertTriangle}
          color="bg-destructive"
          subtitle="조치 필요"
        />
        <StatCard
          title="금일 불량"
          value={dashboard?.todayDefectCount ?? 0}
          icon={ShieldAlert}
          color="bg-orange-500"
          subtitle="오늘 발견된 불량"
        />
        <StatCard
          title="미처리 보수"
          value={dashboard?.unresolvedDefectCount ?? 0}
          icon={Wrench}
          color="bg-rose-600"
          subtitle="보수 대기 건수"
        />
        <StatCard
          title="안전교육 이수율"
          value={`${dashboard?.trainingCompletionRate ?? 0}%`}
          icon={GraduationCap}
          color="bg-primary"
          subtitle={`예정 ${dashboard?.upcomingTrainingCount ?? 0}건`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="w-4 h-4 text-chart-2" />
                최근 업무 일지
              </CardTitle>
              <Link href="/maintenance-logs">
                <span className="text-xs text-primary hover:underline cursor-pointer">전체보기</span>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard?.recentLogs && dashboard.recentLogs.length > 0 ? (
              dashboard.recentLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{log.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {categoryLabel(log.category)} &middot; {log.worker}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className="text-xs text-muted-foreground">{formatDate(log.workDate)}</p>
                    <Badge
                      variant={log.reportSent ? "default" : "outline"}
                      className="text-xs mt-1"
                    >
                      {log.reportSent ? "보고완료" : "미보고"}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                최근 업무 일지가 없습니다
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-chart-3" />
              정기 일정 알림
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboard?.scheduledAlerts && dashboard.scheduledAlerts.length > 0 ? (
              dashboard.scheduledAlerts.map((alert) => {
                const Icon = alertTypeIcons[alert.type] || AlertTriangle;
                return (
                  <div
                    key={alert.id}
                    className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border"
                  >
                    <div className={`p-1.5 rounded ${alert.isOverdue ? "bg-destructive/10" : "bg-primary/10"}`}>
                      <Icon className={`w-4 h-4 ${alert.isOverdue ? "text-destructive" : "text-primary"}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{alert.title}</p>
                        {alert.isOverdue && (
                          <Badge variant="destructive" className="text-xs">지연</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{alert.message}</p>
                    </div>
                    <p className="text-xs text-muted-foreground shrink-0">{formatDate(alert.dueDate)}</p>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                예정된 알림이 없습니다
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {defectTrends && (defectTrends.byCategory.length > 0 || defectTrends.monthlyTrend.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-destructive" />
                월별 불량 발생 추이
              </CardTitle>
            </CardHeader>
            <CardContent>
              {defectTrends.monthlyTrend.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={defectTrends.monthlyTrend}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" fontSize={12} />
                    <YAxis allowDecimals={false} fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="count" name="불량 건수" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  불량 이력 데이터가 없습니다
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-orange-500" />
                카테고리별 불량 현황
              </CardTitle>
            </CardHeader>
            <CardContent>
              {defectTrends.byCategory.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={defectTrends.byCategory.map((d) => ({
                        ...d,
                        name: CATEGORY_LABELS[d.category] || d.category,
                      }))}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ name, count }) => `${name}: ${count}`}
                    >
                      {defectTrends.byCategory.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  카테고리별 불량 데이터가 없습니다
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {defectTrends && defectTrends.repeatedDefects.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              반복 불량 항목
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {defectTrends.repeatedDefects.map((defect, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg bg-orange-50 border border-orange-200 dark:bg-orange-950/20 dark:border-orange-800"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-medium">{defect.itemName}</span>
                    <Badge variant="secondary" className="text-xs">
                      {CATEGORY_LABELS[defect.category] || defect.category}
                    </Badge>
                  </div>
                  <Badge variant="destructive" className="text-xs">
                    {defect.count}회 반복
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="mt-2">
        <WarrantyDdayWidget />
      </div>
    </div>
  );
}

function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    bulb_replacement: "전구 교체",
    drain_cleaning: "배수로 청소",
    equipment_repair: "설비 수리",
    plumbing: "배관",
    hvac: "냉난방",
    other: "기타",
  };
  return labels[cat] || cat;
}
