import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListQuotes,
  useListRfqs,
  useGetQuote,
  useUpdateQuote,
  getListQuotesQueryKey,
  ListRfqsStatus,
  type Quote,
} from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Receipt, AlertCircle, Mail, Search } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

// [Task #358 → #397] 모바일 첫 화면 "파트너사 비교 견적" 위젯.
// - listQuotes 는 서버에서 본인 건물 RFQ 견적으로 자동 스코핑.
// - 최근 도착 N건을 카드로 노출; 미열람 견적에는 NEW 배지.
// - 카드 클릭 시 ResponsiveDialog(Sheet) 로 상세 + "이 업체로 결정"(PATCH accepted).
// - 견적 0건: RFQ 오픈 건이 있으면 대기 카피, 없으면 견적 요청 CTA.

const DEFAULT_LIMIT = 3;

function formatKrw(amount: number): string {
  return `${Math.round(amount).toLocaleString("ko-KR")}원`;
}

function quoteSummaryLine(q: Quote): string {
  const breakdown = q.itemBreakdown?.trim();
  if (breakdown) {
    const first = breakdown.split(/\r?\n/).find((l: string) => l.trim());
    if (first) return first.trim();
  }
  if (q.lineItems) {
    try {
      const items = JSON.parse(q.lineItems) as Array<{ name?: string; description?: string }>;
      const row = items[0];
      if (row?.name?.trim()) return row.name.trim();
      if (row?.description?.trim()) return row.description.trim();
    } catch {
      /* ignore */
    }
  }
  if (q.scope?.trim()) return q.scope.trim();
  if (q.notes?.trim()) return q.notes.trim();
  return "등록된 요약이 없습니다.";
}

interface SubmittedQuotesWidgetProps {
  limit?: number;
}

export default function SubmittedQuotesWidget({
  limit = DEFAULT_LIMIT,
}: SubmittedQuotesWidgetProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [sheetQuoteId, setSheetQuoteId] = useState<number | null>(null);

  const { data, isLoading, isError } = useListQuotes(undefined, {
    query: { staleTime: 60 * 1000 },
  });

  const { data: openRfqsRaw } = useListRfqs(
    { status: ListRfqsStatus.open },
    { query: { staleTime: 60 * 1000 } },
  );

  const quotes = (data ?? []) as Quote[];
  const rfqPending = (openRfqsRaw ?? []).length;

  const items = useMemo(() => {
    const sorted = [...quotes].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
    return sorted.slice(0, limit);
  }, [quotes, limit]);

  const { data: detailQuote } = useGetQuote(sheetQuoteId ?? 0, {
    query: { enabled: sheetQuoteId != null && sheetQuoteId > 0 },
  });

  const sheetQuote =
    detailQuote ??
    (sheetQuoteId != null ? quotes.find((q) => q.id === sheetQuoteId) ?? null : null);

  const updateQuoteMutation = useUpdateQuote({
    mutation: {
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey(undefined) });
        await queryClient.invalidateQueries({ queryKey: ["/dashboard/alerts"] });
        setSheetQuoteId(null);
        toast({ title: "이 업체로 결정했어요" });
      },
      onError: (err: Error) => {
        toast({
          title: "채택에 실패했어요",
          description: err?.message ?? "잠시 후 다시 시도해 주세요",
          variant: "destructive",
        });
      },
    },
  });

  const handleAccept = () => {
    if (!sheetQuote || sheetQuote.status !== "submitted") return;
    updateQuoteMutation.mutate({
      id: sheetQuote.id,
      data: { status: "accepted" },
    });
  };

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
      ) : quotes.length === 0 ? (
        rfqPending > 0 ? (
          <Card>
            <CardContent className="p-4 flex flex-col items-center text-center gap-2">
              <span className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                <Search className="w-5 h-5" aria-hidden />
              </span>
              <p className="text-[15px] font-semibold leading-snug">파트너사에서 견적을 준비 중이에요</p>
              <p className="text-sm text-muted-foreground leading-relaxed px-1">
                조금만 기다려 주세요. 견적이 도착하면 알려드릴게요
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-4 flex flex-col items-center text-center gap-3">
              <span className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                <Mail className="w-5 h-5" aria-hidden />
              </span>
              <p className="text-[15px] font-semibold leading-snug">아직 도착한 견적이 없어요</p>
              <p className="text-sm text-muted-foreground leading-relaxed px-1">
                수리 견적을 요청하면 파트너사에서 견적을 보내드려요
              </p>
              <Button
                asChild
                className="min-h-12 text-[15px] px-6"
                data-testid="submitted-quotes-request-rfq"
              >
                <Link href="/rfqs?new=1">견적 요청하기</Link>
              </Button>
            </CardContent>
          </Card>
        )
      ) : (
        <div className="space-y-2">
          {items.map((q) => {
            const isNew = !q.firstViewedAt;
            return (
              <Card key={q.id}>
                <CardContent className="p-3">
                  <button
                    type="button"
                    data-testid={`submitted-quote-${q.id}`}
                    className="w-full flex items-center gap-3 py-1 px-1 hover-elevate active-elevate-2 rounded-lg text-left"
                    onClick={() => setSheetQuoteId(q.id)}
                  >
                    <span className="w-8 h-8 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                      <Receipt className="w-4 h-4" />
                    </span>
                    <span className="flex flex-col min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold truncate">{q.vendorName}</span>
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
                        <span className="tabular-nums truncate">{formatKrw(q.totalAmount)}</span>
                        <span className="text-muted-foreground shrink-0">{formatDate(q.createdAt)}</span>
                      </span>
                    </span>
                  </button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <ResponsiveDialog
        open={sheetQuoteId != null}
        onOpenChange={(o) => {
          if (!o) {
            if (sheetQuoteId != null) {
              void queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey(undefined) });
            }
            setSheetQuoteId(null);
          }
        }}
      >
        <ResponsiveDialogContent className="max-w-md">
          {sheetQuote ? (
            <>
              <ResponsiveDialogHeader>
                <ResponsiveDialogTitle className="text-[15px] sm:text-base pr-6">
                  견적 상세
                </ResponsiveDialogTitle>
              </ResponsiveDialogHeader>
              <div className="space-y-3 text-[15px] leading-snug">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-0.5">업체명</p>
                  <p className="font-semibold break-words">{sheetQuote.vendorName}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-0.5">견적 금액</p>
                  <p className="font-semibold tabular-nums">{formatKrw(sheetQuote.totalAmount)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-0.5">유효기간</p>
                  <p>{sheetQuote.validUntil ? formatDate(sheetQuote.validUntil) : "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-0.5">견적 내용 요약</p>
                  <p className="text-muted-foreground whitespace-pre-wrap break-words">
                    {quoteSummaryLine(sheetQuote)}
                  </p>
                </div>
              </div>
              <ResponsiveDialogFooter className="!flex-col gap-2 sm:!flex-col pt-2">
                <Button
                  type="button"
                  className="w-full min-h-12 text-[15px] font-medium"
                  disabled={
                    sheetQuote.status !== "submitted" || updateQuoteMutation.isPending
                  }
                  onClick={handleAccept}
                >
                  {updateQuoteMutation.isPending ? "처리 중…" : "이 업체로 결정"}
                </Button>
              </ResponsiveDialogFooter>
            </>
          ) : (
            <div className="py-6 flex justify-center">
              <Skeleton className="h-24 w-full rounded-md" />
            </div>
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </section>
  );
}
