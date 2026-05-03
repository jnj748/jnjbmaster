// [Task #801] 자동분개 규칙 — 이벤트 별 차/대 라인 매핑 정의.
//   본 화면은 "엔진 설정"이지 데이터 입력이 아니므로 구조화된 폼 + 라인 카드 형태로 노출.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useApi } from "@/lib/accounting-api";
import { Sparkles, Plus, Trash2 } from "lucide-react";

const EVENTS: Array<{ value: string; label: string }> = [
  { value: "billing.finalized", label: "관리비 부과 확정" },
  { value: "payment.received", label: "수납 완료" },
  { value: "voucher.confirmed", label: "지출결의 확정" },
  { value: "voucher.recorded", label: "지출결의 출납" },
  { value: "manual", label: "수동 발행" },
];

interface RuleLine { id?: number; kind: "debit" | "credit"; accountCode: string; accountName: string; amountSource: "event" | "fixed"; fixedAmount: number | null; ratio: number; memo: string | null }
interface Rule { id: number; buildingId: number | null; code: string; name: string; event: string; enabled: boolean; memo: string | null; lines: RuleLine[] }

function emptyLine(kind: "debit" | "credit"): RuleLine {
  return { kind, accountCode: "", accountName: "", amountSource: "event", fixedAmount: null, ratio: 1, memo: null };
}

