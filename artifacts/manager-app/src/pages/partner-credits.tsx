import { useState } from "react";
import {
  useGetCreditWallet,
  useListCreditLedger,
} from "@workspace/api-client-react";
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
  Info,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";

// [Task #290] 파트너 전용 — 잔액·포인트·이력 + 크레딧 충전 신청 진입점.
//   실 PG 결제는 Task #68 에서 채워질 예정으로, 이 페이지는 패키지 선택 UI 골격까지만 제공한다.
//   기존 플랫폼관리자용 /platform/credits (VendorCreditsPanel)는 건드리지 않는다.

interface TopupPackage {
  id: string;
  credits: number;
  price: number;
  bonusPoints?: number;
  highlight?: string;
}

const TOPUP_PACKAGES: TopupPackage[] = [
  { id: "starter", credits: 100, price: 10_000 },
  { id: "basic", credits: 300, price: 30_000, bonusPoints: 10 },
  { id: "standard", credits: 500, price: 50_000, bonusPoints: 30, highlight: "인기" },
  { id: "pro", credits: 1000, price: 95_000, bonusPoints: 100, highlight: "추천" },
  { id: "premium", credits: 3000, price: 270_000, bonusPoints: 500 },
];

const ledgerKindLabel = (k: string): string => {
  switch (k) {
    case "topup": return "충전";
    case "bonus": return "보너스";
    case "deduct": return "차감";
    case "refund": return "환불";
    case "expire": return "만료";
    case "adjust": return "조정";
    default: return k;
  }
};

export default function PartnerCredits() {
  const { user } = useAuth();
  const vendorId = user?.vendorId ?? null;
  const [topupOpen, setTopupOpen] = useState(false);
  const [selectedPkg, setSelectedPkg] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: wallet, isLoading: walletLoading } = useGetCreditWallet(
    vendorId ? { vendorId } : undefined,
    { query: { enabled: !!vendorId } },
  );
  const { data: ledger, isLoading: ledgerLoading } = useListCreditLedger(
    vendorId ? { vendorId, limit: 50 } : undefined,
    { query: { enabled: !!vendorId } },
  );

  if (!vendorId) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <h2 className="text-lg font-bold mb-2">업체 연결 필요</h2>
            <p className="text-muted-foreground text-sm">
              계정에 연결된 업체가 없습니다. 본사 관리자에게 문의해 주세요.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  function handleRequestTopup() {
    if (!selectedPkg) {
      toast({ title: "충전 패키지를 선택해 주세요", variant: "destructive" });
      return;
    }
    // [Task #290 / Task #68] 실 PG 결제 호출 자리.
    //   현재는 진입점만 제공하고, 신청 의사만 안내한다.
    toast({
      title: "온라인 결제 준비 중입니다",
      description:
        "현재는 충전 신청 접수만 가능합니다. 본사에서 확인 후 충전 처리됩니다.",
    });
    setTopupOpen(false);
    setSelectedPkg(null);
  }

  return (
    <div className="space-y-6" data-testid="page-partner-credits">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Coins className="w-5 h-5 text-amber-500" />
          <div>
            <h1 className="text-2xl font-bold">크레딧</h1>
            <p className="text-muted-foreground text-sm">
              견적 제출에 사용할 크레딧 잔액과 사용 내역을 확인하고 충전을 신청합니다.
            </p>
          </div>
        </div>
        <Button onClick={() => setTopupOpen(true)} data-testid="button-open-topup">
          <Plus className="w-4 h-4 mr-1.5" />
          크레딧 충전 신청
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
                  <p className="text-sm text-muted-foreground font-medium">
                    크레딧 잔액
                  </p>
                  <p className="text-3xl font-bold mt-1">
                    {wallet.balance.toLocaleString()} C
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    입찰에 사용 가능한 크레딧
                  </p>
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
                  <p className="text-sm text-muted-foreground font-medium">
                    활동 포인트
                  </p>
                  <p className="text-3xl font-bold mt-1">
                    {wallet.pointsBalance.toLocaleString()} P
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    리베이트 및 성실 제출 적립
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
            ledger.map((entry: any) => (
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
          setTopupOpen(o);
          if (!o) setSelectedPkg(null);
        }}
      >
        <ResponsiveDialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>크레딧 충전 패키지 선택</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <p className="leading-relaxed">
                온라인 결제(PG)는 준비 중입니다. 패키지를 선택해 신청하시면 본사에서
                확인 후 크레딧을 충전해 드립니다.
              </p>
            </div>
            <div className="space-y-2">
              {TOPUP_PACKAGES.map((p) => {
                const active = selectedPkg === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPkg(p.id)}
                    data-testid={`topup-package-${p.id}`}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-base">
                            {p.credits.toLocaleString()} C
                          </span>
                          {p.bonusPoints ? (
                            <Badge
                              variant="outline"
                              className="text-pink-600 border-pink-200"
                            >
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
                          1C = {Math.round(p.price / p.credits)}원
                        </p>
                      </div>
                      <p className="font-bold text-lg">
                        {p.price.toLocaleString()}원
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
            <Button
              className="w-full"
              onClick={handleRequestTopup}
              disabled={!selectedPkg}
              data-testid="button-request-topup"
            >
              충전 신청 접수
            </Button>
          </div>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}
