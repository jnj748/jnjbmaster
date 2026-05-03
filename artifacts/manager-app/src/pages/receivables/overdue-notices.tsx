// [Task #800] /receivables/overdue-notices — 미납분 고지서 출력 큐.
//
// 미납 호실 체크 → "출력 의뢰" 버튼. 실 PDF 렌더는 후속(고지서 템플릿 컴포넌트 재사용 자리).
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ReceivablesShell, useApi, krw, Empty, StatCard, STATUS_BADGE, type Bill } from "./_shared";
import { Printer, FileText } from "lucide-react";

export default function ReceivablesOverdueNoticesPage() {
  const api = useApi();
  const { toast } = useToast();
  const [rows, setRows] = useState<Bill[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const r = await api<Bill[]>("GET", "/receivables/overdue/notices");
    setRows(r);
    setSelected(new Set());
  };
  useEffect(() => { void load(); }, []);

  const totalRemaining = useMemo(() => rows.reduce((s, b) => s + (b.remaining ?? 0), 0), [rows]);
  const selectedRemaining = useMemo(() => rows.filter(b => selected.has(b.id)).reduce((s, b) => s + (b.remaining ?? 0), 0), [rows, selected]);

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };
  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map(r => r.id)));
  };

  const printSelected = async () => {
    if (selected.size === 0) { toast({ title: "출력할 호실을 선택하세요" }); return; }
    setBusy(true);
    try {
      // [Task #816] 서버가 호실별 고지서를 단일 PDF 묶음으로 렌더링해 스트리밍.
      const ids = Array.from(selected);
      const resp = await fetch("/api/receivables/overdue/notices/print", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ billIds: ids }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({} as { error?: string }));
        throw new Error(body?.error ?? `HTTP ${resp.status}`);
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `overdue-notices-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast({ title: `${ids.length}건 PDF 다운로드` });
      setSelected(new Set());
    } catch (e) {
      toast({ title: "실패", description: String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <ReceivablesShell title="미납분 고지서 출력" description="미납 호실의 재고지서 — 체크 후 일괄 출력 의뢰."
      action={<Button onClick={printSelected} disabled={busy || selected.size === 0} data-testid="btn-print">
        <Printer className="w-4 h-4 mr-1" />선택 {selected.size}건 출력 의뢰
      </Button>}
    >
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <StatCard title="대상 호실" value={`${rows.length}`} />
        <StatCard title="총 미납" value={krw(totalRemaining)} tone="danger" />
        <StatCard title="선택 합계" value={krw(selectedRemaining)} tone="warn" />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4" />출력 큐</CardTitle></CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? <Empty message="미납 고지서가 없습니다." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-3 py-2 w-10">
                      <Checkbox checked={selected.size > 0 && selected.size === rows.length} onCheckedChange={toggleAll} />
                    </th>
                    <th className="px-3 py-2">호실</th>
                    <th className="px-3 py-2">부과월</th>
                    <th className="px-3 py-2">납기</th>
                    <th className="px-3 py-2 text-right">잔액</th>
                    <th className="px-3 py-2 text-right">연체</th>
                    <th className="px-3 py-2">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(b => (
                    <tr key={b.id} className="border-t hover:bg-muted/30" data-testid={`row-notice-${b.id}`}>
                      <td className="px-3 py-2"><Checkbox checked={selected.has(b.id)} onCheckedChange={() => toggle(b.id)} data-testid={`chk-${b.id}`} /></td>
                      <td className="px-3 py-2 font-medium">{b.unitNumber}</td>
                      <td className="px-3 py-2">{b.billingMonth}</td>
                      <td className="px-3 py-2">{b.dueDate}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-rose-600">{krw(b.remaining)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{b.overdueDays}일</td>
                      <td className="px-3 py-2"><Badge className={STATUS_BADGE[b.status] ?? ""}>{b.status}</Badge></td>
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
