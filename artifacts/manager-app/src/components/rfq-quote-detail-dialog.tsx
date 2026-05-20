import { useEffect, useMemo } from "react";
import {
  useGetQuote,
  getListQuotesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Paperclip } from "lucide-react";
import { formatDate } from "@/lib/utils";

interface LineItem {
  name?: string;
  qty?: number | string;
  unitPrice?: number | string;
  amount?: number | string;
  notes?: string;
}

type ParseResult =
  | { kind: "array"; items: unknown[] }
  | { kind: "raw"; text: string }
  | { kind: "empty" };

function safeParseArray(raw: unknown): ParseResult {
  if (raw == null) return { kind: "empty" };
  if (Array.isArray(raw)) return { kind: "array", items: raw };
  if (typeof raw !== "string") return { kind: "empty" };
  const trimmed = raw.trim();
  if (!trimmed) return { kind: "empty" };
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return { kind: "array", items: parsed };
    // 파싱은 됐지만 배열이 아니면 사용자에게 raw 로 보여 준다(정보 손실 방지).
    return { kind: "raw", text: trimmed };
  } catch {
    // 파싱 실패 — raw 텍스트로 폴백.
    return { kind: "raw", text: trimmed };
  }
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3 text-sm">
      <div className="text-muted-foreground">{label}</div>
      <div className="min-w-0 break-words">{value}</div>
    </div>
  );
}

