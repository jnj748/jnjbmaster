import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListRfqs,
  useListQuotes,
  useCreateQuote,
  useListWorkReports,
  useCreateWorkReport,
  useListSettlements,
  useListVendors,
  getListQuotesQueryKey,
  getListWorkReportsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft,
  Briefcase,
  FileText,
  Send,
  ClipboardCheck,
  Coins,
  LayoutDashboard,
  Clock,
  CheckCircle,
  TrendingUp,
  LogIn,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

type PortalTab = "dashboard" | "rfqs" | "quotes" | "reports" | "settlements";

export default function VendorPortal() {
  const [, navigate] = useLocation();
  const base = import.meta.env.BASE_URL ?? "/";
  const [activeTab, setActiveTab] = useState<PortalTab>("dashboard");
  const [loggedInVendorId, setLoggedInVendorId] = useState<number | null>(null);
  const [loginSelect, setLoginSelect] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: vendors } = useListVendors({ type: "platform" });
  const { data: allRfqs } = useListRfqs(undefined, { query: { enabled: !!loggedInVendorId } });
  const { data: myQuotes } = useListQuotes(
    loggedInVendorId ? { vendorId: loggedInVendorId } : undefined,
    { query: { enabled: !!loggedInVendorId } }
  );
  const { data: myReports } = useListWorkReports(
    loggedInVendorId ? { vendorId: loggedInVendorId } : undefined,
    { query: { enabled: !!loggedInVendorId } }
  );
  const { data: mySettlements } = useListSettlements(
    loggedInVendorId ? { vendorId: loggedInVendorId } : undefined,
    { query: { enabled: !!loggedInVendorId } }
  );

  const createQuoteMutation = useCreateQuote();
  const createReportMutation = useCreateWorkReport();

  const loggedVendor = vendors?.find((v) => v.id === loggedInVendorId);

  const myRfqs = allRfqs?.filter((rfq: any) => {
    if (!rfq.vendorIds) return false;
    return rfq.vendorIds.split(",").includes(loggedInVendorId?.toString() || "");
  }) || [];

  function handleLogin() {
    if (!loginSelect) return;
    setLoggedInVendorId(parseInt(loginSelect));
    toast({ title: "로그인되었습니다" });
  }

  if (!loggedInVendorId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 flex flex-col">
        <header className="border-b bg-white px-6 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            돌아가기
          </Button>
          <h1 className="text-lg font-bold">파트너사 포털</h1>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md w-full">
            <CardContent className="py-10">
              <div className="text-center mb-6">
                <div className="p-4 rounded-2xl bg-chart-3/10 inline-block mb-4">
                  <LogIn className="w-10 h-10 text-chart-3" />
                </div>
                <h2 className="text-xl font-bold">업체 로그인</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  가입된 업체를 선택하여 로그인하세요
                </p>
              </div>
              <div className="space-y-4">
                <Select value={loginSelect} onValueChange={setLoginSelect}>
                  <SelectTrigger><SelectValue placeholder="업체 선택" /></SelectTrigger>
                  <SelectContent>
                    {vendors?.map((v) => (
                      <SelectItem key={v.id} value={v.id.toString()}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button className="w-full" onClick={handleLogin} disabled={!loginSelect}>
                  로그인
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
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
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-56 bg-slate-800 text-white flex flex-col fixed h-full z-30">
        <div className="p-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-chart-3" />
            <span className="font-bold text-sm">업체 포털</span>
          </div>
          <p className="text-xs text-slate-400 mt-1 truncate">{loggedVendor?.name}</p>
        </div>
        <nav className="flex-1 p-3 space-y-0.5">
          {[
            { key: "dashboard" as PortalTab, label: "대시보드", icon: LayoutDashboard },
            { key: "rfqs" as PortalTab, label: "견적 요청", icon: FileText },
            { key: "quotes" as PortalTab, label: "내 견적서", icon: Send },
            { key: "reports" as PortalTab, label: "작업 완료 보고", icon: ClipboardCheck },
            { key: "settlements" as PortalTab, label: "정산 현황", icon: Coins },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setActiveTab(item.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === item.key
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:text-white hover:bg-slate-700/50"
              }`}
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-700 space-y-2">
          <button
            onClick={() => { setLoggedInVendorId(null); setLoginSelect(""); setActiveTab("dashboard"); }}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors w-full"
          >
            <ArrowLeft className="w-3 h-3" />
            로그아웃
          </button>
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-white transition-colors w-full"
          >
            <ArrowLeft className="w-3 h-3" />
            포털 선택
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-56 p-6 max-w-[1200px]">
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
            vendorId={loggedInVendorId}
            vendorName={loggedVendor?.name || ""}
            myQuotes={myQuotes || []}
            queryClient={queryClient}
            createQuoteMutation={createQuoteMutation}
            toast={toast}
          />
        )}
        {activeTab === "quotes" && (
          <VendorQuoteList quotes={myQuotes || []} />
        )}
        {activeTab === "reports" && (
          <VendorWorkReports
            reports={myReports || []}
            quotes={myQuotes?.filter((q: any) => q.status === "accepted") || []}
            vendorId={loggedInVendorId}
            vendorName={loggedVendor?.name || ""}
            queryClient={queryClient}
            createReportMutation={createReportMutation}
            toast={toast}
          />
        )}
        {activeTab === "settlements" && (
          <VendorSettlements settlements={mySettlements || []} />
        )}
      </main>
    </div>
  );
}

function VendorDashboard({
  vendorName, openRfqCount, activeQuoteCount, acceptedQuoteCount,
  pendingReportCount, totalSettlement, paidSettlement, recentRfqs, recentQuotes, onNavigate,
}: any) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{vendorName} 대시보드</h1>
        <p className="text-muted-foreground text-sm mt-1">업체 활동 현황을 한눈에 확인하세요</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

function VendorRfqList({ rfqs, vendorId, vendorName, myQuotes, queryClient, createQuoteMutation, toast }: any) {
  const [quoteDialogRfq, setQuoteDialogRfq] = useState<any>(null);
  const [form, setForm] = useState({
    totalAmount: "",
    itemBreakdown: "",
    scope: "",
    estimatedDays: "",
    availableDate: "",
    notes: "",
  });

  function resetForm() {
    setForm({ totalAmount: "", itemBreakdown: "", scope: "", estimatedDays: "", availableDate: "", notes: "" });
  }

  async function handleSubmitQuote(e: React.FormEvent) {
    e.preventDefault();
    if (!quoteDialogRfq) return;

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">견적 요청</h1>
        <p className="text-muted-foreground text-sm mt-1">관리소장이 보낸 견적 요청을 확인하고 견적서를 제출하세요</p>
      </div>

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
                    </div>
                    <div className="flex gap-4 text-sm text-muted-foreground mt-2">
                      <span>건물: {rfq.buildingName}</span>
                      <span>마감: {formatDate(rfq.deadline)}</span>
                      {rfq.desiredDate && <span>희망일: {formatDate(rfq.desiredDate)}</span>}
                    </div>
                    {rfq.description && (
                      <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{rfq.description}</p>
                    )}
                  </div>
                  <div>
                    {rfq.status === "open" && !hasQuoteFor(rfq.id) ? (
                      <Button size="sm" onClick={() => { setQuoteDialogRfq(rfq); resetForm(); }}>
                        <Send className="w-3.5 h-3.5 mr-1" />
                        견적 제출
                      </Button>
                    ) : hasQuoteFor(rfq.id) ? (
                      <Badge variant="outline" className="text-green-600 border-green-200">제출 완료</Badge>
                    ) : null}
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

      <Dialog open={!!quoteDialogRfq} onOpenChange={(o) => { if (!o) { setQuoteDialogRfq(null); resetForm(); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>견적서 제출</DialogTitle>
          </DialogHeader>
          {quoteDialogRfq && (
            <div>
              <div className="p-3 bg-muted rounded-lg text-sm mb-4 space-y-1">
                <p><strong>요청:</strong> {quoteDialogRfq.title}</p>
                <p><strong>건물:</strong> {quoteDialogRfq.buildingName}</p>
                <p><strong>마감:</strong> {formatDate(quoteDialogRfq.deadline)}</p>
              </div>
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
                <Button type="submit" className="w-full">견적서 제출</Button>
              </form>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">내 견적서</h1>
        <p className="text-muted-foreground text-sm mt-1">제출한 견적서 현황을 확인하세요</p>
      </div>

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
                    <td className="p-3 text-center">{new Date(q.createdAt).toLocaleDateString("ko-KR")}</td>
                    <td className="p-3 text-center">
                      <Badge variant={
                        q.status === "accepted" ? "default" :
                        q.status === "rejected" ? "destructive" : "secondary"
                      }>
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

function VendorWorkReports({
  reports, quotes, vendorId, vendorName, queryClient, createReportMutation, toast,
}: any) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    quoteId: "",
    rfqId: "",
    title: "",
    description: "",
    completionDate: "",
    photoUrls: "",
  });

  function resetForm() {
    setForm({ quoteId: "", rfqId: "", title: "", description: "", completionDate: "", photoUrls: "" });
  }

  function handleQuoteSelect(quoteId: string) {
    const q = quotes.find((quote: any) => quote.id.toString() === quoteId);
    setForm({
      ...form,
      quoteId,
      rfqId: q?.rfqId?.toString() || "",
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await createReportMutation.mutateAsync({
      data: {
        rfqId: parseInt(form.rfqId),
        quoteId: parseInt(form.quoteId),
        vendorId,
        vendorName,
        title: form.title,
        description: form.description || null,
        completionDate: form.completionDate,
        photoUrls: form.photoUrls || null,
      },
    });
    queryClient.invalidateQueries({ queryKey: getListWorkReportsQueryKey() });
    toast({ title: "작업 완료 보고서가 제출되었습니다" });
    setDialogOpen(false);
    resetForm();
  }

  const statusLabel = (s: string) => {
    switch (s) {
      case "submitted": return "검수 대기";
      case "approved": return "승인";
      case "rejected": return "반려";
      default: return s;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">작업 완료 보고</h1>
          <p className="text-muted-foreground text-sm mt-1">작업 완료 후 보고서를 제출하세요</p>
        </div>
        {quotes.length > 0 && (
          <Button onClick={() => { setDialogOpen(true); resetForm(); }}>
            <ClipboardCheck className="w-4 h-4 mr-2" />
            보고서 작성
          </Button>
        )}
      </div>

      {reports.length > 0 ? (
        <div className="space-y-3">
          {reports.map((r: any) => (
            <Card key={r.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <ClipboardCheck className="w-4 h-4 text-primary" />
                      <h3 className="font-medium">{r.title}</h3>
                      <Badge variant={
                        r.status === "approved" ? "default" :
                        r.status === "rejected" ? "destructive" : "secondary"
                      }>
                        {statusLabel(r.status)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      완료일: {formatDate(r.completionDate)} | 제출일: {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                    </p>
                    {r.description && (
                      <p className="text-sm text-muted-foreground mt-1">{r.description}</p>
                    )}
                    {r.reviewNotes && (
                      <p className="text-sm mt-2 p-2 bg-muted rounded">
                        검수 의견: {r.reviewNotes}
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardCheck className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">작업 완료 보고가 없습니다</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>작업 완료 보고서</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>채택된 견적 선택</Label>
              <Select value={form.quoteId} onValueChange={handleQuoteSelect}>
                <SelectTrigger><SelectValue placeholder="견적 선택" /></SelectTrigger>
                <SelectContent>
                  {quotes.map((q: any) => (
                    <SelectItem key={q.id} value={q.id.toString()}>
                      RFQ #{q.rfqId} - {q.totalAmount.toLocaleString()}원
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>보고서 제목</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>작업 내용</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="수행한 작업 내용을 상세히 기재하세요"
              />
            </div>
            <div>
              <Label>작업 완료일</Label>
              <Input
                type="date"
                value={form.completionDate}
                onChange={(e) => setForm({ ...form, completionDate: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>사진 URL (쉼표로 구분)</Label>
              <Textarea
                value={form.photoUrls}
                onChange={(e) => setForm({ ...form, photoUrls: e.target.value })}
                placeholder="현장 사진 URL을 입력하세요 (여러 장일 경우 쉼표로 구분)"
              />
            </div>
            <Button type="submit" className="w-full">보고서 제출</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VendorSettlements({ settlements }: { settlements: any[] }) {
  const total = settlements.reduce((s: number, st: any) => s + st.paymentAmount, 0);
  const paid = settlements.filter((s: any) => s.status === "paid").reduce((sum: number, s: any) => sum + s.paymentAmount, 0);
  const pending = total - paid;

  const statusLabel = (s: string) => {
    switch (s) {
      case "pending": return "대기";
      case "confirmed": return "확정";
      case "paid": return "지급완료";
      case "cancelled": return "취소";
      default: return s;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">정산 현황</h1>
        <p className="text-muted-foreground text-sm mt-1">계약 금액, 수수료, 지급 현황을 확인하세요</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-blue-100">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">총 정산</p>
                <p className="text-xl font-bold">{total.toLocaleString()}원</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-green-100">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">지급 완료</p>
                <p className="text-xl font-bold text-green-600">{paid.toLocaleString()}원</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-amber-100">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">미지급</p>
                <p className="text-xl font-bold text-amber-600">{pending.toLocaleString()}원</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {settlements.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">RFQ</th>
                  <th className="text-right p-3 font-medium">계약 금액</th>
                  <th className="text-right p-3 font-medium">수수료율</th>
                  <th className="text-right p-3 font-medium">수수료</th>
                  <th className="text-right p-3 font-medium">지급 금액</th>
                  <th className="text-center p-3 font-medium">상태</th>
                  <th className="text-center p-3 font-medium">지급일</th>
                </tr>
              </thead>
              <tbody>
                {settlements.map((s: any) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3">#{s.rfqId}</td>
                    <td className="p-3 text-right">{s.contractAmount.toLocaleString()}원</td>
                    <td className="p-3 text-right">{s.feeRate}%</td>
                    <td className="p-3 text-right">{s.feeAmount.toLocaleString()}원</td>
                    <td className="p-3 text-right font-medium">{s.paymentAmount.toLocaleString()}원</td>
                    <td className="p-3 text-center">
                      <Badge variant={
                        s.status === "paid" ? "default" :
                        s.status === "confirmed" ? "secondary" :
                        s.status === "cancelled" ? "destructive" : "outline"
                      }>
                        {statusLabel(s.status)}
                      </Badge>
                    </td>
                    <td className="p-3 text-center">{s.paidAt ? formatDate(s.paidAt) : "-"}</td>
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
