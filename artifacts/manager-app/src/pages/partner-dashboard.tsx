import {
  useGetCreditWallet,
  useListCreditLedger,
  useListRfqs,
  useListQuotes,
  useListContracts,
  useListPlatformSettings,
  useGetMyVendor,
} from "@workspace/api-client-react";
import type {
  Contract,
  CreditLedgerEntry,
  Quote,
  Rfq,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  ArrowRight,
  Wallet,
  Gift,
  Bell,
  MapPin,
  Send,
  Plus,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { PartnerProfileDiagnostic } from "@/components/vendor-portal/partner-profile-diagnostic";
import { useAuth } from "@/contexts/auth-context";
import { ledgerKindLabel, ledgerSourceLabel } from "@/lib/credit-ledger-labels";
import {
  MobileOnly,
  DesktopOnly,
  MobileKpiStrip,
  MobileTabPanels,
  type KpiItem,
} from "@/components/dashboard-widgets/mobile-compact";

const categoryLabel = (c: string) => {
  const map: Record<string, string> = {
    elevator: "승강기", water_tank: "저수조", fire_safety: "소방",
    electrical: "전기", gas: "가스", septic: "정화조",
    cleaning: "청소", security: "보안", other: "기타",
  };
  return map[c] || c;
};

// [Task #637] 파트너 대시보드 — "계약 성사까지만 매칭" 정책에 맞춰 KPI 재구성.
//   - 채택률(제출/채택) 카드는 시작 단계 파트너의 이탈 동기가 되어 제거.
//   - 작업보고/정산/수수료 카드와 메뉴는 분쟁 책임이 플랫폼으로 흐를 위험이 있어 분리.
//   - 대신 "이번 달 성사 금액 / 누적 성사 금액 / 진행 중 견적 / 신규 요청" 4개 KPI 로
//     계약 성사 동기를 전면에 노출.
export default function PartnerDashboard() {
  const { user } = useAuth();
  const vendorId = user?.vendorId ?? undefined;

  const { data: wallet, isLoading: walletLoading } = useGetCreditWallet(
    vendorId ? { vendorId } : undefined,
    { query: { enabled: !!vendorId } },
  );
  const { data: ledger } = useListCreditLedger(
    vendorId ? { vendorId } : undefined,
    { query: { enabled: !!vendorId } },
  );
  const { data: openRfqs } = useListRfqs(undefined, { query: { enabled: !!vendorId } });
  const { data: myQuotes } = useListQuotes(
    vendorId ? { vendorId } : undefined,
    { query: { enabled: !!vendorId } },
  );
  // [Task #637] 본인 vendorId 로 계약 합계를 계산. 별도 서버 집계 API 없이
  //   클라이언트에서 합산한다(진행 중·만료 모두 포함).
  const { data: myContracts } = useListContracts(
    vendorId ? { vendorId } : undefined,
    { query: { enabled: !!vendorId } },
  );
  const { data: platformSettings } = useListPlatformSettings();
  // [Task #682] 파트너 본인의 vendor 프로필 — 빈 상태 진단 배너에서
  //   현재 카테고리/활동지역을 그대로 노출해 "왜 RFQ 가 안 보이는지" 즉시 알게 한다.
  const { data: myVendor } = useGetMyVendor({
    query: { enabled: !!vendorId },
  });

  const refundDays = Number(
    platformSettings?.find((s) => s.key === "no_view_refund_days")?.value ?? 7,
  );
  const refundRatioPct = Math.round(
    Number(platformSettings?.find((s) => s.key === "no_view_refund_ratio")?.value ?? 0.6) * 100,
  );

  const quotedRfqIds = new Set<number>(
    ((myQuotes ?? []) as Quote[]).map((q) => q.rfqId),
  );
  const waitingRfqs: Rfq[] = ((openRfqs ?? []) as Rfq[])
    .filter((r) => r.status === "open" && !quotedRfqIds.has(r.id))
    .slice(0, 5);
  const waitingRfqCount = ((openRfqs ?? []) as Rfq[]).filter(
    (r) => r.status === "open" && !quotedRfqIds.has(r.id),
  ).length;

  const quotesArr = (myQuotes ?? []) as Quote[];
  const contractsArr = (myContracts ?? []) as Contract[];
  const ledgerArr = (ledger ?? []) as CreditLedgerEntry[];

  const submittedQuotes = quotesArr.filter((q) => q.status === "submitted").length;

  // [Task #637] 계약 합계 — startDate 기준 이번 달 / 전체.
  //   contractAmount 가 null 인 계약은 0 으로 합산.
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const sumContract = (c: Contract) => c.contractAmount ?? 0;
  const monthlyContractTotal = contractsArr
    .filter((c) => {
      if (!c.startDate) return false;
      const d = new Date(c.startDate);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    })
    .reduce((sum, c) => sum + sumContract(c), 0);
  const totalContractTotal = contractsArr.reduce((sum, c) => sum + sumContract(c), 0);
  const hasContracts = contractsArr.length > 0;

  const recentDeducts = ledgerArr.filter(
    (e) => e.kind === "consumption" || e.kind === "refund" || e.kind === "manual_debit",
  );

  const formatMoney = (n: number) => `${n.toLocaleString()}원`;
  const formatMoneyShort = (n: number) => {
    if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(n % 100_000_000 === 0 ? 0 : 1)}억`;
    if (n >= 10_000) return `${(n / 10_000).toFixed(n % 10_000 === 0 ? 0 : 1)}만`;
    return n.toLocaleString();
  };

  if (walletLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      </div>
    );
  }

  // [Task #637] 모바일 KPI 4개 — 크레딧 / 신규 요청 / 진행 중 견적 / 이번 달 성사 금액.
  //   기존 "대기 정산" KPI 는 정산 도메인 분리에 따라 제거.
  const mobileKpis: KpiItem[] = [
    {
      key: "credit",
      label: "크레딧 잔액",
      value: wallet ? `${wallet.balance.toLocaleString()} C` : "—",
      hint: wallet ? `${wallet.pointsBalance.toLocaleString()} P 활동` : undefined,
      icon: Wallet,
      iconClass: "text-white",
      iconBg: "bg-indigo-500",
      href: "/me/credits",
      highlight: "info",
    },
    {
      key: "waiting",
      label: "신규 요청",
      value: waitingRfqCount,
      hint: waitingRfqCount > 0 ? "탭에서 확인" : "대기 중 없음",
      icon: Bell,
      iconClass: "text-white",
      iconBg: "bg-teal-500",
      href: "/rfqs",
      highlight: waitingRfqCount > 0 ? "good" : "default",
    },
    {
      key: "in-progress-quotes",
      label: "진행 중 견적",
      value: submittedQuotes,
      hint: submittedQuotes > 0 ? "선정 결과 대기" : "현재 없음",
      icon: Send,
      iconClass: "text-white",
      iconBg: "bg-blue-500",
      href: "/rfqs?tab=quotes",
    },
    {
      key: "monthly-contract",
      label: "이번 달 성사 금액",
      value: monthlyContractTotal > 0 ? `${formatMoneyShort(monthlyContractTotal)}원` : "—",
      hint: monthlyContractTotal > 0 ? "이번 달 계약 합계" : "다음 한 건이면 시작",
      icon: TrendingUp,
      iconClass: "text-white",
      iconBg: "bg-emerald-500",
      highlight: monthlyContractTotal > 0 ? "good" : "default",
    },
  ];

  // [Task #682] 진단 배너 노출 여부.
  //   - vendorId 가 있어야 한다(파트너 계정만).
  //   - 카테고리/활동지역 정보가 부족해서 매칭이 약하거나, waiting 큐가 비어 있어서
  //     "내 설정이 맞는지" 확인이 필요한 케이스에 안내 톤으로 노출.
  const subCatList = (myVendor?.subCategories ?? "")
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const regionLabel =
    [myVendor?.sido, myVendor?.sigungu].filter(Boolean).join(" ") || null;
  const noProfileSetup =
    !!myVendor && (!myVendor.category || !regionLabel);
  const showDiagnostic = !!vendorId && (waitingRfqCount === 0 || noProfileSetup);

  return (
    <div data-testid="page-partner-dashboard">
      <MobileOnly>
        <div className="space-y-3">
          {showDiagnostic && myVendor && (
            <PartnerProfileDiagnostic
              vendor={myVendor}
              subCatList={subCatList}
              regionLabel={regionLabel}
              compact
            />
          )}
          <MobileKpiStrip items={mobileKpis} />
          <MobileTabPanels
            sections={[
              {
                key: "rfqs",
                label: "신규 요청",
                badge: waitingRfqs.length > 0 ? (
                  <Badge variant="destructive" className="text-[9px] h-4 px-1">{waitingRfqs.length}</Badge>
                ) : undefined,
                content: vendorId ? (
                  waitingRfqs.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      신규 요청이 없습니다
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {waitingRfqs.map((r) => (
                        <Link key={r.id} href="/rfqs">
                          <div className="flex items-center justify-between p-2.5 rounded-lg border bg-card hover:border-teal-300 cursor-pointer">
                            <div className="min-w-0">
                              <p className="text-xs font-medium truncate">{r.title}</p>
                              <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                                <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5">
                                  {categoryLabel(r.category)}
                                </Badge>
                                {(r.sido || r.sigungu) && (
                                  <span className="flex items-center gap-0.5">
                                    <MapPin className="w-2.5 h-2.5" />
                                    {[r.sido, r.sigungu].filter(Boolean).join(" ")}
                                  </span>
                                )}
                                {r.deadline && (
                                  <span>마감 {new Date(r.deadline).toLocaleDateString("ko-KR")}</span>
                                )}
                              </p>
                            </div>
                            <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          </div>
                        </Link>
                      ))}
                      <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                        견적 제출 시 크레딧 차감, {refundDays}일 미열람 시 {refundRatioPct}% 환불.
                      </p>
                    </div>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    파트너 정보가 등록되지 않았습니다
                  </p>
                ),
              },
              {
                key: "credit-recent",
                label: "최근 활동",
                content: ledgerArr.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    사용 내역이 없습니다
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {ledgerArr.slice(0, 6).map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between p-2 rounded border bg-card text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-[11px] truncate">{entry.kind}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {entry.notes ?? entry.source ?? ""}
                          </p>
                        </div>
                        <p
                          className={`font-semibold text-[11px] shrink-0 ml-2 ${entry.amount < 0 ? "text-rose-600" : "text-emerald-600"}`}
                        >
                          {entry.amount > 0 ? "+" : ""}{entry.amount} C
                        </p>
                      </div>
                    ))}
                    <Link href="/me/credits">
                      <p className="text-[10px] text-primary hover:underline text-right pt-1">
                        전체 내역 보기 →
                      </p>
                    </Link>
                  </div>
                ),
              },
            ]}
          />
        </div>
      </MobileOnly>

      <DesktopOnly>
        <div className="space-y-6">
      {showDiagnostic && myVendor && (
        <PartnerProfileDiagnostic
          vendor={myVendor}
          subCatList={subCatList}
          regionLabel={regionLabel}
        />
      )}
      {/* 1) 기다리는 견적 요청 — 헤드라인은 시작 단계 파트너 동기부여를 위한 긍정 카피. */}
      {vendorId && (
        <Card className="border-teal-200 bg-teal-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4 text-teal-600" />
              견적이 필요한 건물이 생겼어요
            </CardTitle>
          </CardHeader>
          <CardContent>
            {waitingRfqs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                지금은 파트너님께 연결된 신규 요청이 없습니다. 새 요청이 도착하면 이곳에서 안내해 드릴게요.
              </p>
            ) : (
              <div className="space-y-2">
                {waitingRfqs.map((r) => (
                  <Link key={r.id} href="/rfqs">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-white border hover:border-teal-300 cursor-pointer">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{r.title}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                            {categoryLabel(r.category)}
                          </Badge>
                          {(r.sido || r.sigungu) && (
                            <span className="flex items-center gap-0.5">
                              <MapPin className="w-3 h-3" />
                              {[r.sido, r.sigungu].filter(Boolean).join(" ")}
                            </span>
                          )}
                          {r.deadline && (
                            <span>마감 {new Date(r.deadline).toLocaleDateString("ko-KR")}</span>
                          )}
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
              안내 · 견적 제출 시 지역 단가에 따라 크레딧이 차감되며, 관리소장이 {refundDays}일 동안
              견적을 열람하지 않으면 차감 크레딧의 {refundRatioPct}%가 자동 환불됩니다.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 2) 크레딧 잔액 + 충전 + 활동 포인트 */}
      {vendorId && wallet && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-indigo-200">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">크레딧 잔액</p>
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
              <div className="flex items-center gap-2 mt-4">
                <Link href="/me/credits">
                  <Button size="sm" data-testid="button-dashboard-topup">
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    충전하기
                  </Button>
                </Link>
                <Link href="/me/credits">
                  <Button size="sm" variant="outline">
                    이력 보기
                    <ArrowRight className="w-3.5 h-3.5 ml-1" />
                  </Button>
                </Link>
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
                    리베이트 및 성실 제출 적립
                  </p>
                </div>
                <div className="p-2.5 rounded-lg bg-pink-500">
                  <Gift className="w-5 h-5 text-white" />
                </div>
              </div>
              <div className="mt-4">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  최근 차감·환불
                </p>
                {recentDeducts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">최근 활동이 없습니다</p>
                ) : (
                  <div className="space-y-1">
                    {recentDeducts.slice(0, 3).map((e) => (
                      <div
                        key={e.id}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="truncate text-muted-foreground">
                          {e.notes ?? e.source ?? (e.kind === "refund" ? "미열람 환불" : "차감")}
                        </span>
                        <span
                          className={
                            e.amount < 0 ? "text-rose-600 font-medium" : "text-emerald-600 font-medium"
                          }
                        >
                          {e.amount > 0 ? "+" : ""}
                          {e.amount} C
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 3) 계약 성사 KPI 4종 — 채택률 대신 성사 금액을 전면 노출.
          [Task #637 spec] "성사 금액 카드는 클릭 시 본인 계약 목록(존재한다면)으로,
          없으면 비활성화 표시." 현재 파트너 role 에는 계약 목록 페이지 access 가 없으므로
          (canAccess 화이트리스트 + getRoutesForRole 참조) 두 카드는 명시적 비활성 상태로
          렌더링한다 — cursor:default · aria-disabled · 안내 툴팁 동반. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* 이번 달 성사 금액 — 클릭 가능한 계약 목록 페이지가 없어 비활성. */}
        <Card
          aria-disabled="true"
          title="계약 목록 페이지는 아직 준비 중입니다"
          className={`cursor-default select-none ${hasContracts ? "opacity-95" : "opacity-90"}`}
          data-testid="kpi-monthly-contract"
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-100">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">이번 달 성사 금액</p>
                <p className="text-xl font-bold truncate">
                  {monthlyContractTotal > 0 ? formatMoney(monthlyContractTotal) : "—"}
                </p>
                {monthlyContractTotal === 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    다음 한 건이면 시작
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 누적 성사 금액 — 동일 사유로 비활성. */}
        <Card
          aria-disabled="true"
          title="계약 목록 페이지는 아직 준비 중입니다"
          className="cursor-default select-none opacity-95"
          data-testid="kpi-total-contract"
        >
          <CardContent className="p-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-amber-100">
                <Trophy className="w-4 h-4 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">누적 성사 금액</p>
                <p className="text-xl font-bold truncate">
                  {totalContractTotal > 0 ? formatMoney(totalContractTotal) : "—"}
                </p>
                {totalContractTotal === 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    첫 계약을 기다려요
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 진행 중 견적 — submitted 상태(선정 결과 대기). */}
        <Link href="/rfqs?tab=quotes">
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            data-testid="kpi-in-progress-quotes"
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-100">
                  <Send className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">진행 중 견적</p>
                  <p className="text-xl font-bold">{submittedQuotes}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* 신규 요청 — 본인이 아직 견적 안 낸 open RFQ. */}
        <Link href="/rfqs">
          <Card
            className="cursor-pointer hover:shadow-md transition-shadow"
            data-testid="kpi-new-rfqs"
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-teal-100">
                  <Bell className="w-4 h-4 text-teal-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">신규 요청</p>
                  <p className="text-xl font-bold">{waitingRfqCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* 4) 최근 크레딧 사용 내역 — 1열로 단순화 (최근 수수료 카드 제거). */}
      {vendorId && (
        <div className="grid grid-cols-1 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-indigo-500" />
                  최근 크레딧 사용 내역
                </CardTitle>
                <Link href="/me/credits">
                  <span className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1">
                    전체보기 <ArrowRight className="w-3 h-3" />
                  </span>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {ledgerArr.length > 0 ? (
                ledgerArr.slice(0, 5).map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border text-sm"
                  >
                    <div>
                      <p className="font-medium">{ledgerKindLabel(entry.kind)}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.notes ?? ledgerSourceLabel(entry.source)}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {new Date(entry.createdAt).toLocaleString("ko-KR")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`font-semibold ${entry.amount < 0 ? "text-rose-600" : "text-emerald-600"}`}
                      >
                        {entry.amount > 0 ? "+" : ""}
                        {entry.amount} C
                      </p>
                      {entry.pointsAmount !== 0 && (
                        <p className="text-xs text-pink-600">+{entry.pointsAmount} P</p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  사용 내역이 없습니다
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
        </div>
      </DesktopOnly>
    </div>
  );
}

// [Task #682 review-fix #2] PartnerProfileDiagnostic 는
//   `@/components/vendor-portal/partner-profile-diagnostic` 로 분리되어
//   파트너 RFQ 탭의 빈 상태에서도 재사용된다.

