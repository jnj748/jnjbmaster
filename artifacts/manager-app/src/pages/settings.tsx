import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useBuilding } from "@/contexts/building-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Settings as SettingsIcon,
  Building,
  User,
  Save,
  Loader2,
  Lock,
  Phone,
  Mail,
  CheckCircle2,
  Coins,
  Link2,
  Unlink,
  LogOut,
} from "lucide-react";
import {
  useListPlatformSettings,
  useUpsertPlatformSetting,
  useListCreditCategoryPricing,
  useUpsertCreditCategoryPricing,
  useListCommissionRates,
  useUpsertCommissionRate,
  useGetRfqAdminStats,
  getListPlatformSettingsQueryKey,
  getListCreditCategoryPricingQueryKey,
  getListCommissionRatesQueryKey,
  type CreditCategoryPricing,
  type UpsertCreditCategoryPricingBody,
  type CommissionRate,
  type UpsertCommissionRateBody,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";

const BASE = import.meta.env.BASE_URL ?? "/";
const apiBase = `${BASE}api`.replace(/\/+/g, "/");

const BuildingSetup = lazy(() => import("@/pages/building-setup"));

export default function SettingsPage() {
  const { user } = useAuth();
  const canEditBuilding = user?.role === "manager" || user?.role === "platform_admin";
  const canEditPlatform = user?.role === "platform_admin" || user?.role === "hq_executive";
  // [Task #141] /building-setup 라우트 폐지 후 진입점은 /settings?tab=building.
  const initialTab = (() => {
    if (typeof window === "undefined") return "profile" as const;
    // [메뉴 분리] /settings/profile · /settings/building 경로로도 탭을 결정.
    const path = window.location.pathname;
    if (path.endsWith("/settings/building") && canEditBuilding) return "building" as const;
    if (path.endsWith("/settings/profile")) return "profile" as const;
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "building" && canEditBuilding) return "building" as const;
    if (t === "platform" && canEditPlatform) return "platform" as const;
    return "profile" as const;
  })();
  const [activeTab, setActiveTab] = useState<"building" | "profile" | "platform">(initialTab);

  const tabs = [
    { key: "profile" as const, label: "내정보 수정", icon: User },
    ...(canEditBuilding ? [{ key: "building" as const, label: "건물정보 수정", icon: Building }] : []),
    ...(canEditPlatform ? [{ key: "platform" as const, label: "플랫폼 BM", icon: Coins }] : []),
  ];

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <SettingsIcon className="w-6 h-6" />
          설정
        </h1>
        <p className="text-sm text-muted-foreground mt-1">내정보 및 건물정보를 관리합니다</p>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "profile" && <ProfileSettings />}
      {activeTab === "building" && (
        <Suspense fallback={<div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>}>
          <BuildingSetup />
        </Suspense>
      )}
      {activeTab === "platform" && <PlatformSettings />}
    </div>
  );
}

