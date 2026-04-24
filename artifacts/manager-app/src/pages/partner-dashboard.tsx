import {
  useListCommissions,
  useGetCreditWallet,
  useListCreditLedger,
  useListRfqs,
  useListQuotes,
  useListWorkReports,
  useListSettlements,
  useListPlatformSettings,
} from "@workspace/api-client-react";
import type {
  Commission,
  CreditLedgerEntry,
  Quote,
  Rfq,
  Settlement,
  WorkReport,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  Coins,
  ArrowRight,
  Wallet,
  Gift,
  Bell,
  MapPin,
  FileText,
  Send,
  ClipboardCheck,
  Plus,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
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

// [Task #290] 파트너 대시보드 — 협력업체 풀(/vendors) 카드/리스트 제거.
//   섹션 순서:
//   1) 기다리는 견적 요청
//   2) 크레딧 잔액(+충전하기) / 활동 포인트(+최근 차감·환불)
//   3) 진행 요약(제출 견적 / 채택 견적 / 대기 작업보고 / 대기 정산)
//   4) 최근 크레딧 사용 내역 / 최근 수수료
//   "전체 협력업체" 와 "등록 업체 현황" 섹션은 본사 관리자 영역으로 이동.
export default function PartnerDashboard() {
  const { user } = useAuth();
  const vendorId = user?.vendorId ?? undefined;

  // [Task #290] 호출 패턴은 vendor-portal.tsx 와 동일 — orval-generated 훅의
  //   options 타입 호환을 위해 inline 객체 리터럴을 사용한다.
  const { data: wallet, isLoading: walletLoading } = useGetCreditWallet(
    vendorId ? { vendorId } : undefined,
    { query: { enabled: !!vendorId } },
  );
  const { data: ledger } = useListCreditLedger(
    vendorId ? { vendorId, limit: 5 } : undefined,
    { query: { enabled: !!vendorId } },
  );
  const { data: openRfqs } = useListRfqs(undefined, { query: { enabled: !!vendorId } });
  const { data: myQuotes } = useListQuotes(
    vendorId ? { vendorId } : undefined,
    { query: { enabled: !!vendorId } },
  );
  const { data: myReports } = useListWorkReports(
    vendorId ? { vendorId } : undefined,
    { query: { enabled: !!vendorId } },
  );
  const { data: mySettlements } = useListSettlements(
    vendorId ? { vendorId } : undefined,
    { query: { enabled: !!vendorId } },
  );
  const { data: commissions } = useListCommissions();
  const { data: platformSettings } = useListPlatformSettings();

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

  const quotesArr = (myQuotes ?? []) as Quote[];
  const reportsArr = (myReports ?? []) as WorkReport[];
  const settlementsArr = (mySettlements ?? []) as Settlement[];
  const commissionsArr = (commissions ?? []) as Commission[];
  const ledgerArr = (ledger ?? []) as CreditLedgerEntry[];

  const submittedQuotes = quotesArr.filter((q) => q.status === "submitted").length;
  const acceptedQuotes = quotesArr.filter((q) => q.status === "accepted").length;
  const pendingReports = reportsArr.filter((r) => r.status === "submitted").length;
  const pendingSettlements = settlementsArr.filter(
    (s) => s.status !== "paid" && s.status !== "cancelled",
  ).length;
  const pendingCommissions = commissionsArr.filter((c) => c.status === "pending").length;

  const recentDeducts = ledgerArr.filter(
    (e) => e.kind === "consumption" || e.kind === "refund" || e.kind === "manual_debit",
  );

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

  // [Task #327] 모바일 컴팩트 KPI/탭 — 데이터 hooks 는 위에서 이미 호출됐으므로
  // 여기서는 표시 전용. 데스크탑 뷰는 아래 <DesktopOnly> 안에 그대로 유지.
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
      value: waitingRfqs.length,
      hint: waitingRfqs.length > 0 ? "탭에서 확인" : "대기 중 없음",
      icon: Bell,
      iconClass: "text-white",
      iconBg: "bg-teal-500",
      highlight: waitingRfqs.length > 0 ? "good" : "default",
    },
    {
      key: "quotes",
      label: "진행 견적",
      value: submittedQuotes + acceptedQuotes,
      hint: `제출 ${submittedQuotes} · 채택 ${acceptedQuotes}`,
      icon: Send,
      iconClass: "text-white",
      iconBg: "bg-blue-500",
      href: "/rfqs?tab=quotes",
    },
    {
      key: "settle",
      label: "대기 정산",
      value: pendingSettlements + pendingCommissions,
      hint: `보고서 ${pendingReports} 대기`,
      icon: Coins,
      iconClass: "text-white",
      iconBg: "bg-purple-500",
      href: "/commissions",
      highlight: pendingSettlements + pendingCommissions > 0 ? "warn" : "default",
    },
  ];

  return (
    <div data-testid="page-partner-dashboard">
      <MobileOnly>
        <div className="space-y-3">
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
              {
                key: "commissions",
                label: "정산",
                content: commissionsArr.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">
                    수수료 내역이 없습니다
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {commissionsArr.slice(0, 6).map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between p-2 rounded border bg-card"
                      >
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium truncate">{c.vendorName}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {c.commissionAmount?.toLocaleString()}원
                          </p>
                        </div>
                        <Badge
                          variant={c.status === "completed" ? "default" : "secondary"}
                          className="text-[9px] h-4 px-1.5"
                        >
                          {c.status === "pending" && "대기"}
                          {c.status === "billed" && "청구"}
                          {c.status === "collected" && "수금"}
                          {c.status === "completed" && "완료"}
                          {c.status === "cancelled" && "취소"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ),
              },
            ]}
          />
        </div>
      </MobileOnly>

      <DesktopOnly>
        <div className="space-y-6">
      {/* 1) 기다리는 견적 요청 */}
      {vendorId && (
        <Card className="border-teal-200 bg-teal-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Bell className="w-4 h-4 text-teal-600" />
              파트너님을 기다리는 요청이 들어왔어요
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

      {/* 3) 진행 중인 내 견적·작업·정산 요약 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/rfqs?tab=quotes">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-blue-100">
                  <Send className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">제출한 견적</p>
                  <p className="text-xl font-bold">{submittedQuotes}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/rfqs?tab=quotes">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-emerald-100">
                  <FileText className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">채택된 견적</p>
                  <p className="text-xl font-bold">{acceptedQuotes}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/rfqs?tab=reports">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-amber-100">
                  <ClipboardCheck className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">대기 작업보고</p>
                  <p className="text-xl font-bold">{pendingReports}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/commissions">
          <Card className="cursor-pointer hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-purple-100">
                  <Coins className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">대기 정산</p>
                  <p className="text-xl font-bold">
                    {pendingSettlements + pendingCommissions}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* 4) 최근 크레딧 사용 내역 + 최근 수수료 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {vendorId && (
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
                      <p className="font-medium">{entry.kind}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.notes ?? entry.source}
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
        )}

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Coins className="w-4 h-4 text-emerald-500" />
                최근 수수료
              </CardTitle>
              <Link href="/commissions">
                <span className="text-xs text-primary hover:underline cursor-pointer flex items-center gap-1">
                  전체보기 <ArrowRight className="w-3 h-3" />
                </span>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {commissionsArr.length > 0 ? (
              commissionsArr.slice(0, 5).map((commission) => (
                <div
                  key={commission.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border"
                >
                  <div>
                    <p className="text-sm font-medium">{commission.vendorName}</p>
                    <p className="text-xs text-muted-foreground">
                      {commission.commissionAmount?.toLocaleString()}원
                    </p>
                  </div>
                  <Badge
                    variant={commission.status === "completed" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {commission.status === "pending" && "대기"}
                    {commission.status === "billed" && "청구됨"}
                    {commission.status === "collected" && "수금완료"}
                    {commission.status === "completed" && "정산완료"}
                    {commission.status === "cancelled" && "취소"}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                수수료 내역이 없습니다
              </p>
            )}
          </CardContent>
        </Card>
      </div>
        </div>
      </DesktopOnly>
    </div>
  );
}
