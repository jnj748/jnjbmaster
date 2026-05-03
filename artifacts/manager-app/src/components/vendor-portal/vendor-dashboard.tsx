import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle, Send } from "lucide-react";
import { formatDate } from "@/lib/utils";

// [Task #738] 파트너 포털 탭 — 작업 보고/정산 탭은 플랫폼 책임 영역에서 제외되어 제거.
export type PortalTab = "dashboard" | "rfqs" | "quotes" | "smart-quote";

export interface VendorDashboardProps {
  vendorName: string;
  openRfqCount: number;
  activeQuoteCount: number;
  acceptedQuoteCount: number;
  recentRfqs: any[];
  recentQuotes: any[];
  onNavigate: (tab: PortalTab) => void;
}

export function VendorDashboard({
  openRfqCount, activeQuoteCount, acceptedQuoteCount, recentRfqs, recentQuotes, onNavigate,
}: VendorDashboardProps) {
  return (
    <div className="space-y-6">
      {/* [Task #738] KPI 카드 — 작업보고 검수 대기·총 정산 카드는 제거. 파트너에게 의미 있는
          3개(대기중 견적요청 / 제출한 견적서 / 채택된 견적)만 남긴다. */}
      <div className="grid grid-cols-1 desktop:grid-cols-3 gap-4">
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
              <div className="p-2.5 rounded-lg bg-teal-100">
                <Send className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">제출한 견적서</p>
                <p className="text-2xl font-bold">{activeQuoteCount}</p>
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

        {/* [Task #738] "정산 요약" 섹션 제거 — 대신 최근 제출 견적 목록을 보여 준다. */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">최근 내 견적서</CardTitle>
          </CardHeader>
          <CardContent>
            {recentQuotes.length > 0 ? (
              <div className="space-y-2">
                {recentQuotes.map((q: any) => (
                  <div key={q.id} className="flex items-center justify-between p-2 rounded hover:bg-muted/50">
                    <div>
                      <p className="text-sm font-medium">RFQ #{q.rfqId}</p>
                      <p className="text-xs text-muted-foreground">
                        {typeof q.totalAmount === "number" ? `${q.totalAmount.toLocaleString()}원` : "-"}
                      </p>
                    </div>
                    <Badge
                      variant={
                        q.status === "accepted" ? "default" : q.status === "rejected" ? "destructive" : "secondary"
                      }
                    >
                      {q.status === "accepted" ? "채택" : q.status === "rejected" ? "반려" : "제출"}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">제출한 견적서가 없습니다</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
