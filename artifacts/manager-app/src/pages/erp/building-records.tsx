import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Zap, Droplets, Flame, Gift, Receipt, Coins, Sparkles, Clipboard,
  TrendingUp, TrendingDown, Minus, Save, FileText,
} from "lucide-react";

type EnergyEntry = { usage: number; unit: string; amount: number; avgPerUnit: number; basicCharge?: number; usageCharge?: number } | null;
type EnergySection = { electricity: EnergyEntry; water: EnergyEntry; heating: EnergyEntry; gas: EnergyEntry };
type DiscountSection = {
  energyVoucher: { count: number; amount: number } | null;
  tvFeeExemption: { count: number; amount: number } | null;
  socialDiscount: { count: number; amount: number } | null;
  notes: string | null;
};
type OneTimeChargeSection = {
  elevatorUsage: { count: number; amount: number } | null;
  moveInOut: { count: number; amount: number } | null;
  foodWaste: { weightKg: number; amount: number } | null;
  notes: string | null;
};
type CollectionSection = {
  billedAmount: number; collectedAmount: number; collectionRate: number;
  overdueAmount: number; overdueCount: number; bankMatched: number; bankUnmatched: number;
  autoTransferCount: number; autoTransferAmount: number; lateFeeAmount: number;
  matchExactCount: number; matchExactAmount: number;
  matchShortageCount: number; matchShortageAmount: number;
  matchOverCount: number; matchOverAmount: number;
  externalDepositMemo: string | null;
};
type PartnerPayoutEntry = { vendorName: string; amount: number };
type TransparencySection = {
  cleaning: number; disinfection: number; maintenance: number; longTermRepairFund: number;
  partnerPayoutTotal: number; partnerPayoutCount: number; partnerPayouts: PartnerPayoutEntry[];
  taxInvoiceCount: number; notes: string | null;
};
type EvidenceLink = { label: string; href: string };
type EvidenceLinks = Partial<Record<"energy" | "discounts" | "oneTimeCharges" | "collection" | "transparency", EvidenceLink[]>>;
type Snapshot = {
  energy: EnergySection;
  discounts: DiscountSection;
  oneTimeCharges: OneTimeChargeSection;
  collection: CollectionSection;
  transparency: TransparencySection;
};
type Resp = {
  buildingId: number;
  buildingName: string | null;
  month: string;
  record: { id: number; summaryDraft: string | null; lastEditedAt: string | null };
  current: Snapshot;
  previousMonth: { month: string; snapshot: Snapshot };
  previousYear: { month: string; snapshot: Snapshot };
  evidenceLinks: EvidenceLinks;
  role: string;
  canEdit: boolean;
};

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return Math.round(n).toLocaleString();
}

function pctDelta(curr: number, prev: number): { v: number; sign: 1 | -1 | 0 } | null {
  if (!prev) return null;
  const v = ((curr - prev) / prev) * 100;
  return { v: Math.round(v * 10) / 10, sign: v > 0 ? 1 : v < 0 ? -1 : 0 };
}

function DeltaBadge({ delta, suffix = "%" }: { delta: { v: number; sign: 1 | -1 | 0 } | null; suffix?: string }) {
  if (!delta) return <span className="text-xs text-muted-foreground">-</span>;
  const Icon = delta.sign > 0 ? TrendingUp : delta.sign < 0 ? TrendingDown : Minus;
  const color = delta.sign > 0 ? "text-red-600" : delta.sign < 0 ? "text-emerald-600" : "text-muted-foreground";
  return (
    <span className={`text-xs flex items-center gap-1 ${color}`}>
      <Icon className="w-3 h-3" />
      {delta.v > 0 ? "+" : ""}{delta.v}{suffix}
    </span>
  );
}

