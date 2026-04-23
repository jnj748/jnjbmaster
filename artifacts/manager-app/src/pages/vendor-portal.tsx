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
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
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
    </div>
  );
}
