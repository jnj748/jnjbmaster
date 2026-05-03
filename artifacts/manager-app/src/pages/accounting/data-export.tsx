// [Task #801] 회계데이터 전송 — 분개/라인 CSV 묶음 다운로드.
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useApi } from "@/lib/accounting-api";
import { Download, FileText } from "lucide-react";

interface JE { id: number; entryDate: string; memo: string; sourceEvent: string; isBalanced: boolean; locked: boolean; isReversal: boolean; totalDebit: number; totalCredit: number }
interface JL { id: number; entryId: number; accountCode: string; accountName: string; debit: number; credit: number; partyName: string | null; memo: string | null }

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  const t = s.replace(/"/g, '""');
  return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"'${t}"`.replace(`"'`, `"`) : t;
}
function toCsv(rows: Array<Record<string, unknown>>, headers: string[]): string {
  const head = headers.map(csvEscape).join(",");
  const body = rows.map((r) => headers.map((h) => csvEscape(r[h])).join(",")).join("\n");
  return `\uFEFF${head}\n${body}`;
}
function download(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function DataExportPage() {
  const api = useApi();
  const today = new Date();
  const [from, setFrom] = useState(`${today.getFullYear()}-01-01`);
  const [to, setTo] = useState(today.toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const data = await api<{ entries: JE[]; lines: JL[] }>(`/accounting/data-export?from=${from}&to=${to}`);
      download(toCsv(data.entries as unknown as Array<Record<string, unknown>>, ["id", "entryDate", "memo", "sourceEvent", "totalDebit", "totalCredit", "isBalanced", "locked", "isReversal"]), `journal_entries_${from}_${to}.csv`);
      download(toCsv(data.lines as unknown as Array<Record<string, unknown>>, ["entryId", "accountCode", "accountName", "debit", "credit", "partyName", "memo"]), `journal_lines_${from}_${to}.csv`);
      toast.success(`전표 ${data.entries.length}건 / 라인 ${data.lines.length}건을 내보냈습니다`);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3"><FileText className="size-6 text-primary" /><h1 className="text-2xl font-bold">회계데이터 전송</h1></div>
      <Card>
        <CardHeader><CardTitle className="text-base">기간 선택 후 CSV 내보내기</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <div><Label>시작일</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>종료일</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <div className="flex items-end"><Button className="w-full" onClick={run} disabled={busy} data-testid="export-run"><Download className="size-4 mr-1" />{busy ? "준비 중..." : "내보내기"}</Button></div>
        </CardContent>
      </Card>
    </div>
  );
}
