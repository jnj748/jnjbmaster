import { useMemo } from "react";
import { Link } from "wouter";
import {
  useListQuotes,
  useUpdateQuote,
  useListVendors,
  getListQuotesQueryKey,
  type Quote,
  type Vendor,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Receipt, AlertCircle, CheckCircle2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
// [Task #388] 빈 상태에서 곧 도래하는 필수/제안 업무를 활용한 비교 견적 유도 카드.
import EmptyQuoteRfqSuggestion from "@/components/dashboard-widgets/widgets/empty-quote-rfq-suggestion";

const DEFAULT_LIMIT = 3;

interface SubmittedQuotesWidgetProps {
  limit?: number;
}

// 위젯 단순화 — 받은 견적을 카드로 나열하고 카드 내 "선택하기" 버튼 1개로
//   바로 채택한다. 견적 비교 모달/계약 상세 모달은 모두 제거됨.

// [Task #358 → #397] 모바일 첫 화면 "파트너사 비교 견적" 위젯.
export default function SubmittedQuotesWidget({
  limit = DEFAULT_LIMIT,
}: SubmittedQuotesWidgetProps) {
  const { data, isLoading, isError } = useListQuotes(undefined, {
    query: { staleTime: 60 * 1000 },
  });
  const { data: vendors } = useListVendors();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateQuote = useUpdateQuote();

  const vendorById = useMemo(
    () => new Map<number, Vendor>((vendors || []).map((v) => [v.id, v])),
    [vendors],
  );

  const items = useMemo(() => {
    const list = (data ?? []) as Quote[];
    const sorted = [...list].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
    return sorted.slice(0, limit);
  }, [data, limit]);

  async function handleAccept(quote: Quote) {
    const vendorName = quote.vendorName ?? "이 업체";
    if (!confirm(`파트너사 "${vendorName}"를 선택하시겠습니까?`)) return;
    try {
      await updateQuote.mutateAsync({
        id: quote.id,
        data: { status: "accepted" },
      });
      await queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
      const v = vendorById.get(quote.vendorId);
      const contactBits: string[] = [];
      if (v?.contactName) contactBits.push(`담당자 ${v.contactName}`);
      if (v?.phone) contactBits.push(`☎ ${v.phone}`);
      toast({
        title: `${vendorName} 선택 완료`,
        description:
          contactBits.length > 0
            ? `직접 연락: ${contactBits.join(" · ")}`
            : "파트너사 연락처가 등록되어 있지 않습니다.",
      });
    } catch {
      toast({ title: "처리에 실패했습니다. 다시 시도해 주세요.", variant: "destructive" });
    }
  }

  return (
    <section data-testid="submitted-quotes-widget">
      <div className="flex items-center justify-between mb-1.5">
        <h2 className="text-sm font-bold">받은 파트너사 견적</h2>
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
                      <span className="text-xs font-semibold">받은 파트너사 견적이 없습니다</span>
                      <span className="text-[11px] font-medium leading-snug text-muted-foreground">
                        여기를 눌러 파트너사 견적을 받아 보세요
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
            const isAccepted = q.status === "accepted";
            return (
              <Card key={q.id} data-testid={`submitted-quote-${q.id}`}>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                      <Receipt className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-sm font-semibold truncate flex-1">
                      {q.vendorName}
                    </span>
                    {isNew && !isAccepted && (
                      <Badge
                        className="text-[10px] h-4 px-1.5 bg-rose-500 text-white hover:bg-rose-500 shrink-0"
                        data-testid={`submitted-quote-${q.id}-new`}
                      >
                        NEW
                      </Badge>
                    )}
                    {isAccepted && (
                      <Badge className="text-[10px] h-4 px-1.5 bg-primary text-primary-foreground shrink-0">
                        선택됨
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xl font-bold tabular-nums">
                      {Math.round(q.totalAmount).toLocaleString()}
                      <span className="text-xs font-medium text-muted-foreground ml-1">
                        원
                      </span>
                    </span>
                    <span className="text-[11px] text-muted-foreground shrink-0">
                      {formatDate(q.createdAt)}
                    </span>
                  </div>
                  {!isAccepted && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleAccept(q)}
                      disabled={updateQuote.isPending}
                      className="w-full"
                      data-testid={`quote-accept-button-${q.id}`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                      선택하기
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
