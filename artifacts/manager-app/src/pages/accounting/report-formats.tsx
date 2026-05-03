// [Task #801] 보고서 형식 — 표준 형식(BS/IS) 의 행 구조 보관.
//   AI 추천으로 행을 일괄 생성한 뒤 사용자는 라벨/계정코드만 미세 조정.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useApi } from "@/lib/accounting-api";
import { Sparkles, Plus, Trash2, Loader2 } from "lucide-react";

interface FormatLine { sortOrder: number; label: string; accountCodes: string | null; isSummary: boolean; indent: number; memo: string | null }
interface Format { id: number; buildingId: number | null; code: string; name: string; kind: string; enabled: boolean; lines: FormatLine[] }

const KINDS = [
  { value: "balance_sheet", label: "재무상태표" },
  { value: "income_statement", label: "손익계산서" },
  { value: "trial_balance", label: "시산표" },
  { value: "custom", label: "사용자 정의" },
];

export default function ReportFormatsPage() {
  const api = useApi();
  const [formats, setFormats] = useState<Format[]>([]);
  const [editing, setEditing] = useState<Format | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  async function load() {
    try { const data = await api<{ formats: Format[] }>("/accounting/report-formats"); setFormats(data.formats); }
    catch (e) { toast.error((e as Error).message); }
  }
  useEffect(() => { load(); }, []);

  function startNew() {
    setEditing({ id: 0, buildingId: null, code: "", name: "", kind: "balance_sheet", enabled: true, lines: [] });
  }

  async function aiSuggest() {
    if (!editing) return;
    setLoadingAi(true);
    try {
      const data = await api<{ lines: FormatLine[] }>("/accounting/report-formats/ai-suggest", {
        method: "POST",
        body: JSON.stringify({ kind: editing.kind }),
      });
      setEditing({ ...editing, lines: data.lines.map((l, i) => ({ ...l, sortOrder: i })) });
      toast.success(`${data.lines.length}개 행을 추천했습니다`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoadingAi(false); }
  }

  async function save() {
    if (!editing || !editing.code || !editing.name) { toast.error("코드/이름 필요"); return; }
    try {
      await api("/accounting/report-formats", { method: "POST", body: JSON.stringify(editing) });
      toast.success("저장되었습니다");
      setEditing(null);
      await load();
    } catch (e) { toast.error((e as Error).message); }
  }

  async function remove(id: number) {
    if (!confirm("삭제?")) return;
    try { await api(`/accounting/report-formats/${id}`, { method: "DELETE" }); await load(); }
    catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3"><Sparkles className="size-6 text-primary" /><h1 className="text-2xl font-bold">보고서 형식</h1></div>
        {!editing && <Button onClick={startNew}><Plus className="size-4 mr-1" />새 형식</Button>}
      </div>

      {editing && (
        <Card>
          <CardHeader><CardTitle className="text-base">새 형식</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div><Label>코드</Label><Input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} /></div>
              <div><Label>이름</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div>
                <Label>종류</Label>
                <Select value={editing.kind} onValueChange={(v) => setEditing({ ...editing, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{KINDS.map((k) => (<SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>))}</SelectContent>
                </Select>
              </div>
            </div>
            <Button variant="outline" onClick={aiSuggest} disabled={loadingAi}>
              {loadingAi ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Sparkles className="size-4 mr-1" />}
              AI 행 추천
            </Button>
            {editing.lines.length > 0 && (
              <Table>
                <TableHeader><TableRow><TableHead>순서</TableHead><TableHead>라벨</TableHead><TableHead>계정코드</TableHead><TableHead>합계</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {editing.lines.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>{l.sortOrder}</TableCell>
                      <TableCell><Input value={l.label} onChange={(e) => setEditing({ ...editing, lines: editing.lines.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x) })} /></TableCell>
                      <TableCell><Input value={l.accountCodes ?? ""} onChange={(e) => setEditing({ ...editing, lines: editing.lines.map((x, idx) => idx === i ? { ...x, accountCodes: e.target.value } : x) })} /></TableCell>
                      <TableCell>{l.isSummary && <Badge variant="secondary">합계</Badge>}</TableCell>
                      <TableCell><Button variant="ghost" size="sm" onClick={() => setEditing({ ...editing, lines: editing.lines.filter((_, idx) => idx !== i) })}><Trash2 className="size-3" /></Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditing(null)}>취소</Button>
              <Button onClick={save}>저장</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">등록된 형식</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {formats.length === 0 && <p className="text-center text-muted-foreground py-6">등록된 형식이 없습니다</p>}
          {formats.map((f) => (
            <div key={f.id} className="flex items-center justify-between p-3 border rounded-md">
              <div>
                <div className="font-medium flex items-center gap-2">
                  <span className="font-mono text-xs">{f.code}</span>{f.name}
                  <Badge variant="outline">{KINDS.find((k) => k.value === f.kind)?.label ?? f.kind}</Badge>
                  {f.buildingId == null && <Badge variant="secondary">표준</Badge>}
                </div>
                <div className="text-sm text-muted-foreground">{f.lines.length}개 행</div>
              </div>
              {f.buildingId != null && <Button variant="ghost" size="sm" onClick={() => remove(f.id)}><Trash2 className="size-3" /></Button>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