export default function BuildingRecordsPage() {
  const { token } = useAuth();
  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");
  const [month, setMonth] = useState<string>(thisMonth());
  const [data, setData] = useState<Resp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Editable manual fields
  const [discounts, setDiscounts] = useState<DiscountSection | null>(null);
  const [oneTime, setOneTime] = useState<OneTimeChargeSection | null>(null);
  const [externalDepositMemo, setExternalDepositMemo] = useState<string>("");
  const [transparencyNotes, setTransparencyNotes] = useState<string>("");

  async function load() {
    if (!token) return;
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${apiBase}/building-records?month=${month}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error || "응대 자료를 불러오지 못했습니다");
      }
      const j: Resp = await r.json();
      setData(j);
      setDiscounts(j.current.discounts);
      setOneTime(j.current.oneTimeCharges);
      setExternalDepositMemo(j.current.collection.externalDepositMemo ?? "");
      setTransparencyNotes(j.current.transparency.notes ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [month, token]);

  async function saveOverrides() {
    if (!token || !data) return;
    setSaving(true);
    try {
      const r = await fetch(`${apiBase}/building-records?month=${month}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          overrides: {
            discounts,
            oneTimeCharges: oneTime,
            collection: { externalDepositMemo: externalDepositMemo || null },
            transparency: { notes: transparencyNotes || null },
          },
        }),
      });
      if (!r.ok) throw new Error("저장 실패");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function generateSummary() {
    if (!token) return;
    setSaving(true);
    try {
      await fetch(`${apiBase}/building-records?month=${month}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          overrides: {
            discounts,
            oneTimeCharges: oneTime,
            collection: { externalDepositMemo: externalDepositMemo || null },
            transparency: { notes: transparencyNotes || null },
          },
        }),
      });
      const r = await fetch(`${apiBase}/building-records/summary?month=${month}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error("응대문 생성 실패");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const energyDeltas = useMemo(() => {
    if (!data) return null;
    const c = data.current.energy, p = data.previousMonth.snapshot.energy, y = data.previousYear.snapshot.energy;
    return {
      electricity: {
        mom: pctDelta(c.electricity?.usage ?? 0, p.electricity?.usage ?? 0),
        yoy: pctDelta(c.electricity?.usage ?? 0, y.electricity?.usage ?? 0),
      },
      water: {
        mom: pctDelta(c.water?.usage ?? 0, p.water?.usage ?? 0),
        yoy: pctDelta(c.water?.usage ?? 0, y.water?.usage ?? 0),
      },
      heating: {
        mom: pctDelta(c.heating?.usage ?? 0, p.heating?.usage ?? 0),
        yoy: pctDelta(c.heating?.usage ?? 0, y.heating?.usage ?? 0),
      },
    };
  }, [data]);

  if (loading) {
    return <div className="container max-w-5xl py-10 text-center text-muted-foreground">불러오는 중...</div>;
  }
  if (error) {
    return (
      <div className="container max-w-5xl py-10">
        <Card><CardContent className="py-8 text-center text-red-600">{error}</CardContent></Card>
      </div>
    );
  }
  if (!data) return null;

  const c = data.current;

  return (
    <div className="container max-w-5xl py-6 space-y-5 pb-24">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <Clipboard className="w-6 h-6" />
            관리비 응대 자료
          </h1>
          <p className="text-sm text-muted-foreground">
            {data.buildingName ?? "건물"} · {data.month} · 월별 항목별 한장 요약
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="m" className="text-sm">청구월</Label>
          <Input id="m" type="month" value={month} onChange={e => setMonth(e.target.value)} className="w-40" />
        </div>
      </div>

      {/* Top: 응대 요약 초안 (페이지 로드 시 자동 생성·표시) */}
      <Card className="border-primary/40 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            응대 요약 초안
          </CardTitle>
          <CardDescription>입주민 문의 응대용 한장 초안 — 5개 영역 자동 종합</CardDescription>
        </CardHeader>
        <CardContent>
          {data.record.summaryDraft ? (
            <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans bg-white border rounded p-3">
              {data.record.summaryDraft}
            </pre>
          ) : (
            <div className="text-sm text-muted-foreground">초안이 없습니다. 하단 버튼에서 재생성하세요.</div>
          )}
        </CardContent>
      </Card>

      {/* 1) Energy */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-600" />
            1. 에너지·검침 사용량
          </CardTitle>
          <CardDescription>전월 / 전년 동월 대비 자동 계산</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { key: "electricity" as const, label: "전기", icon: Zap, color: "text-amber-600", v: c.energy.electricity },
              { key: "water" as const, label: "수도", icon: Droplets, color: "text-blue-600", v: c.energy.water },
              { key: "heating" as const, label: "난방", icon: Flame, color: "text-orange-600", v: c.energy.heating },
            ].map(({ key, label, icon: Icon, color, v }) => (
              <div key={key} className="rounded-lg border p-3 space-y-2">
                <div className={`flex items-center gap-2 text-sm font-medium ${color}`}>
                  <Icon className="w-4 h-4" />{label}
                </div>
                <div className="text-xl font-bold">{v ? `${fmt(v.usage)} ${v.unit}` : "데이터 없음"}</div>
                {v && (
                  <div className="text-xs text-muted-foreground">
                    청구 ₩{fmt(v.amount)} · 세대평균 {v.avgPerUnit} {v.unit}
                    {v.basicCharge !== undefined && <> · 기본 ₩{fmt(v.basicCharge)}</>}
                    {v.usageCharge !== undefined && <> · 사용 ₩{fmt(v.usageCharge)}</>}
                  </div>
                )}
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">전월</span>
                  <DeltaBadge delta={energyDeltas?.[key]?.mom ?? null} />
                  <span className="text-muted-foreground">전년</span>
                  <DeltaBadge delta={energyDeltas?.[key]?.yoy ?? null} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 2) Discounts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Gift className="w-4 h-4 text-pink-600" />
            2. 감면·바우처 적용 현황
          </CardTitle>
          <CardDescription>에너지 바우처 / TV 수신료 면제 / 사회적 할인 (수기 입력)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {discounts && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <DiscountField
                label="에너지 바우처" disabled={!data.canEdit}
                value={discounts.energyVoucher}
                onChange={v => setDiscounts({ ...discounts, energyVoucher: v })}
              />
              <DiscountField
                label="TV 수신료 면제" disabled={!data.canEdit}
                value={discounts.tvFeeExemption}
                onChange={v => setDiscounts({ ...discounts, tvFeeExemption: v })}
              />
              <DiscountField
                label="사회적 할인" disabled={!data.canEdit}
                value={discounts.socialDiscount}
                onChange={v => setDiscounts({ ...discounts, socialDiscount: v })}
              />
            </div>
          )}
          {discounts && (
            <Textarea
              placeholder="비고 (예: 적용 근거, 신청 일자 등)"
              value={discounts.notes ?? ""}
              disabled={!data.canEdit}
              onChange={e => setDiscounts({ ...discounts, notes: e.target.value })}
            />
          )}
        </CardContent>
      </Card>

      {/* 3) One-time / special charges */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="w-4 h-4 text-purple-600" />
            3. 일시·특수 부과 흐름
          </CardTitle>
          <CardDescription>승강기 사용료, 이사 정산, 음식물 처리비 등 (수기 입력)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {oneTime && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <DiscountField
                label="승강기 사용료" disabled={!data.canEdit}
                value={oneTime.elevatorUsage}
                onChange={v => setOneTime({ ...oneTime, elevatorUsage: v })}
              />
              <DiscountField
                label="이사 정산" disabled={!data.canEdit}
                value={oneTime.moveInOut}
                onChange={v => setOneTime({ ...oneTime, moveInOut: v })}
              />
              <FoodWasteField
                disabled={!data.canEdit}
                value={oneTime.foodWaste}
                onChange={v => setOneTime({ ...oneTime, foodWaste: v })}
              />
            </div>
          )}
          {oneTime && (
            <Textarea
              placeholder="비고"
              value={oneTime.notes ?? ""}
              disabled={!data.canEdit}
              onChange={e => setOneTime({ ...oneTime, notes: e.target.value })}
            />
          )}
        </CardContent>
      </Card>

      {/* 4) Collection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Coins className="w-4 h-4 text-emerald-600" />
            4. 수납·연체 현황
          </CardTitle>
          <CardDescription>월별 부과·수납·연체 자동 합산</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="부과 총액" value={`₩${fmt(c.collection.billedAmount)}`} />
            <Stat label="수납 총액" value={`₩${fmt(c.collection.collectedAmount)}`} />
            <Stat label="수납률" value={`${c.collection.collectionRate}%`} />
            <Stat
              label={`미납 ${c.collection.overdueCount}건`}
              value={`₩${fmt(c.collection.overdueAmount)}`}
              variant={c.collection.overdueAmount > 0 ? "warn" : "default"}
            />
          </div>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <div className="border rounded p-2">
              <div className="text-muted-foreground">은행 매칭 일치</div>
              <div className="font-semibold">{c.collection.matchExactCount}건 · ₩{fmt(c.collection.matchExactAmount)}</div>
            </div>
            <div className="border rounded p-2">
              <div className="text-muted-foreground">부족 입금</div>
              <div className="font-semibold text-amber-600">{c.collection.matchShortageCount}건 · ₩{fmt(c.collection.matchShortageAmount)}</div>
            </div>
            <div className="border rounded p-2">
              <div className="text-muted-foreground">초과 입금</div>
              <div className="font-semibold text-blue-600">{c.collection.matchOverCount}건 · ₩{fmt(c.collection.matchOverAmount)}</div>
            </div>
          </div>
          <div className="mt-3 text-xs text-muted-foreground space-y-1">
            <div>자동이체 {c.collection.autoTransferCount}건 · ₩{fmt(c.collection.autoTransferAmount)} · 미매칭 ₩{fmt(c.collection.bankUnmatched)} · 연체 가산 ₩{fmt(c.collection.lateFeeAmount)}</div>
            {data.role === "hq_executive" && <div>(직무권한에 따라 일부 항목이 마스킹됩니다)</div>}
          </div>
          {data.canEdit && (
            <div className="mt-3">
              <Label className="text-xs">외부 입금 메모 (지로/계좌 외 입금 보정)</Label>
              <Textarea
                value={externalDepositMemo}
                onChange={e => setExternalDepositMemo(e.target.value)}
                placeholder="예) 9/3 무통장 12,300원 - 305호 추가 입금 확인"
                rows={2}
              />
            </div>
          )}
          {data.evidenceLinks.collection && data.evidenceLinks.collection.length > 0 && (
            <div className="mt-3 text-xs text-muted-foreground">
              근거 문서:&nbsp;
              {data.evidenceLinks.collection.map((l, i) => (
                <a key={i} href={l.href} className="underline mr-2" target="_blank" rel="noreferrer">{l.label}</a>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 5) Transparency */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            5. 공용 관리비 사용처 투명성
          </CardTitle>
          <CardDescription>고지서 OCR로 추출된 항목 자동 반영</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="청소비" value={`₩${fmt(c.transparency.cleaning)}`} />
            <Stat label="소독비" value={`₩${fmt(c.transparency.disinfection)}`} />
            <Stat label="유지보수" value={`₩${fmt(c.transparency.maintenance)}`} />
            <Stat label="장기수선충당금" value={`₩${fmt(c.transparency.longTermRepairFund)}`} />
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            전자세금계산서 수신 {c.transparency.taxInvoiceCount}건
          </div>
          {data.canEdit && (
            <div className="mt-3">
              <Label className="text-xs">투명성 비고 (특이 지출/수기 보정 사유)</Label>
              <Textarea value={transparencyNotes} onChange={e => setTransparencyNotes(e.target.value)} rows={2} />
            </div>
          )}
          {data.evidenceLinks.transparency && data.evidenceLinks.transparency.length > 0 && (
            <div className="mt-3 text-xs text-muted-foreground">
              근거 문서:&nbsp;
              {data.evidenceLinks.transparency.map((l, i) => (
                <a key={i} href={l.href} className="underline mr-2" target="_blank" rel="noreferrer">{l.label}</a>
              ))}
            </div>
          )}
          {c.transparency.partnerPayoutCount > 0 && (
            <div className="mt-4 border-t pt-3">
              <div className="text-xs text-muted-foreground mb-2">
                협력업체 정산 ({c.transparency.partnerPayoutCount}곳, 합계 ₩{fmt(c.transparency.partnerPayoutTotal)})
              </div>
              {c.transparency.partnerPayouts.length > 0 ? (
                <ul className="text-sm divide-y border rounded">
                  {c.transparency.partnerPayouts.slice(0, 8).map((p, i) => (
                    <li key={`${p.vendorName}-${i}`} className="flex items-center justify-between px-3 py-2">
                      <span>{p.vendorName}</span>
                      <span className="font-mono">₩{fmt(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-xs text-muted-foreground">거래처별 명세는 직무권한에 따라 마스킹됩니다.</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action bar */}
      {data.canEdit && (
        <div className="flex flex-wrap gap-2 sticky bottom-3 bg-white/95 border rounded-lg p-3 shadow-sm">
          <Button onClick={saveOverrides} disabled={saving} variant="outline" className="gap-2">
            <Save className="w-4 h-4" />수기 입력 저장
          </Button>
          <Button onClick={generateSummary} disabled={saving} className="gap-2">
            <FileText className="w-4 h-4" />응대문 자동 생성
          </Button>
          {data.record.lastEditedAt && (
            <Badge variant="secondary" className="ml-auto self-center">
              마지막 수정: {new Date(data.record.lastEditedAt).toLocaleString("ko-KR")}
            </Badge>
          )}
        </div>
      )}

      {/* Summary draft */}
      {data.record.summaryDraft && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              응대 요약문 (초안)
            </CardTitle>
            <CardDescription>입주민 문의 시 그대로 또는 수정해 안내하세요</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm bg-slate-50 rounded p-3 border">
              {data.record.summaryDraft}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, variant = "default" }: { label: string; value: string; variant?: "default" | "warn" }) {
  return (
    <div className={`rounded-lg border p-3 ${variant === "warn" ? "border-red-200 bg-red-50" : ""}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-bold mt-1 ${variant === "warn" ? "text-red-700" : ""}`}>{value}</div>
    </div>
  );
}

function DiscountField(
  { label, value, onChange, disabled }:
  { label: string; value: { count: number; amount: number } | null; onChange: (v: { count: number; amount: number } | null) => void; disabled?: boolean },
) {
  const v = value ?? { count: 0, amount: 0 };
  const enabled = !!value;
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{label}</div>
        <Button
          type="button" variant="ghost" size="sm" disabled={disabled}
          onClick={() => onChange(enabled ? null : { count: 0, amount: 0 })}
        >
          {enabled ? "비우기" : "추가"}
        </Button>
      </div>
      {enabled && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">건수</Label>
            <Input type="number" min={0} value={v.count} disabled={disabled}
              onChange={e => onChange({ count: Number(e.target.value) || 0, amount: v.amount })} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">금액(원)</Label>
            <Input type="number" min={0} value={v.amount} disabled={disabled}
              onChange={e => onChange({ count: v.count, amount: Number(e.target.value) || 0 })} />
          </div>
        </div>
      )}
    </div>
  );
}

function FoodWasteField(
  { value, onChange, disabled }:
  { value: { weightKg: number; amount: number } | null; onChange: (v: { weightKg: number; amount: number } | null) => void; disabled?: boolean },
) {
  const v = value ?? { weightKg: 0, amount: 0 };
  const enabled = !!value;
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">음식물 처리비</div>
        <Button
          type="button" variant="ghost" size="sm" disabled={disabled}
          onClick={() => onChange(enabled ? null : { weightKg: 0, amount: 0 })}
        >
          {enabled ? "비우기" : "추가"}
        </Button>
      </div>
      {enabled && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs text-muted-foreground">중량(kg)</Label>
            <Input type="number" min={0} value={v.weightKg} disabled={disabled}
              onChange={e => onChange({ weightKg: Number(e.target.value) || 0, amount: v.amount })} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">금액(원)</Label>
            <Input type="number" min={0} value={v.amount} disabled={disabled}
              onChange={e => onChange({ weightKg: v.weightKg, amount: Number(e.target.value) || 0 })} />
          </div>
        </div>
      )}
    </div>
  );
}
