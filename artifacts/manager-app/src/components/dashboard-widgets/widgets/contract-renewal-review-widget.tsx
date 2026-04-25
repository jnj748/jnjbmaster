import { useMemo } from "react";
import { Link } from "wouter";
import { useListContracts, type Contract } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarClock, AlertCircle } from "lucide-react";
import { useBuilding } from "@/contexts/building-context";
import { CONTRACT_RENEWAL_ALERT_THRESHOLD_DAYS } from "@workspace/shared/contract-renewal";

// [Task #369] "갱신 검토 필요 N건" 위젯.
// - 현재 건물(useBuilding)에서 status 가 renewal_due 이거나, 만료까지 75일 이하로
//   남은 active/in_progress 계약을 한 줄로 노출한다.
// - 위젯 클릭 시 /contracts?expiring=1 로 이동해 만료 임박 배너가 펼쳐진 상태로
//   진입한다 (계약 페이지가 expiring=1 쿼리를 읽어 expiringOnly 체크박스를 ON 으로 켠다).
// - 표시할 계약이 없으면 "이번 분기 검토할 계약이 없어요" 안내가 같은 자리에 노출.

function isWithinThreshold(endDate: string | null | undefined): boolean {
  if (!endDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const diffDays = Math.round(
    (end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  return diffDays >= 0 && diffDays <= CONTRACT_RENEWAL_ALERT_THRESHOLD_DAYS;
}

export default function ContractRenewalReviewWidget() {
  const { building } = useBuilding();
  const buildingId = building?.id ?? null;

  const { data, isLoading, isError } = useListContracts(
    buildingId ? { buildingId } : undefined,
    { query: { enabled: buildingId != null, staleTime: 60 * 1000 } },
  );

  const dueCount = useMemo(() => {
    const list = (data ?? []) as Contract[];
    let n = 0;
    for (const c of list) {
      if (c.status === "terminated" || c.status === "completed") continue;
      if (c.status === "renewal_due") {
        n += 1;
        continue;
      }
      if (
        (c.status === "active" || c.status === "in_progress") &&
        isWithinThreshold(c.endDate)
      ) {
        n += 1;
      }
    }
    return n;
  }, [data]);

  const inner = (() => {
    if (isLoading) return <Skeleton className="h-12 rounded-lg" />;
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
    const empty = dueCount === 0;
    return (
      <Card className="hover-elevate active-elevate-2 cursor-pointer">
        <CardContent className="py-3 px-3 flex items-center gap-2">
          <CalendarClock
            className={`w-4 h-4 shrink-0 ${
              empty ? "text-muted-foreground" : "text-amber-700"
            }`}
          />
          {empty ? (
            <span
              className="text-sm text-muted-foreground flex-1 truncate"
              data-testid="renewal-review-empty"
            >
              이번 분기 검토할 계약이 없어요
            </span>
          ) : (
            <span className="text-sm flex-1 truncate" data-testid="renewal-review-line">
              <span className="font-semibold text-amber-700">
                갱신 검토 필요 {dueCount}건
              </span>
              <span className="text-muted-foreground">
                {" · "}만료 {CONTRACT_RENEWAL_ALERT_THRESHOLD_DAYS}일 이내
              </span>
            </span>
          )}
          <span
            className="text-xs text-primary font-medium shrink-0"
            data-testid="renewal-review-link"
          >
            검토 →
          </span>
        </CardContent>
      </Card>
    );
  })();

  return (
    <section data-testid="contract-renewal-review-widget">
      <div className="flex items-center justify-between mb-1.5">
        <h2 className="text-sm font-bold">갱신 검토 필요 계약</h2>
      </div>
      <Link href="/contracts?expiring=1">{inner}</Link>
    </section>
  );
}