function PlatformSettings() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: settings } = useListPlatformSettings();
  const { data: pricing } = useListCreditCategoryPricing();
  const { data: rates } = useListCommissionRates();
  const upsertSetting = useUpsertPlatformSetting();
  const upsertPrice = useUpsertCreditCategoryPricing();
  const upsertRate = useUpsertCommissionRate();

  const findFlag = (key: string) => settings?.find((s) => s.key === key)?.value === "true";

  const toggleFlag = async (key: string, enabled: boolean) => {
    await upsertSetting.mutateAsync({ data: { key, value: enabled ? "true" : "false" } });
    qc.invalidateQueries({ queryKey: getListPlatformSettingsQueryKey() });
    toast({ title: `${key} ${enabled ? "활성화" : "비활성화"}됨` });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>기능 플래그</CardTitle>
          <CardDescription>플랫폼 수익화 기능의 on/off를 제어합니다</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <p className="font-medium text-sm">크레딧 입찰 시스템</p>
              <p className="text-xs text-muted-foreground">견적 제출 시 크레딧 차감 활성화</p>
            </div>
            <Switch
              checked={findFlag("credits_enabled")}
              onCheckedChange={(v) => toggleFlag("credits_enabled", v)}
            />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <p className="font-medium text-sm">자동 수수료 정산</p>
              <p className="text-xs text-muted-foreground">작업 완료 승인 시 pending→billed 자동 전환</p>
            </div>
            <Switch
              checked={findFlag("auto_commission_enabled")}
              onCheckedChange={(v) => toggleFlag("auto_commission_enabled", v)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>미열람 환불 정책</CardTitle>
          <CardDescription>관리소장이 견적을 일정 기간 열람하지 않으면 일부 크레딧을 자동 환불합니다</CardDescription>
        </CardHeader>
        <CardContent>
          <RefundPolicyEditor />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>크레딧 카테고리 단가 · 지역별</CardTitle>
          <CardDescription>
            카테고리·시도·시군구 조합으로 단가를 설정합니다. 입찰 시 시군구 → 시도 → 기본 순으로 적용됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
         <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead><tr className="border-b"><th className="text-left p-2">카테고리</th><th className="text-left p-2">시도</th><th className="text-left p-2">시군구</th><th className="text-left p-2">Tier</th><th className="text-left p-2">단가(C)</th><th></th></tr></thead>
            <tbody>
              {pricing?.map((p) => (
                <PricingRow
                  key={p.id}
                  row={p}
                  onSave={async (data) => {
                    await upsertPrice.mutateAsync({ data });
                    qc.invalidateQueries({ queryKey: getListCreditCategoryPricingQueryKey() });
                    toast({ title: "단가가 저장되었습니다" });
                  }}
                  onDelete={async () => {
                    if (!confirm("이 단가 행을 삭제하시겠습니까?")) return;
                    await fetch(`${apiBase}/credits/category-pricing/${p.id}`, {
                      method: "DELETE",
                      credentials: "include",
                    });
                    qc.invalidateQueries({ queryKey: getListCreditCategoryPricingQueryKey() });
                    toast({ title: "단가 행이 삭제되었습니다" });
                  }}
                />
              ))}
              <NewPricingRow
                onSave={async (data) => {
                  await upsertPrice.mutateAsync({ data });
                  qc.invalidateQueries({ queryKey: getListCreditCategoryPricingQueryKey() });
                  toast({ title: "지역 단가가 추가되었습니다" });
                }}
              />
            </tbody>
          </table>
         </div>
        </CardContent>
      </Card>

      <RfqMatchStatsCard />

      <Card>
        <CardHeader>
          <CardTitle>카테고리별 수수료율</CardTitle>
          <CardDescription>정기 업무는 고정 5%, 비정기/단건은 슬라이딩 10/7/5%</CardDescription>
        </CardHeader>
        <CardContent>
         <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead><tr className="border-b"><th className="text-left p-2">카테고리</th><th className="text-left p-2">유형</th><th className="text-left p-2">고정 요율(%)</th><th></th></tr></thead>
            <tbody>
              {rates?.map((r) => (
                <RateRow
                  key={r.category}
                  row={r}
                  onSave={async (data) => {
                    await upsertRate.mutateAsync({ data });
                    qc.invalidateQueries({ queryKey: getListCommissionRatesQueryKey() });
                    toast({ title: "수수료율이 저장되었습니다" });
                  }}
                />
              ))}
            </tbody>
          </table>
         </div>
        </CardContent>
      </Card>
    </div>
  );
}

