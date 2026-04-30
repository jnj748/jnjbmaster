// [Task #660] 경리 대시보드 — 미납관리비 현황 (리스트 + 카드 내 문자 발송).
//
// /api/delinquency (active) 의 결과를 카드 안에서 그대로 노출하고, 행 단위로
// /api/delinquency/:id/notify (POST) 를 호출해 카드 안에서 즉시 문자 발송이
// 가능하도록 한다. 성공/실패는 토스트로 피드백한다.

import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  useListDelinquencies,
  useSendDelinquencyNotice,
  getGetDelinquencySummaryQueryKey,
  type DelinquencyAction,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Wallet, Send, AlertTriangle } from "lucide-react";
import { formatDate } from "@/lib/utils";

function lastActionLabel(row: DelinquencyAction): string {
  if (row.status === "resolved" && row.resolvedDate) {
    return `해결 (${formatDate(row.resolvedDate)})`;
  }
  if (row.actionType === "parking_suspended" && row.suspensionDate) {
    return `주차 정지 (${formatDate(row.suspensionDate)})`;
  }
  if (row.actionType === "notice_sent" && row.noticeDate) {
    return `문자 발송 (${formatDate(row.noticeDate)})`;
  }
  if (row.actionType === "detected") return "미조치";
  return row.actionType;
}

export default function AccountantDelinquencyListWidget() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading, refetch, queryKey } = useListDelinquencies({
    status: "active",
  });

  const rows = (data ?? []) as DelinquencyAction[];

  const totalAmount = useMemo(
    () => rows.reduce((s, r) => s + Number(r.totalOverdueAmount || 0), 0),
    [rows],
  );

  const notifyMut = useSendDelinquencyNotice({
    mutation: {
      onSuccess: () => {
        toast({ title: "문자가 발송되었습니다" });
        void refetch();
        void queryClient.invalidateQueries({
          queryKey: getGetDelinquencySummaryQueryKey(),
        });
        void queryClient.invalidateQueries({ queryKey });
      },
      onError: (err) => {
        toast({
          title: "문자 발송 실패",
          description: err instanceof Error ? err.message : String(err),
          variant: "destructive",
        });
      },
    },
  });

  return (
    <Card data-testid="accountant-delinquency-list">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="w-4 h-4" />
            미납관리비 현황
          </CardTitle>
          {totalAmount > 0 && (
            <Badge variant="destructive" className="text-xs">
              총 ₩{totalAmount.toLocaleString()}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              현재 미납 세대가 없습니다.
            </p>
            <Link href="/erp/accounting">
              <button className="text-xs text-primary hover:underline">
                연체 관리 페이지로 이동 →
              </button>
            </Link>
          </div>
        ) : (
          <>
            {rows.slice(0, 8).map((r) => {
              const isUrgent = r.overdueMonths >= 3;
              return (
                <div
                  key={r.id}
                  className={`p-3 rounded-lg border space-y-2 ${
                    isUrgent ? "border-red-300 bg-red-50/40" : ""
                  }`}
                  data-testid={`delinquency-row-${r.id}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {isUrgent && (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                      )}
                      <span className="text-sm font-bold truncate">
                        {r.unitNumber}
                      </span>
                      <Badge variant="destructive" className="text-[10px]">
                        {r.overdueMonths}개월 연체
                      </Badge>
                      {r.tenantName && (
                        <span className="text-xs text-muted-foreground truncate">
                          {r.tenantName}
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-bold shrink-0">
                      ₩{Number(r.totalOverdueAmount).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground truncate">
                      조치사항: {lastActionLabel(r)}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] gap-1 shrink-0"
                      disabled={
                        notifyMut.isPending && notifyMut.variables?.id === r.id
                      }
                      onClick={() => notifyMut.mutate({ id: r.id })}
                      data-testid={`delinquency-notify-${r.id}`}
                    >
                      <Send className="w-3 h-3" />
                      {notifyMut.isPending && notifyMut.variables?.id === r.id
                        ? "발송 중..."
                        : "문자 발송"}
                    </Button>
                  </div>
                </div>
              );
            })}
            {rows.length > 8 && (
              <p className="text-xs text-center text-muted-foreground pt-1">
                외 {rows.length - 8}건 더 있음 ·{" "}
                <Link href="/erp/accounting">
                  <span className="text-primary hover:underline cursor-pointer">
                    전체 보기
                  </span>
                </Link>
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
