// [Task #799] /billing/notices — 고지서 발행 (확정된 부과 → /bills/generate).
//
// 1) 월 + 확정 run 선택 + 마감일 → 발행.
// 2) 발행된 고지서 목록 + 행 클릭 → 미니뷰.
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { BillingShell, useApi, krw, currentMonth, StatCard, Empty } from "./_shared";
import { Send, Loader2, FileText, Download } from "lucide-react";

interface BillingRun { id: number; billingMonth: string; status: string; totalAmount: number; unitCount: number; }
interface Bill {
  id: number; unitNumber: string; billingMonth: string; totalAmount: number;
  paidAmount: number; dueDate: string; status: string; publicToken: string;
  virtualAccount: { bank: string; account: string; holder: string } | null;
}
interface BillItem { id: number; category: string; label: string; amount: number; }

export default function NoticesPage() {
  const api = useApi();
  const { toast } = useToast();
  const [runs, setRuns] = useState<BillingRun[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [month, setMonth] = useState(currentMonth());
  const [runId, setRunId] = useState("");
  const [dueDay, setDueDay] = useState("25");
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<{ bill: Bill; items: BillItem[] } | null>(null);
  // 고지 포맷 / 발송 채널 — 부과월 카드(billing_months)와 연동.
  const [noticeFormat, setNoticeFormat] = useState<"integrated" | "a4_separate">("integrated");
  const [channel, setChannel] = useState<"email" | "sms" | "kakao" | "post">("email");

  const reload = async () => {
    const rs = await api<BillingRun[]>("GET", "/billing/runs");
    setRuns(rs);
    const f = rs.find(r => r.billingMonth === month && r.status === "finalized") ?? rs.find(r => r.status === "finalized");
    if (f) setRunId(String(f.id));
    setBills(await api<Bill[]>("GET", `/bills?month=${month}`));
  };
  useEffect(() => { void reload(); }, [month]);

  const finalized = useMemo(() => runs.filter(r => r.status === "finalized"), [runs]);

  const generate = async () => {
    if (!runId) { toast({ title: "확정된 부과실행을 선택하세요", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const r = await api<{ created: number; skipped: number }>("POST", "/bills/generate", { runId: Number(runId), dueDay: Number(dueDay) });
      toast({ title: "발행 완료", description: `신규 ${r.created} / 기존 ${r.skipped}` });
      await reload();
    } catch (e) { toast({ title: "발행 실패", description: String(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const open = async (b: Bill) => {
    // /bills/:id 가 { bill, items, payments, delinquency } 를 반환. items 만 떼어 사용.
    const detail = await api<{ items: BillItem[] }>("GET", `/bills/${b.id}`).catch(() => ({ items: [] }));
    setSel({ bill: b, items: detail.items ?? [] });
  };

  const totalIssued = bills.reduce((s, b) => s + Number(b.totalAmount || 0), 0);

  // 부과월 카드의 noticeFormat 갱신.
  const updateFormat = async (fmt: "integrated" | "a4_separate") => {
    setNoticeFormat(fmt);
    try {
      const months = await api<Array<{ id: number; billingMonth: string }>>("GET", "/billing-months");
      const m = months.find(x => x.billingMonth === month);
      if (m) await api("PATCH", `/billing-months/${m.id}`, { billingMonth: month, noticeFormat: fmt });
    } catch {/* 부과월 카드 미생성 — 무시 */}
  };

  // 발송 채널로 일괄 발송 큐잉.
  const dispatchChannel = async () => {
    if (bills.length === 0) { toast({ title: "발행된 고지서가 없습니다", variant: "destructive" }); return; }
    if (!confirm(`${bills.length}건을 ${channel.toUpperCase()} 채널로 발송 큐에 등록합니다.`)) return;
    setBusy(true);
    try {
      const r = await api<{ created: number }>("POST", "/billing-notice-deliveries/bulk-dispatch", { month, channel });
      toast({ title: "발송 큐 등록", description: `${r.created}건` });
    } catch (e) { toast({ title: "발송 실패", description: String(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  // 일괄 PDF 다운로드 — 새 탭에서 공개 링크 페이지를 모아 출력 (window.print 안내).
  // (실제 PDF 묶음 zip 은 인쇄 인프라 T11 단계에서 처리 — 여기서는 링크 시트 제공.)
  const downloadBatch = () => {
    if (bills.length === 0) { toast({ title: "발행된 고지서가 없습니다", variant: "destructive" }); return; }
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${month} 고지서 일괄</title>
      <style>body{font-family:system-ui;padding:24px}h2{margin:0 0 12px}table{width:100%;border-collapse:collapse}td,th{border:1px solid #ddd;padding:6px 10px;font-size:13px}a{color:#0a58ca}</style>
    </head><body>
    <h2>${month} 발행 고지서 (${bills.length}건)</h2>
    <p>각 호실의 공개 링크를 클릭해 PDF 인쇄(Ctrl+P) 하세요. 묶음 PDF 는 인쇄 인프라 단계에서 자동화됩니다.</p>
    <table><thead><tr><th>호실</th><th>금액</th><th>마감일</th><th>공개 링크</th></tr></thead><tbody>
    ${bills.map(b => `<tr><td>${b.unitNumber}</td><td style="text-align:right">${krw(b.totalAmount)}</td><td>${b.dueDate ?? ""}</td><td><a href="/public/bills/${b.publicToken}" target="_blank">${b.publicToken.slice(0, 8)}…</a></td></tr>`).join("")}
    </tbody></table></body></html>`;
    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <BillingShell title="고지서 발행" description="확정된 부과 산출에서 호실별 PDF 고지서를 일괄 생성">
      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">발행 입력</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div><Label className="text-xs">월</Label><Input value={month} onChange={(e) => setMonth(e.target.value)} /></div>
          <div><Label className="text-xs">부과 실행</Label>
            <Select value={runId} onValueChange={setRunId}>
              <SelectTrigger data-testid="sel-run"><SelectValue placeholder="확정된 Run 선택" /></SelectTrigger>
              <SelectContent>{finalized.map(r => <SelectItem key={r.id} value={String(r.id)}>#{r.id} · {r.billingMonth} · {krw(r.totalAmount)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">납부 마감일 (일)</Label><Input type="number" value={dueDay} onChange={(e) => setDueDay(e.target.value)} /></div>
          <div className="flex items-end"><Button onClick={generate} disabled={busy} className="w-full" data-testid="btn-generate">
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}고지서 발행
          </Button></div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">고지 포맷 / 발송 채널</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div><Label className="text-xs">고지서 포맷</Label>
            <Select value={noticeFormat} onValueChange={(v) => updateFormat(v as "integrated" | "a4_separate")}>
              <SelectTrigger data-testid="sel-format"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="integrated">통합 1매 (관리비+검침)</SelectItem>
                <SelectItem value="a4_separate">분리 (관리비/검침 각 1매)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label className="text-xs">발송 채널</Label>
            <Select value={channel} onValueChange={(v) => setChannel(v as "email" | "sms" | "kakao" | "post")}>
              <SelectTrigger data-testid="sel-channel"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">이메일</SelectItem>
                <SelectItem value="sms">SMS</SelectItem>
                <SelectItem value="kakao">카카오 알림톡</SelectItem>
                <SelectItem value="post">우편</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end"><Button variant="outline" onClick={dispatchChannel} disabled={busy || bills.length === 0} className="w-full" data-testid="btn-dispatch">
            <Send className="w-4 h-4 mr-1" />채널 일괄 발송
          </Button></div>
          <div className="flex items-end"><Button variant="outline" onClick={downloadBatch} disabled={bills.length === 0} className="w-full" data-testid="btn-batch-pdf">
            <Download className="w-4 h-4 mr-1" />PDF 일괄 인쇄
          </Button></div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <StatCard title="발행 건수" value={`${bills.length}`} />
        <StatCard title="총 발행 금액" value={krw(totalIssued)} />
        <StatCard title="대상 월" value={month} />
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4" />발행된 고지서</CardTitle></CardHeader>
        <CardContent className="p-0">
          {bills.length === 0 ? <Empty message="발행된 고지서가 없습니다." /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>호실</TableHead><TableHead className="text-right">금액</TableHead>
                <TableHead className="text-right">수납</TableHead><TableHead>마감일</TableHead>
                <TableHead>상태</TableHead><TableHead>가상계좌</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {bills.map(b => (
                  <TableRow key={b.id} className="cursor-pointer hover:bg-muted/50" onClick={() => open(b)}>
                    <TableCell className="font-mono">{b.unitNumber}</TableCell>
                    <TableCell className="text-right tabular-nums">{krw(b.totalAmount)}</TableCell>
                    <TableCell className="text-right tabular-nums">{krw(b.paidAmount)}</TableCell>
                    <TableCell className="text-xs">{b.dueDate}</TableCell>
                    <TableCell><Badge variant="outline">{b.status}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {b.virtualAccount ? `${b.virtualAccount.bank} ${b.virtualAccount.account}` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>고지서 #{sel?.bill.id} · {sel?.bill.unitNumber}</SheetTitle></SheetHeader>
          {sel && (
            <div className="space-y-3 mt-4 text-sm">
              <div>월 {sel.bill.billingMonth}</div>
              <div>총액 <b>{krw(sel.bill.totalAmount)}</b> / 수납 {krw(sel.bill.paidAmount)}</div>
              <div>마감일 {sel.bill.dueDate}</div>
              <div>공개 링크 <code className="text-xs">/public/bills/{sel.bill.publicToken}</code></div>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">항목 명세</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-xs">
                  {sel.items.map(it => (
                    <div key={it.id} className="flex justify-between"><span>{it.label}</span><span className="tabular-nums">{krw(it.amount)}</span></div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </BillingShell>
  );
}
