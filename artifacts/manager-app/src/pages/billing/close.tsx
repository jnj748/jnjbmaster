// [Task #799] /billing/close — 부과월 마감 인터록.
//
// 부과월 카드 목록 중 stage=noticed 인 행에 대해 마감 버튼.
// 마감 시 closing 엔진의 lock 인터록과 연동될 수 있도록 closingsRouter 와 분리.
// 본 화면은 부과 사이클 종결만 책임진다.
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { BillingShell, useApi, StatCard, STAGE_LABELS, STAGE_COLORS, type BillingMonthRow } from "./_shared";
import { Lock, RotateCcw } from "lucide-react";

export default function BillingClosePage() {
  const api = useApi();
  const { toast } = useToast();
  const [rows, setRows] = useState<BillingMonthRow[]>([]);

  const load = async () => setRows(await api<BillingMonthRow[]>("GET", "/billing-months"));
  useEffect(() => { void load(); }, []);

  const close = async (r: BillingMonthRow) => {
    if (!confirm(`${r.billingMonth} 을(를) 마감합니다. 마감 후에는 조정/재발행이 제한됩니다.`)) return;
    await api("POST", `/billing-months/${r.id}/advance`, { stage: "closed" });
    toast({ title: `${r.billingMonth} 마감 완료` });
    await load();
  };
  const reopen = async (r: BillingMonthRow) => {
    const reason = prompt("재개방 사유");
    if (!reason || reason.length < 2) return;
    await api("POST", `/billing-months/${r.id}/reopen`, { reason });
    toast({ title: "재개방 완료" });
    await load();
  };

  const counts = useMemo(() => {
    const s = { created: 0, calculated: 0, noticed: 0, closed: 0 };
    for (const r of rows) s[r.stage] += 1;
    return s;
  }, [rows]);

  return (
    <BillingShell title="부과 마감" description="고지 발행이 끝난 부과월을 잠그거나 재개방">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard title={STAGE_LABELS.created} value={`${counts.created}`} />
        <StatCard title={STAGE_LABELS.calculated} value={`${counts.calculated}`} />
        <StatCard title={STAGE_LABELS.noticed} value={`${counts.noticed}`} />
        <StatCard title={STAGE_LABELS.closed} value={`${counts.closed}`} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Lock className="w-4 h-4" />부과월 마감 현황</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>월</TableHead><TableHead>상태</TableHead>
              <TableHead>고지 발행</TableHead><TableHead>마감일</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.billingMonth}</TableCell>
                  <TableCell><Badge className={STAGE_COLORS[r.stage]}>{STAGE_LABELS[r.stage]}</Badge></TableCell>
                  <TableCell className="text-xs">{r.noticeIssuedAt ? new Date(r.noticeIssuedAt).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-xs">{r.closedAt ? new Date(r.closedAt).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-right">
                    {r.stage === "noticed" && <Button size="sm" onClick={() => close(r)} data-testid={`btn-close-${r.billingMonth}`}><Lock className="w-3 h-3 mr-1" />마감</Button>}
                    {r.stage === "closed" && <Button size="sm" variant="outline" onClick={() => reopen(r)}><RotateCcw className="w-3 h-3 mr-1" />재개방</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </BillingShell>
  );
}