// [Task #226] HQ 어드민용 매칭/제출/환불 통계.
// 단가/환불 정책을 조정한 결과가 실제 매칭 모수와 누적 차감/환불에 어떻게 반영되는지 확인할 수 있어야 한다.
export function RfqMatchStatsCard() {
  const { user } = useAuth();
  const isHqAdmin = user?.role === "platform_admin" || user?.role === "hq_executive";
  const { data, isLoading } = useGetRfqAdminStats({ query: { enabled: isHqAdmin } });
  if (!isHqAdmin) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>RFQ 매칭 · 크레딧 통계 (HQ)</CardTitle>
        <CardDescription>
          공고별 매칭 파트너 수 · 견적 제출 수 · 누적 차감/환불 크레딧입니다. 단가 행을 변경한 결과가 매칭 모수에 어떻게 반영되는지 확인하세요.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">불러오는 중...</div>
        ) : !data || data.rows.length === 0 ? (
          <div className="text-sm text-muted-foreground">아직 집계할 RFQ가 없습니다.</div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">매칭 파트너 합계</div><div className="text-lg font-semibold">{data.totals.matched}</div></div>
              <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">제출된 견적</div><div className="text-lg font-semibold">{data.totals.quoted}</div></div>
              <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">누적 차감 크레딧</div><div className="text-lg font-semibold">{data.totals.debited.toLocaleString()}C</div></div>
              <div className="rounded-md border p-3"><div className="text-xs text-muted-foreground">누적 환불 크레딧</div><div className="text-lg font-semibold">{data.totals.refunded.toLocaleString()}C</div></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[760px]">
                <thead><tr className="border-b">
                  <th className="text-left p-2">RFQ</th>
                  <th className="text-left p-2">카테고리</th>
                  <th className="text-left p-2">지역</th>
                  <th className="text-right p-2">매칭</th>
                  <th className="text-right p-2">견적</th>
                  <th className="text-right p-2">차감(C)</th>
                  <th className="text-right p-2">환불(C)</th>
                </tr></thead>
                <tbody>
                  {data.rows.slice(0, 50).map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="p-2"><span className="text-xs text-muted-foreground">#{r.id}</span> {r.title}</td>
                      <td className="p-2">{r.category}</td>
                      <td className="p-2 text-xs text-muted-foreground">{[r.sido, r.sigungu].filter(Boolean).join(" ") || "—"}</td>
                      <td className="p-2 text-right">{r.matchedPartnerCount}</td>
                      <td className="p-2 text-right">{r.quoteCount}</td>
                      <td className="p-2 text-right">{r.creditsDebited.toLocaleString()}</td>
                      <td className="p-2 text-right">{r.creditsRefunded.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PricingRow({ row, onSave, onDelete }: { row: CreditCategoryPricing; onSave: (d: UpsertCreditCategoryPricingBody) => Promise<void>; onDelete?: () => Promise<void> }) {
  const [tier, setTier] = useState(String(row.tier));
  const [cost, setCost] = useState(String(row.creditCost));
  const isRegional = !!(row.sido || row.sigungu);
  // [Task #226] PRICING_DEFAULTS — Tier 1 / 1C 가 코드 기본값. (lib/db schema default 와 일치)
  const PRICING_DEFAULT_TIER = "1";
  const PRICING_DEFAULT_COST = "1";
  return (
    <tr className="border-b">
      <td className="p-2 font-medium">{row.category}</td>
      <td className="p-2 text-xs text-muted-foreground">{row.sido ?? "(기본)"}</td>
      <td className="p-2 text-xs text-muted-foreground">{row.sigungu ?? "(전체)"}</td>
      <td className="p-2"><Input value={tier} onChange={(e) => setTier(e.target.value)} className="h-8 w-16" /></td>
      <td className="p-2"><Input value={cost} onChange={(e) => setCost(e.target.value)} className="h-8 w-20" /></td>
      <td className="p-2 text-right space-x-2 whitespace-nowrap">
        {row.updatedAt && (
          <span className="text-[10px] text-muted-foreground mr-1">
            최근 변경 {new Date(row.updatedAt).toLocaleDateString("ko-KR")}
            {row.updatedBy ? ` · ${row.updatedBy}` : ""}
          </span>
        )}
        <Button size="sm" variant="outline" onClick={() => onSave({ category: row.category, sido: row.sido ?? null, sigungu: row.sigungu ?? null, tier: Number(tier), creditCost: Number(cost), description: row.description })}>
          저장
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            if (!confirm(`Tier ${PRICING_DEFAULT_TIER} / ${PRICING_DEFAULT_COST}C 로 되돌릴까요?`)) return;
            setTier(PRICING_DEFAULT_TIER);
            setCost(PRICING_DEFAULT_COST);
            await onSave({ category: row.category, sido: row.sido ?? null, sigungu: row.sigungu ?? null, tier: Number(PRICING_DEFAULT_TIER), creditCost: Number(PRICING_DEFAULT_COST), description: row.description });
          }}
        >
          기본값 복원
        </Button>
        {isRegional && onDelete && (
          <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => onDelete()}>삭제</Button>
        )}
      </td>
    </tr>
  );
}

