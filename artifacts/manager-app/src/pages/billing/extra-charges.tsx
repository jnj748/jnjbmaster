// [Task #799] /billing/extra-charges — 호실별 일회성 별도 부과.
//
// CSV 붙여넣기로 한방 등록 (호실,라벨,금액[,코드,비고]). 행 단건 추가/삭제도 지원.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { BillingShell, useApi, krw, currentMonth, StatCard, Empty, type ExtraCharge } from "./_shared";
import { Plus, Upload, Trash2 } from "lucide-react";

interface Unit { id: number; unitNumber: string; }

export default function ExtraChargesPage() {
  const api = useApi();
  const { toast } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<ExtraCharge[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [csv, setCsv] = useState("");
  const [editing, setEditing] = useState<{ unitId: string; label: string; amount: string; itemCode: string; notes: string } | null>(null);

  const load = async () => {
    setRows(await api<ExtraCharge[]>("GET", `/billing-extra-charges?month=${month}`));
    setUnits(await api<Unit[]>("GET", "/units").catch(() => []));
  };
  useEffect(() => { void load(); }, [month]);

  const addOne = async () => {
    if (!editing) return;
    const u = units.find(x => String(x.id) === editing.unitId);
    if (!u) { toast({ title: "호실을 선택하세요" }); return; }
    if (!editing.label || !editing.amount) { toast({ title: "라벨/금액 필수" }); return; }
    await api("POST", "/billing-extra-charges", {
      unitId: u.id, unitNumber: u.unitNumber, billingMonth: month,
      itemCode: editing.itemCode || null, label: editing.label,
      amount: Number(editing.amount), notes: editing.notes || null,
    });
    toast({ title: "추가 완료" });
    setEditing(null); await load();
  };

  const importCsv = async () => {
    const lines = csv.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const items: unknown[] = [];
    for (const line of lines) {
      const [unitNumber, label, amount, itemCode, notes] = line.split(",").map(s => s?.trim() ?? "");
      const u = units.find(x => x.unitNumber === unitNumber);
      if (!u) continue;
      items.push({
        unitId: u.id, unitNumber: u.unitNumber, billingMonth: month,
        itemCode: itemCode || null, label, amount: Number(amount), notes: notes || null,
      });
    }
    if (items.length === 0) { toast({ title: "유효 행이 없습니다", variant: "destructive" }); return; }
    const r = await api<{ created: number }>("POST", "/billing-extra-charges/bulk", { items });
    toast({ title: `일괄 등록 ${r.created}건` });
    setCsv(""); await load();
  };

  const remove = async (id: number) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await api("DELETE", `/billing-extra-charges/${id}`);
    await load();
  };

  const total = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <BillingShell title="별도 금액 등록" description="호실별 일회성 부과 — CSV 붙여넣기 또는 단건 추가"
      action={
        <div className="flex gap-2 items-end">
          <div><Label className="text-xs">월</Label><Input value={month} onChange={(e) => setMonth(e.target.value)} className="w-32" /></div>
          <Button onClick={() => setEditing({ unitId: "", label: "", amount: "", itemCode: "", notes: "" })} data-testid="btn-new"><Plus className="w-4 h-4 mr-1" />추가</Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <StatCard title="등록 건수" value={`${rows.length}`} />
        <StatCard title="합계" value={krw(total)} />
        <StatCard title="대상 월" value={month} />
      </div>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Upload className="w-4 h-4" />CSV 붙여넣기</CardTitle></CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-2">형식: <code>호실,라벨,금액,코드(선택),비고(선택)</code></p>
          <Textarea rows={6} value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="101,충당금 추가,50000,S99,2분기분" data-testid="in-csv" />
          <Button className="mt-2" onClick={importCsv} disabled={!csv.trim()} data-testid="btn-import"><Upload className="w-4 h-4 mr-1" />일괄 등록</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">등록 목록</CardTitle></CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? <Empty message="이 달의 별도 부과 항목이 없습니다." /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>호실</TableHead><TableHead>코드</TableHead><TableHead>라벨</TableHead>
                <TableHead className="text-right">금액</TableHead><TableHead>비고</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono">{r.unitNumber}</TableCell>
                    <TableCell className="text-xs">{r.itemCode ?? "—"}</TableCell>
                    <TableCell>{r.label}</TableCell>
                    <TableCell className="text-right tabular-nums">{krw(r.amount)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.notes ?? "—"}</TableCell>
                    <TableCell><Button size="sm" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="w-3 h-3" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="w-full sm:max-w-md">
          <SheetHeader><SheetTitle>별도 부과 추가</SheetTitle></SheetHeader>
          {editing && (
            <div className="space-y-3 mt-4">
              <div><Label className="text-xs">호실</Label>
                <Select value={editing.unitId} onValueChange={(v) => setEditing({ ...editing, unitId: v })}>
                  <SelectTrigger><SelectValue placeholder="호실 선택" /></SelectTrigger>
                  <SelectContent>{units.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.unitNumber}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">라벨</Label><Input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} /></div>
              <div><Label className="text-xs">금액</Label><Input type="number" value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} /></div>
              <div><Label className="text-xs">코드 (선택)</Label><Input value={editing.itemCode} onChange={(e) => setEditing({ ...editing, itemCode: e.target.value })} /></div>
              <div><Label className="text-xs">비고</Label><Input value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
              <Button onClick={addOne} className="w-full">저장</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </BillingShell>
  );
}
