// [Task #800] /receivables/overdue — 미납대장.
//
// AI-first UX: 상단에 에이징 4구간 카드 + AI 메모(소장면담 권장 호실 자동 추출).
// 우측 액션: "오늘자 스냅샷 캡처" → receivable_overdue_snapshots 1행씩 적재.
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ReceivablesShell, useApi, krw, today, StatCard, Empty, BUCKET_LABEL, STATUS_BADGE,
  type OverdueResp } from "./_shared";
import { Camera, Sparkles, Send, Wallet } from "lucide-react";

export default function ReceivablesOverduePage() {
  const api = useApi();
  const { toast } = useToast();
  const [data, setData] = useState<OverdueResp | null>(null);
  const [asOf, setAsOf] = useState<string>(today());
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setData(await api<OverdueResp>("GET", `/receivables/overdue?asOf=${asOf}`));
  };
  useEffect(() => { void load(); }, [asOf]);

  const snapshot = async () => {
    setBusy(true);
    try {
      const r = await api<{ captured: number; total: number }>("POST", "/receivables/overdue/snapshot", { asOf });
      toast({ title: `${r.captured}건 스냅샷 캡처`, description: `대상 ${r.total}건 — 같은 날짜 중복은 자동 무시됩니다.` });
    } catch (e) {
      toast({ title: "스냅샷 실패", description: String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const aiPriority = data?.rows.filter(b => b.overdueDays >= 60) ?? [];

  return (
    <ReceivablesShell title="미납대장" description="호실별 미납 잔액 + 30/60/90+ 에이징. 월말 스냅샷도 1버튼."
      action={
        <div className="flex items-center gap-2">
          <Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} className="w-40" data-testid="in-asof" />
          <Button onClick={snapshot} disabled={busy} data-testid="btn-snapshot">
            <Camera className="w-4 h-4 mr-1" />스냅샷 캡처
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <StatCard title="총 미납" value={krw(data?.total ?? 0)} hint={`${data?.rows.length ?? 0} 호실`} tone="danger" />
        <StatCard title={BUCKET_LABEL.d0_30} value={krw(data?.aging.d0_30 ?? 0)} />
        <StatCard title={BUCKET_LABEL.d31_60} value={krw(data?.aging.d31_60 ?? 0)} tone="warn" />
        <StatCard title={BUCKET_LABEL.d61_90} value={krw(data?.aging.d61_90 ?? 0)} tone="warn" />
        <StatCard title={BUCKET_LABEL.d91_plus} value={krw(data?.aging.d91_plus ?? 0)} tone="danger" />
      </div>

      {aiPriority.length > 0 && (
        <Card className="mb-4 border-rose-200 bg-rose-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-rose-700">
              <Sparkles className="w-4 h-4" />AI 우선 호실 — 60일 초과 {aiPriority.length}건
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <div className="flex flex-wrap gap-2">
              {aiPriority.slice(0, 12).map(b => (
                <Badge key={b.id} variant="outline" className="bg-white text-rose-700 border-rose-300">
                  {b.unitNumber}호 · {b.overdueDays}일 · {krw(b.remaining)}
                </Badge>
              ))}
              {aiPriority.length > 12 && <span className="text-xs text-muted-foreground">+{aiPriority.length - 12}건</span>}
            </div>
            <div className="mt-3 flex gap-2">
              <Link href="/receivables/dunning"><Button size="sm" variant="default"><Send className="w-3.5 h-3.5 mr-1" />2차 독촉장 일괄 발송</Button></Link>
              <Link href="/receivables/overdue-notices"><Button size="sm" variant="outline">미납 고지서 출력</Button></Link>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Wallet className="w-4 h-4" />호실별 미납 ({data?.rows.length ?? 0})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {(data?.rows.length ?? 0) === 0 ? <Empty message="미납 호실이 없습니다." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-3 py-2">호실</th>
                    <th className="px-3 py-2">부과월</th>
                    <th className="px-3 py-2">납기</th>
                    <th className="px-3 py-2 text-right">총 부과</th>
                    <th className="px-3 py-2 text-right">납입</th>
                    <th className="px-3 py-2 text-right">잔액</th>
                    <th className="px-3 py-2 text-right">연체</th>
                    <th className="px-3 py-2">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {data!.rows.map(b => (
                    <tr key={b.id} className="border-t" data-testid={`row-overdue-${b.id}`}>
                      <td className="px-3 py-2 font-medium">{b.unitNumber}</td>
                      <td className="px-3 py-2">{b.billingMonth}</td>
                      <td className="px-3 py-2">{b.dueDate}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{krw(b.totalAmount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{krw(b.paidAmount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-rose-600">{krw(b.remaining)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{b.overdueDays}일</td>
                      <td className="px-3 py-2"><Badge className={STATUS_BADGE[b.status] ?? ""}>{b.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </ReceivablesShell>
  );
}
