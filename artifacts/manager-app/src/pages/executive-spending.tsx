import {
  useGetExecutiveSpending,
  useGetExecutiveKpi,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle,
  BarChart3,
} from "lucide-react";

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

function SpendingCard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
}: {
  title: string;
  value: string;
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

function formatAmount(amount: number): string {
  if (amount >= 100000000) return `₩${(amount / 100000000).toFixed(1)}억`;
  if (amount >= 10000) return `₩${(amount / 10000).toFixed(0)}만`;
  return `₩${amount.toLocaleString()}`;
}

export default function ExecutiveSpending() {
  const { data: spending, isLoading: spendingLoading } = useGetExecutiveSpending();
  const { data: kpi, isLoading: kpiLoading } = useGetExecutiveKpi();

  if (spendingLoading || kpiLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const maxCategoryAmount = Math.max(
    ...(spending?.byCategory?.map((c) => c.amount) ?? [1])
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">지출 현황</h1>
        <p className="text-muted-foreground text-sm mt-1">
          결재 기반 지출 내역과 예산 현황을 확인하세요
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SpendingCard
          title="총 지출 요청"
          value={formatAmount(spending?.totalSpending ?? 0)}
          icon={DollarSign}
          color="bg-chart-3"
          subtitle="전체 결재 요청 금액"
        />
        <SpendingCard
          title="승인 지출"
          value={formatAmount(spending?.approvedSpending ?? 0)}
          icon={CheckCircle}
          color="bg-green-600"
          subtitle="승인된 결재 금액"
        />
        <SpendingCard
          title="대기 지출"
          value={formatAmount(spending?.pendingSpending ?? 0)}
          icon={Clock}
          color="bg-chart-4"
          subtitle="승인 대기 금액"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-accent" />
              카테고리별 지출
            </CardTitle>
          </CardHeader>
          <CardContent>
            {spending?.byCategory && spending.byCategory.length > 0 ? (
              <div className="space-y-4">
                {spending.byCategory.map((cat) => (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {categoryLabel(cat.category)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {cat.count}건
                        </span>
                        <span className="font-medium">
                          {formatAmount(cat.amount)}
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2.5">
                      <div
                        className="bg-accent h-2.5 rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, (cat.amount / maxCategoryAmount) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                지출 데이터가 없습니다
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-chart-2" />
              월별 지출 추이
            </CardTitle>
          </CardHeader>
          <CardContent>
            {spending?.monthlyTrend && spending.monthlyTrend.length > 0 ? (
              <div className="space-y-3">
                {spending.monthlyTrend.map((m) => (
                  <div
                    key={m.month}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <span className="text-sm font-medium">{m.month}</span>
                    <span className="text-sm font-bold">
                      {formatAmount(m.amount)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                월별 추이 데이터가 없습니다
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">KPI 요약</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-2xl font-bold">{kpi?.taskCompletionRate ?? 0}%</p>
              <p className="text-xs text-muted-foreground mt-1">업무 완료율</p>
            </div>
            <div className="text-center p-4 bg-chart-2/10 rounded-lg">
              <p className="text-2xl font-bold text-chart-2">
                {kpi?.inspectionCompletionRate ?? 0}%
              </p>
              <p className="text-xs text-muted-foreground mt-1">점검 완료율</p>
            </div>
            <div className="text-center p-4 bg-destructive/10 rounded-lg">
              <p className="text-2xl font-bold text-destructive">
                {kpi?.overdueItems ?? 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">기한 초과</p>
            </div>
            <div className="text-center p-4 bg-chart-3/10 rounded-lg">
              <p className="text-2xl font-bold text-chart-3">
                {kpi?.pendingApprovals ?? 0}
              </p>
              <p className="text-xs text-muted-foreground mt-1">대기 결재</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
