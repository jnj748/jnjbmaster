import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Coins } from "lucide-react";
import { formatDate } from "@/lib/utils";

export function VendorSettlements({ settlements }: { settlements: any[] }) {
  return (
    <div className="space-y-4">
      {settlements.length > 0 ? (
        <>
          <Card className="hidden desktop:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
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
              </div>
            </CardContent>
          </Card>
          <div className="desktop:hidden space-y-3">
            {settlements.map((s: any) => (
              <Card key={s.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm">{s.description || `정산 #${s.id}`}</p>
                    <Badge variant={s.status === "paid" ? "default" : "secondary"}>
                      {s.status === "paid" ? "지급완료" : "미지급"}
                    </Badge>
                  </div>
                  <p className="text-base font-semibold">{s.paymentAmount.toLocaleString()}원</p>
                  <p className="text-xs text-muted-foreground">
                    예정일: {s.paymentDate ? formatDate(s.paymentDate) : "-"}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
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
