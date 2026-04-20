import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, CheckCircle, Clock, TrendingUp } from "lucide-react";
import { formatDate } from "@/lib/utils";

export type PortalTab = "dashboard" | "rfqs" | "quotes" | "reports" | "settlements";

export interface VendorDashboardProps {
  vendorName: string;
  openRfqCount: number;
  activeQuoteCount: number;
  acceptedQuoteCount: number;
  pendingReportCount: number;
  totalSettlement: number;
  paidSettlement: number;
  recentRfqs: any[];
  recentQuotes: any[];
  onNavigate: (tab: PortalTab) => void;
}

export function VendorDashboard({
  openRfqCount, acceptedQuoteCount,
  pendingReportCount, totalSettlement, paidSettlement, recentRfqs, onNavigate,
}: VendorDashboardProps) {
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
