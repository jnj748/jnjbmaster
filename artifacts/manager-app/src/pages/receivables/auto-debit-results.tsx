// [Task #800] /receivables/auto-debit-results — 자동이체 결과.
//
// 외부 PG 응답 적재 자리(현재는 수동 적재 + 재시도 큐 1버튼).
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ReceivablesShell, useApi, krw, currentMonth, Empty, StatCard, STATUS_BADGE,
  type AutoDebitRow } from "./_shared";
import { RefreshCw } from "lucide-react";

export default function ReceivablesAutoDebitResultsPage() {
  const api = useApi();
  const { toast } = useToast();
  const [rows, setRows] = useState<AutoDebitRow[]>([]);
  const [month, setMonth] = useState<string>(currentMonth());
  const [busy, setBusy] = useState(false);

  const load = async () => setRows(await api<AutoDebitRow[]>("GET", `/receivables/auto-debit-results?month=${month}`));
  useEffect(() => { void load(); }, [month]);

  const counts = useMemo(() => ({
    total: rows.length,
    success: rows.filter(r => r.status === "success").length,
    failed: rows.filter(r => r.status === "failed").length,
    queued: rows.filter(r => r.status === "queued" || r.status === "requested").length,
    successAmount: rows.filter(r => r.status === "success").reduce((s, r) => s + r.amount, 0),
    failedAmount: rows.filter(r => r.status === "failed").reduce((s, r) => s + r.amount, 0),
  }), [rows]);

  const retry = async (id: number) => {
    setBusy(true);
    try {
      await api("POST", `/receivables/auto-debit-results/${id}/retry`);
      toast({ title: "재시도 행 생성" });
      await load();
    } catch (e) { toast({ title: "실패", description: String(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return (
    <ReceivablesShell title="자동이체 결과" description="월별 자동이체 의뢰 결과 — 성공/실패/재시도 추적."
      action={<Input type="month" value={month} onChange={(e) => setMonth(e.target.value || currentMonth())} className="w-40" data-testid="in-month" />}
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <StatCard title="총 건수" value={`${counts.total}`} />
        <StatCard title="성공" value={`${counts.success}`} hint={krw(counts.successAmount)} tone="ok" />
        <StatCard title="실패" value={`${counts.failed}`} hint={krw(counts.failedAmount)} tone="danger" />
        <StatCard title="대기/요청중" value={`${counts.queued}`} />
        <StatCard title="성공률" value={counts.total ? `${Math.round(counts.success / counts.total * 100)}%` : "—"} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><RefreshCw className="w-4 h-4" />결과 ({rows.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? <Empty message={`${month} 자동이체 결과가 없습니다. 의뢰는 부과관리 → 자동이체 의뢰에서 생성합니다.`} /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-3 py-2">호실</th>
                    <th className="px-3 py-2">은행/계좌</th>
                    <th className="px-3 py-2 text-right">금액</th>
                    <th className="px-3 py-2 text-right">시도</th>
                    <th className="px-3 py-2">상태</th>
                    <th className="px-3 py-2">결과</th>
                    <th className="px-3 py-2">완료</th>
                    <th className="px-3 py-2 text-right">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-t" data-testid={`row-ad-${r.id}`}>
                      <td className="px-3 py-2 font-medium">{r.unitNumber}</td>
                      <td className="px-3 py-2 text-xs">{r.bankCode ?? "—"} {r.accountMasked ? `· ${r.accountMasked}` : ""}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{krw(r.amount)}</td>
                      <td className="px-3 py-2 text-right">{r.attempt}</td>
                      <td className="px-3 py-2"><Badge className={STATUS_BADGE[r.status] ?? ""}>{r.status}</Badge></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[220px] truncate" title={r.resultMessage ?? ""}>
                        {r.resultCode ? `[${r.resultCode}] ` : ""}{r.resultMessage ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">{r.completedAt ? r.completedAt.slice(0, 16).replace("T", " ") : "—"}</td>
                      <td className="px-3 py-2 text-right">
                        {r.status === "failed" && (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => retry(r.id)} data-testid={`btn-retry-${r.id}`}>
                            <RefreshCw className="w-3 h-3 mr-1" />재시도
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </ReceivablesShell>
  );
}
