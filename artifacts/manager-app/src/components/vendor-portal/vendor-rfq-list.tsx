import { useState } from "react";
import {
  useGetCreditWallet,
  usePreviewCreditCost,
  useListPlatformSettings,
  getListQuotesQueryKey,
} from "@workspace/api-client-react";
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
import { FileText, Send, AlertCircle, Printer } from "lucide-react";
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

export function VendorRfqList({ rfqs, vendorId, vendorName, myQuotes, queryClient, createQuoteMutation, toast, authToken }: any) {
  const [quoteDialogRfq, setQuoteDialogRfq] = useState<any>(null);
  const [rfqDocRfq, setRfqDocRfq] = useState<RfqDocumentData | null>(null);
  const [form, setForm] = useState({
    totalAmount: "",
    itemBreakdown: "",
    scope: "",
    estimatedDays: "",
    availableDate: "",
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

  function resetForm() {
    setForm({ totalAmount: "", itemBreakdown: "", scope: "", estimatedDays: "", availableDate: "", notes: "" });
  }

  async function handleSubmitQuote(e: React.FormEvent) {
    e.preventDefault();
    if (!quoteDialogRfq) return;
    if (!authToken) {
      toast({ title: "로그인이 필요합니다", variant: "destructive" });
      return;
    }
    try {
      await recordConsent(authToken, "contract_disclaimer", `quote_submit:rfq:${quoteDialogRfq.id}`, { throwOnError: true });
    } catch {
      toast({ title: "동의 기록에 실패했습니다. 다시 시도해 주세요.", variant: "destructive" });
      return;
    }

    await createQuoteMutation.mutateAsync({
      data: {
        rfqId: quoteDialogRfq.id,
        vendorId,
        vendorName,
        totalAmount: parseFloat(form.totalAmount),
        itemBreakdown: form.itemBreakdown || null,
        scope: form.scope || null,
        estimatedDays: form.estimatedDays ? parseInt(form.estimatedDays) : null,
        availableDate: form.availableDate || null,
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
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <h3 className="font-medium">{rfq.title}</h3>
                      <Badge variant={rfq.status === "open" ? "secondary" : "outline"}>
                        {rfq.status === "open" ? "접수중" : rfq.status === "closed" ? "마감" : "취소"}
                      </Badge>
                      <Badge variant="outline">{categoryLabel(rfq.category)}</Badge>
                      {rfq.serviceType && (
                        <Badge variant="outline">{rfqServiceTypeLabel(rfq.serviceType)}</Badge>
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
                  <div className="flex flex-col gap-2">
                    {rfq.status === "open" && !hasQuoteFor(rfq.id) ? (
                      <Button size="sm" onClick={() => { setQuoteDialogRfq(rfq); resetForm(); }}>
                        <Send className="w-3.5 h-3.5 mr-1" />
                        견적 제출
                      </Button>
                    ) : hasQuoteFor(rfq.id) ? (
                      <Badge variant="outline" className="text-green-600 border-green-200">제출 완료</Badge>
                    ) : null}
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

      <ResponsiveDialog open={!!quoteDialogRfq} onOpenChange={(o) => { if (!o) { setQuoteDialogRfq(null); resetForm(); } }}>
        <ResponsiveDialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
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
                <div>
                  <Label>견적 금액 (원)</Label>
                  <Input
                    type="number"
                    value={form.totalAmount}
                    onChange={(e) => setForm({ ...form, totalAmount: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>항목별 내역</Label>
                  <Textarea
                    value={form.itemBreakdown}
                    onChange={(e) => setForm({ ...form, itemBreakdown: e.target.value })}
                    placeholder="항목별 금액 내역을 기재하세요"
                  />
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
