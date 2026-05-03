// [Task #799] /billing/months — 부과월 카드 + 단계 워크플로 (생성→산출→고지→마감).
//
// 한 행 = 한 부과월. 카드형 그리드로 stage 배지 + advance/reopen 버튼.
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { BillingShell, useApi, Empty, currentMonth, STAGE_LABELS, STAGE_COLORS, type BillingMonthRow } from "./_shared";
import { Plus, ChevronRight, RotateCcw, Printer } from "lucide-react";

const blank = (): Partial<BillingMonthRow> => ({
  billingMonth: currentMonth(), periodStart: null, periodEnd: null,
  dueDate: null, noticeFormat: "integrated", autoClose: false, autoDebitEnabled: false,
});

const NEXT_STAGE: Record<BillingMonthRow["stage"], BillingMonthRow["stage"] | null> = {
  created: "calculated", calculated: "noticed", noticed: "closed", closed: null,
};

export default function BillingMonthsPage() {
  const api = useApi();
  const { toast } = useToast();
  const [rows, setRows] = useState<BillingMonthRow[]>([]);
  const [editing, setEditing] = useState<Partial<BillingMonthRow> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => setRows(await api<BillingMonthRow[]>("GET", "/billing-months"));
  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!editing) return;
    if (!editing.billingMonth || !/^\d{4}-\d{2}$/.test(editing.billingMonth)) {
      toast({ title: "부과월(YYYY-MM) 필수" }); return;
    }
    setBusy(true);
    try {
      if (editing.id) await api("PATCH", `/billing-months/${editing.id}`, editing);
      else await api("POST", "/billing-months", editing);
      toast({ title: "저장 완료" });
      setEditing(null); await load();
    } catch (e) { toast({ title: "저장 실패", description: String(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const advance = async (r: BillingMonthRow) => {
    const next = NEXT_STAGE[r.stage];
    if (!next) return;
    await api("POST", `/billing-months/${r.id}/advance`, { stage: next });
    toast({ title: `${STAGE_LABELS[next]} 단계로 전환` });
    await load();
  };

  const reopen = async (r: BillingMonthRow) => {
    const reason = prompt("재개방 사유를 입력하세요");
    if (!reason || reason.length < 2) return;
    await api("POST", `/billing-months/${r.id}/reopen`, { reason });
    toast({ title: "재개방 완료" });
    await load();
  };

  const printRequest = async (r: BillingMonthRow) => {
    await api("POST", `/billing-months/${r.id}/print-request`);
    toast({ title: "출력 의뢰 기록됨" });
    await load();
  };

  return (
    <BillingShell title="부과월 카드" description="월 단위 부과 사이클 — 생성·산출·고지·마감 4단계 워크플로"
      action={<Button onClick={() => setEditing(blank())} data-testid="btn-new"><Plus className="w-4 h-4 mr-1" />부과월 생성</Button>}
    >
      {rows.length === 0 ? (
        <Empty message="등록된 부과월이 없습니다." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map(r => (
            <Card key={r.id} className="cursor-pointer hover:shadow-md transition" onClick={() => setEditing(r)} data-testid={`month-card-${r.billingMonth}`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{r.billingMonth}</CardTitle>
                  <Badge className={STAGE_COLORS[r.stage]}>{STAGE_LABELS[r.stage]}</Badge>
                </div>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-1.5">
                <div>기간: {r.periodStart ?? "—"} ~ {r.periodEnd ?? "—"}</div>
                <div>납부 마감: {r.dueDate ?? "—"}</div>
                {r.noticeIssuedAt && <div>고지 발행: {r.noticeIssuedAt.slice(0, 10)}</div>}
                {r.closedAt && <div>마감: {r.closedAt.slice(0, 10)}</div>}
                <div className="flex gap-2 pt-2" onClick={(e) => e.stopPropagation()}>
                  {NEXT_STAGE[r.stage] && (
                    <Button size="sm" onClick={() => advance(r)} data-testid={`btn-advance-${r.billingMonth}`}>
                      <ChevronRight className="w-3 h-3 mr-1" />{STAGE_LABELS[NEXT_STAGE[r.stage]!]}
                    </Button>
                  )}
                  {r.stage === "closed" && (
                    <Button size="sm" variant="outline" onClick={() => reopen(r)}>
                      <RotateCcw className="w-3 h-3 mr-1" />재개방
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => printRequest(r)}>
                    <Printer className="w-3 h-3 mr-1" />출력 의뢰
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{editing?.id ? `부과월 ${editing.billingMonth}` : "새 부과월"}</SheetTitle></SheetHeader>
          {editing && (
            <div className="space-y-3 mt-4">
              <Field label="부과월 (YYYY-MM)"><Input value={editing.billingMonth ?? ""} onChange={(e) => setEditing({ ...editing, billingMonth: e.target.value })} placeholder="2026-05" data-testid="in-month" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="산출 시작일"><Input type="date" value={editing.periodStart ?? ""} onChange={(e) => setEditing({ ...editing, periodStart: e.target.value || null })} /></Field>
                <Field label="산출 종료일"><Input type="date" value={editing.periodEnd ?? ""} onChange={(e) => setEditing({ ...editing, periodEnd: e.target.value || null })} /></Field>
              </div>
              <Field label="납부 마감일"><Input type="date" value={editing.dueDate ?? ""} onChange={(e) => setEditing({ ...editing, dueDate: e.target.value || null })} /></Field>
              <ToggleRow label="자동 마감" v={!!editing.autoClose} on={(v) => setEditing({ ...editing, autoClose: v })} />
              <ToggleRow label="자동이체 사용" v={!!editing.autoDebitEnabled} on={(v) => setEditing({ ...editing, autoDebitEnabled: v })} />
              <Button onClick={save} disabled={busy} className="w-full" data-testid="btn-save">저장</Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </BillingShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs">{label}</Label>{children}</div>;
}
function ToggleRow({ label, v, on }: { label: string; v: boolean; on: (v: boolean) => void }) {
  return <div className="flex items-center justify-between"><Label>{label}</Label><Switch checked={v} onCheckedChange={on} /></div>;
}