function NewPricingRow({ onSave }: { onSave: (d: UpsertCreditCategoryPricingBody) => Promise<void> }) {
  const [category, setCategory] = useState("");
  const [sido, setSido] = useState("");
  const [sigungu, setSigungu] = useState("");
  const [tier, setTier] = useState("1");
  const [cost, setCost] = useState("1");
  return (
    <tr className="border-b bg-muted/30">
      <td className="p-2"><Input placeholder="elevator/cleaning…" value={category} onChange={(e) => setCategory(e.target.value)} className="h-8 w-32" /></td>
      <td className="p-2"><Input placeholder="서울특별시" value={sido} onChange={(e) => setSido(e.target.value)} className="h-8 w-28" /></td>
      <td className="p-2"><Input placeholder="강남구" value={sigungu} onChange={(e) => setSigungu(e.target.value)} className="h-8 w-28" /></td>
      <td className="p-2"><Input value={tier} onChange={(e) => setTier(e.target.value)} className="h-8 w-16" /></td>
      <td className="p-2"><Input value={cost} onChange={(e) => setCost(e.target.value)} className="h-8 w-20" /></td>
      <td className="p-2 text-right">
        <Button
          size="sm"
          onClick={async () => {
            if (!category.trim()) return;
            await onSave({
              category: category.trim(),
              sido: sido.trim() || null,
              sigungu: sigungu.trim() || null,
              tier: Number(tier),
              creditCost: Number(cost),
              description: null,
            });
            setCategory(""); setSido(""); setSigungu(""); setTier("1"); setCost("1");
          }}
        >
          + 추가
        </Button>
      </td>
    </tr>
  );
}

// [Task #226] 운영팀이 안전하게 되돌릴 수 있도록 정책 기본값을 코드 한 곳에 모아둔다.
const REFUND_POLICY_DEFAULTS = { days: "7", ratio: "0.6" } as const;

