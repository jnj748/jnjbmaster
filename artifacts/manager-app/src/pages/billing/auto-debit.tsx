// [Task #799] /billing/auto-debit — 자동이체 의뢰서 미리보기 + 의뢰 발송.
// [Task #822] 의뢰 직후 결과 표(상태/결과코드/메시지/금액) 를 같은 화면에서 노출.
//   - 발송 후 토스트에 '의뢰 N건 생성' 으로 건수 안내
//   - 결과 표는 폴링(/billing-auto-debit/poll → /receivables/auto-debit-results) 으로 자동 갱신
//   - 실패 건은 한 번에 재시도(/receivables/auto-debit-results/:id/retry 일괄 호출)
//
// CMS 변환은 발송 인프라가 처리. 화면에서는 호실/계좌/금액 행 + 합계 + 은행별 묶음 +
// CSV / 은행별 Excel(.xls) 출력 + 의뢰 발송 버튼.
import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { BillingShell, useApi, krw, currentMonth, StatCard, Empty } from "./_shared";
import { CreditCard, Send, Download, RefreshCw } from "lucide-react";

interface DebitRow {
  billId: number; unitNumber: string; totalAmount: number; paidAmount: number; remaining: number;
  dueDate: string | null; bank: string | null; account: string | null; holder: string | null;
}
interface DebitResp { month: string; count: number; total: number; rows: DebitRow[]; }

type ResultRow = {
  id: number; billingMonth: string; unitId: number; unitNumber: string; billId: number | null;
  bankCode: string | null; accountMasked: string | null; amount: number; attempt: number;
  status: "queued" | "requested" | "success" | "failed" | "cancelled";
  resultCode: string | null; resultMessage: string | null;
  requestedAt: string | null; completedAt: string | null; createdAt: string;
};

