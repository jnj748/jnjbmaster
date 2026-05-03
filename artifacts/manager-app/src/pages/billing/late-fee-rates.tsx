// [Task #799] /billing/late-fee-rates — 연체율 정책 CRUD.
//
// XpBIZ "연체율등록" 1행을 우리 폼으로. 누진 구간(tiers) 은 [from~to일, 율%, 누진여부] 행 추가/삭제.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { BillingShell, useApi, Empty, type LateFeeRate } from "./_shared";
import { Plus, Trash2 } from "lucide-react";

const blank = (): Partial<LateFeeRate> => ({
  noticeKind: "all", periodStart: new Date().toISOString().slice(0, 10),
  periodEnd: null, baseRate: 1.5,
  tiers: [{ fromDay: 1, toDay: 30, rate: 1.5, isProgressive: false }],
  applyCalculation: true,
});

export default function LateFeeRatesPage() {
  const api = useApi();
  const { toast } = useToast();
  const [rows, setRows] = useState<LateFeeRate[]>([]);
  const [editing, setEditing] = useState<Partial<LateFeeRate> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => setRows(await api<LateFeeRate[]>("GET", "/billing-late-fee-rates"));
  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      if (editing.id) await api("PATCH", `/billing-late-fee-rates/${editing.id}`, editing);
      else await api("POST", "/billing-late-fee-rates", editing);
      toast({ title: "저장 완료" });
      setEditing(null); await load();
    } catch (e) { toast({ title: "저장 실패", description: String(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const remove = async (id: number) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await api("DELETE", `/billing-late-fee-rates/${id}`);
    toast({ title: "삭제 완료" });
    await load();
  };

  const updateTier = (i: number, patch: Partial<LateFeeRate["tiers"][number]>) => {
    if (!editing?.tiers) return;
    const t = [...editing.tiers];
    t[i] = { ...t[i], ...patch };
    setEditing({ ...editing, tiers: t });
  };

  return (
    <BillingShell title="연체율 정책" description="기간별 누진 연체율을 정의 — 고지서 미수 발생 시 자동 가산"
      action={<Button onClick={() => setEditing(blank())} data-testid="btn-new"><Plus className="w-4 h-4 mr-1" />정책 추가</Button>}
    >
      {rows.length === 0 ? (
        <Empty message="등록된 연체율 정책이 없습니다." />
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>적용 대상</TableHead><TableHead>기간</TableHead>
              <TableHead className="text-right">기본율(%)</TableHead>
              <TableHead>구간</TableHead><TableHead>상태</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setEditing({ ...r, tiers: r.tiers ?? [] })}>
                  <TableCell><Badge variant="outline">{r.noticeKind}</Badge></TableCell>
                  <TableCell className="text-sm">{r.periodStart} ~ {r.periodEnd ?? "현재"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.baseRate}%</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {(r.tiers ?? []).map(t => `${t.fromDay}~${t.toDay}일 ${t.rate}%`).join(" / ") || "—"}
                  </TableCell>
                  <TableCell>{r.applyCalculation ? <Badge>적용</Badge> : <Badge variant="outline">정지</Badge>}</TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); void remove(r.id); }}>삭제</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>{editing?.id ? "정책 편집" : "새 연체율"}</SheetTitle></SheetHeader>
          {editing && (
            <div className="space-y-3 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="적용 대상"><Input value={editing.noticeKind ?? ""} onChange={(e) => setEditing({ ...editing, noticeKind: e.target.value })} /></Field>
                <Field label="기본율 (%)"><Input type="number" step="0.1" value={editing.baseRate ?? 0} onChange={(e) => setEditing({ ...editing, baseRate: Number(e.target.value) })} /></Field>
                <Field label="시작일"><Input type="date" value={editing.periodStart ?? ""} onChange={(e) => setEditing({ ...editing, periodStart: e.target.value })} /></Field>
                <Field label="종료일 (선택)"><Input type="date" value={editing.periodEnd ?? ""} onChange={(e) => setEditing({ ...editing, periodEnd: e.target.value || null })} /></Field>
              </div>
              <div className="flex items-center justify-between">
                <Label>계산 적용</Label>
                <Switch checked={editing.applyCalculation ?? true} onCheckedChange={(v) => setEditing({ ...editing, applyCalculation: v })} />
              </div>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center justify-between">
                  누진 구간
                  <Button size="sm" variant="outline" onClick={() => setEditing({ ...editing, tiers: [...(editing.tiers ?? []), { fromDay: 0, toDay: 30, rate: 1, isProgressive: false }] })}>
                    <Plus className="w-3 h-3 mr-1" />구간 추가
                  </Button>
                </CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {(editing.tiers ?? []).map((t, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <Input className="col-span-3" type="number" placeholder="시작일" value={t.fromDay} onChange={(e) => updateTier(i, { fromDay: Number(e.target.value) })} />
                      <Input className="col-span-3" type="number" placeholder="종료일" value={t.toDay} onChange={(e) => updateTier(i, { toDay: Number(e.target.value) })} />
                      <Input className="col-span-3" type="number" step="0.1" placeholder="율(%)" value={t.rate} onChange={(e) => updateTier(i, { rate: Number(e.target.value) })} />
                      <div className="col-span-2"><Switch checked={t.isProgressive} onCheckedChange={(v) => updateTier(i, { isProgressive: v })} /></div>
                      <Button size="icon" variant="ghost" className="col-span-1" onClick={() => setEditing({ ...editing, tiers: editing.tiers!.filter((_, j) => j !== i) })}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Button onClick={save} disabled={busy} className="w-full">저장</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </BillingShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs">{label}</Label>{children}</div>;
}
