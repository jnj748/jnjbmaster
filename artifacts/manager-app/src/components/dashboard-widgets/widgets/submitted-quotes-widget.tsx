import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useListQuotes,
  useUpdateQuote,
  useGetQuote,
  getListQuotesQueryKey,
  type Quote,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { useToast } from "@/hooks/use-toast";
import { Receipt, AlertCircle, Paperclip, CheckCircle2 } from "lucide-react";
import { formatDate } from "@/lib/utils";
// [Task #388] 빈 상태에서 곧 도래하는 필수/제안 업무를 활용한 비교 견적 유도 카드.
import EmptyQuoteRfqSuggestion from "@/components/dashboard-widgets/widgets/empty-quote-rfq-suggestion";

const DEFAULT_LIMIT = 3;

interface SubmittedQuotesWidgetProps {
  limit?: number;
}

// [Task #견적-첨부v2] 표준 견적 라인 + 첨부 파싱 — 안전하게 try/catch.
type LineItemRow = { name: string; qty: number; unitPrice: number; amount: number; unit?: string };
type AttachmentRow = { url: string; name: string };

function parseLineItems(raw: string | null | undefined): LineItemRow[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((li: any) => ({
      name: String(li.name ?? ""),
      qty: Number(li.qty ?? 0),
      unitPrice: Number(li.unitPrice ?? 0),
      amount: Number(li.amount ?? Number(li.qty ?? 0) * Number(li.unitPrice ?? 0)),
      unit: li.unit,
    }));
  } catch {
    return [];
  }
}
function parseAttachments(raw: string | null | undefined): AttachmentRow[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.map((a: any) => ({ url: String(a.url ?? ""), name: String(a.name ?? a.url ?? "") }));
  } catch {
    return [];
  }
}
function fmt(n: number): string {
  return Math.round(n).toLocaleString();
}

// [Task #358 → #397] 모바일 첫 화면 "파트너사 비교 견적" 위젯.
export default function SubmittedQuotesWidget({
  limit = DEFAULT_LIMIT,
}: SubmittedQuotesWidgetProps) {
  const { data, isLoading, isError } = useListQuotes(undefined, {
    query: { staleTime: 60 * 1000 },
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateQuote = useUpdateQuote();
  const [openQuote, setOpenQuote] = useState<Quote | null>(null);
  // [Task #견적-첨부v2] Sheet 열림 시 GET /quotes/:id 호출 → 서버가 manager 인 경우
  // firstViewedAt 을 자동으로 기록한다. (미열람 환불 정책의 ground truth)
  useGetQuote(openQuote?.id ?? 0, {
    query: { enabled: !!openQuote, staleTime: 0 },
  });

  const items = useMemo(() => {
    const list = (data ?? []) as Quote[];
    const sorted = [...list].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
    return sorted.slice(0, limit);
  }, [data, limit]);

  // [Task #견적-첨부v2] Sheet 안 데이터 — 라인/첨부/합계.
  const sheetData = useMemo(() => {
    if (!openQuote) return null;
    const lineItems = parseLineItems((openQuote as any).lineItems);
    const attachments = parseAttachments((openQuote as any).attachmentUrls);
    const subtotal = (openQuote as any).subtotal ?? lineItems.reduce((s, li) => s + li.amount, 0);
    const vat = (openQuote as any).vatAmount ?? 0;
    const total = openQuote.totalAmount;
    const vatIncluded = vat > 0;
    return { lineItems, attachments, subtotal, vat, total, vatIncluded };
  }, [openQuote]);

  async function handleAccept() {
    if (!openQuote) return;
    try {
      await updateQuote.mutateAsync({
        id: openQuote.id,
        data: { status: "accepted" },
      });
      await queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
      toast({ title: "선택한 업체로 결정했습니다" });
      setOpenQuote(null);
    } catch {
      toast({ title: "처리에 실패했습니다. 다시 시도해 주세요.", variant: "destructive" });
    }
  }

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
                  <button
                    type="button"
                    data-testid={`submitted-quote-${q.id}`}
                    onClick={() => setOpenQuote(q)}
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* [Task #견적-첨부v2] 견적 상세 Sheet — 항목 + 첨부 + 결정 버튼. */}
      <ResponsiveDialog open={!!openQuote} onOpenChange={(o) => { if (!o) setOpenQuote(null); }}>
        <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>견적 상세</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          {openQuote && sheetData && (
            <div className="space-y-4">
              <div className="flex items-baseline justify-between border-b pb-2">
                <span className="text-[18px] font-bold">{openQuote.vendorName}</span>
                <span className="text-xs text-muted-foreground">제출일 {formatDate(openQuote.createdAt)}</span>
              </div>

              <div className="border rounded-md overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/50 text-xs font-medium border-b">
                  <div className="col-span-6">항목</div>
                  <div className="col-span-2 text-right">수량</div>
                  <div className="col-span-2 text-right">단가</div>
                  <div className="col-span-2 text-right">금액</div>
                </div>
                <div className="divide-y">
                  {sheetData.lineItems.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-muted-foreground">
                      라인 아이템이 없는 견적입니다 (구버전).
                    </div>
                  ) : (
                    sheetData.lineItems.map((li, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 text-sm">
                        <div className="col-span-6 truncate">{li.name}</div>
                        <div className="col-span-2 text-right tabular-nums">
                          {li.qty}{li.unit ? li.unit : ""}
                        </div>
                        <div className="col-span-2 text-right tabular-nums">{fmt(li.unitPrice)}</div>
                        <div className="col-span-2 text-right tabular-nums">{fmt(li.amount)}</div>
                      </div>
                    ))
                  )}
                </div>
                <div className="px-3 py-2 border-t bg-muted/30 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">공급가</span>
                    <span className="tabular-nums">{fmt(sheetData.subtotal)}원</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      부가세 {sheetData.vatIncluded ? "(포함)" : "(별도/없음)"}
                    </span>
                    <span className="tabular-nums">{fmt(sheetData.vat)}원</span>
                  </div>
                  <div className="flex justify-between border-t pt-1 text-[18px] font-bold">
                    <span>최종 금액</span>
                    <span className="tabular-nums">{fmt(sheetData.total)}원</span>
                  </div>
                </div>
              </div>

              {sheetData.attachments.length > 0 && (
                <div>
                  <div className="text-[15px] font-semibold mb-2">첨부 파일</div>
                  <ul className="border rounded-md divide-y">
                    {sheetData.attachments.map((a, i) => (
                      <li key={i} className="px-3 py-2 text-sm">
                        <a
                          href={a.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 text-primary hover:underline"
                        >
                          <Paperclip className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{a.name}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Button
                type="button"
                onClick={handleAccept}
                disabled={updateQuote.isPending || openQuote.status === "accepted"}
                className="w-full h-12 text-[15px]"
                data-testid="quote-accept-button"
              >
                <CheckCircle2 className="w-4 h-4 mr-1.5" />
                {openQuote.status === "accepted" ? "이미 결정된 업체입니다" : "이 업체로 결정"}
              </Button>
            </div>
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </section>
  );
}
