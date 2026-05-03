// [Task #778] T6 회계엔진 v01 — 회계 허브.
//   분개장 / 총계정원장 / 보조부원장 / 현금출납장 / 제예금명세서 /
//   재무상태표 / 운영성과표 — 단일 페이지 탭 구조.
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";

const BASE = (import.meta.env.BASE_URL ?? "/") as string;
const apiBase = `${BASE}api`.replace(/\/+/g, "/");

const won = (n: number) => (Number(n) || 0).toLocaleString("ko-KR") + "원";

interface Account { code: string; name: string; type: string; isHeader: boolean; parentCode: string | null }
interface JournalLine { id: number; accountCode: string; accountName: string; debit: number; credit: number; partyName: string | null; unitId: number | null; memo: string | null }
interface JournalEntry { id: number; entryDate: string; memo: string; sourceEvent: string; isBalanced: boolean; locked: boolean; isReversal: boolean; lines: JournalLine[] }

// [Task #778] phase-3 와 동일한 인증 패턴: useAuth 의 token 을 매 호출마다 Bearer 헤더에 실어야 한다.
type ApiFn = <T>(path: string, init?: RequestInit) => Promise<T>;
function useApi(): ApiFn {
  const { token } = useAuth();
  return useMemo<ApiFn>(() => async (path, init) => {
    const res = await fetch(`${apiBase}${path}`, {
      credentials: "include",
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => "")}`.slice(0, 200));
    return res.json();
  }, [token]);
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const monthStartStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`; };

export default function Phase2AccountingPage() {
  const api = useApi();
  const [accounts, setAccounts] = useState<Account[]>([]);
  useEffect(() => { api<{ accounts: Account[] }>("/accounting/accounts").then(r => setAccounts(r.accounts)).catch(e => toast.error(`계정과목 로드 실패: ${e.message}`)); }, [api]);
  const codeOptions = useMemo(() => accounts.filter(a => !a.isHeader), [accounts]);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">회계엔진 (T6)</h1>
        <p className="text-sm text-muted-foreground">결재 확정·부과 확정·수납 시 자동으로 분개가 생성됩니다. 수동 분개도 가능합니다.</p>
      </div>
      <Tabs defaultValue="journal">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="journal">분개장</TabsTrigger>
          <TabsTrigger value="gl">총계정원장</TabsTrigger>
          <TabsTrigger value="sub">보조부원장</TabsTrigger>
          <TabsTrigger value="cash">현금출납장</TabsTrigger>
          <TabsTrigger value="deposits">제예금명세서</TabsTrigger>
          <TabsTrigger value="bs">재무상태표</TabsTrigger>
          <TabsTrigger value="is">운영성과표</TabsTrigger>
          <TabsTrigger value="anom">이상거래</TabsTrigger>
          <TabsTrigger value="coa">계정과목</TabsTrigger>
        </TabsList>

        <TabsContent value="journal"><JournalTab codeOptions={codeOptions} /></TabsContent>
        <TabsContent value="gl"><GeneralLedgerTab codeOptions={codeOptions} /></TabsContent>
        <TabsContent value="sub"><SubLedgerTab /></TabsContent>
        <TabsContent value="cash"><CashbookTab /></TabsContent>
        <TabsContent value="deposits"><DepositsTab /></TabsContent>
        <TabsContent value="bs"><BalanceSheetTab /></TabsContent>
        <TabsContent value="is"><IncomeStatementTab /></TabsContent>
        <TabsContent value="anom"><AnomaliesTab /></TabsContent>
        <TabsContent value="coa"><ChartOfAccountsTab accounts={accounts} onChanged={() => { api<{ accounts: Account[] }>("/accounting/accounts").then(r => setAccounts(r.accounts)); }} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ── 분개장 ─────────────────────────────────────────────────
function JournalTab({ codeOptions }: { codeOptions: Account[] }) {
  const api = useApi();
  const [from, setFrom] = useState(monthStartStr());
  const [to, setTo] = useState(todayStr());
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const reload = async () => {
    setLoading(true);
    try { const r = await api<{ entries: JournalEntry[] }>(`/accounting/journal?from=${from}&to=${to}`); setEntries(r.entries); }
    catch (e) { toast.error(`분개장 로드 실패: ${(e as Error).message}`); }
    finally { setLoading(false); }
  };
  useEffect(() => { reload(); }, []);

  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ entryDate: todayStr(), memo: "", lines: [{ accountCode: "", debit: 0, credit: 0, partyName: "", memo: "" }, { accountCode: "", debit: 0, credit: 0, partyName: "", memo: "" }] });
  const setLine = (i: number, patch: Partial<typeof draft.lines[0]>) => setDraft(d => ({ ...d, lines: d.lines.map((l, idx) => idx === i ? { ...l, ...patch } : l) }));
  const totalD = draft.lines.reduce((s, l) => s + Number(l.debit || 0), 0);
  const totalC = draft.lines.reduce((s, l) => s + Number(l.credit || 0), 0);
  const submit = async () => {
    if (!draft.memo.trim()) { toast.error("적요를 입력하세요"); return; }
    if (Math.abs(totalD - totalC) > 0.5) { toast.error("차변과 대변이 일치해야 합니다"); return; }
    try {
      await api("/accounting/journal", { method: "POST", body: JSON.stringify(draft) });
      toast.success("분개가 등록되었습니다");
      setShowNew(false);
      setDraft({ entryDate: todayStr(), memo: "", lines: [{ accountCode: "", debit: 0, credit: 0, partyName: "", memo: "" }, { accountCode: "", debit: 0, credit: 0, partyName: "", memo: "" }] });
      reload();
    } catch (e) { toast.error(`등록 실패: ${(e as Error).message}`); }
  };
  const reverse = async (id: number) => {
    // [Task #778] journal.reverse 는 위험 액션 — 사유 필수(서버가 422 로 거부).
    const reason = window.prompt("역분개 사유를 입력하세요 (필수)");
    if (!reason || !reason.trim()) { toast.error("사유는 필수입니다"); return; }
    try {
      await api(`/accounting/journal/${id}/reverse`, {
        method: "POST",
        headers: { "X-Audit-Reason": reason.trim().slice(0, 500) },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      toast.success("역분개 생성 완료"); reload();
    } catch (e) { toast.error(`역분개 실패: ${(e as Error).message}`); }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>분개장</CardTitle>
        <div className="flex items-end gap-2">
          <div><Label>시작</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36" /></div>
          <div><Label>종료</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-36" /></div>
          <Button onClick={reload} disabled={loading}>조회</Button>
          <Button variant="default" onClick={() => setShowNew(s => !s)}>{showNew ? "닫기" : "+ 수동 분개"}</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showNew && (
          <Card className="border-primary/40">
            <CardContent className="space-y-3 pt-4">
              <div className="grid grid-cols-3 gap-3">
                <div><Label>전표일자</Label><Input type="date" value={draft.entryDate} onChange={e => setDraft(d => ({ ...d, entryDate: e.target.value }))} /></div>
                <div className="col-span-2"><Label>적요</Label><Input value={draft.memo} onChange={e => setDraft(d => ({ ...d, memo: e.target.value }))} placeholder="예: 7월 분 사무용품 구입" /></div>
              </div>
              <Table>
                <TableHeader><TableRow><TableHead>계정과목</TableHead><TableHead>거래처</TableHead><TableHead className="text-right">차변</TableHead><TableHead className="text-right">대변</TableHead><TableHead>비고</TableHead></TableRow></TableHeader>
                <TableBody>
                  {draft.lines.map((l, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Select value={l.accountCode} onValueChange={v => setLine(i, { accountCode: v })}>
                          <SelectTrigger className="w-44"><SelectValue placeholder="선택" /></SelectTrigger>
                          <SelectContent>{codeOptions.map(a => <SelectItem key={a.code} value={a.code}>{a.code} {a.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><Input value={l.partyName} onChange={e => setLine(i, { partyName: e.target.value })} className="w-32" /></TableCell>
                      <TableCell><Input type="number" value={l.debit} onChange={e => setLine(i, { debit: Number(e.target.value) || 0 })} className="text-right w-32" /></TableCell>
                      <TableCell><Input type="number" value={l.credit} onChange={e => setLine(i, { credit: Number(e.target.value) || 0 })} className="text-right w-32" /></TableCell>
                      <TableCell><Input value={l.memo} onChange={e => setLine(i, { memo: e.target.value })} className="w-40" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setDraft(d => ({ ...d, lines: [...d.lines, { accountCode: "", debit: 0, credit: 0, partyName: "", memo: "" }] }))}>+ 라인 추가</Button>
                <div className="ml-auto flex items-center gap-3 text-sm">
                  <span>차변합계 <b>{won(totalD)}</b></span>
                  <span>대변합계 <b>{won(totalC)}</b></span>
                  <Badge variant={Math.abs(totalD - totalC) <= 0.5 ? "default" : "destructive"}>{Math.abs(totalD - totalC) <= 0.5 ? "대차일치" : "불일치"}</Badge>
                  <Button onClick={submit}>저장</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Table>
          <TableHeader><TableRow><TableHead>일자</TableHead><TableHead>적요</TableHead><TableHead>출처</TableHead><TableHead>라인</TableHead><TableHead className="text-right">합계</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {entries.map(e => (
              <TableRow key={e.id}>
                <TableCell>{e.entryDate}</TableCell>
                <TableCell>
                  <div>{e.memo}</div>
                  <div className="text-xs text-muted-foreground space-y-0.5 mt-1">
                    {e.lines.map(l => (
                      <div key={l.id}>· {l.accountCode} {l.accountName} {l.debit > 0 ? `차변 ${won(l.debit)}` : `대변 ${won(l.credit)}`}{l.partyName ? ` (${l.partyName})` : ""}</div>
                    ))}
                  </div>
                </TableCell>
                <TableCell><Badge variant="outline">{e.sourceEvent}</Badge>{e.isReversal && <Badge variant="destructive" className="ml-1">역분개</Badge>}</TableCell>
                <TableCell>{e.lines.length}</TableCell>
                <TableCell className="text-right">{won(e.lines.reduce((s, l) => s + l.debit, 0))}</TableCell>
                <TableCell>
                  {!e.isReversal && <Button size="sm" variant="ghost" onClick={() => reverse(e.id)}>{e.locked ? "역분개(마감)" : "역분개"}</Button>}
                  {e.locked && <Badge variant="secondary" className="ml-1">마감</Badge>}
                </TableCell>
              </TableRow>
            ))}
            {entries.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">조회 결과가 없습니다</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── 총계정원장 ──────────────────────────────────────────────
function GeneralLedgerTab({ codeOptions }: { codeOptions: Account[] }) {
  const api = useApi();
  const [code, setCode] = useState("");
  const [from, setFrom] = useState(monthStartStr());
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<{ account: { code: string; name: string }; lines: Array<{ entryDate: string; memo: string; debit: number; credit: number; balance: number; partyName: string | null }>; finalBalance: number } | null>(null);
  const reload = async () => {
    if (!code) return;
    try { const r = await api<typeof data>(`/accounting/general-ledger?accountCode=${code}&from=${from}&to=${to}`); setData(r); }
    catch (e) { toast.error(`총계정원장 로드 실패: ${(e as Error).message}`); }
  };
  return (
    <Card>
      <CardHeader><CardTitle>총계정원장</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-end gap-2 mb-3">
          <div><Label>계정과목</Label>
            <Select value={code} onValueChange={setCode}>
              <SelectTrigger className="w-56"><SelectValue placeholder="선택" /></SelectTrigger>
              <SelectContent>{codeOptions.map(a => <SelectItem key={a.code} value={a.code}>{a.code} {a.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>시작</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div><Label>종료</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <Button onClick={reload}>조회</Button>
        </div>
        {data && (
          <Table>
            <TableHeader><TableRow><TableHead>일자</TableHead><TableHead>적요</TableHead><TableHead>거래처</TableHead><TableHead className="text-right">차변</TableHead><TableHead className="text-right">대변</TableHead><TableHead className="text-right">잔액</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.lines.map((l, i) => (
                <TableRow key={i}><TableCell>{l.entryDate}</TableCell><TableCell>{l.memo}</TableCell><TableCell>{l.partyName ?? "-"}</TableCell><TableCell className="text-right">{l.debit > 0 ? won(l.debit) : "-"}</TableCell><TableCell className="text-right">{l.credit > 0 ? won(l.credit) : "-"}</TableCell><TableCell className="text-right font-mono">{won(l.balance)}</TableCell></TableRow>
              ))}
              <TableRow className="font-semibold"><TableCell colSpan={5}>잔액</TableCell><TableCell className="text-right">{won(data.finalBalance)}</TableCell></TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── 보조부원장 (거래처/호실) ───────────────────────────────
function SubLedgerTab() {
  const api = useApi();
  const [partyName, setPartyName] = useState("");
  const [unitId, setUnitId] = useState("");
  const [lines, setLines] = useState<Array<{ entryDate: string; memo: string; accountCode: string; accountName: string; debit: number; credit: number; partyName: string | null; unitId: number | null }>>([]);
  const reload = async () => {
    const qs = new URLSearchParams();
    if (partyName) qs.set("partyName", partyName);
    if (unitId) qs.set("unitId", unitId);
    if (!qs.toString()) { toast.info("거래처명 또는 호실 ID 를 입력하세요"); return; }
    try { const r = await api<{ lines: typeof lines }>(`/accounting/sub-ledger?${qs}`); setLines(r.lines); }
    catch (e) { toast.error(`보조부원장 로드 실패: ${(e as Error).message}`); }
  };
  return (
    <Card>
      <CardHeader><CardTitle>보조부원장</CardTitle></CardHeader>
      <CardContent>
        <div className="flex items-end gap-2 mb-3">
          <div><Label>거래처명</Label><Input value={partyName} onChange={e => setPartyName(e.target.value)} className="w-44" /></div>
          <div><Label>호실 ID</Label><Input type="number" value={unitId} onChange={e => setUnitId(e.target.value)} className="w-28" /></div>
          <Button onClick={reload}>조회</Button>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>일자</TableHead><TableHead>적요</TableHead><TableHead>계정</TableHead><TableHead>거래처/호실</TableHead><TableHead className="text-right">차변</TableHead><TableHead className="text-right">대변</TableHead></TableRow></TableHeader>
          <TableBody>
            {lines.map((l, i) => (<TableRow key={i}><TableCell>{l.entryDate}</TableCell><TableCell>{l.memo}</TableCell><TableCell>{l.accountCode} {l.accountName}</TableCell><TableCell>{l.partyName ?? `호실#${l.unitId}`}</TableCell><TableCell className="text-right">{l.debit > 0 ? won(l.debit) : "-"}</TableCell><TableCell className="text-right">{l.credit > 0 ? won(l.credit) : "-"}</TableCell></TableRow>))}
            {lines.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">조회 결과가 없습니다</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── 현금출납장 ─────────────────────────────────────────────
function CashbookTab() {
  const api = useApi();
  const [from, setFrom] = useState(monthStartStr());
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<{ lines: Array<{ entryDate: string; memo: string; accountName: string; debit: number; credit: number; balance: number; partyName: string | null }>; finalBalance: number } | null>(null);
  const reload = async () => {
    try { const r = await api<typeof data>(`/accounting/cashbook?from=${from}&to=${to}`); setData(r); }
    catch (e) { toast.error(`현금출납장 로드 실패: ${(e as Error).message}`); }
  };
  useEffect(() => { reload(); }, []);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>현금출납장</CardTitle>
        <div className="flex items-end gap-2">
          <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36" />
          <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-36" />
          <Button onClick={reload}>조회</Button>
        </div>
      </CardHeader>
      <CardContent>
        {data && (
          <Table>
            <TableHeader><TableRow><TableHead>일자</TableHead><TableHead>적요</TableHead><TableHead>계정</TableHead><TableHead>거래처</TableHead><TableHead className="text-right">입금</TableHead><TableHead className="text-right">출금</TableHead><TableHead className="text-right">잔액</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.lines.map((l, i) => (<TableRow key={i}><TableCell>{l.entryDate}</TableCell><TableCell>{l.memo}</TableCell><TableCell>{l.accountName}</TableCell><TableCell>{l.partyName ?? "-"}</TableCell><TableCell className="text-right">{l.debit > 0 ? won(l.debit) : "-"}</TableCell><TableCell className="text-right">{l.credit > 0 ? won(l.credit) : "-"}</TableCell><TableCell className="text-right font-mono">{won(l.balance)}</TableCell></TableRow>))}
              <TableRow className="font-semibold"><TableCell colSpan={6}>현재 잔액</TableCell><TableCell className="text-right">{won(data.finalBalance)}</TableCell></TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── 제예금명세서 ────────────────────────────────────────────
function DepositsTab() {
  const api = useApi();
  type Line = { entryId: number; entryDate: string; memo: string; accountCode: string; accountName: string; debit: number; credit: number; partyName: string | null; balance: number };
  type Acc = { code: string; name: string; balance: number; lines: Line[] };
  const [data, setData] = useState<{ accounts: Acc[] } | null>(null);
  useEffect(() => { api<typeof data>("/accounting/deposits").then(setData).catch(e => toast.error(`예금명세 로드 실패: ${e.message}`)); }, [api]);
  return (
    <Card>
      <CardHeader><CardTitle>제예금명세서</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {data?.accounts.map(a => (
          <div key={a.code} className="rounded border">
            <div className="flex items-center justify-between bg-muted/40 px-3 py-2">
              <div className="font-semibold">{a.code} {a.name}</div>
              <div className="font-mono">잔액 {won(a.balance)}</div>
            </div>
            {a.lines.length > 0 && (
              <Table>
                <TableHeader><TableRow><TableHead>일자</TableHead><TableHead>적요</TableHead><TableHead>거래처</TableHead><TableHead className="text-right">입금</TableHead><TableHead className="text-right">출금</TableHead><TableHead className="text-right">잔액</TableHead></TableRow></TableHeader>
                <TableBody>{a.lines.map((l, i) => (
                  <TableRow key={`${a.code}-${i}`}>
                    <TableCell>{l.entryDate}</TableCell>
                    <TableCell>{l.memo}</TableCell>
                    <TableCell>{l.partyName ?? "-"}</TableCell>
                    <TableCell className="text-right font-mono">{l.debit ? won(l.debit) : "-"}</TableCell>
                    <TableCell className="text-right font-mono">{l.credit ? won(l.credit) : "-"}</TableCell>
                    <TableCell className="text-right font-mono">{won(l.balance)}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            )}
          </div>
        ))}
        {data && data.accounts.length === 0 && <div className="text-sm text-muted-foreground">등록된 예금/현금 계정이 없습니다.</div>}
      </CardContent>
    </Card>
  );
}

// ── 이상거래 탐지 ───────────────────────────────────────────
function AnomaliesTab() {
  const api = useApi();
  type A = { entryId: number; entryDate: string; severity: "high" | "medium" | "low"; kind: string; message: string };
  const [data, setData] = useState<{ anomalies: A[] } | null>(null);
  const reload = () => api<{ anomalies: A[] }>("/accounting/anomalies").then(setData).catch(e => toast.error(`이상거래 로드 실패: ${e.message}`));
  useEffect(() => { reload(); }, []);
  const sevColor = (s: A["severity"]) => s === "high" ? "text-red-600 font-semibold" : s === "medium" ? "text-amber-600" : "text-muted-foreground";
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>이상거래 탐지</CardTitle>
        <Button variant="outline" size="sm" onClick={reload}>새로고침</Button>
      </CardHeader>
      <CardContent>
        {data && data.anomalies.length === 0 && <div className="text-sm text-muted-foreground">탐지된 이상 항목이 없습니다.</div>}
        {data && data.anomalies.length > 0 && (
          <Table>
            <TableHeader><TableRow><TableHead>분개ID</TableHead><TableHead>일자</TableHead><TableHead>심각도</TableHead><TableHead>유형</TableHead><TableHead>메시지</TableHead></TableRow></TableHeader>
            <TableBody>{data.anomalies.map((a, i) => (
              <TableRow key={i}>
                <TableCell>#{a.entryId}</TableCell>
                <TableCell>{a.entryDate}</TableCell>
                <TableCell className={sevColor(a.severity)}>{a.severity}</TableCell>
                <TableCell>{a.kind}</TableCell>
                <TableCell>{a.message}</TableCell>
              </TableRow>
            ))}</TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

// ── 재무상태표 ─────────────────────────────────────────────
function BalanceSheetTab() {
  const api = useApi();
  const [asOf, setAsOf] = useState(todayStr());
  const [data, setData] = useState<{ assets: Array<{ code: string; name: string; balance: number }>; liabilities: Array<{ code: string; name: string; balance: number }>; equity: Array<{ code: string; name: string; balance: number }>; netIncome: number; totals: { assets: number; liabilities: number; equity: number } } | null>(null);
  const reload = async () => { try { const r = await api<typeof data>(`/accounting/balance-sheet?asOf=${asOf}`); setData(r); } catch (e) { toast.error(`재무상태표 로드 실패: ${(e as Error).message}`); } };
  useEffect(() => { reload(); }, []);
  const Section = ({ title, rows, total }: { title: string; rows: Array<{ code: string; name: string; balance: number }>; total: number }) => (
    <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader><CardContent><Table><TableBody>
      {rows.map(r => (<TableRow key={r.code}><TableCell>{r.code} {r.name}</TableCell><TableCell className="text-right font-mono">{won(r.balance)}</TableCell></TableRow>))}
      <TableRow className="font-semibold"><TableCell>합계</TableCell><TableCell className="text-right">{won(total)}</TableCell></TableRow>
    </TableBody></Table></CardContent></Card>
  );
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2"><div><Label>기준일</Label><Input type="date" value={asOf} onChange={e => setAsOf(e.target.value)} /></div><Button onClick={reload}>조회</Button></div>
      {data && (
        <div className="grid md:grid-cols-2 gap-3">
          <Section title="자산" rows={data.assets} total={data.totals.assets} />
          <div className="space-y-3">
            <Section title="부채" rows={data.liabilities} total={data.totals.liabilities} />
            <Section title={`자본 (당기순이익 ${won(data.netIncome)})`} rows={data.equity} total={data.totals.equity} />
          </div>
        </div>
      )}
    </div>
  );
}

// ── 운영성과표 ─────────────────────────────────────────────
function IncomeStatementTab() {
  const api = useApi();
  const [from, setFrom] = useState(monthStartStr());
  const [to, setTo] = useState(todayStr());
  const [data, setData] = useState<{ revenue: Array<{ code: string; name: string; amount: number }>; expense: Array<{ code: string; name: string; amount: number }>; totals: { revenue: number; expense: number; netIncome: number } } | null>(null);
  const reload = async () => { try { const r = await api<typeof data>(`/accounting/income-statement?from=${from}&to=${to}`); setData(r); } catch (e) { toast.error(`운영성과표 로드 실패: ${(e as Error).message}`); } };
  useEffect(() => { reload(); }, []);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>운영성과표 (손익)</CardTitle>
        <div className="flex items-end gap-2"><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-36" /><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-36" /><Button onClick={reload}>조회</Button></div>
      </CardHeader>
      <CardContent>
        {data && (
          <div className="grid md:grid-cols-2 gap-3">
            <Card><CardHeader><CardTitle className="text-base">수익</CardTitle></CardHeader><CardContent><Table><TableBody>
              {data.revenue.map(r => (<TableRow key={r.code}><TableCell>{r.code} {r.name}</TableCell><TableCell className="text-right font-mono">{won(r.amount)}</TableCell></TableRow>))}
              <TableRow className="font-semibold"><TableCell>합계</TableCell><TableCell className="text-right">{won(data.totals.revenue)}</TableCell></TableRow>
            </TableBody></Table></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">비용</CardTitle></CardHeader><CardContent><Table><TableBody>
              {data.expense.map(r => (<TableRow key={r.code}><TableCell>{r.code} {r.name}</TableCell><TableCell className="text-right font-mono">{won(r.amount)}</TableCell></TableRow>))}
              <TableRow className="font-semibold"><TableCell>합계</TableCell><TableCell className="text-right">{won(data.totals.expense)}</TableCell></TableRow>
            </TableBody></Table></CardContent></Card>
            <Card className="md:col-span-2"><CardContent className="pt-4"><div className="text-lg font-semibold flex justify-between"><span>당기순이익</span><span className={data.totals.netIncome >= 0 ? "text-green-600" : "text-red-600"}>{won(data.totals.netIncome)}</span></div></CardContent></Card>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── 계정과목 관리 ──────────────────────────────────────────
function ChartOfAccountsTab({ accounts, onChanged }: { accounts: Account[]; onChanged: () => void }) {
  const api = useApi();
  const [form, setForm] = useState({ code: "", name: "", type: "expense", parentCode: "", description: "" });
  const submit = async () => {
    if (!form.code || !form.name) { toast.error("코드와 명칭은 필수입니다"); return; }
    try { await api("/accounting/accounts", { method: "POST", body: JSON.stringify(form) }); toast.success("계정과목이 추가되었습니다"); setForm({ code: "", name: "", type: "expense", parentCode: "", description: "" }); onChanged(); }
    catch (e) { toast.error(`추가 실패: ${(e as Error).message}`); }
  };
  return (
    <Card>
      <CardHeader><CardTitle>계정과목</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-5 gap-2 items-end">
          <div><Label>코드</Label><Input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} placeholder="6100" /></div>
          <div><Label>명칭</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="용역비" /></div>
          <div><Label>분류</Label>
            <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="asset">자산</SelectItem><SelectItem value="liability">부채</SelectItem>
                <SelectItem value="equity">자본</SelectItem><SelectItem value="revenue">수익</SelectItem>
                <SelectItem value="expense">비용</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>상위코드</Label><Input value={form.parentCode} onChange={e => setForm(f => ({ ...f, parentCode: e.target.value }))} /></div>
          <Button onClick={submit}>추가</Button>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>코드</TableHead><TableHead>명칭</TableHead><TableHead>분류</TableHead><TableHead>상위</TableHead><TableHead>구분</TableHead></TableRow></TableHeader>
          <TableBody>
            {accounts.map(a => (
              <TableRow key={a.code}>
                <TableCell className="font-mono">{a.code}</TableCell>
                <TableCell className={a.isHeader ? "font-semibold" : ""}>{a.name}</TableCell>
                <TableCell>{({ asset: "자산", liability: "부채", equity: "자본", revenue: "수익", expense: "비용" } as Record<string, string>)[a.type] ?? a.type}</TableCell>
                <TableCell>{a.parentCode ?? "-"}</TableCell>
                <TableCell>{a.isHeader ? <Badge variant="secondary">헤더</Badge> : <Badge variant="outline">거래</Badge>}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
