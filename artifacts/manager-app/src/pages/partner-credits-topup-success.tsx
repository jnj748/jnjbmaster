import { useEffect, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { confirmCreditTopupOrder } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

// [Task #319] 토스 successUrl 콜백 — paymentKey/orderId/amount 를 query 로 받아
//   서버 confirm 호출. 멱등성: 동일 페이지 reload 에도 한 번만 confirm.
export default function PartnerCreditsTopupSuccess() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const calledRef = useRef(false);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [message, setMessage] = useState<string>("");
  const [credits, setCredits] = useState<number | null>(null);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    const params = new URLSearchParams(window.location.search);
    // Toss 도 orderId 쿼리를 같이 보내므로 우리 DB id 는 orderDbId 로 분리해서 받는다.
    const orderDbId = Number(params.get("orderDbId"));
    const paymentKey = params.get("paymentKey") ?? "";
    const amount = Number(params.get("amount"));
    if (!orderDbId || !paymentKey || !Number.isFinite(amount)) {
      setState("error");
      setMessage("결제 정보가 올바르지 않습니다.");
      return;
    }
    confirmCreditTopupOrder(orderDbId, { paymentKey, amount })
      .then((resp: { order?: { credits?: number } }) => {
        setState("ok");
        setCredits(resp.order?.credits ?? null);
        void queryClient.invalidateQueries();
      })
      .catch((err: any) => {
        setState("error");
        setMessage(err?.message ?? "결제 확정에 실패했습니다.");
      });
  }, [queryClient]);

  return (
    <div className="p-6 max-w-md mx-auto">
      <Card>
        <CardContent className="py-10 text-center space-y-4" data-testid="topup-success-result">
          {state === "loading" && (
            <>
              <Loader2 className="w-12 h-12 mx-auto text-muted-foreground animate-spin" />
              <h2 className="text-lg font-bold">결제 확인 중…</h2>
              <p className="text-sm text-muted-foreground">잠시만 기다려 주세요.</p>
            </>
          )}
          {state === "ok" && (
            <>
              <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
              <h2 className="text-xl font-bold">충전이 완료되었습니다</h2>
              {credits != null && (
                <p className="text-sm text-muted-foreground">
                  지갑에 <span className="font-semibold">{credits.toLocaleString()} 크레딧</span> 이 충전되었습니다.
                </p>
              )}
              <div className="flex gap-2 justify-center pt-2">
                <Button onClick={() => navigate("/me/credits")} data-testid="button-back-to-credits">
                  내 크레딧으로
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/">대시보드</Link>
                </Button>
              </div>
            </>
          )}
          {state === "error" && (
            <>
              <AlertCircle className="w-12 h-12 mx-auto text-rose-500" />
              <h2 className="text-xl font-bold">결제 확정 실패</h2>
              <p className="text-sm text-muted-foreground">{message}</p>
              <div className="flex gap-2 justify-center pt-2">
                <Button onClick={() => navigate("/me/credits")}>다시 시도</Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
