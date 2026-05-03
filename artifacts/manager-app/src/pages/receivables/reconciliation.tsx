// [Task #800] /receivables/reconciliation — 통장 비교 (이의/차이) 대장.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ReceivablesShell, useApi, krw, Empty, StatCard, STATUS_BADGE, type ReconRow } from "./_shared";
import { GitCompare, Plus, Sparkles } from "lucide-react";

const CAT_LABEL: Record<ReconRow["category"], string> = {
  overpaid: "초과 입금", underpaid: "미달 입금", duplicate: "중복 입금",
  refund_due: "환불 대상", wrong_account: "타 호실 입금", dispute: "이의", other: "기타",
};

export default function ReceivablesReconciliationPage() {
  const api = useApi();
  const { toast } = useToast();
  const [rows, setRows] = useState<ReconRow[]>([]);
  const [filter, setFilter] = useState<"all" | "open" | "investigating" | "resolved">("all");
  const [creating, setCreating] = useState<{ category: ReconRow["category"]; amount: number; reason: string } | null>(null);
  const [editing, setEditing] = useState<{ id: number; status: "open" | "investigating" | "resolved" | "wontfix"; resolution: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const q = filter === "all" ? "" : `?status=${filter}`;
    setRows(await api<ReconRow[]>("GET", `/receivables/reconciliation${q}`));
  };
  useEffect(() => { void load(); }, [filter]);

  const create = async () => {
    if (!creating) return;
    setBusy(true);
    try {
      await api("POST", "/receivables/reconciliation", creating);
      toast({ title: "이의/차이 등록" });
      setCreating(null);
      await load();
    } catch (e) { toast({ title: "실패", description: String(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const update = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      await api("PATCH", `/receivables/reconciliation/${editing.id}`, { status: editing.status, resolution: editing.resolution });
      toast({ title: "처리 상태 업데이트" });
      setEditing(null);
      await load();
    } catch (e) { toast({ title: "실패", description: String(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const counts = {
    all: rows.length,
    open: rows.filter(r => r.status === "open").length,
    investigating: rows.filter(r => r.status === "investigating").length,
    resolved: rows.filter(r => r.status === "resolved").length,
  };

  return (
    <ReceivablesShell title="통장 비교 (이의/차이)" description="초과/미달/중복/환불/타 호실 입금 등 통장-고지 차액을 사례별로 분류·처리."
      action={<Button onClick={() => setCreating({ category: "dispute", amount: 0, reason: "" })} data-testid="btn-new">
        <Plus className="w-4 h-4 mr-1" />이의/차이 등록
      </Button>}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard title="총 건수" value={`${counts.all}`} />
        <StatCard title="미처리" value={`${counts.open}`} tone="warn" />
        <StatCard title="조사중" value={`${counts.investigating}`} />
        <StatCard title="완료" value={`${counts.resolved}`} tone="ok" />
      </div>

      <div className="mb-3 flex gap-2">
        {(["all", "open", "investigating", "resolved"] as const).map(f => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} data-testid={`filter-${f}`}>
            {f === "all" ? "전체" : f === "open" ? "미처리" : f === "investigating" ? "조사중" : "완료"}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><GitCompare className="w-4 h-4" />이의/차이 ({rows.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? <Empty message="등록된 이의/차이가 없습니다." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-3 py-2">분류</th>
                    <th className="px-3 py-2 text-right">차이 금액</th>
                    <th className="px-3 py-2">사유</th>
                    <th className="px-3 py-2">AI 제안</th>
                    <th className="px-3 py-2">상태</th>
                    <th className="px-3 py-2">등록일</th>
                    <th className="px-3 py-2 text-right">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.id} className="border-t" data-testid={`row-recon-${r.id}`}>
                      <td className="px-3 py-2"><Badge variant="outline">{CAT_LABEL[r.category]}</Badge></td>
                      <td className="px-3 py-2 text-right tabular-nums">{krw(r.amount)}</td>
                      <td className="px-3 py-2 text-xs max-w-[200px] truncate" title={r.reason ?? ""}>{r.reason ?? "—"}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[220px]">
                        {r.aiSuggestion ? <span className="inline-flex items-start gap-1"><Sparkles className="w-3 h-3 mt-0.5 text-amber-500" />{r.aiSuggestion}</span> : "—"}
                      </td>
                      <td className="px-3 py-2"><Badge className={STATUS_BADGE[r.status] ?? ""}>{r.status}</Badge></td>
                      <td className="px-3 py-2 text-xs">{r.createdAt.slice(0, 10)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="outline" onClick={() => setEditing({ id: r.id, status: r.status, resolution: r.resolution ?? "" })}>처리</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!creating} onOpenChange={(o) => !o && setCreating(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>이의/차이 등록</SheetTitle></SheetHeader>
          {creating && (
            <div className="space-y-3 mt-4">
              <div>
                <Label className="text-xs">분류</Label>
                <Select value={creating.category} onValueChange={(v) => setCreating({ ...creating, category: v as ReconRow["category"] })}>
                  <SelectTrigger data-testid="sel-cat"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CAT_LABEL) as ReconRow["category"][]).map(k => (
                      <SelectItem key={k} value={k}>{CAT_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">차이 금액 (±)</Label>
                <Input type="number" value={creating.amount} onChange={(e) => setCreating({ ...creating, amount: Number(e.target.value) || 0 })} data-testid="in-amount" />
              </div>
              <div>
                <Label className="text-xs">사유</Label>
                <Textarea rows={4} value={creating.reason} onChange={(e) => setCreating({ ...creating, reason: e.target.value })} />
              </div>
              <Button onClick={create} disabled={busy} className="w-full" data-testid="btn-create">등록</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>처리 상태 변경</SheetTitle></SheetHeader>
          {editing && (
            <div className="space-y-3 mt-4">
              <div>
                <Label className="text-xs">상태</Label>
                <Select value={editing.status} onValueChange={(v) => setEditing({ ...editing, status: v as typeof editing.status })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">미처리</SelectItem>
                    <SelectItem value="investigating">조사중</SelectItem>
                    <SelectItem value="resolved">완료</SelectItem>
                    <SelectItem value="wontfix">보류</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">처리 결과</Label>
                <Textarea rows={5} value={editing.resolution} onChange={(e) => setEditing({ ...editing, resolution: e.target.value })} />
              </div>
              <Button onClick={update} disabled={busy} className="w-full" data-testid="btn-update">저장</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </ReceivablesShell>
  );
}
