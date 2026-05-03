import { useGetDelinquencySummary } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { AlertTriangle } from "lucide-react";

// React Query options (staleTime / gcTime / retry) come from the global
// QueryClient in App.tsx so the same metric is cached uniformly across
// every role that mounts this widget.
export default function DelinquencySummaryWidget() {
  const { data, isLoading } = useGetDelinquencySummary();

  if (isLoading) {
    return <Skeleton className="h-28 rounded-lg" />;
  }

  // [Task #184] 연체 세대가 0건일 때는 위젯 자체를 숨긴다(첫 화면 단순화).
  // 1건 이상일 때의 빨간색 알림 카드는 그대로 유지.
  if (!data || data.totalOverdue <= 0) {
    return null;
  }

  const detected = data.totalOverdue - data.notified - data.parkingSuspended;

  // [사용자 요청 2026-04] 위젯 배경 화이트 통일. 강조는 보더(border-red-200)와
  // 아이콘/텍스트/배지 색상만 사용. 하위 3개 셀도 화이트 + 보더만.
  return (
    <Card className="border-red-200 bg-card">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-semibold text-red-800">
              연체 세대 현황
            </span>
            <Badge variant="destructive" className="text-[10px] h-5">
              {data.totalOverdue}건
            </Badge>
          </div>
          <Link href="/erp/accounting">
            <span className="text-xs text-red-600 hover:underline font-medium cursor-pointer">
              관리 →
            </span>
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-card rounded-lg p-2 text-center border border-red-100">
            <p className="text-lg font-bold text-red-700">{detected}</p>
            <p className="text-[10px] text-red-600">감지됨</p>
          </div>
          <div className="bg-card rounded-lg p-2 text-center border border-orange-100">
            <p className="text-lg font-bold text-orange-600">{data.notified}</p>
            <p className="text-[10px] text-orange-500">독촉 발송</p>
          </div>
          <div className="bg-card rounded-lg p-2 text-center border border-red-100">
            <p className="text-lg font-bold text-red-800">
              {data.parkingSuspended}
            </p>
            <p className="text-[10px] text-red-600">주차 정지</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
