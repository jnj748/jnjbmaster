// [Task #777] 부과엔진 v01 — 환경 / 분할부과 / 계산 / 총괄표 / 조정 / 검증.
// 직전엔 "준비 중" placeholder 였던 자리를 6개 탭으로 교체. 모든 호출은 인증 토큰을 단 plain fetch.
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Calculator, CheckCircle2, AlertTriangle, Plus, Trash2, FileSpreadsheet, Settings, Wallet } from "lucide-react";

// ── 형 ──────────────────────────────────────────────────────
type Settings = {
  id: number; version: number; areaBasis: "supply" | "exclusive";
  repairReserveUnitPrice: number;
  meterUnitPrices: Record<string, number>;
  otherUnitPrices: Record<string, number>;
  allocationRules: Record<string, "area" | "unit_count" | "usage">;
};
type SettingsResp = { active: Settings | null; aiSuggested: Omit<Settings, "id" | "version"> };
type Installment = {
  id: number; title: string; totalAmount: number; amortizationMonths: number;
  monthlyAmount: number; startMonth: string; endMonth: string;
  category: string; allocationKey: string; status: string; notes: string | null;
};
type Run = {
  id: number; billingMonth: string; status: "draft" | "finalized" | "void";
  totalAmount: number; unitCount: number; settingsVersion: number;
  inputSnapshot: { meterTotals?: Record<string, number>; installmentTotal?: number; commonMaintenance?: number };
};
type Line = {
  id: number; unitId: number; unitNumber: string; area: number; areaRatio: number;
  commonCharge: number; meterCharges: Record<string, { usage: number; rate: number; amount: number }>;
  repairReserve: number; installmentCharge: number; otherCharges: Record<string, number>;
  totalAmount: number; manualOverride: number | null; manualReason: string | null;
};
type Adjustment = {
  id: number; runId: number; unitId: number; unitNumber: string;
  adjustmentType: "discount" | "refund" | "rebill" | "writeoff";
  amount: number; reason: string; reasonChip: string | null; appliedAt: string | null; createdAt: string;
};

const krw = (n: number) => `₩${Math.round(n).toLocaleString()}`;
const TYPE_LABEL: Record<string, string> = { discount: "감면", refund: "환불", rebill: "재부과", writeoff: "대손" };
const REASON_CHIPS = ["고지서 오류", "세대 협의", "민원 처리", "결재 누락", "이중 부과"];

