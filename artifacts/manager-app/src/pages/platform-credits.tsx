import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import {
  useListAdminCreditTopupPackages,
  useListAdminCreditTopupOrders,
  createCreditTopupPackage,
  updateCreditTopupPackage,
  deleteCreditTopupPackage,
  type CreditTopupPackage,
  type AdminCreditTopupOrder,
  type UpsertCreditTopupPackageBody,
} from "@workspace/api-client-react";
import { VendorCreditsPanel } from "@/pages/admin-dashboard";

// [Task #312] 플랫폼 — 파트너 크레딧 현황 대시보드.
//   기존 "파트너 크레딧" 메뉴(잔액 표 + 수동 충전/차감)를 대시보드 형태로 재구성.
//   상단: KPI 카드 4개 / 월별 충전·소모·환불 추이 / 용역유형별 소모·환불.
//   하단: 기존 파트너별 잔액·수동 조정 패널을 그대로 유지(운영 편의).

const BASE = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

const CATEGORY_LABEL: Record<string, string> = {
  elevator: "승강기",
  water_tank: "저수조",
  fire_safety: "소방",
  electrical: "전기",
  gas: "가스",
  septic: "정화조",
  cleaning: "청소",
  security: "보안",
  waterproofing: "방수",
  maintenance_repair: "유지보수",
  defect_diagnosis: "하자진단",
  building_maintenance: "건물관리",
  mechanical: "기계",
  other: "기타",
  unknown: "미지정",
};

interface DashboardResponse {
  totals: {
    topUpAmount: number;
    consumptionAmount: number;
    refundAmount: number;
    refundCount: number;
    walletBalance: number;
    walletPointsBalance: number;
  };
  monthly: Array<{
    month: string;
    topUp: number;
    consumption: number;
    refund: number;
    refundCount: number;
  }>;
  byCategory: Array<{
    category: string;
    consumption: number;
    refund: number;
    consumptionCount: number;
    refundCount: number;
  }>;
  refundLast30d: { amount: number; count: number };
  months: number;
}

const fmtKRW = (n: number) => `${n.toLocaleString("ko-KR")} 크레딧`;
const fmtCount = (n: number) => `${n.toLocaleString("ko-KR")}건`;

