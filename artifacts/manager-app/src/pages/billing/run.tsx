// [Task #799] /billing/run — 관리비 부과 처리 (= calculate + finalize).
//
// 1) 월 + 공동관리비(공통경비) 입력 → POST /billing/calculate.
// 2) 결과 run 카드(총액·호실수) 표시 + 검증/조정/확정 액션.
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { BillingShell, useApi, krw, currentMonth, StatCard, Empty } from "./_shared";
import { Calculator, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface BillingRun { id: number; billingMonth: string; status: string; totalAmount: number; unitCount: number; createdAt: string; }
interface ValidateResp { ok: boolean; rules: Array<{ id: string; ok: boolean; message: string; severity: "error" | "warn" }>; }
interface RunLine { id: number; unitNumber: string; area: number; areaRatio: number; totalAmount: number; manualOverride: boolean; manualReason: string | null; breakdown: Record<string, number>; }
interface RunLinesResp { run: BillingRun; lines: RunLine[]; }
const BREAKDOWN_LABEL: Record<string, string> = {
  commonMaintenance: "공동관리비", repairReserve: "수선충당금", installment: "할부",
  meter: "검침합계", commonHeating: "난방비", commonHotWater: "급탕비", commonGas: "가스비",
};

export default function BillingRunPage() {
  const api = useApi();
  const { toast } = useToast();
  const [runs, setRuns] = useState<BillingRun[]>([]);
  const [month, setMonth] = useState(currentMonth());
  const [commonMaintenance, setCommonMaintenance] = useState("0");
  const [busy, setBusy] = useState(false);
  const [selRun, setSelRun] = useState<BillingRun | null>(null);
  const [validate, setValidate] = useState<ValidateResp | null>(null);
  const [lines, setLines] = useState<RunLine[] | null>(null);
  const [lineSearch, setLineSearch] = useState("");

  const load = async () => {
    const data = await api<BillingRun[]>("GET", "/billing/runs");
    setRuns(data);
    const cur = data.find(r => r.billingMonth === month) ?? data[0] ?? null;
    setSelRun(cur);
  };
  useEffect(() => { void load(); }, [month]);

  const draft = useMemo(() => runs.find(r => r.billingMonth === month && r.status === "draft"), [runs, month]);
  const finalized = useMemo(() => runs.find(r => r.billingMonth === month && r.status === "finalized"), [runs, month]);

  const calculate = async () => {
    setBusy(true);
    try {
      const r = await api<{ run: { id: number } }>("POST", "/billing/calculate", { month, commonMaintenance: Number(commonMaintenance) });
      toast({ title: "산출 완료", description: `Run #${r.run.id}` });
      await load();
    } catch (e) { toast({ title: "산출 실패", description: String(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const runValidate = async (id: number) => {
    const r = await api<ValidateResp>("GET", `/billing/runs/${id}/validate`);
    setValidate(r);
  };

  const loadLines = async (id: number) => {
    setLines(null);
    const r = await api<RunLinesResp>("GET", `/billing-run-lines?runId=${id}`);
    setLines(r.lines);
  };

  // selRun 이 바뀔 때마다 자동으로 라인 드릴다운 로드.
  useEffect(() => { if (selRun) void loadLines(selRun.id); else setLines(null); }, [selRun?.id]);

  // 모든 행에서 등장한 breakdown 키들을 동적으로 컬럼화.
  const breakdownKeys = useMemo(() => {
    const s = new Set<string>();
    (lines ?? []).forEach(l => Object.keys(l.breakdown).forEach(k => s.add(k)));
    return Array.from(s);
  }, [lines]);

  const filteredLines = useMemo(() => {
    if (!lines) return [];
    const q = lineSearch.trim().toLowerCase();
    return q ? lines.filter(l => l.unitNumber.toLowerCase().includes(q)) : lines;
  }, [lines, lineSearch]);

  const finalize = async (id: number) => {
    if (!confirm("이 부과를 확정합니다. 회계 분개·고지서 발행이 트리거됩니다.")) return;
    await api("POST", `/billing/runs/${id}/finalize`);
    toast({ title: "확정 완료" });
    await load();
  };

  return (
    <BillingShell title="관리비 부과 처리" description="월 + 공통경비 → 호실별 자동 산출 → 검증 → 확정">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calculator className="w-4 h-4" />산출 입력</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><Label>부과월</Label><Input value={month} onChange={(e) => setMonth(e.target.value)} placeholder="YYYY-MM" data-testid="in-month" /></div>
            <div><Label>공통경비 (₩)</Label><Input type="number" value={commonMaintenance} onChange={(e) => setCommonMaintenance(e.target.value)} data-testid="in-common" /></div>
            <div className="flex items-end"><Button onClick={calculate} disabled={busy} className="w-full" data-testid="btn-calculate">
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Calculator className="w-4 h-4 mr-1" />}산출 실행
            </Button></div>
          </CardContent>
        </Card>
        <StatCard title={`${month} 상태`} value={
          finalized ? "확정" : draft ? "초안" : "미산출"
        } hint={finalized ? `Run #${finalized.id}` : draft ? `Run #${draft.id}` : "아직 산출되지 않음"} />
      </div>

      {selRun ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              Run #{selRun.id} · {selRun.billingMonth}
              <Badge className={selRun.status === "finalized" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>
                {selRun.status === "finalized" ? "확정" : "초안"}
              </Badge>
            </CardTitle>
            <CardDescription>
              총액 {krw(selRun.totalAmount)} · {selRun.unitCount}호실 · {new Date(selRun.createdAt).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 mb-3">
              <Button variant="outline" onClick={() => runValidate(selRun.id)} data-testid="btn-validate"><AlertCircle className="w-4 h-4 mr-1" />검증 실행</Button>
              {selRun.status !== "finalized" && (
                <Button onClick={() => finalize(selRun.id)} data-testid="btn-finalize"><CheckCircle2 className="w-4 h-4 mr-1" />확정</Button>
              )}
            </div>
            {validate && (
              <div className="space-y-1 mb-3">
                {validate.rules.map(rule => (
                  <div key={rule.id} className={`text-sm p-2 rounded ${rule.ok ? "bg-emerald-50" : rule.severity === "error" ? "bg-red-50" : "bg-amber-50"}`}>
                    <span className="font-mono mr-2">{rule.ok ? "✓" : rule.severity === "error" ? "✗" : "⚠"}</span>{rule.message}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Empty message="아직 산출 기록이 없습니다. 위 폼에서 산출 실행을 눌러주세요." />
      )}

      {selRun && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              호실별 산출 내역 ({lines?.length ?? 0}호실)
              <Input className="max-w-[200px]" placeholder="호실 검색…" value={lineSearch} onChange={(e) => setLineSearch(e.target.value)} data-testid="in-line-search" />
            </CardTitle>
            <CardDescription>각 호실의 카테고리별 산출 금액을 확인하고 조정 페이지로 이동할 수 있습니다.</CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {lines === null ? (
              <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />로드 중…</div>
            ) : filteredLines.length === 0 ? (
              <Empty message="라인 데이터가 없습니다." />
            ) : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>호실</TableHead>
                  <TableHead className="text-right">면적(㎡)</TableHead>
                  {breakdownKeys.map(k => <TableHead key={k} className="text-right">{BREAKDOWN_LABEL[k] ?? k}</TableHead>)}
                  <TableHead className="text-right">합계</TableHead>
                  <TableHead className="text-center">수동</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {filteredLines.slice(0, 200).map(l => (
                    <TableRow key={l.id} data-testid={`line-${l.unitNumber}`}>
                      <TableCell className="font-mono">{l.unitNumber}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{Number(l.area || 0).toFixed(2)}</TableCell>
                      {breakdownKeys.map(k => (
                        <TableCell key={k} className="text-right tabular-nums text-xs">
                          {l.breakdown[k] ? krw(l.breakdown[k]) : "—"}
                        </TableCell>
                      ))}
                      <TableCell className="text-right tabular-nums font-medium">{krw(l.totalAmount)}</TableCell>
                      <TableCell className="text-center">{l.manualOverride ? <Badge variant="outline" className="text-amber-700">조정</Badge> : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {(filteredLines?.length ?? 0) > 200 && (
              <div className="p-2 text-center text-xs text-muted-foreground border-t">처음 200행만 표시 중. 검색으로 좁혀주세요.</div>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader><CardTitle className="text-base">최근 부과 실행</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Run</TableHead><TableHead>월</TableHead><TableHead>상태</TableHead>
              <TableHead className="text-right">총액</TableHead><TableHead>호실</TableHead><TableHead>일시</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {runs.slice(0, 12).map(r => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelRun(r)}>
                  <TableCell>#{r.id}</TableCell><TableCell>{r.billingMonth}</TableCell>
                  <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{krw(r.totalAmount)}</TableCell>
                  <TableCell>{r.unitCount}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </BillingShell>
  );
}
