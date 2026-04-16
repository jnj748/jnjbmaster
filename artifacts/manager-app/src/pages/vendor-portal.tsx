import { useState } from "react";
import {
  useListRfqs,
  useListQuotes,
  useCreateQuote,
  useListWorkReports,
  useCreateWorkReport,
  useListSettlements,
  useListVendors,
  useGetCreditWallet,
  usePreviewCreditCost,
  getListQuotesQueryKey,
  getListWorkReportsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Briefcase,
  FileText,
  Send,
  ClipboardCheck,
  Coins,
  LayoutDashboard,
  Clock,
  CheckCircle,
  TrendingUp,
  AlertCircle,
  Printer,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import { RfqRequestDocument, type RfqDocumentData } from "@/components/rfq-request-document";
import { IntermediaryDisclaimerBanner, recordConsent } from "@/components/intermediary-disclaimer";
import { AuthImage } from "@/components/auth-image";

type PortalTab = "dashboard" | "rfqs" | "quotes" | "reports" | "settlements";

export default function VendorPortal() {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState<PortalTab>("dashboard");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const vendorId = user?.vendorId ?? null;

  const { data: vendors } = useListVendors({ type: "platform" });
  const loggedVendor = vendors?.find((v) => v.id === vendorId);

  const { data: allRfqs } = useListRfqs(undefined, { query: { enabled: !!vendorId } });
  const { data: myQuotes } = useListQuotes(
    vendorId ? { vendorId } : undefined,
    { query: { enabled: !!vendorId } }
  );
  const { data: myReports } = useListWorkReports(
    vendorId ? { vendorId } : undefined,
    { query: { enabled: !!vendorId } }
  );
  const { data: mySettlements } = useListSettlements(
    vendorId ? { vendorId } : undefined,
    { query: { enabled: !!vendorId } }
  );

  const createQuoteMutation = useCreateQuote();
  const createReportMutation = useCreateWorkReport();

  const myRfqs = allRfqs || [];

  if (!vendorId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <h2 className="text-lg font-bold mb-2">업체 연결 필요</h2>
            <p className="text-muted-foreground text-sm">
              계정에 연결된 업체가 없습니다. 관리자에게 문의해 주세요.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const openRfqCount = myRfqs.filter((r: any) => r.status === "open").length;
  const activeQuoteCount = myQuotes?.filter((q: any) => q.status === "submitted").length || 0;
  const acceptedQuoteCount = myQuotes?.filter((q: any) => q.status === "accepted").length || 0;
  const pendingReportCount = myReports?.filter((r: any) => r.status === "submitted").length || 0;
  const totalSettlement = mySettlements?.reduce((s: number, st: any) => s + st.paymentAmount, 0) || 0;
  const paidSettlement = mySettlements?.filter((s: any) => s.status === "paid").reduce((sum: number, s: any) => sum + s.paymentAmount, 0) || 0;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Briefcase className="w-5 h-5 text-teal-500" />
        <div>
          <h1 className="text-2xl font-bold">견적 요청</h1>
          <p className="text-muted-foreground text-sm">{loggedVendor?.name || "내 업체"} 포털</p>
        </div>
      </div>

      <div className="flex gap-2 border-b">
        {[
          { key: "dashboard" as PortalTab, label: "대시보드", icon: LayoutDashboard },
          { key: "rfqs" as PortalTab, label: "견적 요청", icon: FileText },
          { key: "quotes" as PortalTab, label: "내 견적서", icon: Send },
          { key: "reports" as PortalTab, label: "작업 보고", icon: ClipboardCheck },
          { key: "settlements" as PortalTab, label: "정산", icon: Coins },
        ].map((item) => (
          <button
            key={item.key}
            onClick={() => setActiveTab(item.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === item.key
                ? "border-teal-500 text-teal-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && (
        <VendorDashboard
          vendorName={loggedVendor?.name || ""}
          openRfqCount={openRfqCount}
          activeQuoteCount={activeQuoteCount}
          acceptedQuoteCount={acceptedQuoteCount}
          pendingReportCount={pendingReportCount}
          totalSettlement={totalSettlement}
          paidSettlement={paidSettlement}
          recentRfqs={myRfqs.slice(0, 5)}
          recentQuotes={(myQuotes || []).slice(0, 5)}
          onNavigate={setActiveTab}
        />
      )}
      {activeTab === "rfqs" && (
        <VendorRfqList
          rfqs={myRfqs}
          vendorId={vendorId}
          vendorName={loggedVendor?.name || ""}
          myQuotes={myQuotes || []}
          queryClient={queryClient}
          createQuoteMutation={createQuoteMutation}
          toast={toast}
          authToken={token}
        />
      )}
      {activeTab === "quotes" && (
        <VendorQuoteList quotes={myQuotes || []} />
      )}
      {activeTab === "reports" && (
        <VendorWorkReports
          reports={myReports || []}
          quotes={myQuotes?.filter((q: any) => q.status === "accepted") || []}
          vendorId={vendorId}
          vendorName={loggedVendor?.name || ""}
          queryClient={queryClient}
          createReportMutation={createReportMutation}
          toast={toast}
        />
      )}
      {activeTab === "settlements" && (
        <VendorSettlements settlements={mySettlements || []} />
      )}
    </div>
  );
}

function VendorDashboard({
  vendorName, openRfqCount, activeQuoteCount, acceptedQuoteCount,
  pendingReportCount, totalSettlement, paidSettlement, recentRfqs, recentQuotes, onNavigate,
}: any) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 desktop:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onNavigate("rfqs")}>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-100">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">대기중 견적요청</p>
                <p className="text-2xl font-bold">{openRfqCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onNavigate("quotes")}>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-green-100">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">채택된 견적</p>
                <p className="text-2xl font-bold">{acceptedQuoteCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onNavigate("reports")}>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-amber-100">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">검수 대기</p>
                <p className="text-2xl font-bold">{pendingReportCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onNavigate("settlements")}>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-purple-100">
                <TrendingUp className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">총 정산</p>
                <p className="text-xl font-bold">{totalSettlement.toLocaleString()}원</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 desktop:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">최근 견적 요청</CardTitle>
          </CardHeader>
          <CardContent>
            {recentRfqs.length > 0 ? (
              <div className="space-y-2">
                {recentRfqs.map((rfq: any) => (
                  <div key={rfq.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">{rfq.title}</p>
                      <p className="text-xs text-muted-foreground">마감: {formatDate(rfq.deadline)}</p>
                    </div>
                    <Badge variant={rfq.status === "open" ? "secondary" : "outline"}>
                      {rfq.status === "open" ? "접수중" : "마감"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">견적 요청이 없습니다</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">정산 요약</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">총 정산 금액</span>
                <span className="font-bold">{totalSettlement.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">지급 완료</span>
                <span className="font-bold text-green-600">{paidSettlement.toLocaleString()}원</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">미지급</span>
                <span className="font-bold text-amber-600">{(totalSettlement - paidSettlement).toLocaleString()}원</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const categoryLabel = (c: string) => {
  const map: Record<string, string> = {
    elevator: "승강기", water_tank: "저수조", fire_safety: "소방",
    electrical: "전기", gas: "가스", septic: "정화조",
    cleaning: "청소", security: "보안", other: "기타",
  };
  return map[c] || c;
};

function VendorRfqList({ rfqs, vendorId, vendorName, myQuotes, queryClient, createQuoteMutation, toast, authToken }: any) {
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
                      {(rfq.isPremium || (rfq.estimatedAmount && rfq.estimatedAmount >= 5_000_000)) && (
                        <Badge className="bg-amber-500 hover:bg-amber-600">
                          프리미엄 · 선착순 {rfq.premiumSlotLimit ?? 5}팀
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-4 text-sm text-muted-foreground mt-2">
                      <span>건물: {rfq.buildingName}</span>
                      <span>마감: {formatDate(rfq.deadline)}</span>
                      {rfq.desiredDate && <span>희망일: {formatDate(rfq.desiredDate)}</span>}
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

function VendorQuoteList({ quotes }: { quotes: any[] }) {
  const statusLabel = (s: string) => {
    switch (s) {
      case "submitted": return "제출";
      case "accepted": return "채택";
      case "rejected": return "반려";
      default: return s;
    }
  };

  return (
    <div className="space-y-4">
      {quotes.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">RFQ ID</th>
                  <th className="text-right p-3 font-medium">견적 금액</th>
                  <th className="text-center p-3 font-medium">소요일</th>
                  <th className="text-center p-3 font-medium">착수일</th>
                  <th className="text-center p-3 font-medium">제출일</th>
                  <th className="text-center p-3 font-medium">상태</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q: any) => (
                  <tr key={q.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3">#{q.rfqId}</td>
                    <td className="p-3 text-right font-medium">{q.totalAmount.toLocaleString()}원</td>
                    <td className="p-3 text-center">{q.estimatedDays ? `${q.estimatedDays}일` : "-"}</td>
                    <td className="p-3 text-center">{q.availableDate ? formatDate(q.availableDate) : "-"}</td>
                    <td className="p-3 text-center">{formatDate(q.createdAt)}</td>
                    <td className="p-3 text-center">
                      <Badge variant={q.status === "accepted" ? "default" : q.status === "rejected" ? "destructive" : "secondary"}>
                        {statusLabel(q.status)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Send className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">제출한 견적서가 없습니다</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function VendorWorkReports({ reports, quotes, vendorId, vendorName, queryClient, createReportMutation, toast }: any) {
  const [reportDialog, setReportDialog] = useState(false);
  const [reportForm, setReportForm] = useState({
    quoteId: "",
    title: "",
    description: "",
    completedDate: "",
  });

  async function handleSubmitReport(e: React.FormEvent) {
    e.preventDefault();
    const selectedQuote = quotes.find((q: any) => q.id === parseInt(reportForm.quoteId));
    if (!selectedQuote) return;

    await createReportMutation.mutateAsync({
      data: {
        rfqId: selectedQuote.rfqId,
        vendorId,
        vendorName,
        quoteId: selectedQuote.id,
        title: reportForm.title,
        description: reportForm.description || null,
        completedDate: reportForm.completedDate,
      },
    });
    queryClient.invalidateQueries({ queryKey: getListWorkReportsQueryKey() });
    toast({ title: "작업 보고서가 제출되었습니다" });
    setReportDialog(false);
    setReportForm({ quoteId: "", title: "", description: "", completedDate: "" });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setReportDialog(true)} disabled={quotes.length === 0}>
          <ClipboardCheck className="w-4 h-4 mr-1" />
          작업 보고
        </Button>
      </div>

      {reports.length > 0 ? (
        <div className="space-y-3">
          {reports.map((r: any) => (
            <Card key={r.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium text-sm">{r.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">완료일: {formatDate(r.completedDate)}</p>
                    {r.description && <p className="text-sm text-muted-foreground mt-1">{r.description}</p>}
                  </div>
                  <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>
                    {r.status === "approved" ? "승인" : r.status === "rejected" ? "반려" : "검수중"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardCheck className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">작업 보고가 없습니다</p>
          </CardContent>
        </Card>
      )}

      <ResponsiveDialog open={reportDialog} onOpenChange={setReportDialog}>
        <ResponsiveDialogContent className="max-w-lg">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>작업 완료 보고</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <form onSubmit={handleSubmitReport} className="space-y-4">
            <div>
              <Label>채택된 견적 선택</Label>
              <select
                className="w-full border rounded-md p-2 text-sm"
                value={reportForm.quoteId}
                onChange={(e) => setReportForm({ ...reportForm, quoteId: e.target.value })}
                required
              >
                <option value="">선택하세요</option>
                {quotes.map((q: any) => (
                  <option key={q.id} value={q.id}>
                    RFQ #{q.rfqId} - {q.totalAmount.toLocaleString()}원
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>보고서 제목</Label>
              <Input
                value={reportForm.title}
                onChange={(e) => setReportForm({ ...reportForm, title: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>작업 내용</Label>
              <Textarea
                value={reportForm.description}
                onChange={(e) => setReportForm({ ...reportForm, description: e.target.value })}
              />
            </div>
            <div>
              <Label>완료일</Label>
              <Input
                type="date"
                value={reportForm.completedDate}
                onChange={(e) => setReportForm({ ...reportForm, completedDate: e.target.value })}
                required
              />
            </div>
            <Button type="submit" className="w-full">보고서 제출</Button>
          </form>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}

function VendorSettlements({ settlements }: { settlements: any[] }) {
  return (
    <div className="space-y-4">
      {settlements.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">정산 항목</th>
                  <th className="text-right p-3 font-medium">금액</th>
                  <th className="text-center p-3 font-medium">상태</th>
                  <th className="text-center p-3 font-medium">예정일</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s: any) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3">{s.description || `정산 #${s.id}`}</td>
                    <td className="p-3 text-right font-medium">{s.paymentAmount.toLocaleString()}원</td>
                    <td className="p-3 text-center">
                      <Badge variant={s.status === "paid" ? "default" : "secondary"}>
                        {s.status === "paid" ? "지급완료" : "미지급"}
                      </Badge>
                    </td>
                    <td className="p-3 text-center">{s.paymentDate ? formatDate(s.paymentDate) : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Coins className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">정산 내역이 없습니다</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
