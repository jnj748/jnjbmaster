// [Task #801] 개시잔액 — AI 우선 흐름.
//   사용자가 전기말/전월 잔액을 자유 텍스트로 붙여넣으면 LLM 이 표준 계정과 매칭한
//   라인 배열을 생성. 사용자는 검토 후 "발행" 버튼으로 manual 분개를 1건 등록한다.
//   별도 셀 그리드 입력 UI 는 제공하지 않는다(컨셉상 회피).
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useApi, won } from "@/lib/accounting-api";
import { Sparkles, Send, Loader2 } from "lucide-react";

interface FiscalPeriod { id: number; code: string; name: string; isCurrent: boolean; status: string }
interface ParsedLine { accountCode: string; accountName: string; debit: number; credit: number; memo: string | null }
interface SavedRow { id: number; accountCode: string; accountName: string; debit: number; credit: number; memo: string | null; posted: boolean; postedJournalEntryId: number | null }

export default function OpeningBalancesPage() {
  const api = useApi();
  const [periods, setPeriods] = useState<FiscalPeriod[]>([]);
  const [periodId, setPeriodId] = useState<number | null>(null);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [lines, setLines] = useState<ParsedLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<SavedRow[]>([]);

  async function loadPeriods() {
    try {
      const data = await api<{ periods: FiscalPeriod[] }>("/accounting/fiscal-periods");
      setPeriods(data.periods);
      const cur = data.periods.find((p) => p.isCurrent) ?? data.periods[0];
      if (cur) setPeriodId(cur.id);
    } catch (e) { toast.error((e as Error).message); }
  }
  async function loadSaved(pid: number) {
    try {
      const data = await api<{ rows: SavedRow[] }>(`/accounting/opening-balances?fiscalPeriodId=${pid}`);
      setSaved(data.rows);
    } catch (e) { toast.error((e as Error).message); }
  }
  useEffect(() => { loadPeriods(); }, []);
  useEffect(() => { if (periodId) loadSaved(periodId); }, [periodId]);

  async function aiParse() {
    if (!text.trim()) { toast.error("전기말 잔액 텍스트를 붙여넣어 주세요"); return; }
    setParsing(true);
    try {
      const data = await api<{ lines: ParsedLine[] }>("/accounting/opening-balances/ai-parse", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setLines(data.lines);
      if (data.lines.length === 0) toast.warning("추출된 라인이 없습니다. 표현을 더 명확히 해 보세요");
      else toast.success(`${data.lines.length}개 라인을 추출했습니다`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setParsing(false); }
  }

  const totalD = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalC = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const balanced = Math.abs(totalD - totalC) < 0.5;

  function updateLine(i: number, patch: Partial<ParsedLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function removeLine(i: number) { setLines((prev) => prev.filter((_, idx) => idx !== i)); }

  async function postNow() {
    if (!periodId) { toast.error("회계기수를 선택해 주세요"); return; }
    if (lines.length === 0) { toast.error("발행할 라인이 없습니다"); return; }
    if (!balanced) { toast.error(`대차 불일치: 차변 ${won(totalD)} / 대변 ${won(totalC)}`); return; }
    setSaving(true);
    try {
      await api("/accounting/opening-balances/post", {
        method: "POST",
        body: JSON.stringify({ fiscalPeriodId: periodId, asOfDate, lines }),
      });
      toast.success("개시잔액 분개가 발행되었습니다");
      setLines([]); setText("");
      await loadSaved(periodId);
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Sparkles className="size-6 text-primary" />
        <h1 className="text-2xl font-bold">개시잔액 (AI 입력)</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">기수 / 기준일</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>회계기수</Label>
            <Select value={periodId ? String(periodId) : ""} onValueChange={(v) => setPeriodId(Number(v))}>
              <SelectTrigger data-testid="opening-period"><SelectValue placeholder="회계기수 선택" /></SelectTrigger>
              <SelectContent>
                {periods.map((p) => (<SelectItem key={p.id} value={String(p.id)}>{p.name} {p.isCurrent ? "(현행)" : ""}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>기준일</Label>
            <Input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">전기말 잔액 붙여넣기</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="예: 기업은행 보통예금 12,500,000 / 미수관리비 3,800,000 / 가수금 -500,000 ..."
            rows={6}
            data-testid="opening-text"
          />
          <Button onClick={aiParse} disabled={parsing} data-testid="opening-parse">
            {parsing ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Sparkles className="size-4 mr-1" />}
            AI 분석
          </Button>
        </CardContent>
      </Card>

      {lines.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">분석 결과 — 검토 후 발행</CardTitle>
              <Badge variant={balanced ? "secondary" : "destructive"}>
                차 {won(totalD)} / 대 {won(totalC)} {balanced ? "균형" : "불균형"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader><TableRow><TableHead>코드</TableHead><TableHead>계정명</TableHead><TableHead className="text-right">차변</TableHead><TableHead className="text-right">대변</TableHead><TableHead>메모</TableHead><TableHead></TableHead></TableRow></TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono">{l.accountCode}</TableCell>
                    <TableCell>{l.accountName}</TableCell>
                    <TableCell className="text-right"><Input type="number" value={l.debit} onChange={(e) => updateLine(i, { debit: Number(e.target.value) || 0 })} className="text-right" /></TableCell>
                    <TableCell className="text-right"><Input type="number" value={l.credit} onChange={(e) => updateLine(i, { credit: Number(e.target.value) || 0 })} className="text-right" /></TableCell>
                    <TableCell><Input value={l.memo ?? ""} onChange={(e) => updateLine(i, { memo: e.target.value })} /></TableCell>
                    <TableCell><Button variant="ghost" size="sm" onClick={() => removeLine(i)}>삭제</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 flex justify-end">
              <Button onClick={postNow} disabled={saving || !balanced} data-testid="opening-post">
                {saving ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Send className="size-4 mr-1" />}
                개시잔액 발행
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">저장된 개시잔액</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>코드</TableHead><TableHead>계정명</TableHead><TableHead className="text-right">차변</TableHead><TableHead className="text-right">대변</TableHead><TableHead>분개</TableHead></TableRow></TableHeader>
            <TableBody>
              {saved.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono">{r.accountCode}</TableCell>
                  <TableCell>{r.accountName}</TableCell>
                  <TableCell className="text-right">{won(r.debit)}</TableCell>
                  <TableCell className="text-right">{won(r.credit)}</TableCell>
                  <TableCell>{r.postedJournalEntryId ? <Badge variant="secondary">#{r.postedJournalEntryId}</Badge> : <Badge variant="outline">미발행</Badge>}</TableCell>
                </TableRow>
              ))}
              {saved.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">저장된 개시잔액이 없습니다</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
