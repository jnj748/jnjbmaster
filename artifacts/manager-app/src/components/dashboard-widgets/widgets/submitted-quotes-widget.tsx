import { useMemo } from "react";
import { Link } from "wouter";
import { useListQuotes, type Quote } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, AlertCircle } from "lucide-react";
import { formatDate } from "@/lib/utils";
// [Task #388] 빈 상태에서 곧 도래하는 필수/제안 업무를 활용한 비교 견적 유도 카드.
import EmptyQuoteRfqSuggestion from "@/components/dashboard-widgets/widgets/empty-quote-rfq-suggestion";

// [Task #358 → #397] 모바일 첫 화면 "파트너사 비교 견적" 위젯.
// - 매니저/회계가 보는 listQuotes 는 서버에서 본인 건물 RFQ 의 견적으로 자동 스코핑된다.
// - 최근 도착 N건(기본 3건)을 카드 형태로 보여 주고 파트너명·금액·도착일을 노출한다.
// - 매니저가 아직 처음 열어보지 않은 견적(firstViewedAt == null)에는 "NEW" 배지를 단다.
// - 카드를 누르면 해당 견적 비교 화면(/rfqs?openQuote={id})으로 이동.
//   /rfqs 가 openQuote 를 받으면 견적 상세를 자동으로 fetch 하면서 firstViewedAt 이 채워진다.
// - [Task #397] 카드 높이/여백/아이콘/폰트는 바로 위 "오늘 업무일지 자동 작성하기"
//   카드(TodayWorkLogEntry) 와 동일한 컴팩트 가로 레이아웃(p-3 + w-8 h-8 아이콘 +
//   text-xs/[11px] 2줄) 으로 통일한다. 빈 상태/목록/스켈레톤/추천 카드 모두 동일
//   스타일이며, 노출 개수·동작·NEW 배지 등 기존 인터랙션은 그대로 유지된다.
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
        <h2 className="text-sm font-bold">파트너사 비교 견적</h2>
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
        // [Task #397] 컴팩트 카드 높이에 맞춰 스켈레톤도 14h 로 낮춘다.
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="p-3">
            <span className="w-full flex items-center gap-3 py-1 px-1 text-left">
              <span className="w-8 h-8 rounded-full bg-destructive/10 text-destructive flex items-center justify-center shrink-0">
                <AlertCircle className="w-4 h-4" />
              </span>
              <span className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-semibold">견적 정보를 불러오지 못했습니다</span>
                <span className="text-[11px] font-medium leading-snug text-muted-foreground">
                  잠시 후 다시 시도해주세요
                </span>
              </span>
            </span>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        // [Task #388 → #397] 적합한 알림이 잡히면 비교 견적 유도 카드(컴팩트), 없으면 빈 상태.
        // 위젯 안에서는 EmptyQuoteRfqSuggestion 도 컴팩트 가로 레이아웃으로 렌더한다.
        <EmptyQuoteRfqSuggestion
          variant="widget"
          compact
          fallback={
            <Card>
              <CardContent className="p-3">
                <Link href="/rfqs">
                  <button
                    type="button"
                    data-testid="submitted-quotes-create-rfq"
                    className="w-full flex items-center gap-3 py-1 px-1 hover-elevate active-elevate-2 rounded-lg text-left"
                  >
                    <span className="w-8 h-8 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                      <Receipt className="w-4 h-4" />
                    </span>
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="text-xs font-semibold">받은 비교 견적이 없습니다</span>
                      <span className="text-[11px] font-medium leading-snug text-muted-foreground">
                        여기를 눌러 비교 견적을 요청해보세요
                      </span>
                    </span>
                  </button>
                </Link>
              </CardContent>
            </Card>
          }
        />
      ) : (
        <div className="space-y-2">
          {items.map((q) => {
            const isNew = !q.firstViewedAt;
            return (
              <Card key={q.id}>
                <CardContent className="p-3">
                  <Link
                    href={`/rfqs?openQuote=${q.id}`}
                    data-testid={`submitted-quote-${q.id}`}
                  >
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 py-1 px-1 hover-elevate active-elevate-2 rounded-lg text-left"
                    >
                      <span className="w-8 h-8 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                        <Receipt className="w-4 h-4" />
                      </span>
                      <span className="flex flex-col min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-semibold truncate">
                            {q.vendorName}
                          </span>
                          {isNew && (
                            <Badge
                              className="text-[10px] h-4 px-1.5 bg-rose-500 text-white hover:bg-rose-500 shrink-0"
                              data-testid={`submitted-quote-${q.id}-new`}
                            >
                              NEW
                            </Badge>
                          )}
                        </span>
                        <span className="flex items-center justify-between gap-2 text-[11px] font-medium leading-snug">
                          <span className="tabular-nums truncate">
                            {Math.round(q.totalAmount).toLocaleString()}원
                          </span>
                          <span className="text-muted-foreground shrink-0">
                            {formatDate(q.createdAt)}
                          </span>
                        </span>
                      </span>
                    </button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
