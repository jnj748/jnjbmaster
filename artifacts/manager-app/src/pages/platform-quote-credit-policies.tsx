import { useState, useEffect, useMemo } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import {
  useUpsertPlatformSetting,
  useListQuoteTypePolicies,
  useUpsertQuoteTypePolicyCategory,
  getListQuoteTypePoliciesQueryKey,
  type CreditCategoryPricing,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

// [Task #298] 견적 유형(카테고리 × 프리미엄 여부)별 크레딧 정책을 한 화면에서 관리한다.
//   - 상단: 공통 기본값 (미열람 환불 비율/일수, 프리미엄 할증율, 프리미엄 슬롯 한도/금액 임계치)
//   - 하단: 카테고리별 정책 표 (기본 단가 + 카테고리 단위 오버라이드)

const COMMON_DEFAULTS: Record<string, string> = {
  noViewRefundDays: "7",
  noViewRefundRatio: "0.6",       // 0~1 (저장단위)
  premiumSurchargeRatio: "0.5",   // 0~  (저장단위, 0.5 = +50%)
  premiumSlotLimit: "5",
  premiumAmountThreshold: "5000000",
};

function ratioToPercentInput(ratio: string): string {
  const n = Number(ratio);
  if (!Number.isFinite(n)) return "";
  return String(Math.round(n * 100));
}
function percentInputToRatio(percent: string): string {
  const n = Number(percent);
  if (!Number.isFinite(n)) return "0";
  return String(n / 100);
}

export default function PlatformQuoteCreditPoliciesPage() {
  const { user } = useAuth();
  if (user?.role !== "platform_admin") {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">플랫폼 관리자만 접근할 수 있습니다.</p>
      </div>
    );
  }
  return (
    <div className="space-y-6 pb-12" data-testid="page-platform-quote-credit-policies">
      <div>
        <h1 className="text-2xl font-bold">견적 유형별 크레딧 설정</h1>
        <p className="text-sm text-muted-foreground mt-1">
          견적 유형(카테고리 × 프리미엄 여부)에 따라 소모 크레딧과 미열람 환불 정책을 관리합니다.
          공통 기본값을 우선 설정하고, 필요 시 카테고리 단위로 덮어씁니다.
        </p>
      </div>
      <CommonPolicySection />
      <CategoryPolicyTable />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">관련 화면</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          <p>
            <Link href="/settings?tab=platform" className="text-primary underline">
              플랫폼 BM 설정 (지역별 단가표 / 수수료율)
            </Link>
            <span className="text-muted-foreground"> — 시도/시군구 단위 단가는 기존 화면에서 관리합니다.</span>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function CommonPolicySection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: policies } = useListQuoteTypePolicies();
  const settings = policies?.common ?? [];
  const upsert = useUpsertPlatformSetting();

  const findVal = (key: string, fallback: string) => settings.find((s) => s.key === key)?.value ?? fallback;
  const findUpdated = (key: string) => {
    const s = settings.find((s) => s.key === key);
    return s && s.updatedAt ? { at: s.updatedAt, by: s.updatedBy ?? null } : null;
  };

  const [refundDays, setRefundDays] = useState(COMMON_DEFAULTS.noViewRefundDays);
  const [refundRatioPct, setRefundRatioPct] = useState(ratioToPercentInput(COMMON_DEFAULTS.noViewRefundRatio));
  const [surchargePct, setSurchargePct] = useState(ratioToPercentInput(COMMON_DEFAULTS.premiumSurchargeRatio));
  const [slotLimit, setSlotLimit] = useState(COMMON_DEFAULTS.premiumSlotLimit);
  const [amountThreshold, setAmountThreshold] = useState(COMMON_DEFAULTS.premiumAmountThreshold);

  useEffect(() => {
    if (!policies) return;
    setRefundDays(findVal("no_view_refund_days", COMMON_DEFAULTS.noViewRefundDays));
    setRefundRatioPct(ratioToPercentInput(findVal("no_view_refund_ratio", COMMON_DEFAULTS.noViewRefundRatio)));
    setSurchargePct(ratioToPercentInput(findVal("premium_surcharge_ratio", COMMON_DEFAULTS.premiumSurchargeRatio)));
    setSlotLimit(findVal("premium_slot_limit", COMMON_DEFAULTS.premiumSlotLimit));
    setAmountThreshold(findVal("premium_amount_threshold", COMMON_DEFAULTS.premiumAmountThreshold));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policies]);

  const lastUpdated = useMemo(() => {
    const stamps = ["no_view_refund_days", "no_view_refund_ratio", "premium_surcharge_ratio", "premium_slot_limit", "premium_amount_threshold"]
      .map(findUpdated)
      .filter((s): s is { at: string; by: string | null } => !!s);
    if (stamps.length === 0) return null;
    return stamps.sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policies]);

  async function save() {
    const days = Number(refundDays);
    const refundRatio = Number(refundRatioPct);
    const surcharge = Number(surchargePct);
    const slot = Number(slotLimit);
    const amt = Number(amountThreshold);
    if (!(days >= 1 && days <= 60)) { toast({ title: "환불 인정 기간은 1~60일이어야 합니다", variant: "destructive" }); return; }
    if (!(refundRatio >= 0 && refundRatio <= 100)) { toast({ title: "환불 비율은 0~100% 사이여야 합니다", variant: "destructive" }); return; }
    if (!(surcharge >= 0 && surcharge <= 500)) { toast({ title: "프리미엄 할증율은 0~500% 사이여야 합니다", variant: "destructive" }); return; }
    if (!(slot >= 1 && slot <= 100)) { toast({ title: "프리미엄 슬롯 한도는 1~100 사이여야 합니다", variant: "destructive" }); return; }
    if (!(amt >= 0)) { toast({ title: "프리미엄 금액 임계치는 0 이상이어야 합니다", variant: "destructive" }); return; }
    await upsert.mutateAsync({ data: { key: "no_view_refund_days", value: String(days), description: "관리소장 미열람 환불 기준 일수" } });
    await upsert.mutateAsync({ data: { key: "no_view_refund_ratio", value: percentInputToRatio(String(refundRatio)), description: "관리소장 미열람 환불 비율 (0~1)" } });
    await upsert.mutateAsync({ data: { key: "premium_surcharge_ratio", value: percentInputToRatio(String(surcharge)), description: "프리미엄 견적 할증율 (카테고리 단가 × (1 + ratio))" } });
    await upsert.mutateAsync({ data: { key: "premium_slot_limit", value: String(slot), description: "프리미엄 공고 선착순 슬롯 한도" } });
    await upsert.mutateAsync({ data: { key: "premium_amount_threshold", value: String(amt), description: "프리미엄 공고 자동 인정 금액 임계치 (원)" } });
    qc.invalidateQueries({ queryKey: getListQuoteTypePoliciesQueryKey() });
    toast({ title: "공통 기본값이 저장되었습니다" });
  }

  return (
    <Card data-testid="section-common-policy">
      <CardHeader>
        <CardTitle className="text-base">공통 기본값</CardTitle>
        <CardDescription>
          카테고리에 별도 오버라이드가 없으면 이 값이 적용됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <Label className="text-xs">미열람 환불 인정 기간 (일)</Label>
            <Input value={refundDays} onChange={(e) => setRefundDays(e.target.value)} className="h-9" data-testid="input-refund-days" />
            <p className="text-[11px] text-muted-foreground mt-1">기본값 {COMMON_DEFAULTS.noViewRefundDays}일</p>
          </div>
          <div>
            <Label className="text-xs">미열람 환불 비율 (%)</Label>
            <Input value={refundRatioPct} onChange={(e) => setRefundRatioPct(e.target.value)} className="h-9" data-testid="input-refund-ratio" />
            <p className="text-[11px] text-muted-foreground mt-1">기본값 {ratioToPercentInput(COMMON_DEFAULTS.noViewRefundRatio)}%</p>
          </div>
          <div>
            <Label className="text-xs">프리미엄 할증율 (%)</Label>
            <Input value={surchargePct} onChange={(e) => setSurchargePct(e.target.value)} className="h-9" data-testid="input-surcharge" />
            <p className="text-[11px] text-muted-foreground mt-1">예: 50 → 일반 단가 × 1.5</p>
          </div>
          <div>
            <Label className="text-xs">프리미엄 슬롯 한도</Label>
            <Input value={slotLimit} onChange={(e) => setSlotLimit(e.target.value)} className="h-9" data-testid="input-slot-limit" />
            <p className="text-[11px] text-muted-foreground mt-1">기본값 {COMMON_DEFAULTS.premiumSlotLimit}</p>
          </div>
          <div>
            <Label className="text-xs">프리미엄 금액 임계치 (원)</Label>
            <Input value={amountThreshold} onChange={(e) => setAmountThreshold(e.target.value)} className="h-9" data-testid="input-amount-threshold" />
            <p className="text-[11px] text-muted-foreground mt-1">예상 금액이 이 값 이상이면 프리미엄 공고로 인정</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 pt-2">
          <div className="text-[11px] text-muted-foreground">
            {lastUpdated ? (
              <>마지막 변경 {new Date(lastUpdated.at).toLocaleString("ko-KR")}{lastUpdated.by ? ` · ${lastUpdated.by}` : ""}</>
            ) : "변경 이력 없음"}
          </div>
          <Button size="sm" onClick={save} data-testid="button-save-common">저장</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryPolicyTable() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: policies } = useListQuoteTypePolicies();
  const upsert = useUpsertQuoteTypePolicyCategory();

  // 서버가 이미 default-row 만 골라 반환한다.
  const rows = useMemo(() => (policies?.categories ?? [])
    .slice()
    .sort((a, b) => a.category.localeCompare(b.category)), [policies]);

  async function refresh() {
    qc.invalidateQueries({ queryKey: getListQuoteTypePoliciesQueryKey() });
  }

  return (
    <Card data-testid="section-category-policy">
      <CardHeader>
        <CardTitle className="text-base">카테고리별 정책</CardTitle>
        <CardDescription>
          기본 소모 크레딧과 카테고리 단위 정책 오버라이드를 관리합니다. 빈 값은 공통 기본값을 따릅니다.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            카테고리 단가 행이 없습니다. 플랫폼 BM 설정에서 먼저 카테고리 기본 단가 행을 생성하세요.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[920px]" data-testid="table-category-policy">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left p-2">카테고리</th>
                  <th className="text-right p-2">기본 소모 크레딧</th>
                  <th className="text-right p-2">미열람 환불 비율 (%)</th>
                  <th className="text-right p-2">미열람 환불 기간 (일)</th>
                  <th className="text-right p-2">프리미엄 할증율 (%)</th>
                  <th className="text-right p-2">마지막 변경</th>
                  <th className="text-right p-2">동작</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <CategoryPolicyRow key={row.id} row={row} onSaved={refresh} onToast={toast} upsertMutateAsync={upsert.mutateAsync} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryPolicyRow({
  row,
  onSaved,
  onToast,
  upsertMutateAsync,
}: {
  row: CreditCategoryPricing;
  onSaved: () => void;
  onToast: ReturnType<typeof useToast>["toast"];
  upsertMutateAsync: ReturnType<typeof useUpsertQuoteTypePolicyCategory>["mutateAsync"];
}) {
  const [creditCost, setCreditCost] = useState(String(row.creditCost));
  const [refundDays, setRefundDays] = useState<string>(row.noViewRefundDays != null ? String(row.noViewRefundDays) : "");
  const [refundRatioPct, setRefundRatioPct] = useState<string>(row.noViewRefundRatioPercent != null ? String(row.noViewRefundRatioPercent) : "");
  const [surchargePct, setSurchargePct] = useState<string>(row.premiumSurchargePercent != null ? String(row.premiumSurchargePercent) : "");

  useEffect(() => {
    setCreditCost(String(row.creditCost));
    setRefundDays(row.noViewRefundDays != null ? String(row.noViewRefundDays) : "");
    setRefundRatioPct(row.noViewRefundRatioPercent != null ? String(row.noViewRefundRatioPercent) : "");
    setSurchargePct(row.premiumSurchargePercent != null ? String(row.premiumSurchargePercent) : "");
  }, [row.id, row.creditCost, row.noViewRefundDays, row.noViewRefundRatioPercent, row.premiumSurchargePercent]);

  function parseOverride(v: string): number | null {
    const t = v.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }

  async function save() {
    const cost = Number(creditCost);
    if (!(cost >= 1)) { onToast({ title: "기본 소모 크레딧은 1 이상이어야 합니다", variant: "destructive" }); return; }
    const days = parseOverride(refundDays);
    const ratio = parseOverride(refundRatioPct);
    const surcharge = parseOverride(surchargePct);
    if (days != null && !(days >= 1 && days <= 60)) { onToast({ title: "환불 기간은 1~60일이어야 합니다", variant: "destructive" }); return; }
    if (ratio != null && !(ratio >= 0 && ratio <= 100)) { onToast({ title: "환불 비율은 0~100% 사이여야 합니다", variant: "destructive" }); return; }
    if (surcharge != null && !(surcharge >= 0 && surcharge <= 500)) { onToast({ title: "프리미엄 할증율은 0~500% 사이여야 합니다", variant: "destructive" }); return; }
    await upsertMutateAsync({
      data: {
        category: row.category,
        creditCost: cost,
        noViewRefundDays: days,
        noViewRefundRatioPercent: ratio,
        premiumSurchargePercent: surcharge,
      },
    });
    onSaved();
    onToast({ title: `${row.category} 정책이 저장되었습니다` });
  }

  async function clearOverrides() {
    setRefundDays("");
    setRefundRatioPct("");
    setSurchargePct("");
    await upsertMutateAsync({
      data: {
        category: row.category,
        creditCost: Number(creditCost),
        noViewRefundDays: null,
        noViewRefundRatioPercent: null,
        premiumSurchargePercent: null,
      },
    });
    onSaved();
    onToast({ title: `${row.category} 오버라이드가 해제되었습니다` });
  }

  // [Task #298] "공통값 사용 중"인 셀은 회색으로 표시
  const usingCommon = (v: string) => v.trim() === "";
  const cellClass = (v: string) => `h-8 w-24 text-right ${usingCommon(v) ? "bg-muted/40 text-muted-foreground" : ""}`;

  const hasAnyOverride = row.noViewRefundDays != null || row.noViewRefundRatioPercent != null || row.premiumSurchargePercent != null;

  return (
    <tr className="border-b" data-testid={`row-category-${row.category}`}>
      <td className="p-2 font-medium">{row.category}</td>
      <td className="p-2 text-right">
        <Input value={creditCost} onChange={(e) => setCreditCost(e.target.value)} className="h-8 w-20 text-right" data-testid={`input-cost-${row.category}`} />
      </td>
      <td className="p-2 text-right">
        <Input value={refundRatioPct} onChange={(e) => setRefundRatioPct(e.target.value)} placeholder="공통" className={cellClass(refundRatioPct)} data-testid={`input-refund-ratio-${row.category}`} />
      </td>
      <td className="p-2 text-right">
        <Input value={refundDays} onChange={(e) => setRefundDays(e.target.value)} placeholder="공통" className={cellClass(refundDays)} data-testid={`input-refund-days-${row.category}`} />
      </td>
      <td className="p-2 text-right">
        <Input value={surchargePct} onChange={(e) => setSurchargePct(e.target.value)} placeholder="공통" className={cellClass(surchargePct)} data-testid={`input-surcharge-${row.category}`} />
      </td>
      <td className="p-2 text-right text-[11px] text-muted-foreground whitespace-nowrap">
        {row.updatedAt ? (
          <>
            {new Date(row.updatedAt).toLocaleDateString("ko-KR")}
            {row.updatedBy ? <><br />{row.updatedBy}</> : null}
          </>
        ) : "—"}
      </td>
      <td className="p-2 text-right whitespace-nowrap">
        <Button size="sm" variant="outline" onClick={save} data-testid={`button-save-${row.category}`}>저장</Button>
        {hasAnyOverride && (
          <Button size="sm" variant="ghost" className="ml-1" onClick={clearOverrides} data-testid={`button-clear-${row.category}`}>오버라이드 해제</Button>
        )}
      </td>
    </tr>
  );
}
