// [Task #799] /billing/notice-delivery — 발송 결과 / 재시도.
//
// 월 + 채널 선택 → 일괄 발송 큐 등록. 결과 행 목록(상태/시간/오류) + 재시도 버튼.
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { BillingShell, useApi, currentMonth, StatCard, Empty, type NoticeDelivery } from "./_shared";
import { Send, RotateCcw } from "lucide-react";

const CHANNEL_LABEL: Record<string, string> = { email: "이메일", sms: "SMS", kakao: "카카오", post: "우편" };
const STATUS_COLOR: Record<string, string> = {
  queued: "bg-slate-100 text-slate-700", sent: "bg-blue-100 text-blue-700",
  delivered: "bg-emerald-100 text-emerald-700", read: "bg-violet-100 text-violet-700",
  failed: "bg-red-100 text-red-700",
};

export default function NoticeDeliveryPage() {
  const api = useApi();
  const { toast } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [channel, setChannel] = useState("email");
  const [rows, setRows] = useState<NoticeDelivery[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => setRows(await api<NoticeDelivery[]>("GET", `/billing-notice-deliveries?month=${month}`));
  useEffect(() => { void load(); }, [month]);

  const dispatch = async () => {
    if (!confirm(`${month} ${CHANNEL_LABEL[channel]} 발송을 큐잉합니다.`)) return;
    setBusy(true);
    try {
      const r = await api<{ created: number }>("POST", "/billing-notice-deliveries/bulk-dispatch", { month, channel });
      toast({ title: `${r.created}건 발송 큐 등록` });
      await load();
    } catch (e) { toast({ title: "발송 실패", description: String(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const retry = async (id: number) => {
    await api("POST", `/billing-notice-deliveries/${id}/retry`);
    toast({ title: "재시도 완료" });
    await load();
  };

  const stats = useMemo(() => {
    const s = { queued: 0, sent: 0, delivered: 0, read: 0, failed: 0 };
    for (const r of rows) s[r.status] = (s[r.status] ?? 0) + 1;
    return s;
  }, [rows]);

  return (
    <BillingShell title="발송 확인" description="이메일/SMS/카카오/우편 채널별 발송 결과 추적 + 실패 재시도"
      action={
        <div className="flex gap-2 items-end">
          <div><Label className="text-xs">월</Label><Input value={month} onChange={(e) => setMonth(e.target.value)} className="w-32" /></div>
          <div><Label className="text-xs">채널</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CHANNEL_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={dispatch} disabled={busy} data-testid="btn-bulk-dispatch"><Send className="w-4 h-4 mr-1" />일괄 발송</Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <StatCard title="큐잉" value={`${stats.queued}`} />
        <StatCard title="발송됨" value={`${stats.sent}`} />
        <StatCard title="도착" value={`${stats.delivered}`} />
        <StatCard title="열람" value={`${stats.read}`} />
        <StatCard title="실패" value={`${stats.failed}`} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">발송 로그 (최근 500)</CardTitle></CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? <Empty message="발송 기록이 없습니다. 위 폼으로 일괄 발송하세요." /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>호실</TableHead><TableHead>채널</TableHead><TableHead>수신처</TableHead>
                <TableHead>상태</TableHead><TableHead>발송시각</TableHead>
                <TableHead>오류</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono">{r.unitNumber ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{CHANNEL_LABEL[r.channel] ?? r.channel}</Badge></TableCell>
                    <TableCell className="text-xs">{r.recipient ?? "—"}</TableCell>
                    <TableCell><Badge className={STATUS_COLOR[r.status]}>{r.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.sentAt ? new Date(r.sentAt).toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-xs text-red-600">{r.errorMessage ?? "—"}</TableCell>
                    <TableCell>
                      {r.status === "failed" && (
                        <Button size="sm" variant="ghost" onClick={() => retry(r.id)}><RotateCcw className="w-3 h-3 mr-1" />재시도</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </BillingShell>
  );
}
