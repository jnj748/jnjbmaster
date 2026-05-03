// [Task #799] /billing/adjustments — 조정대장 (할인/환불/재부과/대손) ledger.
//
// 월 → 가장 최근 run → 조정 ledger 조회/등록/삭제. 사유 칩으로 빠르게 등록.
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { BillingShell, useApi, krw, currentMonth, StatCard, Empty } from "./_shared";
import { Plus } from "lucide-react";

interface BillingRun { id: number; billingMonth: string; status: string; }
interface Adjustment {
  id: number; unitId: number; unitNumber?: string; adjustmentType: string;
  amount: number; reason: string; reasonChip: string | null; appliedAt: string | null; createdAt: string;
}
interface Unit { id: number; unitNumber: string; }

const TYPES = ["discount", "refund", "rebill", "writeoff"] as const;
const TYPE_LABEL: Record<string, string> = { discount: "할인", refund: "환불", rebill: "재부과", writeoff: "대손" };
const REASON_CHIPS = ["AI 추천", "장기 미납 협의", "오부과 정정", "퇴거 정산", "감면 신청", "분쟁 합의"];

export default function AdjustmentsPage() {
  const api = useApi();
  const { toast } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [run, setRun] = useState<BillingRun | null>(null);
  const [rows, setRows] = useState<Adjustment[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [creating, setCreating] = useState<{
    unitId: string; adjustmentType: string; amount: string; reason: string; reasonChip: string;
  } | null>(null);

  const load = async () => {
    const runs = await api<BillingRun[]>("GET", "/billing/runs");
    const r = runs.find(x => x.billingMonth === month) ?? null;
    setRun(r);
    if (r) {
      setRows(await api<Adjustment[]>("GET", `/billing/runs/${r.id}/adjustments`));
    } else { setRows([]); }
    setUnits(await api<Unit[]>("GET", "/units").catch(() => []));
  };
  useEffect(() => { void load(); }, [month]);

  const create = async () => {
    if (!run || !creating) return;
    if (!creating.unitId || !creating.reason || !creating.amount) { toast({ title: "필수값 누락" }); return; }
    await api("POST", `/billing/runs/${run.id}/adjustments`, {
      unitId: Number(creating.unitId),
      adjustmentType: creating.adjustmentType,
      amount: Number(creating.amount),
      reason: creating.reason,
      reasonChip: creating.reasonChip || null,
    });
    toast({ title: "조정 등록 완료" });
    setCreating(null); await load();
  };

  const totals = useMemo(() => {
    const by: Record<string, number> = {};
    for (const r of rows) by[r.adjustmentType] = (by[r.adjustmentType] ?? 0) + Number(r.amount);
    return by;
  }, [rows]);
  const grand = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <BillingShell title="조정대장" description="할인·환불·재부과·대손 — 사유 필수, 감사로그 자동 기록"
      action={
        <div className="flex gap-2 items-end">
          <div><Label className="text-xs">월</Label><Input value={month} onChange={(e) => setMonth(e.target.value)} className="w-32" /></div>
          <Button onClick={() => setCreating({ unitId: "", adjustmentType: "discount", amount: "", reason: "", reasonChip: "" })} disabled={!run} data-testid="btn-new-adj">
            <Plus className="w-4 h-4 mr-1" />조정 추가
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4">
        <StatCard title="총 조정액" value={krw(grand)} hint={`${rows.length}건`} />
        {TYPES.map(t => <StatCard key={t} title={TYPE_LABEL[t]} value={krw(totals[t] ?? 0)} />)}
      </div>

      {!run ? <Empty message="해당 월의 부과 산출이 없습니다." /> : (
        <Card><CardHeader><CardTitle className="text-base">{run.billingMonth} · Run #{run.id} 조정 ledger</CardTitle></CardHeader>
          <CardContent className="p-0">
            {rows.length === 0 ? <Empty message="등록된 조정이 없습니다." /> : (
              <Table>
                <TableHeader><TableRow>
                  <TableHead>호실</TableHead><TableHead>유형</TableHead>
                  <TableHead className="text-right">금액</TableHead><TableHead>사유</TableHead>
                  <TableHead>일시</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono">{r.unitNumber ?? `#${r.unitId}`}</TableCell>
                      <TableCell><Badge variant="outline">{TYPE_LABEL[r.adjustmentType] ?? r.adjustmentType}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{krw(r.amount)}</TableCell>
                      <TableCell className="text-sm">
                        {r.reasonChip && <Badge variant="secondary" className="mr-1">{r.reasonChip}</Badge>}
                        {r.reason}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Sheet open={!!creating} onOpenChange={(o) => !o && setCreating(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>조정 등록</SheetTitle></SheetHeader>
          {creating && (
            <div className="space-y-3 mt-4">
              <div><Label className="text-xs">호실</Label>
                <Select value={creating.unitId} onValueChange={(v) => setCreating({ ...creating, unitId: v })}>
                  <SelectTrigger><SelectValue placeholder="호실 선택" /></SelectTrigger>
                  <SelectContent>{units.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.unitNumber}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">유형</Label>
                <Select value={creating.adjustmentType} onValueChange={(v) => setCreating({ ...creating, adjustmentType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map(t => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">금액 (음수 가능)</Label><Input type="number" value={creating.amount} onChange={(e) => setCreating({ ...creating, amount: e.target.value })} data-testid="in-amount" /></div>
              <div>
                <Label className="text-xs">사유 칩</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {REASON_CHIPS.map(c => (
                    <button key={c} type="button" onClick={() => setCreating({ ...creating, reasonChip: c })}
                      className={`text-xs px-2 py-1 rounded-full border ${creating.reasonChip === c ? "bg-primary text-primary-foreground" : "bg-background"}`}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div><Label className="text-xs">상세 사유</Label><Textarea value={creating.reason} onChange={(e) => setCreating({ ...creating, reason: e.target.value })} data-testid="in-reason" /></div>
              <Button onClick={create} className="w-full" data-testid="btn-save-adj">저장</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </BillingShell>
  );
}
