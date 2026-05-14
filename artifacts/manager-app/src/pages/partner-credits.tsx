import { useState } from "react";
// [임시-결제창전환] 위젯 방식 복원 시 useEffect, useRef 다시 import.
// import { useEffect, useRef } from "react";
import {
  useGetCreditWallet,
  useListCreditLedger,
  useListCreditTopupPackages,
  useListMyCreditTopupOrders,
  createCreditTopupOrder,
  failCreditTopupOrder,
  type CreditTopupPackage,
  type CreditTopupOrder,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { ROLE_LABELS } from "@workspace/shared/role-labels";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import {
  Coins,
  Wallet,
  Gift,
  AlertCircle,
  Plus,
  Receipt,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
// [임시-결제창전환] 토스 실계약 심사 중 — 위젯(결제위젯) 대신 requestPayment(일반 결제창) 사용.
//   실계약 완료 후 위젯 방식으로 복원 예정. TossPaymentsWidgets 타입은 위젯 복원 시 다시 import.
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";
// import { loadTossPayments, type TossPaymentsWidgets } from "@tosspayments/tosspayments-sdk";
import { tossMethodLabel } from "@/lib/toss-method-label";

// TODO: 토스 실계약 완료 후 requestPayment → 위젯(widgets) 방식으로 복원 필요
//   위젯 관련 코드는 주석으로 보존됨 (widgetsRef / widgetsReady / useEffect 2개 /
//   #topup-payment-method / #topup-agreement / disabled 의 !widgetsReady 가드).
//
// [Task #319] 파트너 — 크레딧 충전 결제 (TossPayments).
//   기존 패키지 5종 하드코딩 + handleRequestTopup placeholder 를 제거하고,
//   서버 패키지 카탈로그(/credits/topup/packages) + 토스 결제창을 직접 호출한다.
//   결제 콜백은 success / fail 라우트(아래 별도 파일)에서 confirm/fail API 를 호출.

import { ledgerKindLabel } from "@/lib/credit-ledger-labels";

const orderStatusLabel = (s: string): { label: string; tone: string } => {
  switch (s) {
    case "paid": return { label: "결제완료", tone: "bg-emerald-100 text-emerald-700" };
    case "pending": return { label: "결제중", tone: "bg-amber-100 text-amber-700" };
    case "failed": return { label: "실패", tone: "bg-rose-100 text-rose-700" };
    case "cancelled": return { label: "취소", tone: "bg-slate-100 text-slate-700" };
    default: return { label: s, tone: "bg-slate-100 text-slate-700" };
  }
};

export default function PartnerCredits() {
  const { user } = useAuth();
  const vendorId = user?.vendorId ?? null;
  const [topupOpen, setTopupOpen] = useState(false);
  const [selectedPkgId, setSelectedPkgId] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: wallet, isLoading: walletLoading } = useGetCreditWallet(
    vendorId ? { vendorId } : undefined,
    { query: { enabled: !!vendorId } },
  );
  const { data: ledger, isLoading: ledgerLoading } = useListCreditLedger(
    vendorId ? { vendorId } : undefined,
    { query: { enabled: !!vendorId } },
  );
  const { data: pkgResp, isLoading: pkgLoading } = useListCreditTopupPackages();
  const { data: orders } = useListMyCreditTopupOrders({
    query: { enabled: !!vendorId },
  });

  // [임시-결제창전환] 토스 실계약 심사 중 — 위젯(widgets) 인스턴스 / 렌더 useEffect 2개를
  //   주석 보존. 실계약 완료 후 위젯 방식으로 복원 예정.
  //
  // [Task #760] 토스 통합결제창(widgets) — 카드/카카오페이/네이버페이/토스페이/페이코/계좌이체
  //   등 토스가 제공하는 결제수단을 한 화면에서 선택할 수 있도록 widgets 방식으로 전환한다.
  //   기존 `payment.requestPayment({ method: "CARD", ... })`는 카드+간편결제 통합창만 노출하므로
  //   계좌이체 등을 함께 보여주려면 widgets 가 필요하다.
  // const widgetsRef = useRef<TossPaymentsWidgets | null>(null);
  // const [widgetsReady, setWidgetsReady] = useState(false);
  //
  // // 다이얼로그 오픈 + clientKey 가 준비되면 widgets 인스턴스 1회 생성.
  // useEffect(() => {
  //   const clientKey = pkgResp?.tossClientKey;
  //   if (!topupOpen || !clientKey || !vendorId) return;
  //   let cancelled = false;
  //   (async () => {
  //     try {
  //       const tp = await loadTossPayments(clientKey);
  //       if (cancelled) return;
  //       const widgets = tp.widgets({ customerKey: `vendor_${vendorId}` });
  //       widgetsRef.current = widgets;
  //       setWidgetsReady(true);
  //     } catch (e) {
  //       widgetsRef.current = null;
  //       setWidgetsReady(false);
  //     }
  //   })();
  //   return () => {
  //     cancelled = true;
  //     widgetsRef.current = null;
  //     setWidgetsReady(false);
  //   };
  // }, [topupOpen, pkgResp?.tossClientKey, vendorId]);
  //
  // // 패키지가 선택되면 결제수단/약관 위젯을 렌더링 + setAmount.
  // useEffect(() => {
  //   const widgets = widgetsRef.current;
  //   if (!widgets || !widgetsReady || !selectedPkgId) return;
  //   const pkg = (pkgResp?.packages ?? []).find((p) => p.id === selectedPkgId);
  //   if (!pkg) return;
  //   let cancelled = false;
  //   let methodWidget: { destroy?: () => void } | null = null;
  //   let agreementWidget: { destroy?: () => void } | null = null;
  //   (async () => {
  //     try {
  //       await widgets.setAmount({ currency: "KRW", value: pkg.priceKrw });
  //       if (cancelled) return;
  //       methodWidget = await widgets.renderPaymentMethods({
  //         selector: "#topup-payment-method",
  //         variantKey: "DEFAULT",
  //       });
  //       if (cancelled) { methodWidget?.destroy?.(); return; }
  //       agreementWidget = await widgets.renderAgreement({
  //         selector: "#topup-agreement",
  //         variantKey: "AGREEMENT",
  //       });
  //       if (cancelled) { agreementWidget?.destroy?.(); }
  //     } catch {}
  //   })();
  //   return () => {
  //     cancelled = true;
  //     methodWidget?.destroy?.();
  //     agreementWidget?.destroy?.();
  //   };
  // }, [selectedPkgId, widgetsReady, pkgResp?.packages]);

  if (!vendorId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <h2 className="text-lg font-bold mb-2">업체 연결 필요</h2>
            <p className="text-muted-foreground text-sm">
              계정에 연결된 업체가 없습니다. {ROLE_LABELS.platform_admin}에게 문의해 주세요.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const packages: CreditTopupPackage[] = (pkgResp?.packages ?? []) as CreditTopupPackage[];

  async function handlePay() {
    if (!selectedPkgId || !pkgResp) return;
    const pkg = packages.find((p) => p.id === selectedPkgId);
    if (!pkg) return;
    const clientKey = pkgResp.tossClientKey;
    if (!clientKey) {
      toast({ title: "결제 설정 오류", description: "토스 클라이언트 키가 비어 있습니다. 본사에 문의해 주세요.", variant: "destructive" });
      return;
    }
    setPaying(true);
    let createdOrderDbId: number | null = null;
    try {
      // 1) 서버에 pending 주문 생성 → tossOrderId 수신.
      const created = await createCreditTopupOrder({ packageId: pkg.id });
      createdOrderDbId = created.order.id;

      // [임시-결제창전환] 2) 토스 일반 결제창(requestPayment) 호출.
      //   실계약 심사 중에는 위젯이 테스트 상점에서 동작하지 않으므로 일반 결제창으로 임시 운영.
      //   카드+토스가 활성화한 간편결제(카카오/네이버/토스페이/페이코) 가 한 번에 노출되며,
      //   USER_CANCEL/PAY_PROCESS_ABORTED 등은 catch 분기에서 처리. 실계약 완료 후 widgets 복원 예정.
      const tossPayments = await loadTossPayments(clientKey);
      const payment = tossPayments.payment({ customerKey: `vendor_${vendorId}` });
      const baseUrl = window.location.origin + (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: pkg.priceKrw },
        orderId: created.order.tossOrderId,
        orderName: `크레딧 ${pkg.credits.toLocaleString()}C (${pkg.name})`,
        successUrl: `${baseUrl}/me/credits/topup/success?orderDbId=${created.order.id}`,
        failUrl: `${baseUrl}/me/credits/topup/fail?orderDbId=${created.order.id}`,
        customerName: user?.name ?? undefined,
        customerEmail: user?.email ?? undefined,
        card: {
          useEscrow: false,
          flowMode: "DEFAULT",
          useCardPoint: false,
          useAppCardOnly: false,
        },
      });
      // requestPayment 는 페이지 리다이렉트로 successUrl/failUrl 에 진입한다.
    } catch (err: any) {
      // 사용자가 닫거나 토스 측에서 실패 시 catch 로 떨어진다 (USER_CANCEL / PAY_PROCESS_CANCELED 등).
      const message = err?.message ?? "결제창을 열 수 없습니다";
      const code = err?.code ?? "";
      const isCancel =
        code === "USER_CANCEL" ||
        code === "PAY_PROCESS_CANCELED" ||
        message.includes("PAY_PROCESS_CANCELED");
      if (!isCancel) {
        toast({ title: "결제 오류", description: message, variant: "destructive" });
      }
      setPaying(false);
      // 동일 패키지 재시도 가능하도록 다이얼로그는 유지.
      void queryClient.invalidateQueries({ queryKey: ["/credits/topup/orders"] });
      // 사용자 취소시에도 pending order는 fail/cancelled 로 마킹.
      if (createdOrderDbId) {
        await failCreditTopupOrder(createdOrderDbId, { cancelled: isCancel, reason: code });
      }
    }
  }

  const recentOrders: CreditTopupOrder[] = (orders ?? []) as CreditTopupOrder[];

  return (
    <div className="space-y-6" data-testid="page-partner-credits">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Coins className="w-5 h-5 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold">크레딧</h1>
            <p className="text-muted-foreground text-sm">
              견적 제출에 사용할 크레딧 잔액과 사용 내역을 확인하고 충전합니다.
            </p>
          </div>
        </div>
        <Button onClick={() => setTopupOpen(true)} data-testid="button-open-topup">
          <Plus className="w-4 h-4 mr-1.5" />
          크레딧 충전
        </Button>
      </div>

      {walletLoading ? (
        <Skeleton className="h-28" />
      ) : wallet ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">크레딧 잔액</p>
                  <p className="text-3xl font-bold mt-1" data-testid="text-credit-balance">
                    {wallet.balance.toLocaleString()} C
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">입찰에 사용 가능한 크레딧</p>
                </div>
                <div className="p-2.5 rounded-lg bg-indigo-500">
                  <Wallet className="w-5 h-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">활동 포인트</p>
                  <p className="text-3xl font-bold mt-1">
                    {wallet.pointsBalance.toLocaleString()} P
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    리베이트 및 결제 보너스
                  </p>
                </div>
                <div className="p-2.5 rounded-lg bg-pink-500">
                  <Gift className="w-5 h-5 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {recentOrders.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Receipt className="w-4 h-4 text-blue-500" />
              최근 충전 결제 내역
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentOrders.slice(0, 10).map((o) => {
              const tone = orderStatusLabel(o.status);
              return (
                <div
                  key={o.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border text-sm"
                  data-testid={`topup-order-${o.id}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge className={`text-[11px] ${tone.tone}`}>{tone.label}</Badge>
                      <p className="font-medium truncate">
                        {o.packageName} · {o.credits.toLocaleString()}C
                        {o.bonusPoints > 0 ? ` + ${o.bonusPoints}P` : ""}
                      </p>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(o.createdAt).toLocaleString("ko-KR")}
                      {o.tossMethod ? ` · ${tossMethodLabel(o.tossMethod)}` : ""}
                      {o.failReason ? ` · ${o.failReason}` : ""}
                    </p>
                  </div>
                  <p className="font-semibold shrink-0">
                    {o.amountKrw.toLocaleString()}원
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="w-4 h-4 text-indigo-500" />
            크레딧 사용·환불·충전 이력
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {ledgerLoading ? (
            <Skeleton className="h-40" />
          ) : ledger && ledger.length > 0 ? (
            ledger.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border text-sm"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[11px]">
                      {ledgerKindLabel(entry.kind)}
                    </Badge>
                    <p className="font-medium truncate">
                      {entry.notes ?? entry.source ?? "-"}
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(entry.createdAt).toLocaleString("ko-KR")}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className={`font-semibold ${
                      entry.amount < 0 ? "text-rose-600" : "text-emerald-600"
                    }`}
                  >
                    {entry.amount > 0 ? "+" : ""}
                    {entry.amount} C
                  </p>
                  {entry.pointsAmount !== 0 && (
                    <p className="text-xs text-pink-600">
                      {entry.pointsAmount > 0 ? "+" : ""}
                      {entry.pointsAmount} P
                    </p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              사용 내역이 없습니다
            </p>
          )}
        </CardContent>
      </Card>

      <ResponsiveDialog
        open={topupOpen}
        onOpenChange={(o) => {
          if (paying) return;
          setTopupOpen(o);
          if (!o) setSelectedPkgId(null);
        }}
      >
        <ResponsiveDialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>크레딧 충전 패키지 선택</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              {/* [임시-결제창전환] 토스 실계약 심사 완료 후 위젯 방식으로 복원 시 아래 문구 원복. */}
              결제 완료 즉시 크레딧이 지갑에 충전됩니다. 카드 결제 및 토스가 제공하는 간편결제(카카오페이·네이버페이·토스페이·페이코)를 사용할 수 있습니다.
            </p>
            <div className="space-y-2">
              {pkgLoading ? (
                <Skeleton className="h-32" />
              ) : packages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  현재 활성화된 충전 패키지가 없습니다.
                </p>
              ) : (
                packages.map((p) => {
                  const active = selectedPkgId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPkgId(p.id)}
                      data-testid={`topup-package-${p.id}`}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        active
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-base">
                              {p.name} · {p.credits.toLocaleString()} C
                            </span>
                            {p.bonusPoints > 0 ? (
                              <Badge variant="outline" className="text-pink-600 border-pink-200">
                                + {p.bonusPoints} P
                              </Badge>
                            ) : null}
                            {p.highlight && (
                              <Badge className="bg-amber-500 hover:bg-amber-600">
                                {p.highlight}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            1C = {Math.round(p.priceKrw / p.credits)}원
                          </p>
                        </div>
                        <p className="font-bold text-lg">
                          {p.priceKrw.toLocaleString()}원
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            {/* [임시-결제창전환] 위젯 컨테이너(#topup-payment-method, #topup-agreement) 보존.
                위젯 방식 복원 시 아래 주석 해제 + Button disabled 에 !widgetsReady 재추가. */}
            {/* [Task #760] 토스 통합결제창 위젯 — 패키지를 선택하면 결제수단/약관이 렌더된다.
            {selectedPkgId ? (
              <div className="space-y-2">
                <div id="topup-payment-method" data-testid="topup-payment-method" />
                <div id="topup-agreement" data-testid="topup-agreement" />
              </div>
            ) : null}
            */}
            <Button
              className="w-full"
              onClick={handlePay}
              disabled={!selectedPkgId || paying}
              data-testid="button-request-topup"
            >
              {paying ? "결제 진행 중…" : "결제하기"}
            </Button>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}