export default function AutoJournalRulesPage() {
  const api = useApi();
  const [rules, setRules] = useState<Rule[]>([]);
  const [editing, setEditing] = useState<Rule | null>(null);

  async function load() {
    try {
      const data = await api<{ rules: Rule[] }>("/accounting/auto-journal-rules");
      setRules(data.rules);
    } catch (e) { toast.error((e as Error).message); }
  }
  useEffect(() => { load(); }, []);

  function startNew() {
    setEditing({ id: 0, buildingId: null, code: "", name: "", event: "billing.finalized", enabled: true, memo: null, lines: [emptyLine("debit"), emptyLine("credit")] });
  }

  async function save() {
    if (!editing) return;
    if (!editing.code || !editing.name) { toast.error("코드/이름 필요"); return; }
    try {
      if (editing.id) {
        await api(`/accounting/auto-journal-rules/${editing.id}`, { method: "PATCH", body: JSON.stringify(editing) });
      } else {
        await api("/accounting/auto-journal-rules", { method: "POST", body: JSON.stringify(editing) });
      }
      toast.success("저장되었습니다");
      setEditing(null);
      await load();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function remove(id: number) {
    if (!confirm("삭제하시겠습니까?")) return;
    try {
      await api(`/accounting/auto-journal-rules/${id}`, { method: "DELETE" });
      await load();
    } catch (e) { toast.error((e as Error).message); }
  }

  function patchEditing(p: Partial<Rule>) { setEditing((cur) => (cur ? { ...cur, ...p } : cur)); }
  function patchLine(i: number, p: Partial<RuleLine>) {
    setEditing((cur) => (cur ? { ...cur, lines: cur.lines.map((l, idx) => (idx === i ? { ...l, ...p } : l)) } : cur));
  }
  function addLine(kind: "debit" | "credit") {
    setEditing((cur) => (cur ? { ...cur, lines: [...cur.lines, emptyLine(kind)] } : cur));
  }
  function removeLine(i: number) {
    setEditing((cur) => (cur ? { ...cur, lines: cur.lines.filter((_, idx) => idx !== i) } : cur));
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><Sparkles className="size-6 text-primary" /><h1 className="text-2xl font-bold">자동분개 규칙</h1></div>
        {!editing && <Button onClick={startNew} data-testid="rule-new"><Plus className="size-4 mr-1" />새 규칙</Button>}
      </div>

      {editing && (
        <Card>
          <CardHeader><CardTitle className="text-base">{editing.id ? "규칙 수정" : "새 규칙"}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div><Label>코드</Label><Input value={editing.code} onChange={(e) => patchEditing({ code: e.target.value })} data-testid="rule-code" /></div>
              <div><Label>이름</Label><Input value={editing.name} onChange={(e) => patchEditing({ name: e.target.value })} /></div>
              <div>
                <Label>이벤트</Label>
                <Select value={editing.event} onValueChange={(v) => patchEditing({ event: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EVENTS.map((e) => (<SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2"><Switch checked={editing.enabled} onCheckedChange={(v) => patchEditing({ enabled: v })} /><span className="text-sm">활성</span></div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label>차변</Label><Button variant="outline" size="sm" onClick={() => addLine("debit")}><Plus className="size-3 mr-1" />차변 추가</Button></div>
              {editing.lines.filter((l) => l.kind === "debit").map((l) => {
                const i = editing.lines.indexOf(l);
                return <LineEditor key={i} line={l} onChange={(p) => patchLine(i, p)} onRemove={() => removeLine(i)} />;
              })}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between"><Label>대변</Label><Button variant="outline" size="sm" onClick={() => addLine("credit")}><Plus className="size-3 mr-1" />대변 추가</Button></div>
              {editing.lines.filter((l) => l.kind === "credit").map((l) => {
                const i = editing.lines.indexOf(l);
                return <LineEditor key={i} line={l} onChange={(p) => patchLine(i, p)} onRemove={() => removeLine(i)} />;
              })}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>취소</Button>
              <Button onClick={save} data-testid="rule-save">저장</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">등록된 규칙</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {rules.length === 0 && <p className="text-muted-foreground text-center py-6">등록된 규칙이 없습니다</p>}
          {rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-3 border rounded-md">
              <div>
                <div className="font-medium flex items-center gap-2">
                  <span className="font-mono text-xs">{r.code}</span> {r.name}
                  <Badge variant={r.enabled ? "secondary" : "outline"}>{r.enabled ? "활성" : "정지"}</Badge>
                  {r.buildingId == null && <Badge variant="outline">표준</Badge>}
                </div>
                <div className="text-sm text-muted-foreground">{EVENTS.find((e) => e.value === r.event)?.label ?? r.event} · 차 {r.lines.filter((l) => l.kind === "debit").length} · 대 {r.lines.filter((l) => l.kind === "credit").length}</div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(r)}>수정</Button>
                {r.buildingId != null && <Button variant="ghost" size="sm" onClick={() => remove(r.id)}><Trash2 className="size-3" /></Button>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function LineEditor(props: { line: RuleLine; onChange: (p: Partial<RuleLine>) => void; onRemove: () => void }) {
  const { line, onChange, onRemove } = props;
  return (
    <div className="grid gap-2 md:grid-cols-7 items-end p-2 border rounded">
      <div className="md:col-span-1"><Label className="text-xs">계정코드</Label><Input value={line.accountCode} onChange={(e) => onChange({ accountCode: e.target.value })} /></div>
      <div className="md:col-span-2"><Label className="text-xs">계정명</Label><Input value={line.accountName} onChange={(e) => onChange({ accountName: e.target.value })} /></div>
      <div>
        <Label className="text-xs">금액원</Label>
        <Select value={line.amountSource} onValueChange={(v) => onChange({ amountSource: v as "event" | "fixed" })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="event">이벤트 금액</SelectItem>
            <SelectItem value="fixed">고정 금액</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div><Label className="text-xs">비율</Label><Input type="number" step="0.01" value={line.ratio} onChange={(e) => onChange({ ratio: Number(e.target.value) || 1 })} /></div>
      <div><Label className="text-xs">고정금액</Label><Input type="number" value={line.fixedAmount ?? ""} onChange={(e) => onChange({ fixedAmount: e.target.value === "" ? null : Number(e.target.value) })} disabled={line.amountSource !== "fixed"} /></div>
      <div className="flex justify-end"><Button variant="ghost" size="sm" onClick={onRemove}><Trash2 className="size-3" /></Button></div>
    </div>
  );
}
