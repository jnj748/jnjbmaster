// [Task #780] T9 마감·보고엔진 v01 — 게이트 점검 → 잠금 → 스냅샷·이월 + 표준보고 진입.

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { useBuilding } from "@/contexts/building-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, XCircle, Lock, Unlock, AlertCircle, FileText, BarChart3, RefreshCw } from "lucide-react";

type GateResult = {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
  count: number;
  fixHref?: string;
};

type ClosingRow = {
  id: number;
  month: string;
  status: "open" | "locked" | "reopened";
  lockedAt?: string | null;
  lockReason?: string | null;
  unlockedAt?: string | null;
  unlockReason?: string | null;
  unlockRequestedAt?: string | null;
  unlockRequestedById?: number | null;
  unlockRequestReason?: string | null;
};

type SnapshotTotals = {
  billed?: number;
  collected?: number;
  overdue?: number;
  revenue?: number;
  expense?: number;
  netIncome?: number;
};
type Snapshot = {
  totals?: SnapshotTotals;
  collection?: { rate?: number; overdueCount?: number };
};
type ResidentRow = { unitId: number; unitNumber: string; billed: number; paid: number; overdue: number; status: string };
type SectionRow = { code: string; name: string; balance?: number; amount?: number };

function thisMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function fmtMoney(n: number | undefined | null): string {
  return new Intl.NumberFormat("ko-KR").format(Math.round(Number(n ?? 0)));
}

