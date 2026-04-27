// [Task #495] dashboard-manager-legacy 에서 추출.
//   [원본 주석 보존]
//   [Task #246] 관리소장 대시보드 전용 "관리비 요약" 2×2 위젯.
//   기존 4-카드(관리비회계업무·시설업무·기한지난업무·예정점검) 그리드를 대체한다.
//   데이터 출처:
//     - /fees/bill-summaries → 최신 청구월의 totalAmount (당월 부과액)
//     - /fees/arrears-summary → 누적 미수금 / 미납 건수
//     - useGetDashboardAnalytics → 미납률
//   데이터가 없을 때는 "—" 로 비어있는 상태를 표시한다.

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { CATEGORY_ICON_CLASS } from "@/lib/category-colors";

export function FeesSummaryWidget({
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
