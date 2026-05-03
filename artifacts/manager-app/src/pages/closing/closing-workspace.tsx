// [Task #803] 결산 워크스페이스 — 7개 결산 보고를 탭으로 묶은 단일 화면.
//   - 시산표 / 월별손익 / 현금흐름 / 세입세출 / 년도이월 / 결산스냅샷 / 진입 안내.
//   - 데이터는 /api/closing-reports/* 위임. 마감 잠금 자체는 /erp/closings 가 담당.

import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useBuilding } from "@/contexts/building-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type TBRow = { code: string; name: string; type: string; periodDebit: number; periodCredit: number; balanceDebit: number; balanceCredit: number };
type TBPayload = { rows: TBRow[]; totals: { debit: number; credit: number; balanced: boolean }; from: string | null; to: string | null };
type ISMonth = { month: string; revenue: number; expense: number; netIncome: number };
type CFMonth = { month: string; inflow: number; outflow: number; net: number };
type BVARow = { category: string; label: string; budget: number; actual: number; variance: number; rate: number | null };
type RolloverLine = { code: string; name: string; type: string; balance: number };

function nf(n: number | null | undefined): string {
  if (n == null) return "-";
  return new Intl.NumberFormat("ko-KR").format(Math.round(Number(n)));
}

function thisYear(): string { return String(new Date().getUTCFullYear()); }

