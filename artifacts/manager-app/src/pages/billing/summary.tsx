// [Task #799] /billing/summary — 부과총괄표 + AI 한 단락 요약.
//
// 월 선택 → 카테고리 카드 + 호실 라인 테이블 + AI 한 줄 요약.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { BillingShell, useApi, krw, currentMonth, StatCard, Empty, type SummaryResp } from "./_shared";
import { Sparkles, Download } from "lucide-react";

const CATEGORY_LABEL: Record<string, string> = {
  commonMaintenance: "공동 관리비",
  repairReserve: "장기수선충당금",
  installment: "분할 부과",
  meter: "검침 사용량",
  other: "기타",
};

export default function BillingSummaryPage() {
  const api = useApi();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<SummaryResp | null>(null);
  const [aiSummary, setAiSummary] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [summary, ai] = await Promise.all([
        api<SummaryResp>("GET", `/billing-summary?month=${month}`),
        api<{ summary: string }>("GET", `/billing-ai-summary?month=${month}`).catch(() => ({ summary: "" })),
      ]);
      setData(summary); setAiSummary(ai.summary);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [month]);

  const exportCsv = () => {
    if (!data) return;
    const header = ["호실", "총액"];
    const lines = data.lines.map(l => [l.unitNumber, String(l.totalAmount)].join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `summary-${month}.csv`;
    a.click();
  };

  return (
    <BillingShell title="부과 총괄표" description="월별 카테고리·호실 합계와 AI 핵심 요약 한 단락"
      action={
        <div className="flex gap-2 items-end">
          <div><Label className="text-xs">월</Label><Input value={month} onChange={(e) => setMonth(e.target.value)} className="w-32" data-testid="in-month" /></div>
          <Button variant="outline" onClick={exportCsv} disabled={!data}><Download className="w-4 h-4 mr-1" />CSV</Button>
        </div>
      }
    >
      {loading ? <Empty message="불러오는 중…" /> :
       !data || !data.run ? <Empty message="해당 월의 부과 산출 기록이 없습니다." /> : (
        <>
          <Card className="mb-4 border-primary/30 bg-primary/5">
            <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="w-4 h-4" />AI 요약</CardTitle></CardHeader>
            <CardContent className="text-sm leading-relaxed" data-testid="ai-summary">{aiSummary || "—"}</CardContent>
          </Card>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard title="총 부과액" value={krw(data.total)}
              hint={data.compare ? `전월 ${krw(data.compare.previous.total)} · ${data.compare.totalDiff >= 0 ? "+" : ""}${(data.compare.totalRate * 100).toFixed(1)}%` : undefined} />
            <StatCard title="호실 수" value={`${data.unitCount}`} hint={data.compare ? `전월 ${data.compare.previous.unitCount}` : undefined} />
            <StatCard title="조정 합계" value={krw(data.adjustmentTotal)} hint={`${data.adjustments.length}건`} />
            <StatCard title="별도 부과" value={krw(data.extraTotal)} hint={`${data.extras.length}건`} />
          </div>

          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="text-base">카테고리별 합계 · 전월 대비</CardTitle>
              <CardDescription>{data.run.billingMonth} · Run #{data.run.id} · 비교월 {data.compareMonth}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>항목</TableHead>
                  <TableHead className="text-right">이번 달</TableHead>
                  <TableHead className="text-right">전월</TableHead>
                  <TableHead className="text-right">증감</TableHead>
                  <TableHead className="text-right">증감률</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(data.compare?.byCategory ?? []).map(c => {
                    const up = c.diff > 0;
                    const dn = c.diff < 0;
                    return (
                      <TableRow key={c.key} data-testid={`row-cat-${c.key}`}>
                        <TableCell>{CATEGORY_LABEL[c.key] ?? c.key}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{krw(c.current)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{krw(c.previous)}</TableCell>
                        <TableCell className={`text-right tabular-nums ${up ? "text-red-600" : dn ? "text-emerald-600" : ""}`}>
                          {up ? "▲" : dn ? "▼" : ""} {krw(Math.abs(c.diff))}
                        </TableCell>
                        <TableCell className={`text-right tabular-nums text-xs ${up ? "text-red-600" : dn ? "text-emerald-600" : ""}`}>
                          {c.previous ? `${(c.rate * 100).toFixed(1)}%` : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">호실별 라인</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader><TableRow><TableHead>호실</TableHead><TableHead className="text-right">총액</TableHead><TableHead>구성</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.lines.map(l => (
                    <TableRow key={l.id}>
                      <TableCell className="font-mono">{l.unitNumber}</TableCell>
                      <TableCell className="text-right tabular-nums">{krw(l.totalAmount)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {Object.entries(l.breakdown ?? {}).map(([k, v]) => (
                          <Badge key={k} variant="outline" className="mr-1">{CATEGORY_LABEL[k] ?? k} {krw(Number(v))}</Badge>
                        ))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </BillingShell>
  );
}
