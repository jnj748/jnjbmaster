import { useEffect, useState } from "react";
import {
  useGetCreditWallet,
  usePreviewCreditCost,
  useListPlatformSettings,
  getListQuotesQueryKey,
  useListRfqMessages,
  usePostRfqMessage,
  useMarkRfqMessagesRead,
  useListRfqSiteVisits,
  useCreateRfqSiteVisit,
  getListRfqMessagesQueryKey,
  getListRfqSiteVisitsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText,
  Send,
  AlertCircle,
  Printer,
  MessageSquare,
  CalendarDays,
  Plus,
  Trash2,
  CheckCircle,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { RfqRequestDocument, type RfqDocumentData } from "@/components/rfq-request-document";
import { IntermediaryDisclaimerBanner, recordConsent } from "@/components/intermediary-disclaimer";
import { AuthImage } from "@/components/auth-image";
import { rfqServiceTypeLabel } from "@workspace/shared/rfq-service-types";

const categoryLabel = (c: string) => {
  const map: Record<string, string> = {
    elevator: "승강기", water_tank: "저수조", fire_safety: "소방",
    electrical: "전기", gas: "가스", septic: "정화조",
    cleaning: "청소", security: "보안", other: "기타",
  };
  return map[c] || c;
};

// [Task #612] 견적서 표준 라인 아이템 한 줄. 합계는 qty * unitPrice 로 자동 계산.
type LineItemDraft = {
  name: string;
  qty: string;
  unitPrice: string;
  unit: string;
};

const newLine = (): LineItemDraft => ({ name: "", qty: "1", unitPrice: "", unit: "EA" });

export function VendorRfqList({ rfqs, vendorId, vendorName, myQuotes, queryClient: _externalQc, createQuoteMutation, toast, authToken }: any) {
  const queryClient = useQueryClient();
  const [quoteDialogRfq, setQuoteDialogRfq] = useState<any>(null);
  const [rfqDocRfq, setRfqDocRfq] = useState<RfqDocumentData | null>(null);
  // [Task #612] 메시지/방문 일정 다이얼로그를 RFQ 카드별로 열고 닫는다.
  const [commsRfq, setCommsRfq] = useState<any>(null);
  const [visitRfq, setVisitRfq] = useState<any>(null);

  const [lineItems, setLineItems] = useState<LineItemDraft[]>([newLine()]);
  const [vatRate, setVatRate] = useState("10"); // 부가세율(%) — 기본 10%
  const [form, setForm] = useState({
    scope: "",
    estimatedDays: "",
    availableDate: "",
    validUntil: "",
    warrantyTerms: "",
    attachmentUrl: "",
    notes: "",
  });

  const { data: wallet } = useGetCreditWallet(
    { vendorId: vendorId ?? 0 },
    { query: { enabled: !!vendorId } },
  );
  const { data: costPreview } = usePreviewCreditCost(
    quoteDialogRfq ? { rfqId: quoteDialogRfq.id } : { rfqId: 0 },
    { query: { enabled: !!quoteDialogRfq } },
  );
  // [Task #226] 미열람 환불 정책을 다이얼로그에서 명시.
  const { data: platformSettings } = useListPlatformSettings();
  const refundDays = Number(platformSettings?.find((s: any) => s.key === "no_view_refund_days")?.value ?? 7);
  const refundRatioPct = Math.round(Number(platformSettings?.find((s: any) => s.key === "no_view_refund_ratio")?.value ?? 0.6) * 100);
  const creditsEnabled = wallet?.creditsEnabled ?? false;
  const insufficient = !!(creditsEnabled && costPreview && wallet && wallet.balance < costPreview.totalCost);

  // 자동 합계: subtotal = Σ(qty * unitPrice), vat = subtotal * vatRate%, total = subtotal + vat.
  const subtotal = lineItems.reduce((sum, li) => {
    const q = parseFloat(li.qty || "0");
    const p = parseFloat(li.unitPrice || "0");
    return sum + (isFinite(q) && isFinite(p) ? q * p : 0);
  }, 0);
  const vat = Math.round(subtotal * (parseFloat(vatRate || "0") / 100));
  const total = subtotal + vat;

  function resetForm() {
    setLineItems([newLine()]);
    setVatRate("10");
    setForm({
      scope: "",
      estimatedDays: "",
      availableDate: "",
      validUntil: "",
      warrantyTerms: "",
      attachmentUrl: "",
      notes: "",
    });
  }

  function updateLine(i: number, patch: Partial<LineItemDraft>) {
    setLineItems((prev) => prev.map((li, idx) => (idx === i ? { ...li, ...patch } : li)));
  }
  function addLine() {
    setLineItems((prev) => [...prev, newLine()]);
  }
  function removeLine(i: number) {
    setLineItems((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  async function handleSubmitQuote(e: React.FormEvent) {
    e.preventDefault();
    if (!quoteDialogRfq) return;
    if (!authToken) {
      toast({ title: "로그인이 필요합니다", variant: "destructive" });
      return;
    }
    // 최소 1개 항목 + 금액이 있어야 한다.
    const valid = lineItems.filter(
      (li) => li.name.trim() && parseFloat(li.unitPrice || "0") > 0,
    );
    if (valid.length === 0) {
      toast({ title: "라인 아이템을 1개 이상 입력해주세요", variant: "destructive" });
      return;
    }
    try {
      await recordConsent(authToken, "contract_disclaimer", `quote_submit:rfq:${quoteDialogRfq.id}`, { throwOnError: true });
    } catch {
      toast({ title: "동의 기록에 실패했습니다. 다시 시도해 주세요.", variant: "destructive" });
      return;
    }

    const lineItemsPayload = JSON.stringify(
      valid.map((li) => ({
        name: li.name.trim(),
        qty: parseFloat(li.qty || "0"),
        unitPrice: parseFloat(li.unitPrice || "0"),
        unit: li.unit,
        amount: parseFloat(li.qty || "0") * parseFloat(li.unitPrice || "0"),
      })),
    );

    const itemBreakdown = valid
      .map(
        (li) =>
          `${li.name} ${li.qty}${li.unit} × ${Number(li.unitPrice).toLocaleString()}원`,
      )
      .join("\n");

    await createQuoteMutation.mutateAsync({
      data: {
        rfqId: quoteDialogRfq.id,
        vendorId,
        vendorName,
        totalAmount: total,
        subtotal: subtotal,
        vatAmount: vat,
        lineItems: lineItemsPayload,
        itemBreakdown,
        scope: form.scope || null,
        estimatedDays: form.estimatedDays ? parseInt(form.estimatedDays) : null,
        availableDate: form.availableDate || null,
        validUntil: form.validUntil || null,
        warrantyTerms: form.warrantyTerms || null,
        attachmentUrl: form.attachmentUrl || null,
        notes: form.notes || null,
      },
    });
    queryClient.invalidateQueries({ queryKey: getListQuotesQueryKey() });
    toast({ title: "견적서가 제출되었습니다" });
    setQuoteDialogRfq(null);
    resetForm();
  }

  const hasQuoteFor = (rfqId: number) =>
    myQuotes.some((q: any) => q.rfqId === rfqId);

  return (
    <div className="space-y-4">
      {rfqs.length > 0 ? (
        <div className="space-y-3">
          {rfqs.map((rfq: any) => (
            <Card key={rfq.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <h3 className="font-medium">{rfq.title}</h3>
                      <Badge variant={rfq.status === "open" ? "secondary" : "outline"}>
                        {rfq.status === "open" ? "접수중" : rfq.status === "closed" ? "마감" : "취소"}
                      </Badge>
                      <Badge variant="outline">{categoryLabel(rfq.category)}</Badge>
                      {rfq.serviceType && (
                        <Badge variant="outline">{rfqServiceTypeLabel(rfq.serviceType)}</Badge>
                      )}
                      {/* [Task #612] 현장방문이 필요한 견적은 별도 배지로 강조. */}
                      {rfq.requiresSiteVisit && (
                        <Badge className="bg-amber-100 text-amber-800 border border-amber-300">
                          <CalendarDays className="w-3 h-3 mr-0.5" />
                          현장방문 필요
                        </Badge>
                      )}
                      {(rfq.isPremium || (rfq.estimatedAmount && rfq.estimatedAmount >= 5_000_000)) && (
                        <Badge className="bg-amber-500 hover:bg-amber-600">
                          프리미엄 · 선착순 {rfq.premiumSlotLimit ?? 5}팀
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground mt-2">
                      <span>건물: {rfq.buildingName}</span>
                      <span>마감: {formatDate(rfq.deadline)}</span>
                      {rfq.desiredDate && <span>희망일: {formatDate(rfq.desiredDate)}</span>}
                      {/* [Task #226] 카드에서 바로 예상 차감 크레딧 + 미열람 환불 정책을 확인할 수 있게 한다. */}
                      {typeof rfq.expectedCreditCost === "number" && (
                        <span className="text-teal-700 font-medium">예상 차감 {rfq.expectedCreditCost}C</span>
                      )}
                      {typeof rfq.noViewRefundDays === "number" && typeof rfq.noViewRefundRatio === "number" && (
                        <span className="text-amber-700">
                          {rfq.noViewRefundDays}일 미열람 시 {Math.round(rfq.noViewRefundRatio * 100)}% 자동 환불
                        </span>
                      )}
                    </div>
                    {rfq.description && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{rfq.description}</p>
                    )}
                    {(rfq.closeUpPhotoUrl || rfq.widePhotoUrl) && (
                      <div className="flex gap-2 mt-2">
                        {rfq.closeUpPhotoUrl && (
                          <AuthImage src={rfq.closeUpPhotoUrl} alt="근경" className="w-16 h-16 rounded border object-cover" />
                        )}
                        {rfq.widePhotoUrl && (
                          <AuthImage src={rfq.widePhotoUrl} alt="원경" className="w-16 h-16 rounded border object-cover" />
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 items-end">
                    {rfq.status === "open" && !hasQuoteFor(rfq.id) ? (
                      <Button size="sm" onClick={() => { setQuoteDialogRfq(rfq); resetForm(); }}>
                        <Send className="w-3.5 h-3.5 mr-1" />
                        견적 제출
                      </Button>
                    ) : hasQuoteFor(rfq.id) ? (
                      <Badge variant="outline" className="text-green-600 border-green-200">제출 완료</Badge>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => setCommsRfq(rfq)}>
                      <MessageSquare className="w-3.5 h-3.5 mr-1" />
                      연락하기
                    </Button>
                    {rfq.requiresSiteVisit && (
                      <Button size="sm" variant="outline" onClick={() => setVisitRfq(rfq)}>
                        <CalendarDays className="w-3.5 h-3.5 mr-1" />
                        방문 일정 제안
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setRfqDocRfq({
                      title: rfq.title,
                      category: rfq.category,
                      serviceType: rfq.serviceType,
                      description: rfq.description,
                      buildingName: rfq.buildingName,
                      desiredDate: rfq.desiredDate,
                      deadline: rfq.deadline,
                      sido: rfq.sido,
                      sigungu: rfq.sigungu,
                      closeUpPhotoUrl: rfq.closeUpPhotoUrl,
                      widePhotoUrl: rfq.widePhotoUrl,
                      createdAt: rfq.createdAt,
                    })}>
                      <Printer className="w-3.5 h-3.5 mr-1" />
                      의뢰서
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">수신된 견적 요청이 없습니다</p>
          </CardContent>
        </Card>
      )}

      {/* 표준 견적 제출 다이얼로그 — 라인 아이템 + 부가세 + 유효기한 + A/S */}
      <ResponsiveDialog open={!!quoteDialogRfq} onOpenChange={(o) => { if (!o) { setQuoteDialogRfq(null); resetForm(); } }}>
        <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>견적서 제출</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          {quoteDialogRfq && (
            <div>
              <div className="p-3 bg-muted rounded-lg text-sm mb-4 space-y-1">
                <p><strong>요청:</strong> {quoteDialogRfq.title}</p>
                <p><strong>건물:</strong> {quoteDialogRfq.buildingName}</p>
                <p><strong>마감:</strong> {formatDate(quoteDialogRfq.deadline)}</p>
              </div>
              <IntermediaryDisclaimerBanner variant="contract" className="mb-3" />
              {creditsEnabled && costPreview && (
                <div className={`p-3 rounded-lg text-sm mb-4 border ${insufficient ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium">예상 차감 크레딧</span>
                    <span className="font-bold">{costPreview.totalCost} C</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    보유: {wallet?.balance ?? 0} C · 포인트: {wallet?.pointsBalance ?? 0} P
                  </div>
                  {costPreview.reason?.length > 0 && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {costPreview.reason.join(" · ")}
                    </div>
                  )}
                  {insufficient && (
                    <div className="text-xs text-red-600 mt-2 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      크레딧이 부족합니다. 본사에 충전 요청 후 제출해주세요.
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
                    안내 · 관리소장이 {refundDays}일 동안 견적을 열람하지 않으면 차감 크레딧의 {refundRatioPct}%가 자동 환불됩니다.
                  </div>
                </div>
              )}
              <form onSubmit={handleSubmitQuote} className="space-y-4">
                <div className="border rounded-md">
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/50 text-xs font-medium border-b">
                    <div className="col-span-5">항목</div>
                    <div className="col-span-2">수량</div>
                    <div className="col-span-1">단위</div>
                    <div className="col-span-3">단가(원)</div>
                    <div className="col-span-1"></div>
                  </div>
                  <div className="divide-y">
                    {lineItems.map((li, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 items-center">
                        <Input
                          className="col-span-5 h-8 text-sm"
                          value={li.name}
                          onChange={(e) => updateLine(i, { name: e.target.value })}
                          placeholder="예: 승강기 부품 교체"
                        />
                        <Input
                          className="col-span-2 h-8 text-sm"
                          type="number"
                          value={li.qty}
                          onChange={(e) => updateLine(i, { qty: e.target.value })}
                        />
                        <Input
                          className="col-span-1 h-8 text-sm"
                          value={li.unit}
                          onChange={(e) => updateLine(i, { unit: e.target.value })}
                        />
                        <Input
                          className="col-span-3 h-8 text-sm"
                          type="number"
                          value={li.unitPrice}
                          onChange={(e) => updateLine(i, { unitPrice: e.target.value })}
                          placeholder="0"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="col-span-1 h-8 w-8"
                          onClick={() => removeLine(i)}
                          disabled={lineItems.length === 1}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="px-3 py-2 border-t flex items-center justify-between text-xs">
                    <Button type="button" variant="ghost" size="sm" onClick={addLine}>
                      <Plus className="w-3 h-3 mr-1" />
                      항목 추가
                    </Button>
                    <div className="flex items-center gap-1">
                      <span>VAT(%)</span>
                      <Input
                        type="number"
                        value={vatRate}
                        onChange={(e) => setVatRate(e.target.value)}
                        className="h-7 w-16 text-sm"
                      />
                    </div>
                  </div>
                  <div className="px-3 py-2 border-t bg-muted/30 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">공급가</span>
                      <span>{subtotal.toLocaleString()}원</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">부가세</span>
                      <span>{vat.toLocaleString()}원</span>
                    </div>
                    <div className="flex justify-between font-bold border-t pt-1">
                      <span>합계</span>
                      <span>{total.toLocaleString()}원</span>
                    </div>
                  </div>
                </div>

                <div>
                  <Label>작업 범위</Label>
                  <Textarea
                    value={form.scope}
                    onChange={(e) => setForm({ ...form, scope: e.target.value })}
                    placeholder="작업 범위와 내용을 기재하세요"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>예상 소요일 (일)</Label>
                    <Input
                      type="number"
                      value={form.estimatedDays}
                      onChange={(e) => setForm({ ...form, estimatedDays: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>착수 가능일</Label>
                    <Input
                      type="date"
                      value={form.availableDate}
                      onChange={(e) => setForm({ ...form, availableDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>견적 유효기한</Label>
                    <Input
                      type="date"
                      value={form.validUntil}
                      onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>첨부 파일 URL</Label>
                    <Input
                      value={form.attachmentUrl}
                      onChange={(e) => setForm({ ...form, attachmentUrl: e.target.value })}
                      placeholder="선택 사항"
                    />
                  </div>
                </div>
                <div>
                  <Label>A/S · 보증 조건</Label>
                  <Textarea
                    value={form.warrantyTerms}
                    onChange={(e) => setForm({ ...form, warrantyTerms: e.target.value })}
                    placeholder="예: 시공 후 1년 무상 A/S"
                  />
                </div>
                <div>
                  <Label>비고</Label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={insufficient}>견적서 제출</Button>
              </form>
            </div>
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {/* [Task #612] 메시지 다이얼로그 */}
      {commsRfq && (
        <PartnerMessagesDialog
          rfq={commsRfq}
          vendorId={vendorId}
          onClose={() => setCommsRfq(null)}
          toast={toast}
        />
      )}

      {/* [Task #612] 현장방문 일정 제안 다이얼로그 */}
      {visitRfq && (
        <PartnerProposeVisitDialog
          rfq={visitRfq}
          vendorId={vendorId}
          onClose={() => setVisitRfq(null)}
          toast={toast}
        />
      )}

      {rfqDocRfq && (
        <RfqRequestDocument
          open={!!rfqDocRfq}
          onOpenChange={(o) => { if (!o) setRfqDocRfq(null); }}
          rfq={rfqDocRfq}
        />
      )}
    </div>
  );
}

// [Task #612] 파트너 → 매니저 메시지 다이얼로그.
function PartnerMessagesDialog({
  rfq,
  vendorId,
  onClose,
  toast,
}: {
  rfq: any;
  vendorId: number;
  onClose: () => void;
  toast: any;
}) {
  const queryClient = useQueryClient();
  const { data: thread } = useListRfqMessages(rfq.id);
  const postMsg = usePostRfqMessage();
  const markRead = useMarkRfqMessagesRead();
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!thread || thread.messages.length === 0) return;
    if (thread.readByPartnerAt) return;
    markRead.mutate(
      { id: rfq.id, data: { vendorId } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListRfqMessagesQueryKey(rfq.id) });
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread?.messages.length]);

  async function handleSend() {
    if (!body.trim()) return;
    try {
      await postMsg.mutateAsync({ id: rfq.id, data: { body: body.trim() } });
      setBody("");
      queryClient.invalidateQueries({ queryKey: getListRfqMessagesQueryKey(rfq.id) });
    } catch {
      toast({ title: "메시지 전송 실패", variant: "destructive" });
    }
  }

  return (
    <ResponsiveDialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <ResponsiveDialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>관리소장에게 메시지</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            견적 요청: <strong>{rfq.title}</strong>
          </p>
          <div className="border rounded-md max-h-64 overflow-y-auto p-3 space-y-2 bg-muted/20">
            {thread?.messages.length ? (
              thread.messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col text-sm ${
                    m.senderRole === "partner" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-md px-3 py-2 whitespace-pre-wrap ${
                      m.senderRole === "partner"
                        ? "bg-primary text-primary-foreground"
                        : "bg-card border"
                    }`}
                  >
                    {m.body}
                  </div>
                  <span className="text-[10px] text-muted-foreground mt-0.5">
                    {m.senderName || m.senderRole} · {new Date(m.createdAt).toLocaleString("ko-KR")}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-6">
                아직 메시지가 없습니다.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="문의/안내 메시지를 입력하세요"
              className="min-h-[60px]"
            />
            <Button onClick={handleSend} disabled={postMsg.isPending || !body.trim()}>
              <Send className="w-4 h-4 mr-1" />
              보내기
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

// [Task #612] 파트너 → 매니저 현장방문 후보 시각 제안 다이얼로그.
function PartnerProposeVisitDialog({
  rfq,
  vendorId: _vendorId,
  onClose,
  toast,
}: {
  rfq: any;
  vendorId: number;
  onClose: () => void;
  toast: any;
}) {
  const queryClient = useQueryClient();
  const { data: visits } = useListRfqSiteVisits(rfq.id);
  const createVisit = useCreateRfqSiteVisit();
  const [slots, setSlots] = useState<string[]>(["", "", ""]);
  const [notes, setNotes] = useState("");

  async function handleSubmit() {
    const valid = slots.filter((s) => s.trim()).map((s) => new Date(s).toISOString());
    if (valid.length === 0) {
      toast({ title: "최소 1개 이상의 일시를 입력해주세요", variant: "destructive" });
      return;
    }
    try {
      await createVisit.mutateAsync({
        id: rfq.id,
        data: { proposedSlots: JSON.stringify(valid), notes: notes || null },
      });
      queryClient.invalidateQueries({ queryKey: getListRfqSiteVisitsQueryKey(rfq.id) });
      toast({ title: "방문 일정이 제안되었습니다" });
      onClose();
    } catch {
      toast({ title: "제안 실패", variant: "destructive" });
    }
  }

  const myVisits = (visits || []).filter((v: any) => v.vendorId === _vendorId);

  return (
    <ResponsiveDialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <ResponsiveDialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>현장방문 일정 제안</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            견적 요청: <strong>{rfq.title}</strong> · 관리소장이 슬롯을 골라 확정합니다.
          </p>

          {myVisits.length > 0 && (
            <div className="border rounded-md p-3 space-y-2">
              <p className="text-xs font-medium">기존 제안</p>
              {myVisits.map((v: any) => (
                <div key={v.id} className="text-sm flex items-center justify-between">
                  <Badge variant="outline">
                    {v.status === "proposed"
                      ? "대기"
                      : v.status === "confirmed"
                      ? "확정"
                      : v.status === "cancelled"
                      ? "취소"
                      : "완료"}
                  </Badge>
                  {v.confirmedSlot && (
                    <span className="text-xs flex items-center gap-1 text-emerald-700">
                      <CheckCircle className="w-3 h-3" />
                      {new Date(v.confirmedSlot).toLocaleString("ko-KR")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label>가능한 일시 (최소 1개)</Label>
            {slots.map((s, i) => (
              <Input
                key={i}
                type="datetime-local"
                value={s}
                onChange={(e) => {
                  const next = [...slots];
                  next[i] = e.target.value;
                  setSlots(next);
                }}
              />
            ))}
          </div>
          <div>
            <Label>안내 메모</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="현장 확인 시 필요한 안내 사항"
            />
          </div>
          <Button className="w-full" onClick={handleSubmit} disabled={createVisit.isPending}>
            <Send className="w-4 h-4 mr-1" />
            방문 일정 제안
          </Button>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
