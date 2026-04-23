import { useEffect, useRef } from "react";
import { useLocation, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { XCircle } from "lucide-react";
import { failCreditTopupOrder } from "@workspace/api-client-react";

// [Task #319] 토스 failUrl 콜백 — 서버 주문을 failed/cancelled 로 표시.
export default function PartnerCreditsTopupFail() {
  const [, navigate] = useLocation();
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    const params = new URLSearchParams(window.location.search);
    // Toss 도 orderId 쿼리를 같이 보내므로 우리 DB id 는 orderDbId 로 분리해서 받는다.
    const orderDbId = Number(params.get("orderDbId"));
    const code = params.get("code") ?? "";
    const message = params.get("message") ?? "";
    if (orderDbId) {
      void failCreditTopupOrder(orderDbId, {
        cancelled: code === "PAY_PROCESS_CANCELED" || code === "USER_CANCEL",
        reason: message || code || undefined,
      }).catch(() => {/* ignore */});
    }
  }, []);

  const params = new URLSearchParams(window.location.search);
  const message = params.get("message") ?? "결제가 취소되었거나 실패했습니다.";

  return (
    <div className="p-6 max-w-md mx-auto">
      <Card>
        <CardContent className="py-10 text-center space-y-4" data-testid="topup-fail-result">
          <XCircle className="w-12 h-12 mx-auto text-rose-500" />
          <h2 className="text-xl font-bold">결제가 완료되지 않았습니다</h2>
          <p className="text-sm text-muted-foreground">{message}</p>
          <div className="flex gap-2 justify-center pt-2">
            <Button onClick={() => navigate("/me/credits")} data-testid="button-back-to-credits">
              다시 시도
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">대시보드</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