export default function ErpClosingsPage() {
  const { token } = useAuth();
  const { building } = useBuilding();
  const { toast } = useToast();
  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");
  const buildingId = building?.id ?? null;

  const headers = useMemo<Record<string, string>>(
    () => {
      const h: Record<string, string> = { "Content-Type": "application/json" };
      if (token) h.Authorization = `Bearer ${token}`;
      return h;
    },
    [token],
  );

  const [month, setMonth] = useState<string>(thisMonth());
  const [lockReason, setLockReason] = useState<string>("");
  const [unlockReason, setUnlockReason] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [closings, setClosings] = useState<ClosingRow[]>([]);
  const [gates, setGates] = useState<GateResult[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [residents, setResidents] = useState<{ items: ResidentRow[]; totals: { billed: number; paid: number; overdue: number } } | null>(null);
  const [bs, setBs] = useState<{ assets?: SectionRow[]; liabilities?: SectionRow[]; equity?: SectionRow[] } | null>(null);
  const [op, setOp] = useState<{ revenue?: SectionRow[]; expense?: SectionRow[]; netIncome?: number } | null>(null);

  const reloadClosings = async () => {
    if (!token || !buildingId) return;
    const r = await fetch(`${apiBase}/closings`, { headers });
    if (!r.ok) return;
    const j = await r.json();
    setClosings(j.closings ?? []);
  };

  const reloadGates = async () => {
    if (!token || !buildingId) return;
    const r = await fetch(`${apiBase}/closings/gate?month=${month}`, { headers });
    if (!r.ok) return;
    const j = await r.json();
    setGates(j.gates ?? []);
  };

  const reloadReports = async () => {
    if (!token || !buildingId) return;
    const [m, rg, b, o] = await Promise.all([
      fetch(`${apiBase}/closings/reports/monthly?month=${month}`, { headers }).then(r => r.ok ? r.json() : null),
      fetch(`${apiBase}/closings/reports/resident?month=${month}`, { headers }).then(r => r.ok ? r.json() : null),
      fetch(`${apiBase}/closings/reports/balance-sheet?month=${month}`, { headers }).then(r => r.ok ? r.json() : null),
      fetch(`${apiBase}/closings/reports/operations?month=${month}`, { headers }).then(r => r.ok ? r.json() : null),
    ]);
    setSnapshot(m?.snapshot ?? null);
    setResidents(rg ? { items: rg.items ?? [], totals: rg.totals ?? { billed: 0, paid: 0, overdue: 0 } } : null);
    setBs(b?.balanceSheet ?? null);
    setOp(o?.operations ?? null);
  };

  useEffect(() => { reloadClosings(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token, buildingId]);
  useEffect(() => { reloadGates(); reloadReports(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token, buildingId, month]);

  const monthClosing = closings.find((c) => c.month === month) ?? null;
  const allPassed = gates.length > 0 && gates.every(g => g.passed);
  const isLocked = monthClosing?.status === "locked";

  const lock = async () => {
    if (!token || !buildingId) return;
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/closings/lock`, {
        method: "POST", headers,
        body: JSON.stringify({ month, reason: lockReason || undefined }),
      });
      const j = await r.json();
      if (!r.ok) {
        toast({ title: "마감 실패", description: j?.message ?? j?.error ?? "잠금 실패", variant: "destructive" });
        return;
      }
      toast({ title: "마감 완료", description: `이월잔액 ${j.carryForward ?? 0}건 생성됨` });
      setLockReason("");
      await Promise.all([reloadClosings(), reloadGates(), reloadReports()]);
    } finally { setBusy(false); }
  };

  // [Task #780] 이중승인 — 1차(unlock-request) → 2차(unlock-approve, 다른 사용자).
  const submitUnlock = async (path: "unlock-request" | "unlock-approve" | "unlock-cancel") => {
    if (!token || !buildingId) return;
    setBusy(true);
    try {
      const body = path === "unlock-cancel" ? { month } : { month, reason: unlockReason };
      const r = await fetch(`${apiBase}/closings/${path}`, {
        method: "POST", headers, body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) {
        toast({ title: "해제 처리 실패", description: j?.message ?? j?.error ?? "실패", variant: "destructive" });
        return;
      }
      toast({
        title:
          path === "unlock-request" ? "1차 해제 요청 등록 — 2차 승인 대기" :
          path === "unlock-approve" ? "이중승인 완료 — 마감 해제됨" :
                                      "1차 해제 요청 취소",
      });
      setUnlockReason("");
      await reloadClosings();
    } finally { setBusy(false); }
  };

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-6xl" data-testid="erp-closings-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Lock className="w-6 h-6" /> 월마감·보고
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            T9 마감엔진 — 게이트 5종 점검 → 분개·고지서 잠금 → 이월잔액 생성 → 표준보고 5종 노출.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-40"
            data-testid="month-select"
          />
          <Button variant="outline" size="sm" onClick={() => { reloadGates(); reloadReports(); }} data-testid="btn-refresh">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="lock">
        <TabsList>
          <TabsTrigger value="lock" data-testid="tab-lock">마감 게이트</TabsTrigger>
          <TabsTrigger value="reports" data-testid="tab-reports">표준보고</TabsTrigger>
          <TabsTrigger value="diff" data-testid="tab-diff">스냅샷 비교</TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">이력</TabsTrigger>
        </TabsList>

        <TabsContent value="lock" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="w-4 h-4" /> 마감 게이트 5종 — {month}
                {allPassed
                  ? <Badge className="bg-emerald-500">모두 통과</Badge>
                  : <Badge variant="destructive">미통과 {gates.filter(g => !g.passed).length}건</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {gates.map((g) => (
                  <div key={g.key} className={`border rounded-lg p-3 ${g.passed ? "border-emerald-200 bg-emerald-50/40" : "border-red-200 bg-red-50/40"}`} data-testid={`gate-${g.key}`}>
                    <div className="flex items-start justify-between">
                      <div className="font-medium flex items-center gap-1">
                        {g.passed ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
                        {g.label}
                      </div>
                      {g.count > 0 && <Badge variant="outline">{g.count}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">{g.detail}</p>
                    {!g.passed && g.fixHref && (
                      <Link href={g.fixHref} className="text-sm text-blue-600 hover:underline mt-2 inline-block">
                        → 보정 화면으로
                      </Link>
                    )}
                  </div>
                ))}
                {gates.length === 0 && <p className="text-sm text-muted-foreground">게이트 점검 중…</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{isLocked ? "마감 해제" : "마감 실행"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!isLocked && (
                <>
                  <Textarea
                    placeholder="잠금 사유(선택)"
                    value={lockReason}
                    onChange={(e) => setLockReason(e.target.value)}
                    rows={2}
                    data-testid="input-lock-reason"
                  />
                  <Button
                    onClick={lock}
                    disabled={!allPassed || busy}
                    className="bg-red-600 hover:bg-red-700"
                    data-testid="btn-lock"
                  >
                    <Lock className="w-4 h-4 mr-2" /> {month} 마감 잠금
                  </Button>
                  {!allPassed && (
                    <p className="text-sm text-amber-700">게이트 5종 모두 통과 후 잠금 가능합니다.</p>
                  )}
                </>
              )}
              {isLocked && (
                <>
                  <div className="text-sm bg-muted p-3 rounded">
                    <div>잠긴 시각: <span className="font-mono">{monthClosing?.lockedAt ? new Date(monthClosing.lockedAt).toLocaleString("ko-KR") : "-"}</span></div>
                    {monthClosing?.lockReason && <div>사유: {monthClosing.lockReason}</div>}
                  </div>
                  {/* [Task #780] 이중승인 안내 — 두 명의 서로 다른 승인자가 차례로 확인해야 해제됨. */}
                  <div className="text-xs bg-amber-50 border border-amber-200 text-amber-900 p-3 rounded" data-testid="dual-approval-notice">
                    <div className="font-semibold mb-1">⚠ 이중 승인이 필요합니다</div>
                    <div>1차 요청 → 다른 사용자(HQ 임원·플랫폼 관리자)의 2차 승인이 있어야 잠금이 해제됩니다. 1차 요청 후 24시간 내 미승인 시 자동 만료.</div>
                  </div>
                  {monthClosing?.unlockRequestedAt && monthClosing?.unlockRequestedById ? (
                    <>
                      <div className="text-sm bg-blue-50 border border-blue-200 p-3 rounded" data-testid="unlock-request-pending">
                        <div>1차 요청자 ID: <span className="font-mono">{monthClosing.unlockRequestedById}</span></div>
                        <div>요청 시각: <span className="font-mono">{new Date(monthClosing.unlockRequestedAt).toLocaleString("ko-KR")}</span></div>
                        {monthClosing.unlockRequestReason && <div>사유: {monthClosing.unlockRequestReason}</div>}
                      </div>
                      <Textarea
                        placeholder="2차 승인 사유 (3자 이상 필수)"
                        value={unlockReason}
                        onChange={(e) => setUnlockReason(e.target.value)}
                        rows={2}
                        data-testid="input-unlock-approve-reason"
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={() => submitUnlock("unlock-approve")}
                          disabled={unlockReason.trim().length < 3 || busy}
                          variant="destructive"
                          data-testid="btn-unlock-approve"
                        >
                          <Unlock className="w-4 h-4 mr-2" /> 2차 승인 — {month} 해제 확정
                        </Button>
                        <Button
                          onClick={() => submitUnlock("unlock-cancel")}
                          disabled={busy}
                          variant="outline"
                          data-testid="btn-unlock-cancel"
                        >
                          1차 요청 취소
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <Textarea
                        placeholder="1차 해제 요청 사유 (3자 이상 필수, 감사로그 기록)"
                        value={unlockReason}
                        onChange={(e) => setUnlockReason(e.target.value)}
                        rows={2}
                        data-testid="input-unlock-reason"
                      />
                      <Button
                        onClick={() => submitUnlock("unlock-request")}
                        disabled={unlockReason.trim().length < 3 || busy}
                        variant="destructive"
                        data-testid="btn-unlock-request"
                      >
                        <Unlock className="w-4 h-4 mr-2" /> 1차 해제 요청 등록
                      </Button>
                    </>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> 월간 요약 — {month}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!snapshot ? <p className="text-muted-foreground">데이터가 없습니다.</p> : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                  <Stat label="부과액" value={fmtMoney(snapshot.totals?.billed)} />
                  <Stat label="수납액" value={fmtMoney(snapshot.totals?.collected)} />
                  <Stat label="미수액" value={fmtMoney(snapshot.totals?.overdue)} highlight />
                  <Stat label="당월 매출" value={fmtMoney(snapshot.totals?.revenue)} />
                  <Stat label="당월 비용" value={fmtMoney(snapshot.totals?.expense)} />
                  <Stat label="당월 손익" value={fmtMoney(snapshot.totals?.netIncome)} />
                  <Stat label="수납률" value={`${snapshot.collection?.rate ?? 0}%`} />
                  <Stat label="미수 호실 수" value={String(snapshot.collection?.overdueCount ?? 0)} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">호실별 부과·수납·미수</CardTitle></CardHeader>
            <CardContent>
              {!residents ? <p>로딩…</p> : (
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="p-2 text-left">호실</th>
                        <th className="p-2 text-right">부과</th>
                        <th className="p-2 text-right">수납</th>
                        <th className="p-2 text-right">미수</th>
                        <th className="p-2 text-left">상태</th>
                      </tr>
                    </thead>
                    <tbody>
                      {residents.items.map((r) => (
                        <tr key={r.unitId} className="border-t" data-testid={`resident-row-${r.unitId}`}>
                          <td className="p-2">{r.unitNumber}</td>
                          <td className="p-2 text-right">{fmtMoney(r.billed)}</td>
                          <td className="p-2 text-right">{fmtMoney(r.paid)}</td>
                          <td className={`p-2 text-right ${r.overdue > 0 ? "text-red-600 font-medium" : ""}`}>{fmtMoney(r.overdue)}</td>
                          <td className="p-2"><Badge variant="outline">{r.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="font-semibold bg-muted/30">
                      <tr>
                        <td className="p-2">합계</td>
                        <td className="p-2 text-right">{fmtMoney(residents.totals.billed)}</td>
                        <td className="p-2 text-right">{fmtMoney(residents.totals.paid)}</td>
                        <td className="p-2 text-right">{fmtMoney(residents.totals.overdue)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">재무상태표</CardTitle></CardHeader>
            <CardContent>
              {!bs ? <p className="text-muted-foreground">데이터 없음</p> : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <Section title="자산(1xxx)" rows={bs.assets ?? []} />
                  <Section title="부채(2xxx)" rows={bs.liabilities ?? []} />
                  <Section title="자본(3xxx)" rows={bs.equity ?? []} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">손익계산서</CardTitle></CardHeader>
            <CardContent>
              {!op ? <p className="text-muted-foreground">데이터 없음</p> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                  <Section title="매출(4xxx)" rows={op.revenue ?? []} amountKey="amount" />
                  <Section title="비용(5xxx)" rows={op.expense ?? []} amountKey="amount" />
                  <div className="md:col-span-2 border-t pt-2 text-right font-semibold">
                    당월 손익: <span className={(op.netIncome ?? 0) >= 0 ? "text-emerald-700" : "text-red-700"}>{fmtMoney(op.netIncome)}원</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="diff" className="space-y-4">
          <ClosingDiffPanel apiBase={apiBase} headers={headers} defaultTo={month} />
        </TabsContent>

        <TabsContent value="history" className="space-y-3">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="w-4 h-4" /> 마감 이력</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="p-2 text-left">월</th>
                      <th className="p-2 text-left">상태</th>
                      <th className="p-2 text-left">잠긴 시각</th>
                      <th className="p-2 text-left">사유</th>
                      <th className="p-2 text-left">해제 시각</th>
                      <th className="p-2 text-left">해제 사유</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closings.map((c) => (
                      <tr key={c.id} className="border-t" data-testid={`closing-row-${c.month}`}>
                        <td className="p-2 font-mono">
                          <button className="hover:underline" onClick={() => setMonth(c.month)}>{c.month}</button>
                        </td>
                        <td className="p-2">
                          <Badge variant={c.status === "locked" ? "default" : c.status === "reopened" ? "secondary" : "outline"}>
                            {c.status === "locked" ? "잠금" : c.status === "reopened" ? "재오픈" : "오픈"}
                          </Badge>
                        </td>
                        <td className="p-2">{c.lockedAt ? new Date(c.lockedAt).toLocaleString("ko-KR") : "-"}</td>
                        <td className="p-2">{c.lockReason ?? "-"}</td>
                        <td className="p-2">{c.unlockedAt ? new Date(c.unlockedAt).toLocaleString("ko-KR") : "-"}</td>
                        <td className="p-2">{c.unlockReason ?? "-"}</td>
                      </tr>
                    ))}
                    {closings.length === 0 && (
                      <tr><td colSpan={6} className="p-4 text-center text-muted-foreground">마감 이력이 없습니다.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`border rounded-lg p-3 ${highlight ? "bg-amber-50 border-amber-200" : "bg-muted/20"}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}

// [Task #780] 스냅샷 diff 패널 — 두 월의 totals/collection 변동을 보여준다.
type DiffEntry = { from: number; to: number; delta: number; pct: number | null };
type DiffResponse = {
  from: { month: string; status: string; fromSnapshot: boolean };
  to: { month: string; status: string; fromSnapshot: boolean };
  diff: {
    totals: Record<string, DiffEntry>;
    collection: { rate: { from: number; to: number; delta: number }; overdueCount: { from: number; to: number; delta: number } };
  };
};

function ClosingDiffPanel({ apiBase, headers, defaultTo }: { apiBase: string; headers: Record<string, string>; defaultTo: string }) {
  const prevYM = (ym: string) => {
    const [y, m] = ym.split("-").map((s) => Number(s));
    if (!y || !m) return ym;
    const d = new Date(Date.UTC(y, m - 2, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const [from, setFrom] = useState<string>(prevYM(defaultTo));
  const [to, setTo] = useState<string>(defaultTo);
  const [data, setData] = useState<DiffResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    setBusy(true);
    try {
      const r = await fetch(`${apiBase}/closings/diff?from=${from}&to=${to}`, { headers });
      if (r.ok) setData(await r.json());
    } finally { setBusy(false); }
  };
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [from, to]);

  const labels: Record<string, string> = {
    billed: "부과액", collected: "수납액", overdue: "미수액",
    revenue: "매출", expense: "비용", netIncome: "손익",
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="w-4 h-4" /> 스냅샷 비교 — {from} → {to}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2">
          <Input type="month" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" data-testid="diff-from" />
          <span className="text-muted-foreground">→</span>
          <Input type="month" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" data-testid="diff-to" />
          <Button variant="outline" size="sm" onClick={reload} disabled={busy} data-testid="btn-diff-reload">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        {!data ? <p className="text-sm text-muted-foreground">불러오는 중…</p> : (
          <>
            <div className="text-xs text-muted-foreground">
              {data.from.month} <Badge variant="outline">{data.from.status}{data.from.fromSnapshot ? "·snapshot" : "·live"}</Badge>
              {" → "}
              {data.to.month} <Badge variant="outline">{data.to.status}{data.to.fromSnapshot ? "·snapshot" : "·live"}</Badge>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm" data-testid="diff-totals-table">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left">항목</th>
                    <th className="p-2 text-right">{data.from.month}</th>
                    <th className="p-2 text-right">{data.to.month}</th>
                    <th className="p-2 text-right">변동</th>
                    <th className="p-2 text-right">변동률</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.diff.totals).map(([k, v]) => (
                    <tr key={k} className="border-t" data-testid={`diff-row-${k}`}>
                      <td className="p-2">{labels[k] ?? k}</td>
                      <td className="p-2 text-right font-mono">{fmtMoney(v.from)}</td>
                      <td className="p-2 text-right font-mono">{fmtMoney(v.to)}</td>
                      <td className={`p-2 text-right font-mono ${v.delta > 0 ? "text-emerald-700" : v.delta < 0 ? "text-red-700" : ""}`}>
                        {v.delta > 0 ? "+" : ""}{fmtMoney(v.delta)}
                      </td>
                      <td className="p-2 text-right font-mono text-muted-foreground">
                        {v.pct == null ? "-" : `${v.pct > 0 ? "+" : ""}${v.pct}%`}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t bg-muted/30">
                    <td className="p-2">수납률(%)</td>
                    <td className="p-2 text-right font-mono">{data.diff.collection.rate.from}</td>
                    <td className="p-2 text-right font-mono">{data.diff.collection.rate.to}</td>
                    <td className={`p-2 text-right font-mono ${data.diff.collection.rate.delta > 0 ? "text-emerald-700" : data.diff.collection.rate.delta < 0 ? "text-red-700" : ""}`}>
                      {data.diff.collection.rate.delta > 0 ? "+" : ""}{data.diff.collection.rate.delta}
                    </td>
                    <td className="p-2 text-right text-muted-foreground">-</td>
                  </tr>
                  <tr className="border-t">
                    <td className="p-2">연체호실 수</td>
                    <td className="p-2 text-right font-mono">{data.diff.collection.overdueCount.from}</td>
                    <td className="p-2 text-right font-mono">{data.diff.collection.overdueCount.to}</td>
                    <td className={`p-2 text-right font-mono ${data.diff.collection.overdueCount.delta > 0 ? "text-red-700" : data.diff.collection.overdueCount.delta < 0 ? "text-emerald-700" : ""}`}>
                      {data.diff.collection.overdueCount.delta > 0 ? "+" : ""}{data.diff.collection.overdueCount.delta}
                    </td>
                    <td className="p-2 text-right text-muted-foreground">-</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Section({ title, rows, amountKey = "balance" }: { title: string; rows: SectionRow[]; amountKey?: "balance" | "amount" }) {
  return (
    <div className="border rounded-lg p-3 bg-muted/10">
      <div className="font-medium mb-2">{title}</div>
      <div className="space-y-1">
        {rows.length === 0 && <div className="text-muted-foreground text-xs">데이터 없음</div>}
        {rows.map((r) => (
          <div key={r.code} className="flex justify-between text-sm">
            <span className="text-muted-foreground">{r.code} {r.name}</span>
            <span className="font-mono">{fmtMoney(r[amountKey] ?? 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