const STATUS_BADGE: Record<string, string> = {
  queued: "bg-blue-100 text-blue-700",
  requested: "bg-blue-100 text-blue-700",
  success: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export default function AutoDebitPage() {
  const api = useApi();
  const { toast } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<DebitResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [retryAllBusy, setRetryAllBusy] = useState(false);
  const monthRef = useRef(month);
  monthRef.current = month;

  const load = async () => setData(await api<DebitResp>("GET", `/billing-auto-debit?month=${month}`));
  const loadResults = async () => {
    try {
      setResults(await api<ResultRow[]>("GET", `/receivables/auto-debit-results?month=${month}`));
    } catch { /* 결과가 아직 없을 수 있음 */ }
  };
  useEffect(() => { void load(); void loadResults(); }, [month]);

  // 폴링 — 'requested' 상태 행이 남아 있는 동안 5초 간격으로 PG 결과 조회 + 표 갱신.
  // 폴링 URL 미설정(204) 이어도 결과 조회는 계속하므로 콜백/웹훅 갱신을 빠르게 반영한다.
  useEffect(() => {
    const hasPending = results.some(r => r.status === "requested" || r.status === "queued");
    if (!hasPending) return;
    const t = setInterval(async () => {
      if (monthRef.current !== month) return;
      try { await api("POST", `/billing-auto-debit/poll`, { month }); } catch { /* no-op */ }
      await loadResults();
    }, 5000);
    return () => clearInterval(t);
  }, [results, month]);

  const dispatch = async () => {
    if (!confirm(`${month} 자동이체 의뢰를 발송합니다.`)) return;
    setBusy(true);
    try {
      const r = await api<{ requested: number }>("POST", "/billing-auto-debit/dispatch", { month });
      toast({ title: `의뢰 ${r?.requested ?? 0}건 생성` });
      await Promise.all([load(), loadResults()]);
    } catch (e) { toast({ title: "발송 실패", description: String(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const retryOne = async (id: number) => {
    try {
      await api("POST", `/receivables/auto-debit-results/${id}/retry`);
      await loadResults();
    } catch (e) { toast({ title: "재시도 실패", description: String(e), variant: "destructive" }); }
  };

  const failedRows = useMemo(() => results.filter(r => r.status === "failed"), [results]);
  const counts = useMemo(() => ({
    total: results.length,
    success: results.filter(r => r.status === "success").length,
    failed: failedRows.length,
    pending: results.filter(r => r.status === "requested" || r.status === "queued").length,
  }), [results, failedRows]);

  const retryAllFailed = async () => {
    if (!failedRows.length) return;
    if (!confirm(`실패 ${failedRows.length}건을 재시도합니다.`)) return;
    setRetryAllBusy(true);
    let ok = 0; let bad = 0;
    for (const r of failedRows) {
      try { await api("POST", `/receivables/auto-debit-results/${r.id}/retry`); ok += 1; }
      catch { bad += 1; }
    }
    toast({
      title: `재시도 ${ok}건 생성`,
      description: bad ? `${bad}건 실패` : undefined,
      variant: bad ? "destructive" : undefined,
    });
    await loadResults();
    setRetryAllBusy(false);
  };

  const exportCsv = () => {
    if (!data) return;
    const header = ["호실", "은행", "계좌", "예금주", "금액", "납부일"];
    const lines = data.rows.map(r => [r.unitNumber, r.bank ?? "", r.account ?? "", r.holder ?? "", r.remaining, r.dueDate ?? ""].join(","));
    const blob = new Blob(["\uFEFF" + [header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `auto-debit-${month}.csv`; a.click();
  };

  // 은행별 묶음 — CMS 의뢰서는 통상 은행 단위로 분리 발송된다.
  const groups = useMemo(() => {
    const m = new Map<string, { count: number; total: number; missing: number }>();
    for (const r of (data?.rows ?? [])) {
      const key = r.bank ?? "(미지정)";
      const g = m.get(key) ?? { count: 0, total: 0, missing: 0 };
      g.count += 1; g.total += Number(r.remaining || 0); if (!r.account) g.missing += 1;
      m.set(key, g);
    }
    return Array.from(m.entries()).map(([bank, g]) => ({ bank, ...g })).sort((a, b) => b.total - a.total);
  }, [data]);

  // 은행별 시트로 묶은 .xls 호환 TSV 출력.
  const exportExcelByBank = () => {
    if (!data?.rows.length) return;
    const sections: string[] = [];
    for (const g of groups) {
      const sub = data.rows.filter(r => (r.bank ?? "(미지정)") === g.bank);
      sections.push(`# ${g.bank} (${g.count}건 / ${g.total}원)`);
      sections.push(["호실", "은행", "계좌", "예금주", "금액", "납부일"].join("\t"));
      for (const r of sub) sections.push([r.unitNumber, r.bank ?? "", r.account ?? "", r.holder ?? "", r.remaining, r.dueDate ?? ""].join("\t"));
      sections.push("");
    }
    const blob = new Blob(["\uFEFF" + sections.join("\n")], { type: "application/vnd.ms-excel;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `auto-debit-${month}.xls`; a.click();
  };

  return (
    <BillingShell title="자동이체 의뢰서" description="가상계좌 기반 호실별 출금 내역 + 은행별 묶음 + CMS 발송 의뢰"
      action={
        <div className="flex gap-2 items-end">
          <div><Label className="text-xs">월</Label><Input value={month} onChange={(e) => setMonth(e.target.value)} className="w-32" /></div>
          <Button variant="outline" onClick={exportCsv} disabled={!data?.rows.length}><Download className="w-4 h-4 mr-1" />CSV</Button>
          <Button onClick={dispatch} disabled={busy || !data?.rows.length} data-testid="btn-dispatch"><Send className="w-4 h-4 mr-1" />발송 의뢰</Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <StatCard title="대상 호실" value={`${data?.count ?? 0}`} />
        <StatCard title="합계" value={krw(data?.total ?? 0)} />
        <StatCard title="대상 월" value={month} />
      </div>

      {groups.length > 0 && (
        <Card className="mb-4">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              은행별 묶음 (CMS 발송 단위)
              <Button variant="outline" size="sm" onClick={exportExcelByBank} data-testid="btn-bank-xls"><Download className="w-4 h-4 mr-1" />은행별 Excel</Button>
            </CardTitle>
            <CardDescription>각 은행별 출금 건수·합계 + 계좌 미배정 건수</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>은행</TableHead>
                <TableHead className="text-right">건수</TableHead>
                <TableHead className="text-right">합계</TableHead>
                <TableHead className="text-right">계좌 미배정</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {groups.map(g => (
                  <TableRow key={g.bank} data-testid={`bank-${g.bank}`}>
                    <TableCell>{g.bank}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.count}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{krw(g.total)}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.missing > 0 ? <span className="text-amber-700">{g.missing}</span> : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><CreditCard className="w-4 h-4" />출금 행</CardTitle><CardDescription>가상계좌 미배정 호실은 별도 처리 필요</CardDescription></CardHeader>
        <CardContent className="p-0">
          {!data?.rows.length ? (<Empty message="해당 월의 고지서가 없습니다." />) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>호실</TableHead><TableHead>은행</TableHead><TableHead>계좌</TableHead>
                <TableHead>예금주</TableHead><TableHead className="text-right">금액</TableHead><TableHead>납부일</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {data.rows.map(r => (
                  <TableRow key={r.billId}>
                    <TableCell className="font-mono">{r.unitNumber}</TableCell>
                    <TableCell>{r.bank ?? "—"}</TableCell>
                    <TableCell className="font-mono">{r.account ?? "—"}</TableCell>
                    <TableCell>{r.holder ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{krw(r.remaining)}</TableCell>
                    <TableCell className="text-xs">{r.dueDate ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* [Task #822] 의뢰 결과 — 같은 화면에서 곧바로 확인. */}
      <Card data-testid="card-results">
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4" />의뢰 결과 ({results.length})</span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => void loadResults()} data-testid="btn-refresh-results">
                <RefreshCw className="w-3 h-3 mr-1" />새로고침
              </Button>
              <Button variant="outline" size="sm" disabled={retryAllBusy || !failedRows.length} onClick={retryAllFailed} data-testid="btn-retry-all">
                실패 {failedRows.length}건 재시도
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            성공 {counts.success} · 실패 {counts.failed} · 대기 {counts.pending}
            {counts.pending > 0 ? " · 5초 간격으로 자동 갱신" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {results.length === 0 ? (
            <Empty message={`${month} 자동이체 의뢰 결과가 없습니다. '발송 의뢰' 를 눌러 결과를 만드세요.`} />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>호실</TableHead>
                <TableHead>은행/계좌</TableHead>
                <TableHead className="text-right">금액</TableHead>
                <TableHead className="text-right">시도</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>결과</TableHead>
                <TableHead>완료</TableHead>
                <TableHead className="text-right">액션</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {results.map(r => (
                  <TableRow key={r.id} data-testid={`row-result-${r.id}`}>
                    <TableCell className="font-medium">{r.unitNumber}</TableCell>
                    <TableCell className="text-xs">{r.bankCode ?? "—"}{r.accountMasked ? ` · ${r.accountMasked}` : ""}</TableCell>
                    <TableCell className="text-right tabular-nums">{krw(r.amount)}</TableCell>
                    <TableCell className="text-right">{r.attempt}</TableCell>
                    <TableCell><Badge className={STATUS_BADGE[r.status] ?? ""}>{r.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate" title={r.resultMessage ?? ""}>
                      {r.resultCode ? `[${r.resultCode}] ` : ""}{r.resultMessage ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs">{r.completedAt ? r.completedAt.slice(0, 16).replace("T", " ") : "—"}</TableCell>
                    <TableCell className="text-right">
                      {r.status === "failed" && (
                        <Button size="sm" variant="outline" onClick={() => void retryOne(r.id)} data-testid={`btn-retry-${r.id}`}>
                          <RefreshCw className="w-3 h-3 mr-1" />재시도
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </BillingShell>
  );
}
