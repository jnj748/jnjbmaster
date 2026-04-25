import { useMemo } from "react";
import { Link } from "wouter";
import { useListContracts, type Contract } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, AlertCircle } from "lucide-react";
import { useBuilding } from "@/contexts/building-context";
// [Task #369] 만료 임박 임계값은 단일 소스(75일)에서 가져온다.
//   서버 알림 잡 / contracts 페이지 배너 / 갱신 검토 위젯과 같은 값이 보장된다.
import { CONTRACT_RENEWAL_ALERT_THRESHOLD_DAYS } from "@workspace/shared/contract-renewal";

// [Task #358 → 갱신 검토 위젯 병합] 건물관련 계약현황 한 줄 위젯.
// - 현재 건물의 계약을 상태별로 압축해 한 줄 안에 보여준다.
// - 진행중 = active / in_progress
// - 결재대기 = draft / in_approval
// - 갱신 검토 = renewal_due 또는 endDate 가 오늘부터 75일(2개월 15일) 이내인 active/in_progress
// - 갱신 검토가 1건 이상이면 amber 로 강조되고 클릭 시 /contracts?expiring=1 로 이동(만료 임박만 펼침).
// - 갱신 검토가 0건이면 일반 /contracts 로 이동.
// - 표시할 만한 계약이 없으면 "등록된 계약이 없습니다" 안내가 같은 줄 자리에 노출.

function isExpiringSoon(endDate: string | null | undefined): boolean {
  if (!endDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const diffMs = end.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= CONTRACT_RENEWAL_ALERT_THRESHOLD_DAYS;
}

export default function BuildingContractsSummaryWidget() {
  const { building } = useBuilding();
  const buildingId = building?.id ?? null;

  const { data, isLoading, isError } = useListContracts(
    buildingId ? { buildingId } : undefined,
    { query: { enabled: buildingId != null, staleTime: 60 * 1000 } },
  );

  const summary = useMemo(() => {
    const list = (data ?? []) as Contract[];
    let active = 0;
    let pending = 0;
    let expiring = 0;
    for (const c of list) {
      const s = c.status;
      if (s === "active" || s === "in_progress") {
        active += 1;
        if (isExpiringSoon(c.endDate)) expiring += 1;
      } else if (s === "draft" || s === "in_approval") {
        pending += 1;
      } else if (s === "renewal_due") {
        expiring += 1;
      }
    }
    return { active, pending, expiring, total: list.length };
  }, [data]);

  // [Task #358] empty 판단은 list.length 가 아니라 표시 대상(active/pending/expiring)
  // 합으로 본다. 모든 계약이 completed/terminated 같은 비표시 상태인 경우에도
  // "진행중 0 · 결재대기 0 · 만료임박 0" 대신 "등록된 계약이 없습니다" 가 노출된다.
  const showableTotal = summary.active + summary.pending + summary.expiring;

  const inner = (() => {
    if (isLoading) {
      return <Skeleton className="h-12 rounded-lg" />;
    }
    if (isError) {
      return (
        <Card>
          <CardContent className="py-3 px-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            <span className="text-xs text-muted-foreground">
              계약 정보를 불러오지 못했습니다
            </span>
          </CardContent>
        </Card>
      );
    }
    const empty = showableTotal === 0;
    const hasReview = summary.expiring > 0;
    return (
      <Card className="hover-elevate active-elevate-2 cursor-pointer">
        <CardContent className="py-3 px-3 flex items-center gap-2">
          <FileText
            className={`w-4 h-4 shrink-0 ${hasReview ? "text-amber-700" : "text-primary"}`}
          />
          {empty ? (
            <span
              className="text-sm text-muted-foreground flex-1 truncate"
              data-testid="contracts-summary-empty"
            >
              등록된 계약이 없습니다
            </span>
          ) : (
            <span
              className="text-sm flex-1 truncate"
              data-testid="contracts-summary-line"
            >
              <span className="font-medium">진행중 {summary.active}</span>
              <span className="text-muted-foreground"> · </span>
              <span className="font-medium">결재대기 {summary.pending}</span>
              <span className="text-muted-foreground"> · </span>
              <span
                className={`font-medium ${hasReview ? "text-amber-700" : ""}`}
                data-testid="contracts-summary-renewal"
              >
                갱신 검토 {summary.expiring}건
              </span>
            </span>
          )}
          <span
            className={`text-xs font-medium shrink-0 ${hasReview ? "text-amber-700" : "text-primary"}`}
            data-testid="contracts-summary-manage-link"
          >
            {hasReview ? "검토 →" : "관리 →"}
          </span>
        </CardContent>
      </Card>
    );
  })();

  // 갱신 검토 N>0 이면 만료 임박만 펼쳐 보이는 화면으로 진입한다.
  const targetHref = summary.expiring > 0 ? "/contracts?expiring=1" : "/contracts";

  return (
    <section data-testid="building-contracts-summary-widget">
      <div className="flex items-center justify-between mb-1.5">
        <h2 className="text-sm font-bold">건물관련 계약현황</h2>
      </div>
      <Link href={targetHref}>{inner}</Link>
    </section>
  );
}
