import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send } from "lucide-react";
import { formatDate } from "@/lib/utils";

export function VendorQuoteList({ quotes }: { quotes: any[] }) {
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
        <>
          <Card className="hidden desktop:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
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
              </div>
            </CardContent>
          </Card>
          <div className="desktop:hidden space-y-3">
            {quotes.map((q: any) => (
              <Card key={q.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm">RFQ #{q.rfqId}</p>
                    <Badge variant={q.status === "accepted" ? "default" : q.status === "rejected" ? "destructive" : "secondary"}>
                      {statusLabel(q.status)}
                    </Badge>
                  </div>
                  <p className="text-base font-semibold">{q.totalAmount.toLocaleString()}원</p>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>소요: {q.estimatedDays ? `${q.estimatedDays}일` : "-"}</span>
                    <span>착수: {q.availableDate ? formatDate(q.availableDate) : "-"}</span>
                    <span className="col-span-2">제출일: {formatDate(q.createdAt)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
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