function KpiCard({
  label, value, sub, tone,
}: { label: string; value: string; sub?: string; tone?: "default" | "blue" | "green" | "amber" }) {
  const toneClass =
    tone === "blue" ? "border-blue-200 bg-blue-50"
    : tone === "green" ? "border-emerald-200 bg-emerald-50"
    : tone === "amber" ? "border-amber-200 bg-amber-50"
    : "border-slate-200 bg-white";
  return (
    <Card className={`${toneClass} border`}>
      <CardContent className="p-4">
        <div className="text-xs text-slate-600">{label}</div>
        <div className="text-2xl font-bold mt-1 text-slate-900" data-testid={`kpi-${label}`}>{value}</div>
        {sub && <div className="text-[11px] text-slate-500 mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
}

export default function PlatformCreditsPage() {
  const [months, setMonths] = useState<number>(12);

  const { data, isLoading, error } = useQuery<DashboardResponse>({
    queryKey: ["platform-credits-dashboard", months],
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/credits/admin/dashboard?months=${months}`, {
        credentials: "include",
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
  });

  const monthly = data?.monthly ?? [];
  const byCategory = useMemo(() => {
    return (data?.byCategory ?? []).map((c) => ({
      ...c,
      label: CATEGORY_LABEL[c.category] ?? c.category,
    }));
  }, [data]);

  return (
    <div className="space-y-6" data-testid="page-platform-credits-dashboard">
      {/* 헤더 */}
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-900">파트너 크레딧 현황</h1>
          <p className="text-sm text-slate-500 mt-1">
            파트너 크레딧 충전·소모·환불 현황을 한눈에 확인합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">기간</span>
          <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
            <SelectTrigger className="h-8 w-28" data-testid="select-months">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3">최근 3개월</SelectItem>
              <SelectItem value="6">최근 6개월</SelectItem>
              <SelectItem value="12">최근 12개월</SelectItem>
              <SelectItem value="24">최근 24개월</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="총 충전금액 누계"
          value={fmtKRW(data?.totals.topUpAmount ?? 0)}
          sub="누적 (전체 기간)"
          tone="blue"
        />
        <KpiCard
          label="총 소모액 누계"
          value={fmtKRW(data?.totals.consumptionAmount ?? 0)}
          sub="견적 열람 등 차감"
        />
        <KpiCard
          label="미열람 환불 누계"
          value={fmtKRW(data?.totals.refundAmount ?? 0)}
          sub={`총 ${fmtCount(data?.totals.refundCount ?? 0)} · 최근 30일 ${fmtKRW(data?.refundLast30d.amount ?? 0)}`}
          tone="amber"
        />
        <KpiCard
          label="현재 지갑 잔액 합계"
          value={fmtKRW(data?.totals.walletBalance ?? 0)}
          sub={`포인트 ${fmtKRW(data?.totals.walletPointsBalance ?? 0)}`}
          tone="green"
        />
      </div>

      {/* 차트 영역 */}
      <Tabs defaultValue="trend">
        <TabsList>
          <TabsTrigger value="trend" data-testid="tab-trend">월별 추이</TabsTrigger>
          <TabsTrigger value="category" data-testid="tab-category">용역유형별</TabsTrigger>
          <TabsTrigger value="packages" data-testid="tab-packages">충전 패키지 관리</TabsTrigger>
          <TabsTrigger value="orders" data-testid="tab-orders">충전 결제 내역</TabsTrigger>
        </TabsList>

        <TabsContent value="trend" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">월별 충전금액 추이</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <div className="h-64">
                {isLoading ? (
                  <p className="text-sm text-slate-500">불러오는 중…</p>
                ) : error ? (
                  <p className="text-sm text-red-500">데이터를 불러오지 못했습니다.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthly} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v.toLocaleString("ko-KR")} />
                      <Tooltip formatter={(v: number) => fmtKRW(v)} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="topUp" name="충전" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">월별 소모·환불</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <div className="h-64">
                {monthly.length === 0 ? (
                  <p className="text-sm text-slate-500">표시할 데이터가 없습니다.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthly} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v.toLocaleString("ko-KR")} />
                      <Tooltip formatter={(v: number) => fmtKRW(v)} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="consumption" name="소모" fill="#475569" />
                      <Bar dataKey="refund" name="미열람 환불" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="category" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">용역유형별 소모·환불</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <div className="h-72">
                {byCategory.length === 0 ? (
                  <p className="text-sm text-slate-500">표시할 데이터가 없습니다.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={byCategory} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => v.toLocaleString("ko-KR")} />
                      <Tooltip formatter={(v: number) => fmtKRW(v)} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="consumption" name="소모" fill="#2563eb" />
                      <Bar dataKey="refund" name="미열람 환불" fill="#f59e0b" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 용역유형별 표 — 데스크톱: 표 / 모바일: 카드 스택 */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">용역유형별 상세</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {/* [Task #752] 모바일 — 표 대신 라벨/값 페어 카드 */}
              <div className="desktop:hidden space-y-2" data-testid="cards-by-category-mobile">
                {byCategory.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">데이터 없음</p>
                ) : byCategory.map((c) => {
                  const refundRatio = c.consumption > 0 ? (c.refund / c.consumption) * 100 : 0;
                  return (
                    <div key={c.category} className="rounded-lg border bg-card p-3 text-xs space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm">{c.label}</span>
                        {c.category === "unknown" && (
                          <Badge variant="outline" className="text-[10px]">미지정</Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-y-1 text-[11px]">
                        <span className="text-slate-500">소모</span>
                        <span className="text-right">{fmtKRW(c.consumption)}</span>
                        <span className="text-slate-500">건수</span>
                        <span className="text-right">{fmtCount(c.consumptionCount)}</span>
                        <span className="text-slate-500">미열람 환불</span>
                        <span className="text-right text-amber-700">{fmtKRW(c.refund)}</span>
                        <span className="text-slate-500">환불 건수</span>
                        <span className="text-right text-amber-700">{fmtCount(c.refundCount)}</span>
                        <span className="text-slate-500">환불율</span>
                        <span className="text-right">{refundRatio.toFixed(1)}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="hidden desktop:block overflow-x-auto">
                <table className="w-full text-xs" data-testid="table-by-category">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="text-left px-3 py-2">용역유형</th>
                      <th className="text-right px-3 py-2">소모</th>
                      <th className="text-right px-3 py-2">건수</th>
                      <th className="text-right px-3 py-2">미열람 환불</th>
                      <th className="text-right px-3 py-2">환불 건수</th>
                      <th className="text-right px-3 py-2">환불율</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCategory.map((c) => {
                      const refundRatio = c.consumption > 0 ? (c.refund / c.consumption) * 100 : 0;
                      return (
                        <tr key={c.category} className="border-t border-slate-100">
                          <td className="px-3 py-2">
                            {c.label}
                            {c.category === "unknown" && (
                              <Badge variant="outline" className="ml-2 text-[10px]">미지정</Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">{fmtKRW(c.consumption)}</td>
                          <td className="px-3 py-2 text-right">{fmtCount(c.consumptionCount)}</td>
                          <td className="px-3 py-2 text-right text-amber-700">{fmtKRW(c.refund)}</td>
                          <td className="px-3 py-2 text-right text-amber-700">{fmtCount(c.refundCount)}</td>
                          <td className="px-3 py-2 text-right">{refundRatio.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                    {byCategory.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                          데이터 없음
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packages" className="mt-4">
          <TopupPackagesAdmin />
        </TabsContent>
        <TabsContent value="orders" className="mt-4">
          <TopupOrdersAdmin />
        </TabsContent>
      </Tabs>

      {/* 운영 편의 — 기존 파트너별 잔액·수동 조정 유지 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">파트너별 잔액 및 수동 조정</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <VendorCreditsPanel />
        </CardContent>
      </Card>
    </div>
  );
}

// ── [Task #319] 충전 패키지 관리 ────────────────────────────
type PkgForm = UpsertCreditTopupPackageBody & { id?: number };
const blankForm = (): PkgForm => ({
  name: "",
  credits: 100,
  priceKrw: 100000,
  bonusPoints: 0,
  highlight: null,
  sortOrder: 100,
  isActive: true,
});

function TopupPackagesAdmin() {
  const { data, isLoading } = useListAdminCreditTopupPackages();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PkgForm>(blankForm());
  const [saving, setSaving] = useState(false);

  const packages: CreditTopupPackage[] = (data ?? []) as CreditTopupPackage[];

  function startCreate() {
    setForm(blankForm());
    setOpen(true);
  }
  function startEdit(p: CreditTopupPackage) {
    setForm({
      id: p.id,
      name: p.name,
      credits: p.credits,
      priceKrw: p.priceKrw,
      bonusPoints: p.bonusPoints,
      highlight: p.highlight,
      sortOrder: p.sortOrder,
      isActive: p.isActive,
    });
    setOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const body: UpsertCreditTopupPackageBody = {
        name: form.name,
        credits: Number(form.credits),
        priceKrw: Number(form.priceKrw),
        bonusPoints: Number(form.bonusPoints) || 0,
        highlight: form.highlight || null,
        sortOrder: Number(form.sortOrder) || 100,
        isActive: form.isActive ?? true,
      };
      if (form.id) {
        await updateCreditTopupPackage(form.id, body);
      } else {
        await createCreditTopupPackage(body);
      }
      toast({ title: "저장되었습니다" });
      setOpen(false);
      void qc.invalidateQueries({ queryKey: ["/credits/admin/topup-packages"] });
    } catch (err: any) {
      toast({ title: "저장 실패", description: err?.message ?? "", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(p: CreditTopupPackage) {
    if (!window.confirm(`"${p.name}" 패키지를 삭제하시겠습니까?`)) return;
    try {
      await deleteCreditTopupPackage(p.id);
      toast({ title: "삭제되었습니다" });
      void qc.invalidateQueries({ queryKey: ["/credits/admin/topup-packages"] });
    } catch (err: any) {
      toast({ title: "삭제 실패", description: err?.message ?? "", variant: "destructive" });
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm">충전 패키지</CardTitle>
        <Button size="sm" onClick={startCreate} data-testid="button-create-package">
          <Plus className="w-4 h-4 mr-1" />새 패키지
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {/* [Task #752] 모바일 — 표 대신 카드 스택 */}
        <div className="desktop:hidden space-y-2" data-testid="cards-topup-packages-mobile">
          {isLoading ? (
            <p className="text-xs text-slate-500 py-4 text-center">불러오는 중…</p>
          ) : packages.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">패키지가 없습니다</p>
          ) : packages.map((p) => (
            <div key={p.id} className="rounded-lg border bg-card p-3 text-xs space-y-1.5" data-testid={`row-package-mobile-${p.id}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm">{p.name}</span>
                <div className="flex items-center gap-1">
                  {p.isActive ? <Badge>활성</Badge> : <Badge variant="outline">비활성</Badge>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-y-1 text-[11px]">
                <span className="text-slate-500">크레딧</span>
                <span className="text-right">{p.credits.toLocaleString()}</span>
                <span className="text-slate-500">보너스 P</span>
                <span className="text-right">{p.bonusPoints.toLocaleString()}</span>
                <span className="text-slate-500">가격</span>
                <span className="text-right">{p.priceKrw.toLocaleString()}원</span>
                <span className="text-slate-500">정렬</span>
                <span className="text-right">{p.sortOrder}</span>
                <span className="text-slate-500">강조</span>
                <span className="text-right">{p.highlight ?? "-"}</span>
              </div>
              <div className="flex items-center gap-1 pt-1">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => startEdit(p)} data-testid={`button-edit-package-mobile-${p.id}`}>
                  <Pencil className="w-3.5 h-3.5 mr-1" /> 편집
                </Button>
                <Button size="sm" variant="outline" className="flex-1" onClick={() => handleDelete(p)} data-testid={`button-delete-package-mobile-${p.id}`}>
                  <Trash2 className="w-3.5 h-3.5 mr-1 text-rose-500" /> 삭제
                </Button>
              </div>
            </div>
          ))}
        </div>
        <div className="hidden desktop:block overflow-x-auto">
          <table className="w-full text-xs" data-testid="table-topup-packages">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2">정렬</th>
                <th className="text-left px-3 py-2">이름</th>
                <th className="text-right px-3 py-2">크레딧</th>
                <th className="text-right px-3 py-2">보너스 P</th>
                <th className="text-right px-3 py-2">가격</th>
                <th className="text-left px-3 py-2">강조</th>
                <th className="text-center px-3 py-2">활성</th>
                <th className="text-right px-3 py-2">작업</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">불러오는 중…</td></tr>
              ) : packages.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">패키지가 없습니다</td></tr>
              ) : packages.map((p) => (
                <tr key={p.id} className="border-t border-slate-100" data-testid={`row-package-${p.id}`}>
                  <td className="px-3 py-2">{p.sortOrder}</td>
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2 text-right">{p.credits.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{p.bonusPoints.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{p.priceKrw.toLocaleString()}원</td>
                  <td className="px-3 py-2">{p.highlight ?? "-"}</td>
                  <td className="px-3 py-2 text-center">
                    {p.isActive ? <Badge>활성</Badge> : <Badge variant="outline">비활성</Badge>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(p)} data-testid={`button-edit-package-${p.id}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(p)} data-testid={`button-delete-package-${p.id}`}>
                      <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>

      <ResponsiveDialog open={open} onOpenChange={setOpen}>
        <ResponsiveDialogContent className="max-w-md">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{form.id ? "패키지 편집" : "새 패키지"}</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <div className="space-y-3">
            <div>
              <Label>이름</Label>
              <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-package-name" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>크레딧</Label>
                <Input type="number" value={form.credits ?? 0} onChange={(e) => setForm({ ...form, credits: Number(e.target.value) })} data-testid="input-package-credits" />
              </div>
              <div>
                <Label>가격(원)</Label>
                <Input type="number" value={form.priceKrw ?? 0} onChange={(e) => setForm({ ...form, priceKrw: Number(e.target.value) })} data-testid="input-package-price" />
              </div>
              <div>
                <Label>보너스 포인트</Label>
                <Input type="number" value={form.bonusPoints ?? 0} onChange={(e) => setForm({ ...form, bonusPoints: Number(e.target.value) })} />
              </div>
              <div>
                <Label>정렬</Label>
                <Input type="number" value={form.sortOrder ?? 100} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
              </div>
            </div>
            <div>
              <Label>강조 라벨 (예: 인기, 추천)</Label>
              <Input value={form.highlight ?? ""} onChange={(e) => setForm({ ...form, highlight: e.target.value || null })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isActive ?? true} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              <Label>활성화</Label>
            </div>
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>취소</Button>
            <Button onClick={handleSave} disabled={saving || !form.name} data-testid="button-save-package">
              {saving ? "저장 중…" : "저장"}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </Card>
  );
}

function TopupOrdersAdmin() {
  const [status, setStatus] = useState<string>("all");
  const params = status === "all" ? undefined : { status: status as "pending" | "paid" | "failed" | "cancelled" };
  const { data, isLoading } = useListAdminCreditTopupOrders(params);
  const orders: AdminCreditTopupOrder[] = (data ?? []) as AdminCreditTopupOrder[];

  return (
    <Card>
      <CardHeader className="pb-2 flex-row items-center justify-between">
        <CardTitle className="text-sm">충전 결제 내역</CardTitle>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-8 w-32" data-testid="select-order-status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="paid">결제완료</SelectItem>
            <SelectItem value="pending">결제중</SelectItem>
            <SelectItem value="failed">실패</SelectItem>
            <SelectItem value="cancelled">취소</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="pt-0">
        {/* [Task #752] 모바일 — 결제 내역 카드 스택 */}
        <div className="desktop:hidden space-y-2" data-testid="cards-topup-orders-mobile">
          {isLoading ? (
            <p className="text-xs text-slate-500 py-4 text-center">불러오는 중…</p>
          ) : orders.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">결제 내역이 없습니다</p>
          ) : orders.map((o) => (
            <div key={o.id} className="rounded-lg border bg-card p-3 text-xs space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm truncate">{o.vendorName ?? `#${o.vendorId}`}</span>
                {o.status === "paid" ? <Badge className="bg-emerald-500">결제완료</Badge>
                  : o.status === "pending" ? <Badge variant="outline">결제중</Badge>
                  : o.status === "processing" ? <Badge variant="outline">처리중</Badge>
                  : o.status === "failed" ? <Badge variant="destructive">실패</Badge>
                  : <Badge variant="outline">취소</Badge>}
              </div>
              <p className="text-[11px] text-slate-600">{o.packageName}</p>
              <div className="grid grid-cols-2 gap-y-1 text-[11px]">
                <span className="text-slate-500">일시</span>
                <span className="text-right">{new Date(o.createdAt).toLocaleString("ko-KR")}</span>
                <span className="text-slate-500">크레딧</span>
                <span className="text-right">{o.credits.toLocaleString()}{o.bonusPoints > 0 ? ` (+${o.bonusPoints}P)` : ""}</span>
                <span className="text-slate-500">금액</span>
                <span className="text-right">{o.amountKrw.toLocaleString()}원</span>
                <span className="text-slate-500">결제수단/사유</span>
                <span className="text-right">{o.tossMethod ?? o.failReason ?? "-"}</span>
              </div>
              {o.tossPaymentKey && (
                <p className="text-[10px] text-slate-400 font-mono break-all" data-testid={`text-payment-key-mobile-${o.id}`}>
                  {o.tossPaymentKey}
                </p>
              )}
            </div>
          ))}
        </div>
        <div className="hidden desktop:block overflow-x-auto">
          <table className="w-full text-xs" data-testid="table-topup-orders">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2">일시</th>
                <th className="text-left px-3 py-2">파트너</th>
                <th className="text-left px-3 py-2">패키지</th>
                <th className="text-right px-3 py-2">크레딧</th>
                <th className="text-right px-3 py-2">금액</th>
                <th className="text-center px-3 py-2">상태</th>
                <th className="text-left px-3 py-2">결제수단/사유</th>
                <th className="text-left px-3 py-2">PG 결제키</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">불러오는 중…</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">결제 내역이 없습니다</td></tr>
              ) : orders.map((o) => (
                <tr key={o.id} className="border-t border-slate-100">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(o.createdAt).toLocaleString("ko-KR")}
                  </td>
                  <td className="px-3 py-2">{o.vendorName ?? `#${o.vendorId}`}</td>
                  <td className="px-3 py-2">{o.packageName}</td>
                  <td className="px-3 py-2 text-right">
                    {o.credits.toLocaleString()}
                    {o.bonusPoints > 0 ? ` (+${o.bonusPoints}P)` : ""}
                  </td>
                  <td className="px-3 py-2 text-right">{o.amountKrw.toLocaleString()}원</td>
                  <td className="px-3 py-2 text-center">
                    {o.status === "paid" ? <Badge className="bg-emerald-500">결제완료</Badge>
                      : o.status === "pending" ? <Badge variant="outline">결제중</Badge>
                      : o.status === "processing" ? <Badge variant="outline">처리중</Badge>
                      : o.status === "failed" ? <Badge variant="destructive">실패</Badge>
                      : <Badge variant="outline">취소</Badge>}
                  </td>
                  <td className="px-3 py-2 text-slate-500">
                    {o.tossMethod ?? o.failReason ?? "-"}
                  </td>
                  <td className="px-3 py-2 text-slate-400 font-mono text-[10px] break-all max-w-[200px]" data-testid={`text-payment-key-${o.id}`}>
                    {o.tossPaymentKey ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
