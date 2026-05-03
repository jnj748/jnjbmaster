// [Task #801] 전표 입력 — AI 우선 흐름.
//   사용자가 거래를 자연어("4월 전기료 1,200,000 기업은행에서 한전에 송금")로 입력하면
//   LLM 이 분개 라인을 제안. 사용자는 라인을 확인/수정한 뒤 발행. 셀 그리드 행 추가
//   방식의 수기 입력은 제공하지 않으며, 미세 조정만 인라인 입력으로 허용한다.
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useApi, won } from "@/lib/accounting-api";
import { Sparkles, Send, Loader2 } from "lucide-react";

interface SuggestedLine { accountCode: string; accountName: string; debit: number; credit: number; memo: string | null }

export default function JournalsPage() {
  const api = useApi();
  const [text, setText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<SuggestedLine[]>([]);
  const [saving, setSaving] = useState(false);

  async function aiSuggest() {
    if (!text.trim()) { toast.error("거래 내용을 적어 주세요"); return; }
    setParsing(true);
    try {
      const data = await api<{ entryDate: string; memo: string; lines: SuggestedLine[] }>("/accounting/journal/ai-suggest", {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setEntryDate(data.entryDate);
      setMemo(data.memo);
      setLines(data.lines);
      toast.success("AI 가 분개를 제안했습니다");
    } catch (e) { toast.error((e as Error).message); }
    finally { setParsing(false); }
  }

  const totalD = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalC = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const balanced = Math.abs(totalD - totalC) < 0.5;

  function updateLine(i: number, patch: Partial<SuggestedLine>) {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function save() {
    if (!balanced) { toast.error(`대차 불일치: 차 ${won(totalD)} / 대 ${won(totalC)}`); return; }
    setSaving(true);
    try {
      await api("/accounting/journal", {
        method: "POST",
        body: JSON.stringify({ entryDate, memo, lines: lines.map((l) => ({ ...l, accountCode: l.accountCode, accountName: l.accountName })) }),
      });
      toast.success("전표가 발행되었습니다");
      setText(""); setLines([]); setMemo("");
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Sparkles className="size-6 text-primary" />
        <h1 className="text-2xl font-bold">전표 입력 (AI)</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">거래를 설명해 주세요</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="예) 4월 전기료 1,200,000 기업은행에서 한전에 송금"
            data-testid="journal-text"
          />
          <Button onClick={aiSuggest} disabled={parsing} data-testid="journal-ai">
            {parsing ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Sparkles className="size-4 mr-1" />}
            AI 분개 추천
          </Button>
        </CardContent>
      </Card>

      {lines.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">제안 분개 — 검토 후 발행</CardTitle>
              <Badge variant={balanced ? "secondary" : "destructive"}>차 {won(totalD)} / 대 {won(totalC)}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div><Label>전표일자</Label><Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} /></div>
              <div><Label>적요</Label><Input value={memo} onChange={(e) => setMemo(e.target.value)} data-testid="journal-memo" /></div>
            </div>
            <Table>
              <TableHeader><TableRow><TableHead>코드</TableHead><TableHead>계정명</TableHead><TableHead className="text-right">차변</TableHead><TableHead className="text-right">대변</TableHead><TableHead>메모</TableHead></TableRow></TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-mono">{l.accountCode}</TableCell>
                    <TableCell>{l.accountName}</TableCell>
                    <TableCell><Input type="number" value={l.debit} onChange={(e) => updateLine(i, { debit: Number(e.target.value) || 0 })} className="text-right" /></TableCell>
                    <TableCell><Input type="number" value={l.credit} onChange={(e) => updateLine(i, { credit: Number(e.target.value) || 0 })} className="text-right" /></TableCell>
                    <TableCell><Input value={l.memo ?? ""} onChange={(e) => updateLine(i, { memo: e.target.value })} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving || !balanced} data-testid="journal-save">
                {saving ? <Loader2 className="size-4 mr-1 animate-spin" /> : <Send className="size-4 mr-1" />}
                전표 발행
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
