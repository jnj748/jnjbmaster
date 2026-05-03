// [Task #800] /receivables/payments — 수납 처리 + 영수증 발행.
//
// 좌측 미납 호실 → 클릭 시 수납 입력 → /bills/:id/payments 호출 후 자동으로
// 우측에 최근 수납 + "영수증 발행" 버튼 제공.
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ReceivablesShell, useApi, krw, Empty, StatCard, STATUS_BADGE,
  type Bill, type Payment } from "./_shared";
import { Banknote, Receipt as ReceiptIcon } from "lucide-react";

type Resp = { unpaid: Bill[]; recent: Payment[] };

export default function ReceivablesPaymentsPage() {
  const api = useApi();
  const { toast } = useToast();
  const [data, setData] = useState<Resp | null>(null);
  const [paying, setPaying] = useState<{ bill: Bill; amount: number; channel: "transfer" | "card" | "cash" | "virtual_account"; memo: string } | null>(null);
  const [receipt, setReceipt] = useState<{ payment: Payment; channel: "print" | "sms" | "kakao" | "email"; recipient: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => setData(await api<Resp>("GET", "/receivables/payments"));
  useEffect(() => { void load(); }, []);

  const totalUnpaid = useMemo(() => data?.unpaid.reduce((s, b) => s + b.remaining, 0) ?? 0, [data]);
  const todayPaid = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return data?.recent.filter(p => p.paidAt.slice(0, 10) === today).reduce((s, p) => s + p.amount, 0) ?? 0;
  }, [data]);

  const submitPayment = async () => {
    if (!paying) return;
    if (paying.amount <= 0) { toast({ title: "수납 금액을 입력하세요" }); return; }
    setBusy(true);
    try {
      await api("POST", `/bills/${paying.bill.id}/payments`, {
        amount: paying.amount, channel: paying.channel, memo: paying.memo || undefined,
      });
      toast({ title: `${paying.bill.unitNumber}호 ${krw(paying.amount)} 수납 완료` });
      setPaying(null);
      await load();
    } catch (e) { toast({ title: "수납 실패", description: String(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const submitReceipt = async () => {
    if (!receipt) return;
    setBusy(true);
    try {
      const r = await api<{ receiptNo: string }>("POST", "/receivables/receipts", {
        paymentId: receipt.payment.id, channel: receipt.channel, recipient: receipt.recipient || undefined,
      });
      toast({ title: `영수증 ${r.receiptNo} 발행` });
      setReceipt(null);
    } catch (e) { toast({ title: "발행 실패", description: String(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  return (
    <ReceivablesShell title="수납 처리" description="미납 호실 클릭 → 즉시 수납 입력. 수납 완료 후 영수증 1버튼 발행.">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <StatCard title="미납 호실" value={`${data?.unpaid.length ?? 0}`} />
        <StatCard title="총 미납" value={krw(totalUnpaid)} tone="danger" />
        <StatCard title="오늘 수납" value={krw(todayPaid)} tone="ok" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Banknote className="w-4 h-4" />미납 호실 ({data?.unpaid.length ?? 0})</CardTitle></CardHeader>
          <CardContent className="p-0 max-h-[600px] overflow-auto">
            {(data?.unpaid.length ?? 0) === 0 ? <Empty message="미납 호실이 없습니다." /> : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="px-3 py-2">호실</th>
                    <th className="px-3 py-2">월</th>
                    <th className="px-3 py-2 text-right">잔액</th>
                    <th className="px-3 py-2 text-right">연체</th>
                    <th className="px-3 py-2 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {data!.unpaid.map(b => (
                    <tr key={b.id} className="border-t hover:bg-muted/30 cursor-pointer" data-testid={`row-pay-${b.id}`}
                      onClick={() => setPaying({ bill: b, amount: b.remaining, channel: "transfer", memo: "" })}
                    >
                      <td className="px-3 py-2 font-medium">{b.unitNumber}</td>
                      <td className="px-3 py-2">{b.billingMonth}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-rose-600">{krw(b.remaining)}</td>
                      <td className="px-3 py-2 text-right">{b.overdueDays}일</td>
                      <td className="px-3 py-2 text-right"><Button size="sm" variant="outline">수납</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><ReceiptIcon className="w-4 h-4" />최근 수납 ({data?.recent.length ?? 0})</CardTitle></CardHeader>
          <CardContent className="p-0 max-h-[600px] overflow-auto">
            {(data?.recent.length ?? 0) === 0 ? <Empty message="최근 수납이 없습니다." /> : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr className="text-left">
                    <th className="px-3 py-2">시각</th>
                    <th className="px-3 py-2">채널</th>
                    <th className="px-3 py-2 text-right">금액</th>
                    <th className="px-3 py-2"></th>
                    <th className="px-3 py-2 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {data!.recent.map(p => (
                    <tr key={p.id} className="border-t" data-testid={`row-recent-${p.id}`}>
                      <td className="px-3 py-2 text-xs">{p.paidAt.slice(0, 16).replace("T", " ")}</td>
                      <td className="px-3 py-2">{p.channel}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{krw(p.amount)}</td>
                      <td className="px-3 py-2">{p.isPartial && <Badge variant="outline" className="text-xs">부분</Badge>}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => setReceipt({ payment: p, channel: "print", recipient: "" })}>영수증</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 수납 입력 시트 */}
      <Sheet open={!!paying} onOpenChange={(o) => !o && setPaying(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{paying?.bill.unitNumber}호 — {paying?.bill.billingMonth} 수납</SheetTitle></SheetHeader>
          {paying && (
            <div className="space-y-3 mt-4">
              <div className="bg-muted/50 p-3 rounded text-xs space-y-1">
                <div>총 부과: <strong className="tabular-nums">{krw(paying.bill.totalAmount)}</strong></div>
                <div>기납입: <strong className="tabular-nums">{krw(paying.bill.paidAmount)}</strong></div>
                <div>미납: <strong className="tabular-nums text-rose-600">{krw(paying.bill.remaining)}</strong></div>
              </div>
              <div>
                <Label className="text-xs">수납 금액</Label>
                <Input type="number" value={paying.amount} onChange={(e) => setPaying({ ...paying, amount: Number(e.target.value) || 0 })} data-testid="in-amount" />
              </div>
              <div>
                <Label className="text-xs">채널</Label>
                <Select value={paying.channel} onValueChange={(v) => setPaying({ ...paying, channel: v as typeof paying.channel })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transfer">계좌이체</SelectItem>
                    <SelectItem value="virtual_account">가상계좌</SelectItem>
                    <SelectItem value="card">카드</SelectItem>
                    <SelectItem value="cash">현금</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">메모</Label>
                <Input value={paying.memo} onChange={(e) => setPaying({ ...paying, memo: e.target.value })} />
              </div>
              <Button onClick={submitPayment} disabled={busy} className="w-full" data-testid="btn-submit-pay">수납 기록</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* 영수증 발행 시트 */}
      <Sheet open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>영수증 발행</SheetTitle></SheetHeader>
          {receipt && (
            <div className="space-y-3 mt-4">
              <div className="bg-muted/50 p-3 rounded text-xs">수납 ID #{receipt.payment.id} · {krw(receipt.payment.amount)}</div>
              <div>
                <Label className="text-xs">발행 채널</Label>
                <Select value={receipt.channel} onValueChange={(v) => setReceipt({ ...receipt, channel: v as typeof receipt.channel })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="print">프린트(PDF)</SelectItem>
                    <SelectItem value="sms">문자</SelectItem>
                    <SelectItem value="kakao">카카오</SelectItem>
                    <SelectItem value="email">이메일</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">수신자(이메일/번호 등)</Label>
                <Input value={receipt.recipient} onChange={(e) => setReceipt({ ...receipt, recipient: e.target.value })} />
              </div>
              <Button onClick={submitReceipt} disabled={busy} className="w-full" data-testid="btn-submit-receipt">발행</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </ReceivablesShell>
  );
}