function RefundPolicyEditor() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: settings } = useListPlatformSettings();
  const upsert = useUpsertPlatformSetting();
  const daysSetting = settings?.find((s) => s.key === "no_view_refund_days");
  const ratioSetting = settings?.find((s) => s.key === "no_view_refund_ratio");
  const initialDays = daysSetting?.value ?? REFUND_POLICY_DEFAULTS.days;
  const initialRatio = ratioSetting?.value ?? REFUND_POLICY_DEFAULTS.ratio;
  const [days, setDays] = useState<string>(initialDays);
  const [ratio, setRatio] = useState<string>(initialRatio);
  // [Task #226] 정책 값이 늦게 도착해도 입력에 반영되도록 동기화.
  useEffect(() => {
    if (settings) {
      setDays(settings.find((s) => s.key === "no_view_refund_days")?.value ?? REFUND_POLICY_DEFAULTS.days);
      setRatio(settings.find((s) => s.key === "no_view_refund_ratio")?.value ?? REFUND_POLICY_DEFAULTS.ratio);
    }
  }, [settings]);
  const lastUpdated = [daysSetting?.updatedAt, ratioSetting?.updatedAt]
    .filter(Boolean)
    .sort()
    .at(-1);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
        <div>
          <Label className="text-xs">미열람 기준 일수</Label>
          <Input value={days} onChange={(e) => setDays(e.target.value)} className="h-9" />
          <p className="text-[11px] text-muted-foreground mt-1">기본값 {REFUND_POLICY_DEFAULTS.days}일</p>
        </div>
        <div>
          <Label className="text-xs">환불 비율 (0~1)</Label>
          <Input value={ratio} onChange={(e) => setRatio(e.target.value)} className="h-9" />
          <p className="text-[11px] text-muted-foreground mt-1">기본값 {REFUND_POLICY_DEFAULTS.ratio} (=60%)</p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="h-9"
            onClick={async () => {
              const d = Number(days);
              const r = Number(ratio);
              if (!(d >= 1 && d <= 60)) { toast({ title: "일수는 1~60 사이여야 합니다", variant: "destructive" }); return; }
              if (!(r > 0 && r <= 1)) { toast({ title: "비율은 0 초과 1 이하여야 합니다", variant: "destructive" }); return; }
              await upsert.mutateAsync({ data: { key: "no_view_refund_days", value: String(d), description: "관리소장 미열람 환불 기준 일수" } });
              await upsert.mutateAsync({ data: { key: "no_view_refund_ratio", value: String(r), description: "관리소장 미열람 환불 비율 (0~1)" } });
              qc.invalidateQueries({ queryKey: getListPlatformSettingsQueryKey() });
              toast({ title: "환불 정책이 저장되었습니다" });
            }}
          >
            저장
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            onClick={async () => {
              if (!confirm(`기본값(${REFUND_POLICY_DEFAULTS.days}일 / ${Math.round(Number(REFUND_POLICY_DEFAULTS.ratio) * 100)}%)으로 되돌릴까요?`)) return;
              await upsert.mutateAsync({ data: { key: "no_view_refund_days", value: REFUND_POLICY_DEFAULTS.days, description: "관리소장 미열람 환불 기준 일수" } });
              await upsert.mutateAsync({ data: { key: "no_view_refund_ratio", value: REFUND_POLICY_DEFAULTS.ratio, description: "관리소장 미열람 환불 비율 (0~1)" } });
              qc.invalidateQueries({ queryKey: getListPlatformSettingsQueryKey() });
              setDays(REFUND_POLICY_DEFAULTS.days);
              setRatio(REFUND_POLICY_DEFAULTS.ratio);
              toast({ title: "기본값으로 되돌렸습니다" });
            }}
          >
            기본값 복원
          </Button>
        </div>
      </div>
      {lastUpdated && (
        <p className="text-[11px] text-muted-foreground">
          최근 변경: {new Date(lastUpdated).toLocaleString("ko-KR")}
          {(() => {
            const lastBy = (daysSetting?.updatedAt ?? "") >= (ratioSetting?.updatedAt ?? "")
              ? daysSetting?.updatedBy
              : ratioSetting?.updatedBy;
            return lastBy ? ` · ${lastBy}` : "";
          })()}
        </p>
      )}
    </div>
  );
}

function RateRow({ row, onSave }: { row: CommissionRate; onSave: (d: UpsertCommissionRateBody) => Promise<void> }) {
  const [rateType, setRateType] = useState(row.rateType);
  const [fixedRate, setFixedRate] = useState(String(row.fixedRate));
  return (
    <tr className="border-b">
      <td className="p-2 font-medium">{row.category}</td>
      <td className="p-2">
        <select value={rateType} onChange={(e) => setRateType(e.target.value as CommissionRate["rateType"])} className="h-8 text-xs border rounded px-2">
          <option value="fixed">고정</option>
          <option value="sliding">슬라이딩</option>
        </select>
      </td>
      <td className="p-2"><Input value={fixedRate} onChange={(e) => setFixedRate(e.target.value)} className="h-8 w-20" /></td>
      <td className="p-2 text-right">
        <Button size="sm" variant="outline" onClick={() => onSave({ category: row.category, rateType, fixedRate: Number(fixedRate), slidingRules: row.slidingRules, description: row.description })}>
          저장
        </Button>
      </td>
    </tr>
  );
}

type SocialProvider = "naver" | "kakao" | "google";
const SOCIAL_PROVIDER_LABEL: Record<SocialProvider, string> = {
  naver: "네이버",
  kakao: "카카오",
  google: "구글",
};

interface ConnectedSocialAccount {
  provider: SocialProvider;
  email: string | null;
  displayName: string | null;
  connectedAt: string;
}

interface ProviderEnabled {
  provider: SocialProvider;
  enabled: boolean;
}

