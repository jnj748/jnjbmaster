import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, FileText, Upload, ArrowRight, AlertTriangle, Clipboard } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, Legend,
} from "recharts";

const LABELS: Record<string, string> = {
  general: "일반관리비", cleaning: "청소비", security: "경비비", disinfection: "소독비",
  elevator: "승강기", electricity: "공동전기", water: "공동수도", heating: "난방",
  gas: "가스", longTermRepairFund: "장기수선충당금", insurance: "보험", other: "기타",
};

type Bill = {
  id: number;
  billingMonth: string;
  totalAmount: number;
  unitCount: number | null;
  lineItems: Record<string, number>;
  confirmed: boolean;
};

export default function FeesSummaryPage() {
  const { token } = useAuth();
  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");
  const [bills, setBills] = useState<Bill[]>([]);
  const [arrears, setArrears] = useState<{ totalArrears: number; unpaidCount: number; overdueCount: number; oldestUnpaidMonth: string | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      fetch(`${apiBase}/fees/bill-summaries`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => []),
      fetch(`${apiBase}/fees/arrears-summary`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => null),
    ]).then(([billsData, arrearsData]) => {
      setBills(Array.isArray(billsData) ? billsData.filter((b: Bill) => !b.billingMonth.startsWith("failed-")) : []);
      setArrears(arrearsData ?? null);
    }).finally(() => setLoading(false));
  }, [token, apiBase]);

  const sortedAsc = useMemo(() => [...bills].sort((a, b) => a.billingMonth.localeCompare(b.billingMonth)), [bills]);
  const last12 = useMemo(() => sortedAsc.slice(-12), [sortedAsc]);
  const latest = sortedAsc[sortedAsc.length - 1];
  const prev = sortedAsc[sortedAsc.length - 2];

  const trend = last12.map(b => ({
    month: b.billingMonth.slice(5) + "월",
    총액: Math.round(b.totalAmount),
    세대평균: b.unitCount && b.unitCount > 0 ? Math.round(b.totalAmount / b.unitCount) : null,
  }));

  const change = useMemo(() => {
    if (!latest || !prev) return [];
    const keys = Array.from(new Set([...Object.keys(latest.lineItems || {}), ...Object.keys(prev.lineItems || {})]));
    return keys.map(k => {
      const cur = latest.lineItems?.[k] || 0;
      const old = prev.lineItems?.[k] || 0;
      return { key: k, label: LABELS[k] || k, 전월: old, 이번달: cur, 증감: cur - old };
    }).filter(r => r.전월 || r.이번달).sort((a, b) => Math.abs(b.증감) - Math.abs(a.증감));
  }, [latest, prev]);

  if (loading) {
    return <div className="container max-w-5xl py-10 text-center text-muted-foreground">불러오는 중...</div>;
  }

  if (bills.length === 0) {
    return (
      <div className="container max-w-5xl py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">관리비 요약</h1>
          <p className="text-sm text-muted-foreground">월별 관리비 추세와 항목별 변동을 한눈에 봅니다.</p>
        </div>
        <Card>
          <CardContent className="py-16 text-center space-y-4">
            <FileText className="w-12 h-12 mx-auto opacity-30" />
            <div>
              <p className="text-base font-medium">아직 데이터가 없습니다</p>
              <p className="text-sm text-muted-foreground mt-1">관리비 고지서를 1장 이상 올리면 자동으로 요약이 생성됩니다.</p>
            </div>
            <Link href="/erp/bills">
              <Button className="gap-2"><Upload className="w-4 h-4" />고지서 업로드 가기<ArrowRight className="w-4 h-4" /></Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalAvg = latest && latest.unitCount && latest.unitCount > 0
    ? Math.round(latest.totalAmount / latest.unitCount) : null;
  const totalDelta = latest && prev ? latest.totalAmount - prev.totalAmount : 0;

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1">관리비 요약</h1>
          <p className="text-sm text-muted-foreground">최근 {sortedAsc.length}개월 데이터 기준</p>
        </div>
        <div className="flex items-center gap-2">
          {/* [메뉴 통합] 관리비 응대 자료를 관리비 요약 안에서 바로 진입 */}
          <Link href="/erp/building-records">
            <Button variant="outline" size="sm" className="gap-2" data-testid="btn-building-records">
              <Clipboard className="w-4 h-4" />응대 자료
            </Button>
          </Link>
          <Link href="/erp/bills"><Button variant="outline" size="sm" className="gap-2"><Upload className="w-4 h-4" />고지서 추가</Button></Link>
        </div>
      </div>

      {arrears && arrears.totalArrears > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-red-800">
                누적 미납 ₩{arrears.totalArrears.toLocaleString()} ({arrears.unpaidCount}건)
              </div>
              <div className="text-xs text-red-700 mt-0.5">
                연체 {arrears.overdueCount}건{arrears.oldestUnpaidMonth ? ` · 최장 미납 ${arrears.oldestUnpaidMonth}월부터` : ""}
              </div>
            </div>
            <Link href="/erp/billing"><Button size="sm" variant="outline" className="gap-1">관리 <ArrowRight className="w-3 h-3" /></Button></Link>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">최근 청구월</div>
          <div className="text-lg font-bold mt-1">{latest?.billingMonth ?? "-"}</div>
        </CardContent></Card>
        <Card className={arrears && arrears.totalArrears > 0 ? "border-red-200" : ""}><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">누적 미납</div>
          <div className={`text-lg font-bold mt-1 ${arrears && arrears.totalArrears > 0 ? "text-red-600" : ""}`}>
            {arrears ? `₩${arrears.totalArrears.toLocaleString()}` : "-"}
          </div>
          {arrears && arrears.unpaidCount > 0 && (
            <div className="text-xs text-muted-foreground mt-0.5">{arrears.unpaidCount}건 미납</div>
          )}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">최근 총액</div>
          <div className="text-lg font-bold mt-1">₩{Math.round(latest?.totalAmount ?? 0).toLocaleString()}</div>
          {prev && (
            <div className={`text-xs mt-0.5 flex items-center gap-1 ${totalDelta > 0 ? "text-red-600" : totalDelta < 0 ? "text-emerald-600" : "text-muted-foreground"}`}>
              {totalDelta > 0 ? <TrendingUp className="w-3 h-3" /> : totalDelta < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              {totalDelta === 0 ? "전월과 동일" : `${totalDelta > 0 ? "+" : ""}₩${Math.abs(Math.round(totalDelta)).toLocaleString()}`}
            </div>
          )}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">세대당 평균</div>
          <div className="text-lg font-bold mt-1">{totalAvg ? `₩${totalAvg.toLocaleString()}` : "-"}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">확정 / 전체</div>
          <div className="text-lg font-bold mt-1">{bills.filter(b => b.confirmed).length} / {bills.length}</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">최근 12개월 총액 추세</CardTitle></CardHeader>
        <CardContent style={{ height: 240 }}>
          {trend.length < 2 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              더 많은 고지서를 올리면 추세가 표시됩니다.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 10000)}만`} />
                <Tooltip formatter={(v: number) => `₩${Math.round(v).toLocaleString()}`} />
                <Line type="monotone" dataKey="총액" stroke="#2563eb" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {prev && change.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">전월 대비 항목별 증감</CardTitle>
            <CardDescription>{prev.billingMonth} → {latest.billingMonth}</CardDescription>
          </CardHeader>
          <CardContent style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={change}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" />
                <YAxis tickFormatter={(v) => `${Math.round(Number(v) / 10000)}만`} />
                <Tooltip formatter={(v: number) => `₩${Math.round(v).toLocaleString()}`} />
                <Legend />
                <Bar dataKey="전월" fill="#94a3b8" />
                <Bar dataKey="이번달" fill="#2563eb" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">월별 고지서</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {sortedAsc.slice().reverse().map(b => (
              <div key={b.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-mono">{b.billingMonth}</Badge>
                  {b.confirmed
                    ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">확정</Badge>
                    : <Badge variant="secondary" className="text-[10px]">검토 필요</Badge>}
                </div>
                <div className="text-sm font-mono font-semibold">₩{Math.round(b.totalAmount).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
