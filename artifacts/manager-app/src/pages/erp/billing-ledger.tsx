// [Task #779] T8 고지·수납엔진 v01 — 고지서/수납/미수/연체 통합 화면.
//
// 탭 구조:
//   1) 고지서: 월 + 부과실행 선택 → 발행. 호실 카드 목록.
//   2) 수납: 단건 수납 기록(부분/전액). 영수증 미니뷰.
//   3) 통장매칭: JSON 행 페이스트 → import → 자동매칭.
//   4) 미수금: 30/60/90+ 에이징.
//   5) 연체: 단계 변경 + 안내 발송.

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Receipt, CreditCard, Banknote, AlertTriangle, Send } from "lucide-react";

const krw = (n: number) => `₩${Math.round(n).toLocaleString()}`;

interface BillingRun { id: number; billingMonth: string; status: string; totalAmount: number; unitCount: number; }
interface Bill {
  id: number; unitNumber: string; billingMonth: string; totalAmount: number;
  paidAmount: number; dueDate: string; status: string; publicToken: string;
  virtualAccount: { bank: string; account: string; holder: string } | null;
}
interface BillItem { id: number; category: string; label: string; amount: number; }
interface BillPayment { id: number; amount: number; channel: string; paidAt: string; isPartial: boolean; reversedAt: string | null; memo: string | null; }
interface BankTx { id: number; txDate: string; amount: number; counterpart: string | null; memo: string | null; matchStatus: string; matchedBillId: number | null; }
interface Aging { d0_30: number; d31_60: number; d61_90: number; d91_plus: number; }
interface ArrearsResp { rows: Array<Bill & { remaining: number; overdueDays: number }>; aging: Aging; total: number; }