export default function Phase3BillingPage() {
  const { token } = useAuth();
  const BASE = (import.meta.env.BASE_URL ?? "/") as string;
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");
  const headers = useMemo(() => ({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }), [token]);

  const callApi = async (path: string, init?: RequestInit) => {
    const r = await fetch(`${apiBase}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      let msg = text;
      try { msg = JSON.parse(text).error ?? text; } catch { /* keep as-is */ }
      throw new Error(typeof msg === "string" ? msg : "요청 실패");
    }
    return r.json();
  };

  const [tab, setTab] = useState("calculate");

  // ── 상태 ───────────────────────────────────────────────────
  const [settings, setSettings] = useState<SettingsResp | null>(null);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [activeRun, setActiveRun] = useState<{ run: Run; lines: Line[]; adjustments: Adjustment[] } | null>(null);
  const [validation, setValidation] = useState<{ issues: Array<{ rule: string; severity: "error" | "warn"; message: string }>; passed: boolean } | null>(null);

  const refreshSettings = () => callApi("/billing/settings").then(setSettings).catch(e => toast.error(`환경: ${e.message}`));
  const refreshInstallments = () => callApi("/billing/installments").then(setInstallments).catch(e => toast.error(`분할부과: ${e.message}`));
  const refreshRuns = () => callApi("/billing/runs").then(setRuns).catch(e => toast.error(`실행 내역: ${e.message}`));

  useEffect(() => {
    if (!token) return;
    refreshSettings(); refreshInstallments(); refreshRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadRun = async (id: number) => {
    const data = await callApi(`/billing/runs/${id}`);
    setActiveRun(data);
    const v = await callApi(`/billing/runs/${id}/validate`).catch(() => null);
    setValidation(v);
  };

  // ── 계산 입력 ──────────────────────────────────────────────
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [calcMonth, setCalcMonth] = useState(defaultMonth);
  const [common, setCommon] = useState("");
  const [calcNotes, setCalcNotes] = useState("");
  const [calcResult, setCalcResult] = useState<{ run: Run; lines: Line[]; anomalies: Array<{ unitNumber: string; reason: string }> } | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  const onCalculate = async () => {
    if (!common || isNaN(Number(common))) { toast.error("공용관리비 총액을 입력하세요"); return; }
    setCalcLoading(true);
    try {
      const data = await callApi("/billing/calculate", {
        method: "POST",
        body: JSON.stringify({ month: calcMonth, commonMaintenance: Number(common), notes: calcNotes || undefined }),
      });
      setCalcResult(data);
      await refreshRuns();
      await loadRun(data.run.id);
      toast.success(`${calcMonth} 산출 완료 — 호실 ${data.lines.length}개, 합계 ${krw(data.run.totalAmount)}`);
    } catch (e) { toast.error(`산출 실패: ${(e as Error).message}`); }
    finally { setCalcLoading(false); }
  };

  const onFinalize = async (id: number) => {
    if (!confirm("확정하면 보정 불가, 조정명세서로만 변경 가능합니다. 계속할까요?")) return;
    try {
      await callApi(`/billing/runs/${id}/finalize`, { method: "POST" });
      toast.success("부과 확정 — T6 회계엔진 분개 이벤트 발행");
      await refreshRuns(); await loadRun(id);
    } catch (e) { toast.error(`확정 실패: ${(e as Error).message}`); }
  };

  return (
    <div className="container max-w-7xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Phase 3 — 부과엔진</h1>
        <p className="text-base text-muted-foreground">
          면적기준 공용부 배분 · 검침 사용량 반영 · 수선적립금 ㎡단가 · 분할부과 당월액. 호실별 부과 + 총괄표 + 조정 + 검증.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-6 w-full">
          <TabsTrigger value="calculate"><Calculator className="w-4 h-4 mr-1.5" />계산</TabsTrigger>
          <TabsTrigger value="matrix"><FileSpreadsheet className="w-4 h-4 mr-1.5" />총괄표</TabsTrigger>
          <TabsTrigger value="adjustments"><Wallet className="w-4 h-4 mr-1.5" />조정</TabsTrigger>
          <TabsTrigger value="validation"><CheckCircle2 className="w-4 h-4 mr-1.5" />검증</TabsTrigger>
          <TabsTrigger value="installments">분할부과</TabsTrigger>
          <TabsTrigger value="settings"><Settings className="w-4 h-4 mr-1.5" />환경</TabsTrigger>
        </TabsList>

        {/* ── 계산 탭 ─────────────────────────── */}
        <TabsContent value="calculate" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>월별 부과 산출</CardTitle>
              <CardDescription>면적 비율로 공용관리비를 배분하고 검침·수선적립·분할부과를 합산합니다.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>부과월</Label>
                  <Input type="month" value={calcMonth} onChange={e => setCalcMonth(e.target.value)} />
                </div>
                <div>
                  <Label>공용관리비 총액(원)</Label>
                  <Input type="number" value={common} onChange={e => setCommon(e.target.value)} placeholder="예: 5000000" />
                </div>
                <div>
                  <Label>비고</Label>
                  <Input value={calcNotes} onChange={e => setCalcNotes(e.target.value)} placeholder="선택" />
                </div>
              </div>
              <Button onClick={onCalculate} disabled={calcLoading}>
                {calcLoading ? "산출 중..." : "산출 실행"}
              </Button>
              {calcResult && (
                <div className="rounded-lg border p-4 bg-muted/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-muted-foreground text-sm">{calcResult.run.billingMonth} 합계</span>
                      <div className="text-2xl font-bold">{krw(calcResult.run.totalAmount)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground">호실</div>
                      <div className="text-xl font-semibold">{calcResult.lines.length}개</div>
                    </div>
                  </div>
                  {calcResult.anomalies.length > 0 && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        이상치 {calcResult.anomalies.length}건:{" "}
                        {calcResult.anomalies.slice(0, 5).map(a => `${a.unitNumber}호(${a.reason})`).join(", ")}
                        {calcResult.anomalies.length > 5 ? " 외" : ""}
                      </AlertDescription>
                    </Alert>
                  )}
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setTab("matrix")}>총괄표 보기</Button>
                    <Button size="sm" variant="outline" onClick={() => setTab("validation")}>검증</Button>
                    {calcResult.run.status === "draft" && (
                      <Button size="sm" onClick={() => onFinalize(calcResult.run.id)}>확정</Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>최근 실행 내역</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>부과월</TableHead><TableHead>상태</TableHead>
                    <TableHead className="text-right">호실</TableHead>
                    <TableHead className="text-right">합계</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.slice(0, 12).map(r => (
                    <TableRow key={r.id}>
                      <TableCell>{r.billingMonth}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "finalized" ? "default" : "secondary"}>
                          {r.status === "finalized" ? "확정" : r.status === "draft" ? "초안" : "취소"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{r.unitCount}</TableCell>
                      <TableCell className="text-right">{krw(r.totalAmount)}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => { loadRun(r.id); setTab("matrix"); }}>
                          상세
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {runs.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">실행 내역이 없습니다</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── 총괄표 탭 ─────────────────────────── */}
        <TabsContent value="matrix" className="space-y-4 mt-4">
          {!activeRun ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">계산 탭에서 실행을 선택하세요</CardContent></Card>
          ) : (
            <MatrixView
              run={activeRun.run}
              lines={activeRun.lines}
              onOverride={async (lineId, amount, reason) => {
                try {
                  await callApi(`/billing/lines/${lineId}/override`, {
                    method: "PATCH", body: JSON.stringify({ amount, reason }),
                  });
                  toast.success("호실 보정 적용");
                  await loadRun(activeRun.run.id);
                } catch (e) { toast.error((e as Error).message); }
              }}
              onFinalize={() => onFinalize(activeRun.run.id)}
            />
          )}
        </TabsContent>

        {/* ── 조정 탭 ─────────────────────────── */}
        <TabsContent value="adjustments" className="space-y-4 mt-4">
          {!activeRun ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">계산 탭에서 실행을 선택하세요</CardContent></Card>
          ) : (
            <AdjustmentsView
              run={activeRun.run}
              lines={activeRun.lines}
              adjustments={activeRun.adjustments}
              onCreate={async (body) => {
                try {
                  await callApi(`/billing/runs/${activeRun.run.id}/adjustments`, {
                    method: "POST", body: JSON.stringify(body),
                  });
                  toast.success("조정 등록");
                  await loadRun(activeRun.run.id);
                } catch (e) { toast.error((e as Error).message); }
              }}
            />
          )}
        </TabsContent>

        {/* ── 검증 탭 ─────────────────────────── */}
        <TabsContent value="validation" className="space-y-4 mt-4">
          {!activeRun || !validation ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">계산 탭에서 실행을 선택하세요</CardContent></Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{activeRun.run.billingMonth} 부과 검증</CardTitle>
                    <CardDescription>검침↔OCR 일치 / 총괄표 합계 / 분개 연결 / 호실 이상치</CardDescription>
                  </div>
                  <Badge variant={validation.passed ? "default" : "destructive"}>
                    {validation.passed ? "통과" : "오류 있음"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {validation.issues.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">이슈 없음 — 부과 정합성 OK</div>
                ) : (
                  <div className="space-y-2">
                    {validation.issues.map((it, i) => (
                      <Alert key={i} variant={it.severity === "error" ? "destructive" : "default"}>
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          <Badge variant="outline" className="mr-2">{it.rule}</Badge>{it.message}
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── 분할부과 탭 ─────────────────────── */}
        <TabsContent value="installments" className="space-y-4 mt-4">
          <InstallmentsView
            installments={installments}
            onCreate={async (body) => {
              try { await callApi("/billing/installments", { method: "POST", body: JSON.stringify(body) });
                toast.success("분할부과 등록"); await refreshInstallments();
              } catch (e) { toast.error((e as Error).message); }
            }}
            onDelete={async (id) => {
              const reason = prompt("삭제 사유를 입력하세요 (감사로그에 기록됩니다)");
              if (!reason || !reason.trim()) return;
              try { await callApi(`/billing/installments/${id}`, {
                  method: "DELETE", body: JSON.stringify({ reason: reason.trim() }),
                });
                toast.success("삭제"); await refreshInstallments();
              } catch (e) { toast.error((e as Error).message); }
            }}
            onPatch={async (id, body) => {
              try { await callApi(`/billing/installments/${id}`, { method: "PATCH", body: JSON.stringify(body) });
                await refreshInstallments();
              } catch (e) { toast.error((e as Error).message); }
            }}
          />
        </TabsContent>

        {/* ── 환경 탭 ─────────────────────────── */}
        <TabsContent value="settings" className="space-y-4 mt-4">
          <SettingsView
            data={settings}
            onSave={async (body) => {
              try { await callApi("/billing/settings", { method: "PUT", body: JSON.stringify(body) });
                toast.success("부과환경 갱신 — 새 버전"); await refreshSettings();
              } catch (e) { toast.error((e as Error).message); }
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── 총괄표 뷰 ────────────────────────────────────────────────
function MatrixView({ run, lines, onOverride, onFinalize }: {
  run: Run; lines: Line[];
  onOverride: (id: number, amount: number, reason: string) => Promise<void>;
  onFinalize: () => Promise<void>;
}) {
  const meterTypes = useMemo(() => {
    const s = new Set<string>();
    for (const l of lines) for (const k of Object.keys(l.meterCharges ?? {})) s.add(k);
    return Array.from(s);
  }, [lines]);

  const total = lines.reduce((s, l) => s + l.totalAmount, 0);

  const exportCsv = () => {
    const head = ["호실", "면적", "비율%", "공용관리", ...meterTypes.map(m => `검침-${m}`), "수선적립", "분할부과", "합계"];
    const rows = lines.map(l => [
      l.unitNumber, l.area, l.areaRatio,
      l.commonCharge,
      ...meterTypes.map(m => l.meterCharges[m]?.amount ?? 0),
      l.repairReserve, l.installmentCharge, l.totalAmount,
    ].join(","));
    const blob = new Blob(["\uFEFF" + [head.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `billing_${run.billingMonth}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle>{run.billingMonth} 총괄표</CardTitle>
            <CardDescription>합계 {krw(total)} · 호실 {lines.length}개 · v{run.settingsVersion}</CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge variant={run.status === "finalized" ? "default" : "secondary"}>
              {run.status === "finalized" ? "확정" : "초안"}
            </Badge>
            <Button size="sm" variant="outline" onClick={exportCsv}>CSV</Button>
            {run.status === "draft" && <Button size="sm" onClick={onFinalize}>확정</Button>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>호실</TableHead>
              <TableHead className="text-right">면적</TableHead>
              <TableHead className="text-right">비율</TableHead>
              <TableHead className="text-right">공용관리</TableHead>
              {meterTypes.map(m => <TableHead key={m} className="text-right">{m}</TableHead>)}
              <TableHead className="text-right">수선적립</TableHead>
              <TableHead className="text-right">분할부과</TableHead>
              <TableHead className="text-right font-bold">합계</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map(l => (
              <TableRow key={l.id}>
                <TableCell className="font-medium">{l.unitNumber}</TableCell>
                <TableCell className="text-right">{l.area}㎡</TableCell>
                <TableCell className="text-right">{l.areaRatio.toFixed(2)}%</TableCell>
                <TableCell className="text-right">{krw(l.commonCharge)}</TableCell>
                {meterTypes.map(m => (
                  <TableCell key={m} className="text-right text-sm">
                    {l.meterCharges[m] ? krw(l.meterCharges[m].amount) : "—"}
                  </TableCell>
                ))}
                <TableCell className="text-right">{krw(l.repairReserve)}</TableCell>
                <TableCell className="text-right">{krw(l.installmentCharge)}</TableCell>
                <TableCell className="text-right font-bold">
                  {krw(l.totalAmount)}
                  {l.manualOverride != null && <Badge variant="outline" className="ml-1 text-xs">보정</Badge>}
                </TableCell>
                <TableCell>
                  {run.status === "draft" && <OverrideDialog line={l} onOverride={onOverride} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function OverrideDialog({ line, onOverride }: { line: Line; onOverride: (id: number, amount: number, reason: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(line.totalAmount));
  const [reason, setReason] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="ghost">보정</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{line.unitNumber}호 보정</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>새 부과액</Label><Input type="number" value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <div><Label>사유</Label><Textarea value={reason} onChange={e => setReason(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button onClick={async () => {
            if (!reason.trim()) return;
            await onOverride(line.id, Number(amount), reason);
            setOpen(false);
          }}>적용</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 조정 뷰 ─────────────────────────────────────────────────
function AdjustmentsView({ run, lines, adjustments, onCreate }: {
  run: Run; lines: Line[]; adjustments: Adjustment[];
  onCreate: (body: { unitId: number; adjustmentType: string; amount: number; reason: string; reasonChip?: string }) => Promise<void>;
}) {
  const [unitId, setUnitId] = useState<string>("");
  const [type, setType] = useState<"discount" | "refund" | "rebill" | "writeoff">("discount");
  const [amount, setAmount] = useState("");
  const [chip, setChip] = useState("");
  const [reason, setReason] = useState("");
  const total = adjustments.reduce((s, a) => s + a.amount, 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>{run.billingMonth} 조정명세서</CardTitle>
          <CardDescription>확정 후 변경은 라인 직접 수정 대신 조정으로 누적합니다. 누계 {krw(total)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Select value={unitId} onValueChange={setUnitId}>
              <SelectTrigger><SelectValue placeholder="호실 선택" /></SelectTrigger>
              <SelectContent>
                {lines.map(l => <SelectItem key={l.id} value={String(l.unitId)}>{l.unitNumber}호 ({krw(l.totalAmount)})</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={type} onValueChange={v => setType(v as typeof type)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(TYPE_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="number" placeholder="금액" value={amount} onChange={e => setAmount(e.target.value)} />
            <Select value={chip} onValueChange={setChip}>
              <SelectTrigger><SelectValue placeholder="사유 칩" /></SelectTrigger>
              <SelectContent>
                {REASON_CHIPS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Textarea placeholder="상세 사유" value={reason} onChange={e => setReason(e.target.value)} />
          <Button onClick={async () => {
            if (!unitId || !amount || !reason.trim()) return;
            await onCreate({
              unitId: Number(unitId),
              adjustmentType: type,
              amount: Number(amount),
              reason,
              reasonChip: chip || undefined,
            });
            setAmount(""); setReason(""); setChip("");
          }}>
            <Plus className="w-4 h-4 mr-1.5" />조정 등록
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>이력</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>일자</TableHead><TableHead>호실</TableHead><TableHead>구분</TableHead>
                <TableHead>사유</TableHead><TableHead className="text-right">금액</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {adjustments.map(a => (
                <TableRow key={a.id}>
                  <TableCell>{a.appliedAt ?? a.createdAt.slice(0, 10)}</TableCell>
                  <TableCell>{a.unitNumber}호</TableCell>
                  <TableCell><Badge variant="outline">{TYPE_LABEL[a.adjustmentType]}</Badge></TableCell>
                  <TableCell>
                    {a.reasonChip && <Badge className="mr-1">{a.reasonChip}</Badge>}
                    <span className="text-sm">{a.reason}</span>
                  </TableCell>
                  <TableCell className={`text-right font-medium ${a.amount < 0 ? "text-destructive" : ""}`}>
                    {a.amount < 0 ? "-" : "+"}{krw(Math.abs(a.amount))}
                  </TableCell>
                </TableRow>
              ))}
              {adjustments.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">조정 없음</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ── 분할부과 뷰 ─────────────────────────────────────────────
function InstallmentsView({ installments, onCreate, onDelete, onPatch }: {
  installments: Installment[];
  onCreate: (body: { title: string; totalAmount: number; amortizationMonths: number; startMonth: string; category: string; allocationKey: string; notes?: string }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onPatch: (id: number, body: { status?: "active" | "paused" | "closed"; notes?: string }) => Promise<void>;
}) {
  const today = new Date();
  const [title, setTitle] = useState("");
  const [total, setTotal] = useState("");
  const [months, setMonths] = useState("12");
  const [startMonth, setStartMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
  const [category, setCategory] = useState("repair");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>분할부과 등록 (T4 ledger)</CardTitle>
          <CardDescription>거액 1회 지출을 N개월로 나눠 매월 부과합니다. T6 지출결의서와 자동 연결될 자리.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <Input placeholder="제목 (예: 옥상 방수)" value={title} onChange={e => setTitle(e.target.value)} />
            <Input type="number" placeholder="총액(원)" value={total} onChange={e => setTotal(e.target.value)} />
            <Input type="number" placeholder="분할 개월수" value={months} onChange={e => setMonths(e.target.value)} />
            <Input type="month" value={startMonth} onChange={e => setStartMonth(e.target.value)} />
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="repair">수선</SelectItem>
                <SelectItem value="long_term">장기수선</SelectItem>
                <SelectItem value="other">기타</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={async () => {
            if (!title || !total || !months) return;
            await onCreate({
              title, totalAmount: Number(total), amortizationMonths: Number(months),
              startMonth, category, allocationKey: "area",
            });
            setTitle(""); setTotal("");
          }}><Plus className="w-4 h-4 mr-1.5" />등록</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>현재 ledger</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>제목</TableHead><TableHead>기간</TableHead>
                <TableHead className="text-right">총액</TableHead><TableHead className="text-right">월액</TableHead>
                <TableHead>상태</TableHead><TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {installments.map(i => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.title}</TableCell>
                  <TableCell className="text-sm">{i.startMonth} ~ {i.endMonth}</TableCell>
                  <TableCell className="text-right">{krw(i.totalAmount)}</TableCell>
                  <TableCell className="text-right font-semibold">{krw(i.monthlyAmount)}</TableCell>
                  <TableCell>
                    <Select value={i.status} onValueChange={v => onPatch(i.id, { status: v as "active" | "paused" | "closed" })}>
                      <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">진행</SelectItem>
                        <SelectItem value="paused">일시중지</SelectItem>
                        <SelectItem value="closed">종료</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => onDelete(i.id)}><Trash2 className="w-4 h-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {installments.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">등록된 분할부과 없음</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// ── 환경 뷰 ─────────────────────────────────────────────────
function SettingsView({ data, onSave }: {
  data: SettingsResp | null;
  onSave: (body: { areaBasis: "supply" | "exclusive"; repairReserveUnitPrice: number; meterUnitPrices: Record<string, number>; otherUnitPrices: Record<string, number>; allocationRules: Record<string, "area" | "unit_count" | "usage"> }) => Promise<void>;
}) {
  const seed = data?.active ?? data?.aiSuggested;
  const [areaBasis, setAreaBasis] = useState<"supply" | "exclusive">(seed?.areaBasis ?? "supply");
  const [repair, setRepair] = useState<string>(String(seed?.repairReserveUnitPrice ?? 350));
  const [water, setWater] = useState<string>(String(seed?.meterUnitPrices?.water ?? 850));
  const [elec, setElec] = useState<string>(String(seed?.meterUnitPrices?.electricity ?? 130));
  const [gas, setGas] = useState<string>(String(seed?.meterUnitPrices?.gas ?? 1100));
  const [heat, setHeat] = useState<string>(String(seed?.meterUnitPrices?.heating ?? 90));

  useEffect(() => {
    if (!seed) return;
    setAreaBasis(seed.areaBasis);
    setRepair(String(seed.repairReserveUnitPrice));
    setWater(String(seed.meterUnitPrices?.water ?? 850));
    setElec(String(seed.meterUnitPrices?.electricity ?? 130));
    setGas(String(seed.meterUnitPrices?.gas ?? 1100));
    setHeat(String(seed.meterUnitPrices?.heating ?? 90));
  }, [data?.active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card>
      <CardHeader>
        <CardTitle>부과환경 v{data?.active?.version ?? "—"}</CardTitle>
        <CardDescription>저장 시 새 버전이 발급되고, 신규 산출부터 적용됩니다.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>면적기준</Label>
            <Select value={areaBasis} onValueChange={v => setAreaBasis(v as "supply" | "exclusive")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="supply">공급면적</SelectItem>
                <SelectItem value="exclusive">전용면적</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>수선적립금 ㎡당 단가(원)</Label>
            <Input type="number" value={repair} onChange={e => setRepair(e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label>수도(원/㎥)</Label><Input type="number" value={water} onChange={e => setWater(e.target.value)} /></div>
          <div><Label>전기(원/kWh)</Label><Input type="number" value={elec} onChange={e => setElec(e.target.value)} /></div>
          <div><Label>가스(원/㎥)</Label><Input type="number" value={gas} onChange={e => setGas(e.target.value)} /></div>
          <div><Label>난방(원/단위)</Label><Input type="number" value={heat} onChange={e => setHeat(e.target.value)} /></div>
        </div>
        <Button onClick={() => onSave({
          areaBasis,
          repairReserveUnitPrice: Number(repair),
          meterUnitPrices: { water: Number(water), electricity: Number(elec), gas: Number(gas), heating: Number(heat) },
          otherUnitPrices: data?.active?.otherUnitPrices ?? {},
          allocationRules: data?.active?.allocationRules ?? { commonMaintenance: "area", repairReserve: "area", installment: "area", meter: "usage" },
        })}>저장 → 새 버전</Button>
        {data?.aiSuggested && (
          <Alert>
            <AlertDescription>
              <span className="font-medium">AI 추천(동종 본사 평균):</span>{" "}
              수선적립 ₩{data.aiSuggested.repairReserveUnitPrice}/㎡ · 수도 ₩{data.aiSuggested.meterUnitPrices.water}/㎥ · 전기 ₩{data.aiSuggested.meterUnitPrices.electricity}/kWh
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
