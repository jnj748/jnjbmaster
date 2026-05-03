// [Task #800] /receivables/dunning — 독촉장 대장 + 차수별 일괄 생성/발송.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ReceivablesShell, useApi, krw, Empty, StatCard, STATUS_BADGE, type DunningRow } from "./_shared";
import { Send, Sparkles, Plus, X } from "lucide-react";

const STAGE_LABEL: Record<number, string> = { 1: "1차 안내", 2: "2차 독촉", 3: "최종 통보" };

export default function ReceivablesDunningPage() {
  const api = useApi();
  const { toast } = useToast();
  const [rows, setRows] = useState<DunningRow[]>([]);
  const [filter, setFilter] = useState<"all" | "1" | "2" | "3">("all");
  const [batch, setBatch] = useState<{ stage: number; channel: "post" | "sms" | "kakao" | "email"; minOverdueDays: number; bodyTemplate: string } | null>(null);
  const [preview, setPreview] = useState<DunningRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const q = filter === "all" ? "" : `?stage=${filter}`;
    setRows(await api<DunningRow[]>("GET", `/receivables/dunning${q}`));
  };
  useEffect(() => { void load(); }, [filter]);

  const runBatch = async () => {
    if (!batch) return;
    setBusy(true);
    try {
      const r = await api<{ batchId: string | null; created: number }>("POST", "/receivables/dunning/batch", batch);
      toast({ title: `${r.created}건 생성`, description: r.batchId ? `배치 ${r.batchId}` : "대상 호실이 없습니다." });
      setBatch(null);
      await load();
    } catch (e) { toast({ title: "실패", description: String(e), variant: "destructive" }); }
    finally { setBusy(false); }
  };

  const send = async (id: number) => {
    try {
      await api("POST", `/receivables/dunning/${id}/send`);
      toast({ title: "발송 처리" });
      await load();
    } catch (e) { toast({ title: "발송 실패", description: String(e), variant: "destructive" }); }
  };
  const cancel = async (id: number) => {
    try {
      await api("POST", `/receivables/dunning/${id}/cancel`);
      toast({ title: "취소" });
      await load();
    } catch (e) { toast({ title: "실패", description: String(e), variant: "destructive" }); }
  };

  const counts = {
    all: rows.length,
    draft: rows.filter(r => r.status === "draft").length,
    sent: rows.filter(r => r.status === "sent" || r.status === "delivered").length,
  };

  return (
    <ReceivablesShell title="독촉장 대장" description="차수별(1차/2차/최종) 일괄 생성·발송. AI가 본문 초안 작성."
      action={<Button onClick={() => setBatch({ stage: 1, channel: "post", minOverdueDays: 30, bodyTemplate: "" })} data-testid="btn-new-batch">
        <Plus className="w-4 h-4 mr-1" />차수별 일괄 생성
      </Button>}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard title="총 발행" value={`${counts.all}`} />
        <StatCard title="초안" value={`${counts.draft}`} tone="warn" />
        <StatCard title="발송" value={`${counts.sent}`} tone="ok" />
        <StatCard title="발송 비율" value={counts.all ? `${Math.round(counts.sent / counts.all * 100)}%` : "—"} />
      </div>

      <div className="mb-3 flex gap-2">
        {(["all", "1", "2", "3"] as const).map(f => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}
            data-testid={`filter-${f}`}
          >
            {f === "all" ? "전체" : STAGE_LABEL[Number(f)]}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Send className="w-4 h-4" />독촉장 ({rows.length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? <Empty message="발행된 독촉장이 없습니다. 우상단 '차수별 일괄 생성'으로 시작하세요." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left">
                    <th className="px-3 py-2">호실</th>
                    <th className="px-3 py-2">차수</th>
                    <th className="px-3 py-2">채널</th>
                    <th className="px-3 py-2">수신</th>
                    <th className="px-3 py-2 text-right">미납</th>
                    <th className="px-3 py-2 text-right">연체이자</th>
                    <th className="px-3 py-2">상태</th>
                    <th className="px-3 py-2">발송</th>
                    <th className="px-3 py-2 text-right">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(d => (
                    <tr key={d.id} className="border-t" data-testid={`row-dun-${d.id}`}>
                      <td className="px-3 py-2 font-medium">{d.unitNumber}</td>
                      <td className="px-3 py-2"><Badge variant="outline">{STAGE_LABEL[d.stage]}</Badge></td>
                      <td className="px-3 py-2">{d.channel}</td>
                      <td className="px-3 py-2">{d.recipientName ?? "—"}<div className="text-xs text-muted-foreground">{d.recipientContact ?? ""}</div></td>
                      <td className="px-3 py-2 text-right tabular-nums">{krw(d.overdueAmount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{krw(d.lateFeeAmount)}</td>
                      <td className="px-3 py-2"><Badge className={STATUS_BADGE[d.status] ?? ""}>{d.status}</Badge></td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{d.sentAt ? d.sentAt.slice(0, 16).replace("T", " ") : "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => setPreview(d)}>본문</Button>
                        {(d.status === "draft" || d.status === "queued") && (
                          <>
                            <Button size="sm" variant="default" onClick={() => send(d.id)} data-testid={`btn-send-${d.id}`}>발송</Button>
                            <Button size="sm" variant="ghost" onClick={() => cancel(d.id)}><X className="w-3 h-3" /></Button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 일괄 생성 시트 */}
      <Sheet open={!!batch} onOpenChange={(o) => !o && setBatch(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>차수별 일괄 생성</SheetTitle></SheetHeader>
          {batch && (
            <div className="space-y-3 mt-4">
              <div>
                <Label className="text-xs">차수</Label>
                <Select value={String(batch.stage)} onValueChange={(v) => setBatch({ ...batch, stage: Number(v) })}>
                  <SelectTrigger data-testid="sel-stage"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1차 안내</SelectItem>
                    <SelectItem value="2">2차 독촉</SelectItem>
                    <SelectItem value="3">최종 통보</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">채널</Label>
                <Select value={batch.channel} onValueChange={(v) => setBatch({ ...batch, channel: v as typeof batch.channel })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="post">우편</SelectItem>
                    <SelectItem value="sms">문자</SelectItem>
                    <SelectItem value="kakao">카카오</SelectItem>
                    <SelectItem value="email">이메일</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">최소 연체일</Label>
                <Input type="number" value={batch.minOverdueDays} onChange={(e) => setBatch({ ...batch, minOverdueDays: Number(e.target.value) || 0 })} data-testid="in-min-days" />
              </div>
              <div>
                <Label className="text-xs flex items-center gap-1"><Sparkles className="w-3 h-3" />본문 템플릿 (비우면 AI 기본 문구 사용)</Label>
                <Textarea rows={6} placeholder="{unit}호 미납액 {amount}원 연체 {days}일 …" value={batch.bodyTemplate} onChange={(e) => setBatch({ ...batch, bodyTemplate: e.target.value })} />
                <div className="text-xs text-muted-foreground mt-1">치환 변수: {"{unit}"}, {"{amount}"}, {"{days}"}</div>
              </div>
              <Button onClick={runBatch} disabled={busy} className="w-full" data-testid="btn-run-batch">
                <Send className="w-4 h-4 mr-1" />일괄 생성 (초안 상태)
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* 본문 미리보기 시트 */}
      <Sheet open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader><SheetTitle>{preview?.unitNumber}호 · {preview && STAGE_LABEL[preview.stage]}</SheetTitle></SheetHeader>
          {preview && (
            <div className="mt-4 space-y-3 text-sm">
              <div className="bg-muted/50 p-3 rounded text-xs space-y-1">
                <div>채널: <strong>{preview.channel}</strong></div>
                <div>수신: {preview.recipientName ?? "—"} {preview.recipientContact ? `(${preview.recipientContact})` : ""}</div>
                <div>미납액: <strong>{krw(preview.overdueAmount)}</strong> + 연체이자 {krw(preview.lateFeeAmount)}</div>
              </div>
              <pre className="whitespace-pre-wrap text-sm bg-card border rounded p-3">{preview.bodyText}</pre>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </ReceivablesShell>
  );
}