export default function ClosingWorkspacePage() {
  const { token } = useAuth();
  const { building } = useBuilding();
  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");
  const buildingId = building?.id ?? null;
  const headers = useMemo<Record<string, string>>(() => {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, [token]);

  const [year, setYear] = useState<string>(thisYear());
  const [from, setFrom] = useState<string>(`${year}-01-01`);
  const [to, setTo] = useState<string>(`${year}-12-31`);
  const [tab, setTab] = useState<string>("trial-balance");

  const [tb, setTb] = useState<TBPayload | null>(null);
  const [is, setIs] = useState<{ months: ISMonth[]; totals: { revenue: number; expense: number; netIncome: number } } | null>(null);
  const [cf, setCf] = useState<{ months: CFMonth[]; totals: { inflow: number; outflow: number; net: number } } | null>(null);
  const [bva, setBva] = useState<{ rows: BVARow[]; totals: { budget: number; actual: number; variance: number }; hasBudget: boolean } | null>(null);
  const [roll, setRoll] = useState<{ lines: RolloverLine[]; totals: { assets: number; liabilities: number; equity: number }; lastLockedMonth: string | null } | null>(null);
  const [snap, setSnap] = useState<{ closing: { month: string; status: string }; snapshots: unknown[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setFrom(`${year}-01-01`); setTo(`${year}-12-31`); }, [year]);

  async function load() {
    if (!buildingId) return;
    setLoading(true); setError(null);
    try {
      const q = `?buildingId=${buildingId}`;
      const [r1, r2, r3, r4, r5, r6] = await Promise.all([
        fetch(`${apiBase}/closing-reports/trial-balance${q}&from=${from}&to=${to}`, { headers }),
        fetch(`${apiBase}/closing-reports/monthly-income-statement${q}&year=${year}`, { headers }),
        fetch(`${apiBase}/closing-reports/cash-flow${q}&year=${year}`, { headers }),
        fetch(`${apiBase}/closing-reports/budget-vs-actual${q}&year=${year}`, { headers }),
        fetch(`${apiBase}/closing-reports/year-end-rollover${q}&year=${year}`, { headers }),
        fetch(`${apiBase}/closing-reports/latest-snapshot${q}`, { headers }),
      ]);
      if (r1.ok) setTb(await r1.json());
      if (r2.ok) setIs(await r2.json());
      if (r3.ok) setCf(await r3.json());
      if (r4.ok) setBva(await r4.json());
      if (r5.ok) setRoll(await r5.json());
      if (r6.ok) {
        const j = await r6.json();
        setSnap(j.snapshot);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [buildingId, year]);

  // [Task #812] 결산 보고 PDF·엑셀 다운로드. fetch 후 Blob → a[download] 로 저장한다.
  async function download(reportKey: string, format: "xlsx" | "pdf"): Promise<void> {
    if (!buildingId) return;
    const params = new URLSearchParams({ buildingId: String(buildingId) });
    if (reportKey === "trial-balance") {
      params.set("from", from); params.set("to", to);
    } else if (reportKey !== "latest-snapshot") {
      params.set("year", year);
    }
    const url = `${apiBase}/closing-reports/${reportKey}.${format}?${params.toString()}`;
    setError(null);
    try {
      const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) { setError(`다운로드 실패 (${res.status})`); return; }
      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const m = /filename\*=UTF-8''([^;]+)/i.exec(cd) ?? /filename="?([^";]+)"?/i.exec(cd);
      const filename = m ? decodeURIComponent(m[1]) : `${reportKey}.${format}`;
      const a = document.createElement("a");
      const objUrl = URL.createObjectURL(blob);
      a.href = objUrl; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(objUrl);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function ExportButtons({ reportKey }: { reportKey: string }): ReactElement {
    return (
      <div className="flex items-center gap-2 ml-auto">
        <Button variant="outline" size="sm" onClick={() => void download(reportKey, "xlsx")} data-testid={`button-export-xlsx-${reportKey}`}>
          엑셀 다운로드
        </Button>
        <Button variant="outline" size="sm" onClick={() => void download(reportKey, "pdf")} data-testid={`button-export-pdf-${reportKey}`}>
          PDF 다운로드
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 max-w-7xl mx-auto" data-testid="page-closing-workspace">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <CardTitle>결산 워크스페이스</CardTitle>
            <div className="flex items-center gap-2">
              <label className="text-sm text-muted-foreground">회계연도</label>
              <Input value={year} onChange={(e) => setYear(e.target.value)} className="w-24" data-testid="input-year" />
              <Button variant="outline" onClick={() => void load()} disabled={loading} data-testid="button-reload">
                {loading ? "조회 중…" : "다시 조회"}
              </Button>
              <Link href="/erp/closings"><Button variant="ghost" size="sm">월마감 화면 →</Button></Link>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!buildingId && <p className="text-sm text-muted-foreground">건물을 선택해주세요.</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex flex-wrap">
              <TabsTrigger value="trial-balance" data-testid="tab-trial-balance">시산표</TabsTrigger>
              <TabsTrigger value="income-statement">월별손익</TabsTrigger>
              <TabsTrigger value="cash-flow">현금흐름</TabsTrigger>
              <TabsTrigger value="budget-vs-actual">세입세출</TabsTrigger>
              <TabsTrigger value="rollover">년도이월</TabsTrigger>
              <TabsTrigger value="snapshot">최근 스냅샷</TabsTrigger>
            </TabsList>

            <TabsContent value="trial-balance">
              <div className="flex items-center gap-2 mb-3">
                <label className="text-sm">기간</label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
                <span>~</span>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
                <Button variant="outline" size="sm" onClick={() => void load()}>적용</Button>
                {tb && <Badge variant={tb.totals.balanced ? "default" : "destructive"}>{tb.totals.balanced ? "차대 일치" : "차대 불일치"}</Badge>}
                <ExportButtons reportKey="trial-balance" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="table-trial-balance">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2">계정</th>
                      <th className="text-right p-2">기간 차변</th>
                      <th className="text-right p-2">기간 대변</th>
                      <th className="text-right p-2">잔액 차변</th>
                      <th className="text-right p-2">잔액 대변</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tb?.rows.map((r) => (
                      <tr key={r.code} className="border-t">
                        <td className="p-2"><span className="font-mono text-xs text-muted-foreground mr-2">{r.code}</span>{r.name}</td>
                        <td className="text-right p-2 tabular-nums">{nf(r.periodDebit)}</td>
                        <td className="text-right p-2 tabular-nums">{nf(r.periodCredit)}</td>
                        <td className="text-right p-2 tabular-nums">{nf(r.balanceDebit)}</td>
                        <td className="text-right p-2 tabular-nums">{nf(r.balanceCredit)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/30 font-semibold">
                      <td className="p-2">합계</td>
                      <td colSpan={2}></td>
                      <td className="text-right p-2 tabular-nums" data-testid="text-tb-debit-total">{nf(tb?.totals.debit ?? 0)}</td>
                      <td className="text-right p-2 tabular-nums" data-testid="text-tb-credit-total">{nf(tb?.totals.credit ?? 0)}</td>
                    </tr>
                  </tfoot>
                </table>
                {tb && tb.rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">표시할 분개가 없습니다.</p>}
              </div>
            </TabsContent>

            <TabsContent value="income-statement">
              <div className="flex items-center mb-3"><ExportButtons reportKey="monthly-income-statement" /></div>
              <table className="w-full text-sm">
                <thead className="bg-muted/50"><tr><th className="text-left p-2">월</th><th className="text-right p-2">수익</th><th className="text-right p-2">비용</th><th className="text-right p-2">순이익</th></tr></thead>
                <tbody>
                  {is?.months.map((m) => (
                    <tr key={m.month} className="border-t">
                      <td className="p-2">{m.month}</td>
                      <td className="text-right p-2 tabular-nums">{nf(m.revenue)}</td>
                      <td className="text-right p-2 tabular-nums">{nf(m.expense)}</td>
                      <td className="text-right p-2 tabular-nums">{nf(m.netIncome)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t bg-muted/30 font-semibold"><td className="p-2">연 합계</td>
                  <td className="text-right p-2 tabular-nums">{nf(is?.totals.revenue)}</td>
                  <td className="text-right p-2 tabular-nums">{nf(is?.totals.expense)}</td>
                  <td className="text-right p-2 tabular-nums">{nf(is?.totals.netIncome)}</td>
                </tr></tfoot>
              </table>
            </TabsContent>

            <TabsContent value="cash-flow">
              <div className="flex items-center mb-3"><ExportButtons reportKey="cash-flow" /></div>
              <p className="text-xs text-muted-foreground mb-2">현금성(1010) + 보통예금(1020) 계정 기준 월별 유입/유출.</p>
              <table className="w-full text-sm">
                <thead className="bg-muted/50"><tr><th className="text-left p-2">월</th><th className="text-right p-2">유입</th><th className="text-right p-2">유출</th><th className="text-right p-2">순증감</th></tr></thead>
                <tbody>
                  {cf?.months.map((m) => (
                    <tr key={m.month} className="border-t">
                      <td className="p-2">{m.month}</td>
                      <td className="text-right p-2 tabular-nums">{nf(m.inflow)}</td>
                      <td className="text-right p-2 tabular-nums">{nf(m.outflow)}</td>
                      <td className="text-right p-2 tabular-nums">{nf(m.net)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t bg-muted/30 font-semibold"><td className="p-2">연 합계</td>
                  <td className="text-right p-2 tabular-nums">{nf(cf?.totals.inflow)}</td>
                  <td className="text-right p-2 tabular-nums">{nf(cf?.totals.outflow)}</td>
                  <td className="text-right p-2 tabular-nums">{nf(cf?.totals.net)}</td>
                </tr></tfoot>
              </table>
            </TabsContent>

            <TabsContent value="budget-vs-actual">
              <div className="flex items-center mb-3"><ExportButtons reportKey="budget-vs-actual" /></div>
              {bva && !bva.hasBudget && <p className="text-xs text-muted-foreground mb-2">의결된 예산 버전이 없어 편성액은 0으로 표기됩니다. <Link href="/erp/budgets" className="underline">예산 편성</Link>에서 등록하세요.</p>}
              <table className="w-full text-sm">
                <thead className="bg-muted/50"><tr><th className="text-left p-2">비목</th><th className="text-right p-2">편성</th><th className="text-right p-2">실집행</th><th className="text-right p-2">차이</th><th className="text-right p-2">집행률</th></tr></thead>
                <tbody>
                  {bva?.rows.map((r) => (
                    <tr key={r.category} className="border-t">
                      <td className="p-2">{r.label}</td>
                      <td className="text-right p-2 tabular-nums">{nf(r.budget)}</td>
                      <td className="text-right p-2 tabular-nums">{nf(r.actual)}</td>
                      <td className="text-right p-2 tabular-nums">{nf(r.variance)}</td>
                      <td className="text-right p-2 tabular-nums">{r.rate == null ? "-" : `${r.rate.toFixed(1)}%`}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr className="border-t bg-muted/30 font-semibold"><td className="p-2">합계</td>
                  <td className="text-right p-2 tabular-nums">{nf(bva?.totals.budget)}</td>
                  <td className="text-right p-2 tabular-nums">{nf(bva?.totals.actual)}</td>
                  <td className="text-right p-2 tabular-nums">{nf(bva?.totals.variance)}</td>
                  <td></td>
                </tr></tfoot>
              </table>
            </TabsContent>

            <TabsContent value="rollover">
              <div className="flex items-center mb-3"><ExportButtons reportKey="year-end-rollover" /></div>
              <p className="text-xs text-muted-foreground mb-2">{year}년 12월 31일 기준 자산·부채·자본 잔액 미리보기. 직전 잠금 월: {roll?.lastLockedMonth ?? "없음"}</p>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">자산</div><div className="text-lg font-semibold tabular-nums">{nf(roll?.totals.assets)}</div></div>
                <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">부채</div><div className="text-lg font-semibold tabular-nums">{nf(roll?.totals.liabilities)}</div></div>
                <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">자본</div><div className="text-lg font-semibold tabular-nums">{nf(roll?.totals.equity)}</div></div>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/50"><tr><th className="text-left p-2">계정</th><th className="text-left p-2">분류</th><th className="text-right p-2">잔액</th></tr></thead>
                <tbody>
                  {roll?.lines.map((l) => (
                    <tr key={l.code} className="border-t">
                      <td className="p-2"><span className="font-mono text-xs text-muted-foreground mr-2">{l.code}</span>{l.name}</td>
                      <td className="p-2">{l.type}</td>
                      <td className="text-right p-2 tabular-nums">{nf(l.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabsContent>

            <TabsContent value="snapshot">
              <div className="flex items-center mb-3"><ExportButtons reportKey="latest-snapshot" /></div>
              {snap ? (
                <div className="space-y-2">
                  <div>최근 잠금 월: <span className="font-mono">{snap.closing.month}</span> · 상태 <Badge>{snap.closing.status}</Badge></div>
                  <pre className="bg-muted/40 rounded p-2 text-xs overflow-auto">{JSON.stringify(snap.snapshots, null, 2)}</pre>
                </div>
              ) : <p className="text-sm text-muted-foreground">잠금된 월이 없습니다. <Link href="/erp/closings" className="underline">월마감</Link>에서 잠금을 진행하면 스냅샷이 생성됩니다.</p>}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
