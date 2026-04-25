import { useState, useEffect, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import {
  useListRfqs,
  useListQuotes,
  useCreateQuote,
  useListWorkReports,
  useCreateWorkReport,
  useListSettlements,
  useListVendors,
  useListContracts,
  useAgreeContractAsPartner,
  getListContractsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { ROLE_LABELS } from "@workspace/shared/role-labels";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Briefcase,
  FileText,
  Send,
  ClipboardCheck,
  Coins,
  LayoutDashboard,
  AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { VendorDashboard, type PortalTab } from "@/components/vendor-portal/vendor-dashboard";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2 } from "lucide-react";

const VendorRfqList = lazy(() => import("@/components/vendor-portal/vendor-rfq-list").then((m) => ({ default: m.VendorRfqList })));
const VendorQuoteList = lazy(() => import("@/components/vendor-portal/vendor-quote-list").then((m) => ({ default: m.VendorQuoteList })));
const VendorWorkReports = lazy(() => import("@/components/vendor-portal/vendor-work-reports").then((m) => ({ default: m.VendorWorkReports })));
const VendorSettlements = lazy(() => import("@/components/vendor-portal/vendor-settlements").then((m) => ({ default: m.VendorSettlements })));

const TabFallback = () => <Skeleton className="h-64" />;

export default function VendorPortal() {
  const { user, token } = useAuth();
  // [Task #290] 사이드바·하단 네비에서 ?tab= 쿼리로 진입 시 해당 탭을 초기 선택한다.
  const [location] = useLocation();
  const initialTab: PortalTab = (() => {
    if (typeof window === "undefined") return "dashboard";
    const t = new URLSearchParams(window.location.search).get("tab") as PortalTab | null;
    const valid: PortalTab[] = ["dashboard", "rfqs", "quotes", "reports", "settlements"];
    return t && valid.includes(t) ? t : "dashboard";
  })();
  const [activeTab, setActiveTab] = useState<PortalTab>(initialTab);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("tab") as PortalTab | null;
    const valid: PortalTab[] = ["dashboard", "rfqs", "quotes", "reports", "settlements"];
    if (t && valid.includes(t)) setActiveTab(t);
  }, [location]);
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

  // [Task #335] 파트너 계약 동의 흐름:
  //  1) /vendor-portal?openContract={id} 딥링크로 진입 → quotes 탭 + 동의 다이얼로그
  //  2) "계약 내용에 동의" 클릭 → POST /contracts/:id/agree → 매니저에게 인앱 알림.
  const { data: myContracts } = useListContracts(
    vendorId ? { vendorId } : undefined,
    { query: { enabled: !!vendorId } },
  );
  const [openContractId, setOpenContractId] = useState<number | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const c = url.searchParams.get("openContract");
    if (c) {
      const id = Number(c);
      if (!Number.isNaN(id)) {
        setOpenContractId(id);
        setActiveTab("quotes");
      }
      url.searchParams.delete("openContract");
      window.history.replaceState({}, "", url.toString());
    }
  }, [location]);
  const openContract = (myContracts ?? []).find((x) => x.id === openContractId) ?? null;
  const agreeMutation = useAgreeContractAsPartner();
  async function handleAgree() {
    if (!openContractId) return;
    try {
      await agreeMutation.mutateAsync({ id: openContractId });
      toast({ title: "계약 내용에 동의했습니다", description: `${ROLE_LABELS.hq_executive} 결재 후 계약이 활성화됩니다.` });
      queryClient.invalidateQueries({ queryKey: getListContractsQueryKey(vendorId ? { vendorId } : undefined) });
      setOpenContractId(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "잠시 후 다시 시도해주세요.";
      toast({ title: "동의 처리 실패", description: msg, variant: "destructive" });
    }
  }

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
        <Suspense fallback={<TabFallback />}>
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
        </Suspense>
      )}
      {activeTab === "quotes" && (
        <Suspense fallback={<TabFallback />}>
          <VendorQuoteList quotes={myQuotes || []} />
        </Suspense>
      )}
      {activeTab === "reports" && (
        <Suspense fallback={<TabFallback />}>
          <VendorWorkReports
            reports={myReports || []}
            quotes={myQuotes?.filter((q: any) => q.status === "accepted") || []}
            vendorId={vendorId}
            vendorName={loggedVendor?.name || ""}
            queryClient={queryClient}
            createReportMutation={createReportMutation}
            toast={toast}
          />
        </Suspense>
      )}
      {activeTab === "settlements" && (
        <Suspense fallback={<TabFallback />}>
          <VendorSettlements settlements={mySettlements || []} />
        </Suspense>
      )}

      {/* [Task #335] 파트너 계약 동의 다이얼로그. openContractId 가 설정되면 열린다. */}
      <ResponsiveDialog open={openContractId !== null} onOpenChange={(o) => { if (!o) setOpenContractId(null); }}>
        <ResponsiveDialogContent className="max-w-lg">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>계약 내용 확인 및 동의</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              관리단과 직접 체결되는 계약입니다. 계약 내용을 확인하고 동의해주세요.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          {!openContract ? (
            <Skeleton className="h-32" />
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-semibold">{openContract.title}</span>
                <Badge variant="outline">{openContract.category}</Badge>
              </div>
              {openContract.buildingName && (
                <p className="text-muted-foreground">건물: {openContract.buildingName}</p>
              )}
              {openContract.contractAmount != null && (
                <p>계약금액: {Math.round(openContract.contractAmount).toLocaleString()}원</p>
              )}
              {openContract.notes && (
                <p className="text-xs text-muted-foreground bg-muted/40 p-2 rounded">{openContract.notes}</p>
              )}

              {/* [Task #335] 매니저 contracts.tsx 와 동일한 5단계 트래커.
                  파트너도 자기 계약의 현재 단계를 동일하게 인식하도록 노출한다. */}
              <div className="border-t pt-3">
                <p className="text-xs font-medium mb-2 text-muted-foreground">진행 단계</p>
                <ol className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {(() => {
                    const partnerAgreed = !!openContract.partnerAgreedAt;
                    const hqApproved = openContract.status === "active" || openContract.status === "terminated";
                    const activated = openContract.status === "active";
                    const stages: Array<{ key: string; label: string; done: boolean }> = [
                      { key: "quote_received", label: "견적 도착", done: true },
                      { key: "quote_accepted", label: "견적 수락", done: true },
                      { key: "partner_agreed", label: "파트너 동의", done: partnerAgreed },
                      { key: "hq_approved", label: `${ROLE_LABELS.hq_executive} 결재`, done: hqApproved },
                      { key: "activated", label: "계약 활성화", done: activated },
                    ];
                    return stages.map((s, i) => (
                      <li key={s.key} className="flex items-center gap-1.5">
                        <span
                          className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold ${
                            s.done ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {i + 1}
                        </span>
                        <span className={s.done ? "font-medium" : "text-muted-foreground"}>{s.label}</span>
                        {i < 4 && <span className="text-muted-foreground">→</span>}
                      </li>
                    ));
                  })()}
                </ol>
              </div>

              {openContract.partnerAgreedAt ? (
                <div className="flex items-center gap-2 text-emerald-600">
                  <CheckCircle2 className="w-4 h-4" />
                  이미 동의 완료한 계약입니다.
                </div>
              ) : (
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={() => setOpenContractId(null)}>닫기</Button>
                  <Button onClick={handleAgree} disabled={agreeMutation.isPending}>
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    {agreeMutation.isPending ? "처리 중..." : "계약 내용에 동의"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}