async function api(method: string, url: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`/api${url}`, {
    method, credentials: "include",
    headers: body ? { "content-type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`);
  return res.json();
}

export default function BillingLedgerPage() {
  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Receipt className="w-6 h-6" />고지·수납</h1>
        <p className="text-muted-foreground text-sm">부과 확정 → 고지서 발행 → 수납·통장매칭 → 미수·연체관리</p>
      </div>
      <Tabs defaultValue="bills">
        <TabsList className="mb-4 flex-wrap h-auto">
          <TabsTrigger value="bills">고지서</TabsTrigger>
          <TabsTrigger value="bank">통장 매칭</TabsTrigger>
          <TabsTrigger value="arrears">미수금</TabsTrigger>
          <TabsTrigger value="dunning">연체관리</TabsTrigger>
        </TabsList>
        <TabsContent value="bills"><BillsTab /></TabsContent>
        <TabsContent value="bank"><BankTxTab /></TabsContent>
        <TabsContent value="arrears"><ArrearsTab /></TabsContent>
        <TabsContent value="dunning"><DunningTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ── 1. 고지서 발행 + 목록 ─────────────────────────────────────
function BillsTab() {
  const { toast } = useToast();
  const [runs, setRuns] = useState<BillingRun[]>([]);
  const [runId, setRunId] = useState<string>("");
  const [dueDay, setDueDay] = useState<string>("25");
  const [bills, setBills] = useState<Bill[]>([]);
  const [month, setMonth] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [selBill, setSelBill] = useState<{ bill: Bill; items: BillItem[]; payments: BillPayment[] } | null>(null);

  const reload = async () => {
    const data = await api("GET", "/billing/runs") as BillingRun[];
    setRuns(data);
    const finalized = data.find(r => r.status === "finalized");
    if (finalized) setRunId(String(finalized.id));
    const u = month ? `/bills?month=${month}` : "/bills";
    setBills(await api("GET", u) as Bill[]);
  };
  useEffect(() => { void reload(); }, [month]);

  const generate = async () => {
    if (!runId) { toast({ title: "확정된 부과실행을 선택하세요", variant: "destructive" }); return; }
    setBusy(true);
    try {
      const r = await api("POST", "/bills/generate", { runId: Number(runId), dueDay: Number(dueDay) }) as { created: number; skipped: number };
      toast({ title: "고지서 발행 완료", description: `신규 ${r.created}건 / 기존 ${r.skipped}건` });
      await reload();
    } catch (e) {
      toast({ title: "발행 실패", description: String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const openBill = async (id: number) => {
    const detail = await api("GET", `/bills/${id}`) as { bill: Bill; items: BillItem[]; payments: BillPayment[] };
    setSelBill(detail);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>고지서 발행</CardTitle>
          <CardDescription>확정된 부과실행 한 건을 선택하면 호실별 고지서가 발행됩니다(이미 있으면 스킵).</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>부과실행</Label>
            <Select value={runId} onValueChange={setRunId}>
              <SelectTrigger><SelectValue placeholder="확정된 실행 선택" /></SelectTrigger>
              <SelectContent>
                {runs.filter(r => r.status === "finalized").map(r =>
                  <SelectItem key={r.id} value={String(r.id)}>{r.billingMonth} ({r.unitCount}호 · {krw(r.totalAmount)})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>납기일(다음 달)</Label>
            <Input type="number" min={1} max={31} value={dueDay} onChange={e => setDueDay(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={generate} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Receipt className="w-4 h-4 mr-1.5" />}발행
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div><CardTitle>고지서 목록</CardTitle><CardDescription>{bills.length}건</CardDescription></div>
          <Input className="max-w-[160px]" type="month" value={month} onChange={e => setMonth(e.target.value)} placeholder="월 필터" />
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>월</TableHead><TableHead>호실</TableHead><TableHead>납기</TableHead>
              <TableHead className="text-right">청구</TableHead><TableHead className="text-right">수납</TableHead>
              <TableHead>상태</TableHead><TableHead>가상계좌</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {bills.map(b => (
                <TableRow key={b.id}>
                  <TableCell>{b.billingMonth}</TableCell>
                  <TableCell className="font-medium">{b.unitNumber}호</TableCell>
                  <TableCell className="text-sm">{b.dueDate}</TableCell>
                  <TableCell className="text-right">{krw(b.totalAmount)}</TableCell>
                  <TableCell className="text-right">{krw(b.paidAmount)}</TableCell>
                  <TableCell><StatusBadge status={b.status} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{b.virtualAccount?.account ?? "—"}</TableCell>
                  <TableCell><Button size="sm" variant="outline" onClick={() => openBill(b.id)}>상세</Button></TableCell>
                </TableRow>
              ))}
              {bills.length === 0 && <TableRow><TableCell colSpan={8} className="text-center py-6 text-muted-foreground">고지서 없음</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {selBill && <BillDetailCard data={selBill} onClose={() => setSelBill(null)} onChanged={reload} />}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    issued: { label: "발행", cls: "" },
    partial: { label: "부분수납", cls: "bg-amber-100 text-amber-800" },
    paid: { label: "완납", cls: "bg-green-100 text-green-800" },
    overdue: { label: "연체", cls: "bg-red-100 text-red-800" },
    closed: { label: "마감", cls: "bg-slate-200 text-slate-700" },
    void: { label: "무효", cls: "bg-slate-100 text-slate-500 line-through" },
  };
  const v = map[status] ?? { label: status, cls: "" };
  return <Badge variant="outline" className={v.cls}>{v.label}</Badge>;
}

function BillDetailCard({ data, onClose, onChanged }: {
  data: { bill: Bill; items: BillItem[]; payments: BillPayment[] };
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { bill, items, payments } = data;
  const remaining = Math.max(0, bill.totalAmount - bill.paidAmount);
  const [amount, setAmount] = useState<string>(String(remaining));
  const [channel, setChannel] = useState<string>("transfer");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const record = async () => {
    if (!amount || Number(amount) <= 0) return;
    setBusy(true);
    try {
      await api("POST", `/bills/${bill.id}/payments`, { amount: Number(amount), channel, memo: memo || undefined });
      toast({ title: "수납 기록 완료" });
      await onChanged();
      onClose();
    } catch (e) {
      toast({ title: "실패", description: String(e), variant: "destructive" });
    } finally { setBusy(false); }
  };

  const reverse = async (pid: number) => {
    const reason = window.prompt("취소 사유");
    if (!reason) return;
    try {
      await api("POST", `/bills/${bill.id}/payments/${pid}/reverse`, { reason });
      toast({ title: "수납 취소 완료" });
      await onChanged(); onClose();
    } catch (e) { toast({ title: "실패", description: String(e), variant: "destructive" }); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>{bill.billingMonth} {bill.unitNumber}호 — {krw(bill.totalAmount)}</CardTitle>
          <CardDescription>납기 {bill.dueDate} · 가상계좌 {bill.virtualAccount?.account ?? "—"}</CardDescription>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>닫기</Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium mb-2">항목</h4>
            <Table>
              <TableBody>
                {items.map(it => (
                  <TableRow key={it.id}>
                    <TableCell>{it.label}</TableCell>
                    <TableCell><Badge variant="outline">{it.category}</Badge></TableCell>
                    <TableCell className="text-right">{krw(it.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div>
            <h4 className="font-medium mb-2">수납 이력</h4>
            <Table>
              <TableBody>
                {payments.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-3">없음</TableCell></TableRow>}
                {payments.map(p => (
                  <TableRow key={p.id} className={p.reversedAt ? "opacity-50 line-through" : ""}>
                    <TableCell className="text-xs">{new Date(p.paidAt).toLocaleDateString("ko-KR")}</TableCell>
                    <TableCell><Badge variant="outline">{p.channel}</Badge></TableCell>
                    <TableCell className="text-right">{krw(p.amount)}</TableCell>
                    <TableCell>
                      {!p.reversedAt && <Button size="sm" variant="ghost" onClick={() => reverse(p.id)}>취소</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        {remaining > 0 && bill.status !== "void" && bill.status !== "closed" && (
          <div className="border-t pt-4">
            <h4 className="font-medium mb-2">수납 기록 (잔액 {krw(remaining)})</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div><Label>금액</Label><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
              <div><Label>경로</Label>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="transfer">계좌이체</SelectItem>
                    <SelectItem value="virtual_account">가상계좌</SelectItem>
                    <SelectItem value="card">카드</SelectItem>
                    <SelectItem value="cash">현금</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2"><Label>메모</Label><Input value={memo} onChange={e => setMemo(e.target.value)} /></div>
            </div>
            <Button className="mt-3" onClick={record} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <CreditCard className="w-4 h-4 mr-1.5" />}수납 기록
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── 2. 통장 매칭 ─────────────────────────────────────────────
function BankTxTab() {
  const { toast } = useToast();
  const [rows, setRows] = useState<BankTx[]>([]);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async () => setRows(await api("GET", "/bank-tx") as BankTx[]);
  useEffect(() => { void reload(); }, []);

  const importTx = async () => {
    setBusy(true);
    try {
      const lines = paste.split("\n").map(s => s.trim()).filter(Boolean);
      const parsed = lines.map(l => {
        const [date, amount, counterpart, memo, vak] = l.split(",").map(s => s.trim());
        return { txDate: date, amount: Number(amount), counterpart, memo, virtualAccountKey: vak || undefined };
      }).filter(r => r.txDate && Number.isFinite(r.amount));
      if (parsed.length === 0) { toast({ title: "유효한 행이 없습니다", variant: "destructive" }); return; }
      const r = await api("POST", "/bank-tx/import", { rows: parsed }) as { count: number };
      toast({ title: `${r.count}건 적재` });
      setPaste(""); await reload();
    } catch (e) { toast({ title: "실패", description: String(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const autoMatch = async () => {
    const r = await api("POST", "/bank-tx/auto-match", {}) as { scanned: number; matched: number };
    toast({ title: "자동 매칭", description: `대상 ${r.scanned} · 매칭 ${r.matched}` });
    await reload();
  };

  const suspend = async (id: number) => {
    await api("POST", `/bank-tx/${id}/suspense`, {});
    toast({ title: "가수금 처리" });
    await reload();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>통장 내역 업로드</CardTitle>
          <CardDescription>한 줄에 하나, 형식: <code>YYYY-MM-DD,금액,입금자,적요,가상계좌(선택)</code></CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Textarea rows={5} placeholder="2026-05-01,250000,홍길동,101호 5월,301-001-0001-202605" value={paste} onChange={e => setPaste(e.target.value)} />
          <div className="flex gap-2">
            <Button onClick={importTx} disabled={busy}><Banknote className="w-4 h-4 mr-1.5" />업로드</Button>
            <Button variant="outline" onClick={autoMatch}>자동 매칭 실행</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>매칭 큐</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>일자</TableHead><TableHead className="text-right">금액</TableHead>
              <TableHead>입금자</TableHead><TableHead>적요</TableHead><TableHead>상태</TableHead><TableHead></TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {rows.map(t => (
                <TableRow key={t.id}>
                  <TableCell>{t.txDate}</TableCell>
                  <TableCell className="text-right">{krw(t.amount)}</TableCell>
                  <TableCell>{t.counterpart ?? "—"}</TableCell>
                  <TableCell className="text-sm">{t.memo ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline">{t.matchStatus}</Badge></TableCell>
                  <TableCell>
                    {t.matchStatus === "unmatched" && <Button size="sm" variant="ghost" onClick={() => suspend(t.id)}>가수금</Button>}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && <TableRow><TableCell colSpan={6} className="text-center py-4 text-muted-foreground">업로드된 내역이 없습니다</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ── 3. 미수금 ────────────────────────────────────────────────
function ArrearsTab() {
  const [data, setData] = useState<ArrearsResp | null>(null);
  useEffect(() => { void api("GET", "/bills/arrears").then(d => setData(d as ArrearsResp)); }, []);
  if (!data) return <div className="text-muted-foreground">불러오는 중…</div>;
  const a = data.aging;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <AgingCard label="0~30일" value={a.d0_30} />
        <AgingCard label="31~60일" value={a.d31_60} tone="amber" />
        <AgingCard label="61~90일" value={a.d61_90} tone="red" />
        <AgingCard label="91일+" value={a.d91_plus} tone="red" />
      </div>
      <Card>
        <CardHeader><CardTitle>미수 호실 ({data.rows.length}건 · 총 {krw(data.total)})</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>월</TableHead><TableHead>호실</TableHead><TableHead>납기</TableHead>
              <TableHead className="text-right">청구</TableHead><TableHead className="text-right">미수</TableHead>
              <TableHead className="text-right">연체일</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.rows.map(b => (
                <TableRow key={b.id}>
                  <TableCell>{b.billingMonth}</TableCell>
                  <TableCell className="font-medium">{b.unitNumber}호</TableCell>
                  <TableCell className="text-sm">{b.dueDate}</TableCell>
                  <TableCell className="text-right">{krw(b.totalAmount)}</TableCell>
                  <TableCell className="text-right font-semibold text-red-600">{krw(b.remaining)}</TableCell>
                  <TableCell className="text-right">{b.overdueDays}일</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function AgingCard({ label, value, tone }: { label: string; value: number; tone?: "amber" | "red" }) {
  const cls = tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "";
  return (
    <Card><CardContent className="pt-5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${cls}`}>{krw(value)}</div>
    </CardContent></Card>
  );
}

// ── 4. 연체관리 ──────────────────────────────────────────────
function DunningTab() {
  const { toast } = useToast();
  const [rows, setRows] = useState<Array<Bill & { remaining: number; overdueDays: number }>>([]);
  const reload = async () => {
    const d = await api("GET", "/bills/arrears") as ArrearsResp;
    setRows(d.rows.filter(r => r.overdueDays > 0));
  };
  useEffect(() => { void reload(); }, []);

  const setStage = async (billId: number, stage: number, dispatch: boolean) => {
    try {
      await api("POST", `/bills/${billId}/delinquency-stage`, { stage, dispatch, channel: "sms" });
      toast({ title: dispatch ? "안내 발송" : "단계 변경 완료" });
      await reload();
    } catch (e) { toast({ title: "실패", description: String(e), variant: "destructive" }); }
  };

  return (
    <Card>
      <CardHeader><CardTitle>연체 호실 ({rows.length}건)</CardTitle>
        <CardDescription>1차 안내 → 2차 독촉 → 소장면담 단계로 관리하고, 발송 시 발송 로그가 누적됩니다.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>호실</TableHead><TableHead>월</TableHead><TableHead className="text-right">미수</TableHead>
            <TableHead className="text-right">연체일</TableHead><TableHead>단계 변경</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map(b => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.unitNumber}호</TableCell>
                <TableCell>{b.billingMonth}</TableCell>
                <TableCell className="text-right text-red-600 font-semibold">{krw(b.remaining)}</TableCell>
                <TableCell className="text-right">{b.overdueDays}일</TableCell>
                <TableCell className="space-x-1">
                  <Button size="sm" variant="outline" onClick={() => setStage(b.id, 1, true)}><Send className="w-3 h-3 mr-1" />1차</Button>
                  <Button size="sm" variant="outline" onClick={() => setStage(b.id, 2, true)}><Send className="w-3 h-3 mr-1" />2차</Button>
                  <Button size="sm" variant="outline" onClick={() => setStage(b.id, 3, false)}><AlertTriangle className="w-3 h-3 mr-1" />면담</Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={5} className="text-center py-6 text-muted-foreground">연체 없음</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
