import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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

          {/* 용역유형별 표 */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">용역유형별 상세</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
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