export interface RfqQuoteDetailDialogProps {
  quoteId: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RfqQuoteDetailDialog({
  quoteId,
  open,
  onOpenChange,
}: RfqQuoteDetailDialogProps) {
  const queryClient = useQueryClient();
  // useGetQuote 호출만으로 서버에서 firstViewedAt 이 1회 기록된다(기존 동작).
  const { data: quote, isLoading } = useGetQuote(quoteId ?? 0, {
    query: { enabled: open && quoteId != null, staleTime: 0 },
  });

  // [Task #872] 모달이 처음 열려 서버가 firstViewedAt 을 채워 응답한 경우,
  //   부모 화면의 useListQuotes 캐시도 즉시 갱신해 카드의 "열람함" 배지가
  //   다음 렌더에서 바로 보이도록 invalidate 한다. (새로고침 없이도 반영)
  const firstViewedAt = (quote as any)?.firstViewedAt ?? null;
  useEffect(() => {
    if (!open || !firstViewedAt) return;
    queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
  }, [open, firstViewedAt, queryClient]);

  const lineItems = useMemo<ParseResult>(
    () => (quote ? safeParseArray((quote as any).lineItems) : { kind: "empty" }),
    [quote],
  );
  const attachments = useMemo(() => {
    if (!quote) return [] as string[];
    const multi = safeParseArray((quote as any).attachmentUrls);
    const list: string[] = [];
    if (multi.kind === "array") {
      for (const u of multi.items) {
        if (typeof u === "string" && u.trim()) list.push(u);
      }
    }
    if (list.length === 0) {
      const single = (quote as any).attachmentUrl;
      if (typeof single === "string" && single.trim()) list.push(single);
    }
    return list;
  }, [quote]);

  const subtotal = quote ? num((quote as any).subtotal) : null;
  const vatAmount = quote ? num((quote as any).vatAmount) : null;
  const totalAmount = quote ? num((quote as any).totalAmount) : null;
  const estimatedDays = quote ? num((quote as any).estimatedDays) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        data-testid="rfq-quote-detail-dialog"
      >
        <DialogHeader>
          <DialogTitle>견적 자세히 보기</DialogTitle>
        </DialogHeader>

        {isLoading || !quote ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* 기본 정보 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-lg font-semibold">
                  {(quote as any).vendorName}
                </h3>
                <Badge variant="outline">
                  {(quote as any).status === "accepted"
                    ? "선택됨"
                    : (quote as any).status === "rejected"
                    ? "반려"
                    : (quote as any).status === "submitted"
                    ? "제출됨"
                    : String((quote as any).status ?? "")}
                </Badge>
              </div>
              <div className="text-3xl font-bold tabular-nums">
                {(totalAmount ?? 0).toLocaleString()}
                <span className="text-base font-medium text-muted-foreground ml-1">
                  원
                </span>
              </div>
              {(subtotal != null || vatAmount != null) && (
                <div className="text-xs text-muted-foreground">
                  {subtotal != null && <>소계 {subtotal.toLocaleString()}원</>}
                  {subtotal != null && vatAmount != null && " · "}
                  {vatAmount != null && <>부가세 {vatAmount.toLocaleString()}원</>}
                </div>
              )}
            </div>

            {/* 메타 */}
            <div className="rounded-lg border p-3 space-y-2">
              <Row label="제출일" value={formatDate((quote as any).createdAt)} />
              {(quote as any).validUntil && (
                <Row label="유효기간" value={formatDate((quote as any).validUntil)} />
              )}
              {(quote as any).availableDate && (
                <Row
                  label="작업 가능일"
                  value={formatDate((quote as any).availableDate)}
                />
              )}
              {estimatedDays != null && (
                <Row label="예상 작업일수" value={`${estimatedDays}일`} />
              )}
              <Row
                label="첫 열람"
                value={
                  (quote as any).firstViewedAt
                    ? formatDate((quote as any).firstViewedAt)
                    : "—"
                }
              />
            </div>

            {/* 품목 내역 */}
            <div>
              <h4 className="text-sm font-semibold mb-2">품목 내역</h4>
              {lineItems.kind === "array" && lineItems.items.length > 0 ? (
                <div className="overflow-x-auto">
                  <table
                    className="w-full text-xs border-collapse"
                    data-testid="rfq-quote-line-items"
                  >
                    <thead>
                      <tr className="border-b bg-muted/40">
                        <th className="text-left p-2 font-medium">품명</th>
                        <th className="text-right p-2 font-medium">수량</th>
                        <th className="text-right p-2 font-medium">단가</th>
                        <th className="text-right p-2 font-medium">금액</th>
                        <th className="text-left p-2 font-medium">비고</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.items.map((raw, idx) => {
                        const li = (raw ?? {}) as LineItem;
                        const qty = num(li.qty);
                        const unit = num(li.unitPrice);
                        const amount = num(li.amount);
                        return (
                          <tr key={idx} className="border-b align-top">
                            <td className="p-2">{li.name ?? "-"}</td>
                            <td className="p-2 text-right tabular-nums">
                              {qty != null ? qty.toLocaleString() : "-"}
                            </td>
                            <td className="p-2 text-right tabular-nums">
                              {unit != null ? unit.toLocaleString() : "-"}
                            </td>
                            <td className="p-2 text-right tabular-nums">
                              {amount != null ? amount.toLocaleString() : "-"}
                            </td>
                            <td className="p-2 text-muted-foreground">
                              {li.notes ?? ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : lineItems.kind === "raw" ? (
                // [Task #872] JSON 파싱 실패/배열 아닌 lineItems 는 정보 손실 없이 raw 텍스트로 노출.
                <p
                  className="text-sm whitespace-pre-wrap text-muted-foreground"
                  data-testid="rfq-quote-line-items-raw"
                >
                  {lineItems.text}
                </p>
              ) : (quote as any).itemBreakdown ? (
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                  {(quote as any).itemBreakdown}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">품목 정보가 없습니다.</p>
              )}
            </div>

            {/* 작업 범위 / 보증 / 비고 */}
            {(quote as any).scope && (
              <div>
                <h4 className="text-sm font-semibold mb-1">작업 범위</h4>
                <p className="text-sm whitespace-pre-wrap">{(quote as any).scope}</p>
              </div>
            )}
            {(quote as any).warrantyTerms && (
              <div>
                <h4 className="text-sm font-semibold mb-1">보증 / A/S 조건</h4>
                <p className="text-sm whitespace-pre-wrap">
                  {(quote as any).warrantyTerms}
                </p>
              </div>
            )}
            {(quote as any).notes && (
              <div>
                <h4 className="text-sm font-semibold mb-1">비고</h4>
                <p className="text-sm whitespace-pre-wrap">{(quote as any).notes}</p>
              </div>
            )}

            {/* 첨부 */}
            <div>
              <h4 className="text-sm font-semibold mb-2">첨부 파일</h4>
              {attachments.length > 0 ? (
                <ul className="space-y-1">
                  {attachments.map((url, idx) => (
                    <li key={`${url}-${idx}`}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline break-all"
                        data-testid={`rfq-quote-attachment-${idx}`}
                      >
                        <Paperclip className="w-3.5 h-3.5 shrink-0" />
                        {`첨부 ${idx + 1}`}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">첨부 파일이 없습니다.</p>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