function SocialAccountsCard() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState<ConnectedSocialAccount[]>([]);
  const [providers, setProviders] = useState<ProviderEnabled[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!token) return;
    try {
      const [accRes, provRes] = await Promise.all([
        fetch(`${apiBase}/auth/social-accounts`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiBase}/auth/oauth/providers`),
      ]);
      const accData = await accRes.json();
      const provData = await provRes.json();
      setAccounts(accData.accounts || []);
      setProviders(provData.providers || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // detect link callback in hash
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const linked = params.get("linked");
    const errCode = params.get("error");
    if (linked) {
      toast({ title: `${SOCIAL_PROVIDER_LABEL[linked as SocialProvider] || linked} 계정이 연결되었습니다` });
      window.location.hash = "";
    } else if (errCode === "already_linked_to_other_account") {
      toast({ title: "해당 소셜 계정은 이미 다른 사용자에 연결되어 있습니다", variant: "destructive" });
      window.location.hash = "";
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleUnlink(provider: SocialProvider) {
    if (!confirm(`${SOCIAL_PROVIDER_LABEL[provider]} 계정 연결을 해제하시겠습니까?`)) return;
    const res = await fetch(`${apiBase}/auth/social-accounts/${provider}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      toast({ title: data.error || "해제에 실패했습니다", variant: "destructive" });
      return;
    }
    toast({ title: "연결이 해제되었습니다" });
    refresh();
  }

  async function handleLink(provider: SocialProvider) {
    try {
      const r = await fetch(`${apiBase}/auth/oauth/${provider}/link/init`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data?.authorizeUrl) {
        toast({
          title: "연결 실패",
          description: data?.error || "소셜 계정 연결을 시작할 수 없습니다",
          variant: "destructive",
        });
        return;
      }
      window.location.href = data.authorizeUrl;
    } catch {
      toast({ title: "네트워크 오류", description: "잠시 후 다시 시도해 주세요", variant: "destructive" });
    }
  }

  const connectedSet = new Set(accounts.map((a) => a.provider));
  const allProviders: SocialProvider[] = ["naver", "kakao", "google"];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="w-4 h-4" />
          연결된 소셜 계정
        </CardTitle>
        <CardDescription>네이버·카카오·구글 계정으로 빠르게 로그인할 수 있습니다</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="text-sm text-muted-foreground">불러오는 중...</div>
        ) : (
          allProviders.map((p) => {
            const isConnected = connectedSet.has(p);
            const acc = accounts.find((a) => a.provider === p);
            const enabled = providers.find((x) => x.provider === p)?.enabled ?? false;
            return (
              <div key={p} className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <p className="font-medium text-sm">{SOCIAL_PROVIDER_LABEL[p]}</p>
                  <p className="text-xs text-muted-foreground">
                    {isConnected
                      ? `연결됨${acc?.email ? ` · ${acc.email}` : ""}`
                      : enabled
                      ? "미연결"
                      : "관리자가 아직 구성하지 않음"}
                  </p>
                </div>
                {isConnected ? (
                  <Button size="sm" variant="outline" onClick={() => handleUnlink(p)}>
                    <Unlink className="w-3.5 h-3.5 mr-1" /> 해제
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled={!enabled} onClick={() => handleLink(p)}>
                    <Link2 className="w-3.5 h-3.5 mr-1" /> 연결
                  </Button>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function ProfileSettings() {
  const { token, user, setUser, logout } = useAuth();
  const { building } = useBuilding();
  const { toast } = useToast();

  const derivedName = building?.name ? `${building.name} 관리사무소` : "";
  const [name, setName] = useState(user?.name || derivedName);
  const [phone, setPhone] = useState(user?.phone || "");
  const [saving, setSaving] = useState(false);
  const prevDerivedRef = useRef(derivedName);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (user) {
      setName(user.name || derivedName);
      setPhone(user.phone || "");
    }
    // intentionally not depending on derivedName — initial sync only on user change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Auto-update name when building name changes, but only if the user hasn't
  // customized it (i.e., the field is empty or still matches the previous derived value).
  useEffect(() => {
    setName((prev) => {
      const wasDerived = !prev || prev === prevDerivedRef.current;
      prevDerivedRef.current = derivedName;
      return wasDerived ? derivedName : prev;
    });
  }, [derivedName]);

  async function handleSaveProfile() {
    if (!name.trim()) {
      toast({ title: "이름을 입력해주세요", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/auth/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      const result = await res.json();
      if (res.ok && result.user) {
        if (setUser && user) {
          setUser({ ...user, name: result.user.name, phone: result.user.phone });
        }
        toast({ title: "정보가 수정되었습니다" });
      } else {
        toast({ title: result.error || "수정에 실패했습니다", variant: "destructive" });
      }
    } catch {
      toast({ title: "수정 중 오류가 발생했습니다", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const hasPassword = user?.hasPassword !== false; // default true if undefined (legacy)

  async function handleChangePassword() {
    if (!newPassword) {
      toast({ title: "새 비밀번호를 입력해주세요", variant: "destructive" });
      return;
    }
    if (hasPassword && !currentPassword) {
      toast({ title: "현재 비밀번호를 입력해주세요", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "새 비밀번호가 일치하지 않습니다", variant: "destructive" });
      return;
    }
    if (newPassword.length < 8) {
      toast({ title: "새 비밀번호는 8자 이상이어야 합니다", variant: "destructive" });
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch(`${apiBase}/auth/me/password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(hasPassword ? { currentPassword, newPassword } : { newPassword }),
      });
      const result = await res.json();
      if (res.ok) {
        toast({ title: hasPassword ? "비밀번호가 변경되었습니다" : "비밀번호가 설정되었습니다" });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        if (setUser && user) setUser({ ...user, hasPassword: true });
      } else {
        toast({ title: result.error || "비밀번호 변경에 실패했습니다", variant: "destructive" });
      }
    } catch {
      toast({ title: "비밀번호 변경 중 오류가 발생했습니다", variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="w-4 h-4" />
            기본 정보
          </CardTitle>
          <CardDescription>이름과 연락처를 수정할 수 있습니다</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 desktop:grid-cols-2 gap-4">
            <div>
              <Label className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                이메일
              </Label>
              <Input value={user?.email || ""} disabled className="mt-1 bg-muted" />
              <p className="text-xs text-muted-foreground mt-1">이메일은 변경할 수 없습니다</p>
            </div>
            <div>
              <Label className="flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                이름 *
              </Label>
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="이름을 입력하세요"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                연락처
              </Label>
              <Input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="010-0000-0000"
                className="mt-1"
              />
            </div>
          </div>
          <Button onClick={handleSaveProfile} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            저장
          </Button>
        </CardContent>
      </Card>

      {user?.portalType !== "hq" && <SocialAccountsCard />}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="w-4 h-4" />
            {hasPassword ? "비밀번호 변경" : "비밀번호 설정"}
          </CardTitle>
          <CardDescription>
            {hasPassword
              ? "현재 비밀번호를 확인 후 새 비밀번호로 변경합니다"
              : "소셜 로그인 외에 이메일·비밀번호로도 로그인하려면 비밀번호를 설정해 주세요"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={`grid grid-cols-1 ${hasPassword ? "desktop:grid-cols-3" : "desktop:grid-cols-2"} gap-4`}>
            {hasPassword && (
              <div>
                <Label>현재 비밀번호</Label>
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="현재 비밀번호"
                  className="mt-1"
                />
              </div>
            )}
            <div>
              <Label>새 비밀번호</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="8자 이상"
                className="mt-1"
              />
            </div>
            <div>
              <Label>새 비밀번호 확인</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="새 비밀번호 확인"
                className="mt-1"
              />
            </div>
          </div>
          {newPassword && confirmPassword && newPassword === confirmPassword && (
            <div className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              비밀번호가 일치합니다
            </div>
          )}
          <Button onClick={handleChangePassword} disabled={changingPassword} variant="outline">
            {changingPassword ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Lock className="w-4 h-4 mr-2" />}
            비밀번호 변경
          </Button>
        </CardContent>
      </Card>

      {/* 설정 화면 최하단 로그아웃 */}
      <Card>
        <CardContent className="pt-6">
          <Button
            onClick={() => {
              if (confirm("로그아웃 하시겠습니까?")) logout();
            }}
            variant="outline"
            className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4 mr-2" />
            로그아웃
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
