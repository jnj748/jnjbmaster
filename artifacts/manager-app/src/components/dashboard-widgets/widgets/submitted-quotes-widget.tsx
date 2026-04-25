import { useMemo } from "react";
import { Link } from "wouter";
import { useListQuotes, type Quote } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, AlertCircle } from "lucide-react";
import { formatDate } from "@/lib/utils";

// [Task #358] 모바일 첫 화면 "제출받은 견적서" 위젯.
// - 매니저/회계가 보는 listQuotes 는 서버에서 본인 건물 RFQ 의 견적으로 자동 스코핑된다.
// - 최근 도착 N건(기본 3건)을 카드 형태로 보여 주고 파트너명·금액·도착일을 노출한다.
// - 매니저가 아직 처음 열어보지 않은 견적(firstViewedAt == null)에는 "NEW" 배지를 단다.
// - 카드를 누르면 해당 견적 비교 화면(/rfqs?openQuote={id})으로 이동.
//   /rfqs 가 openQuote 를 받으면 견적 상세를 자동으로 fetch 하면서 firstViewedAt 이 채워진다.
const DEFAULT_LIMIT = 3;

interface SubmittedQuotesWidgetProps {
  limit?: number;
}

export default function SubmittedQuotesWidget({
  limit = DEFAULT_LIMIT,
}: SubmittedQuotesWidgetProps) {
  const { data, isLoading, isError } = useListQuotes(undefined, {
    query: { staleTime: 60 * 1000 },
  });

  const items = useMemo(() => {
    const list = (data ?? []) as Quote[];
    const sorted = [...list].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
    return sorted.slice(0, limit);
  }, [data, limit]);

  return (
    <section data-testid="submitted-quotes-widget">
      <div className="flex items-center justify-between mb-1.5">
        <h2 className="text-sm font-bold">제출받은 견적서</h2>
        {items.length > 0 && (
          <Link
            href="/rfqs"
            className="text-xs text-primary hover:underline font-medium"
            data-testid="submitted-quotes-manage-link"
          >
            전체 보기 →
          </Link>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="py-3 px-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
            <span className="text-xs text-muted-foreground">
              견적 정보를 불러오지 못했습니다
            </span>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-5 px-3 flex flex-col items-center gap-2 text-center">
            <Receipt className="w-6 h-6 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              제출받은 견적이 없습니다
            </p>
            <Link href="/rfqs">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                data-testid="submitted-quotes-create-rfq"
              >
                견적 요청하기
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((q) => {
            const isNew = !q.firstViewedAt;
            return (
              <Link
                key={q.id}
                href={`/rfqs?openQuote=${q.id}`}
                data-testid={`submitted-quote-${q.id}`}
              >
                <Card className="hover-elevate active-elevate-2 cursor-pointer">
                  <CardContent className="py-2.5 px-3">
                    <div className="flex items-start gap-2">
                      <span className="w-8 h-8 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                        <Receipt className="w-4 h-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium truncate">
                            {q.vendorName}
                          </p>
                          {isNew && (
                            <Badge
                              className="text-[10px] h-4 px-1.5 bg-rose-500 text-white hover:bg-rose-500"
                              data-testid={`submitted-quote-${q.id}-new`}
                            >
                              NEW
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <span className="text-sm font-semibold tabular-nums truncate">
                            {Math.round(q.totalAmount).toLocaleString()}원
                          </span>
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            {formatDate(q.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
