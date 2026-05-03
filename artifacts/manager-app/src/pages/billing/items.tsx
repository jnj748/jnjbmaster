// [Task #799] /billing/items — 부과항목 마스터 CRUD.
//
// XpBIZ "부과항목등록" 화면을 우리 디자인으로 재구성. 시드 버튼으로 표준 13항목을
//   한방에 채울 수 있다. 행 클릭 → 우측 시트 편집.
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { BillingShell, useApi, krw, Empty, type BillingItem } from "./_shared";
import { Plus, Sparkles } from "lucide-react";

const CATS: BillingItem["category"][] = ["maintenance", "heating", "gas", "meter", "separate"];
const BASES: BillingItem["basis"][] = ["area", "unit_count", "fixed", "meter", "usage"];
const CAT_LABEL: Record<BillingItem["category"], string> = {
  maintenance: "관리비", heating: "난방", gas: "가스", meter: "검침", separate: "별도",
};
const BASIS_LABEL: Record<BillingItem["basis"], string> = {
  area: "면적기준", unit_count: "호실당", fixed: "정액", meter: "검침량", usage: "사용량",
};

const blank = (): Partial<BillingItem> => ({
  code: "", name: "", category: "maintenance", basis: "area", unitPrice: 0,
  isProgressive: false, isDailyBased: false, exemptionRate: 0,
  optOutAllowed: false, isTaxable: false, printOnNotice: true, printOnAdjustment: true,
  isActive: true, sortOrder: 100,
});

export default function BillingItemsPage() {
  const api = useApi();
  const { toast } = useToast();
  const [rows, setRows] = useState<BillingItem[]>([]);
  const [editing, setEditing] = useState<Partial<BillingItem> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => setRows(await api<BillingItem[]>("GET", "/billing-items"));
  useEffect(() => { void load(); }, []);

  const seed = async () => {
    setBusy(true);
    try {
      const r = await api<{ created?: number; skipped?: number }>("POST", "/billing-items/seed");
      toast({ title: r.created ? `시드 ${r.created}개 생성` : "이미 항목이 존재합니다" });
      await load();
    } catch (e) { toast({ title: "시드 실패", description: String(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.code || !editing.name) { toast({ title: "코드/명칭 필수" }); return; }
    setBusy(true);
    try {
      if (editing.id) {
        await api("PATCH", `/billing-items/${editing.id}`, editing);
        toast({ title: "저장 완료" });
      } else {
        await api("POST", "/billing-items", editing);
        toast({ title: "추가 완료" });
      }
      setEditing(null); await load();
    } catch (e) { toast({ title: "저장 실패", description: String(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const remove = async (id: number) => {
    if (!confirm("삭제하시겠습니까?")) return;
    await api("DELETE", `/billing-items/${id}`);
    toast({ title: "삭제 완료" });
    await load();
  };

  return (
    <BillingShell title="부과항목 마스터" description="고지서·총괄표에서 사용할 항목 코드와 단가/기준 설정"
      action={
        <div className="flex gap-2">
          <Button variant="outline" onClick={seed} disabled={busy} data-testid="btn-seed">
            <Sparkles className="w-4 h-4 mr-1" />표준 13항목 시드
          </Button>
          <Button onClick={() => setEditing(blank())} data-testid="btn-new">
            <Plus className="w-4 h-4 mr-1" />항목 추가
          </Button>
        </div>
      }
    >
      {rows.length === 0 ? (
        <Empty message="등록된 항목이 없습니다. '표준 13항목 시드' 로 시작하세요." />
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>코드</TableHead><TableHead>명칭</TableHead>
              <TableHead>분류</TableHead><TableHead>기준</TableHead>
              <TableHead className="text-right">단가</TableHead>
              <TableHead>상태</TableHead><TableHead className="w-24"></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map(r => (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setEditing(r)}>
                  <TableCell className="font-mono text-sm">{r.code}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell><Badge variant="outline">{CAT_LABEL[r.category]}</Badge></TableCell>
                  <TableCell><Badge variant="secondary">{BASIS_LABEL[r.basis]}</Badge></TableCell>
                  <TableCell className="text-right tabular-nums">{krw(r.unitPrice)}</TableCell>
                  <TableCell>
                    {r.isActive ? <Badge>활성</Badge> : <Badge variant="outline">비활성</Badge>}
                    {r.printOnNotice && <Badge variant="outline" className="ml-1">고지</Badge>}
                  </TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); void remove(r.id); }}>삭제</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{editing?.id ? "항목 편집" : "새 항목"}</SheetTitle></SheetHeader>
          {editing && (
            <div className="space-y-3 mt-4">
              <Field label="코드"><Input value={editing.code ?? ""} onChange={(e) => setEditing({ ...editing, code: e.target.value })} data-testid="in-code" /></Field>
              <Field label="명칭"><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
              <Field label="분류">
                <Select value={editing.category} onValueChange={(v: BillingItem["category"]) => setEditing({ ...editing, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CATS.map(c => <SelectItem key={c} value={c}>{CAT_LABEL[c]}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="기준">
                <Select value={editing.basis} onValueChange={(v: BillingItem["basis"]) => setEditing({ ...editing, basis: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BASES.map(b => <SelectItem key={b} value={b}>{BASIS_LABEL[b]}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="단가"><Input type="number" value={editing.unitPrice ?? 0} onChange={(e) => setEditing({ ...editing, unitPrice: Number(e.target.value) })} /></Field>
              <Field label="면제율 (0~1)"><Input type="number" step="0.01" value={editing.exemptionRate ?? 0} onChange={(e) => setEditing({ ...editing, exemptionRate: Number(e.target.value) })} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="상위 항목 코드"><Input value={editing.parentCode ?? ""} onChange={(e) => setEditing({ ...editing, parentCode: e.target.value || null })} placeholder="(없음)" data-testid="in-parent" /></Field>
                <Field label="정렬 순서"><Input type="number" value={editing.sortOrder ?? 100} onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })} /></Field>
              </div>
              <Field label="비고"><Input value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value || null })} placeholder="규약/근거/주의사항" /></Field>
              <ToggleRow label="입주자 거부 가능 (opt-out)" v={!!editing.optOutAllowed} on={(v) => setEditing({ ...editing, optOutAllowed: v })} />
              <ToggleRow label="누진 계산" v={!!editing.isProgressive} on={(v) => setEditing({ ...editing, isProgressive: v })} />
              <ToggleRow label="일수 계산" v={!!editing.isDailyBased} on={(v) => setEditing({ ...editing, isDailyBased: v })} />
              <ToggleRow label="고지서 출력" v={!!editing.printOnNotice} on={(v) => setEditing({ ...editing, printOnNotice: v })} />
              <ToggleRow label="조정대장 출력" v={!!editing.printOnAdjustment} on={(v) => setEditing({ ...editing, printOnAdjustment: v })} />
              <ToggleRow label="과세" v={!!editing.isTaxable} on={(v) => setEditing({ ...editing, isTaxable: v })} />
              <ToggleRow label="활성" v={editing.isActive ?? true} on={(v) => setEditing({ ...editing, isActive: v })} />
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
function ToggleRow({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return <div className="flex items-center justify-between"><Label>{label}</Label><Switch checked={v} onCheckedChange={on} /></div>;
}
