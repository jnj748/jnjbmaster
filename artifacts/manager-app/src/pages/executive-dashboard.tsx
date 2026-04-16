import {
  useGetExecutiveKpi,
  useGetApprovalStats,
  useGetRecentActivity,
  useGetComplaintAnalytics,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  ClipboardCheck,
  TrendingUp,
  AlertTriangle,
  DollarSign,
  CheckSquare,
  Shield,
  Activity,
  ArrowRight,
  MessageSquare,
  Repeat,
  ArrowUpCircle,
} from "lucide-react";

function KpiCard({
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

const categoryLabel = (c: string) => {
  const labels: Record<string, string> = {
    maintenance: "유지보수",
    inspection: "법정점검",
    facility: "시설관리",
    equipment: "장비",
    other: "기타",
  };
  return labels[c] || c;
};

const complaintCategoryLabel = (c: string) => {
  const labels: Record<string, string> = {
    noise: "소음", parking: "주차", maintenance: "유지보수", cleaning: "청결",
    security: "보안", contract_legal: "계약/법무", management_dispute: "관리단 분쟁",
    accounting_issue: "회계 부적정", water_leak: "누수/방수", elevator: "승강기",
    floor_noise: "층간소음", other: "기타",
  };
  return labels[c] || c;
};

const statusBadge = (status: string) => {
  switch (status) {
    case "pending":
      return <Badge variant="secondary">대기중</Badge>;
    case "approved":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">승인</Badge>;
    case "rejected":
      return <Badge variant="destructive">반려</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const sensitivityBadge = (s: string) => {
  const map: Record<string, { label: string; color: string }> = {
    normal: { label: "일반", color: "bg-gray-100 text-gray-600" },
    caution: { label: "주의", color: "bg-yellow-100 text-yellow-700" },
    sensitive: { label: "민감", color: "bg-orange-100 text-orange-700" },
    urgent: { label: "긴급", color: "bg-red-100 text-red-700" },
  };
  const info = map[s] || map.normal;
  return <Badge className={`text-[10px] ${info.color}`}>{info.label}</Badge>;
};

export default function ExecutiveDashboard() {
  const { data: kpi, isLoading: kpiLoading } = useGetExecutiveKpi();
  const { data: stats, isLoading: statsLoading } = useGetApprovalStats();
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity();
  const { data: analytics, isLoading: analyticsLoading } = useGetComplaintAnalytics();

  if (kpiLoading) {
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
        <h1 className="text-2xl font-bold">최고관리자 대시보드</h1>
        <p className="text-muted-foreground text-sm mt-1">
          건물 관리 핵심 지표 및 결재 현황을 한눈에 확인하세요
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="대기 결재"
          value={kpi?.pendingApprovals ?? 0}
          icon={ClipboardCheck}
          color="bg-chart-3"
          subtitle="승인 대기 중"
        />
        <KpiCard
          title="업무 완료율"
          value={`${kpi?.taskCompletionRate ?? 0}%`}
          icon={TrendingUp}
          color="bg-primary"
          subtitle={`${kpi?.completedTasks ?? 0}/${kpi?.totalTasks ?? 0} 완료`}
        />
        <KpiCard
          title="점검 완료율"
          value={`${kpi?.inspectionCompletionRate ?? 0}%`}
          icon={Shield}
          color="bg-chart-2"
          subtitle={`${kpi?.completedInspections ?? 0}/${kpi?.totalInspections ?? 0} 완료`}
        />
        <KpiCard
          title="기한 초과"
          value={kpi?.overdueItems ?? 0}
          icon={AlertTriangle}
          color="bg-destructive"
          subtitle="즉시 처리 필요"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="월간 지출"
          value={`₩${((kpi?.monthlySpending ?? 0) / 10000).toFixed(0)}만`}
          icon={DollarSign}
          color="bg-chart-4"
          subtitle="승인된 결재 기준"
        />
        <KpiCard
          title="총 업무"
          value={kpi?.totalTasks ?? 0}
          icon={CheckSquare}
          color="bg-accent"
        />
        <KpiCard
          title="총 점검"
          value={kpi?.totalInspections ?? 0}
          icon={Shield}
          color="bg-chart-5"
        />
        <KpiCard
          title="승인 건수"
          value={stats?.totalApproved ?? 0}
          icon={Activity}
          color="bg-muted-foreground"
          subtitle={`반려 ${stats?.totalRejected ?? 0}건`}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-orange-500" />
              민원 분석
            </CardTitle>
            <Link href="/complaints">
              <Button variant="ghost" size="sm" className="text-xs gap-1">
                전체보기 <ArrowRight className="w-3 h-3" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {analyticsLoading ? (
            <Skeleton className="h-32" />
          ) : analytics ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-2xl font-bold">{analytics.totalComplaints}</p>
                  <p className="text-xs text-muted-foreground">전체 민원</p>
                </div>
                <div className="p-3 bg-orange-50 rounded-lg text-center border border-orange-200">
                  <p className="text-2xl font-bold text-orange-600">{analytics.sensitiveCount}</p>
                  <p className="text-xs text-orange-600">민감 민원 ({analytics.sensitiveComplaintRate}%)</p>
                </div>
                <div className="p-3 bg-blue-50 rounded-lg text-center border border-blue-200">
                  <p className="text-2xl font-bold text-blue-600">{analytics.recurringCount}</p>
                  <p className="text-xs text-blue-600">반복 민원</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg text-center border border-purple-200">
                  <p className="text-2xl font-bold text-purple-600">
                    {analytics.recurringAvgResolutionDays != null ? `${analytics.recurringAvgResolutionDays}일` : "-"}
                  </p>
                  <p className="text-xs text-purple-600">반복 민원 평균 처리</p>
                </div>
              </div>

              {analytics.buildingSummary && analytics.buildingSummary.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">단지별 민원 현황</p>
                  <div className="space-y-2">
                    {analytics.buildingSummary.map((b) => (
                      <div key={b.buildingId} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                        <div>
                          <p className="text-sm font-medium">{b.buildingName}</p>
                          <p className="text-xs text-muted-foreground">
                            전체 {b.totalComplaints}건 · 민감 {b.sensitiveCount}건 · 반복 {b.recurringCount}건
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {b.sensitiveRate > 0 && (
                            <Badge className={`text-[10px] ${b.sensitiveRate >= 30 ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}`}>
                              민감 {b.sensitiveRate}%
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analytics.unresolvedSensitiveComplaints && analytics.unresolvedSensitiveComplaints.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2 text-red-600 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    미처리 민감 민원 ({analytics.unresolvedSensitiveComplaints.length}건)
                  </p>
                  <div className="space-y-2">
                    {analytics.unresolvedSensitiveComplaints.slice(0, 5).map((c) => (
                      <div key={c.id} className="flex items-center justify-between p-3 rounded-lg bg-red-50/50 border border-red-200">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{c.title}</p>
                            {sensitivityBadge(c.sensitivity)}
                            {c.isRecurring && (
                              <Badge variant="outline" className="text-[9px] border-blue-300 text-blue-600 gap-0.5">
                                <Repeat className="w-2.5 h-2.5" />
                                반복
                              </Badge>
                            )}
                            {c.escalatedToHq && (
                              <Badge className="text-[9px] bg-red-100 text-red-700 gap-0.5">
                                <ArrowUpCircle className="w-2.5 h-2.5" />
                                HQ
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {c.unitNumber}호 · {complaintCategoryLabel(c.category)} · {c.complainantName}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground shrink-0 ml-3">
                          {c.createdAt ? new Date(c.createdAt).toLocaleDateString("ko-KR") : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analytics.categoryTrend && analytics.categoryTrend.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">카테고리별 월간 추이</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1.5 pr-3">월</th>
                          <th className="text-left py-1.5 pr-3">카테고리</th>
                          <th className="text-right py-1.5">건수</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.categoryTrend.slice(0, 15).map((item, idx) => (
                          <tr key={idx} className="border-b last:border-0">
                            <td className="py-1.5 pr-3 text-muted-foreground">{item.month}</td>
                            <td className="py-1.5 pr-3">{complaintCategoryLabel(item.category)}</td>
                            <td className="py-1.5 text-right font-medium">{item.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              민원 데이터가 없습니다
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-chart-3" />
                최근 결재 요청
              </CardTitle>
              <Link href="/approvals">
                <Button variant="ghost" size="sm" className="text-xs gap-1">
                  전체보기 <ArrowRight className="w-3 h-3" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {statsLoading ? (
              <Skeleton className="h-20" />
            ) : stats?.recentApprovals && stats.recentApprovals.length > 0 ? (
              stats.recentApprovals.slice(0, 5).map((approval) => (
                <div
                  key={approval.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{approval.title}</p>
                      {statusBadge(approval.status)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {approval.requesterName} · {categoryLabel(approval.category)}
                    </p>
                  </div>
                  {approval.estimatedAmount && (
                    <p className="text-sm font-medium shrink-0 ml-3">
                      ₩{approval.estimatedAmount.toLocaleString()}
                    </p>
                  )}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                결재 요청이 없습니다
              </p>
            )}
          </CardContent>
        </Card>

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
    </div>
  );
}
