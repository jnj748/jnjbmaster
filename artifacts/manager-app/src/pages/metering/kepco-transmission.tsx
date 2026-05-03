// [Task #798] 한전 송신 페이지 — AI 자동집계 우선. 검침값에서 월·건물 합계를
//   자동으로 모아서 송신 초안을 만들고, 한 번 더 확인 후 송신(모의)한다.
//   수기 그리드 입력은 두지 않고, 필요한 경우만 노출되는 보조 폼만 둔다.
import { useMemo, useState } from "react";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useListBuildings,
  useListKepcoTransmissions,
  useCreateKepcoTransmission,
  useSendKepcoTransmission,
  useListMeterReadings,
  type KepcoTransmission,
} from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, Send, CheckCircle2, AlertCircle, Zap, History } from "lucide-react";

function todayStr(): string { return new Date().toISOString().slice(0, 10); }
function thisMonth(): string { return new Date().toISOString().slice(0, 7); }

export default function KepcoTransmissionPage() {
  const { user } = useAuth();
  const readOnly = user?.role === "hq_executive";
  const { toast } = useToast();
  const qc = useQueryClient();

  const buildingsQuery = useListBuildings();
  const buildings = buildingsQuery.data ?? [];

  const [buildingId, setBuildingId] = useState<number | null>(null);
  const [billingMonth, setBillingMonth] = useState<string>(thisMonth());
  const [readingDate, setReadingDate] = useState<string>(todayStr());
  const [workerName, setWorkerName] = useState<string>(user?.name ?? "");

  // 첫 건물 자동 선택.
  if (buildingId == null && buildings.length > 0) {
    setBuildingId(buildings[0].id);
  }

  // AI 자동집계: 해당 월 전기 검침 합계 미리보기.
  const monthStart = `${billingMonth}-01`;
  const monthEnd = `${billingMonth}-31`;
  const meterQuery = useListMeterReadings(
    { meterType: "electricity", from: monthStart, to: monthEnd, limit: 500 },
    { query: { enabled: !!buildingId } },
  );
  const meterRows = meterQuery.data ?? [];
  const aggregated = useMemo(() => {
    let total = 0; let count = 0;
    for (const r of meterRows) {
      if (buildingId && r.buildingId !== buildingId) continue;
      const u = Number(r.usage ?? 0);
      if (Number.isFinite(u)) { total += u; count += 1; }
    }
    return { total, count };
  }, [meterRows, buildingId]);

  const logsQuery = useListKepcoTransmissions(
    buildingId ? { buildingId } : undefined,
    { query: { enabled: !!buildingId } },
  );
  const logs = logsQuery.data ?? [];
  const monthLog = logs.find((l) => l.billingMonth === billingMonth) ?? null;

  const createMut = useCreateKepcoTransmission({
    mutation: {
      onSuccess: () => {
        toast({ title: "송신 초안이 생성되었습니다", description: "AI가 검침값에서 자동 집계했습니다" });
        qc.invalidateQueries({ queryKey: [`/api/kepco-transmissions`] });
      },
      onError: (e: Error) => toast({ title: "초안 생성 실패", description: e.message, variant: "destructive" }),
    },
  });
  const sendMut = useSendKepcoTransmission({
    mutation: {
      onSuccess: () => {
        toast({ title: "한전으로 송신되었습니다", description: "외부 EMS 응답을 기다리는 중 (모의)" });
        qc.invalidateQueries({ queryKey: [`/api/kepco-transmissions`] });
      },
      onError: (e: Error) => toast({ title: "송신 실패", description: e.message, variant: "destructive" }),
    },
  });

  const onAggregate = () => {
    if (!buildingId) return;
    createMut.mutate({
      data: {
        buildingId,
        billingMonth,
        readingDate,
        workerName: workerName || undefined,
      },
    });
  };

  const onSend = (id: number) => {
    if (!window.confirm("이 송신 건을 한전으로 보냅니다. 진행하시겠습니까?")) return;
    sendMut.mutate({ id });
  };

  const statusBadge = (s: KepcoTransmission["status"]) => {
    if (s === "transmitted") return <Badge className="bg-emerald-500"><CheckCircle2 className="h-3 w-3 mr-1" />송신완료</Badge>;
    if (s === "failed") return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />실패</Badge>;
    return <Badge variant="secondary">초안</Badge>;
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <div className="flex items-center gap-2">
        <Zap className="h-6 w-6 text-yellow-500" />
        <h1 className="text-2xl font-semibold">한전 송신</h1>
        {readOnly && <Badge variant="outline">조회 전용</Badge>}
      </div>
      <p className="text-sm text-muted-foreground">
        검침값에서 자동 집계해 한전으로 송신합니다. 수기 입력은 사용하지 않으며,
        AI가 모은 합계를 검토 후 한 번에 보냅니다.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-violet-500" /> AI 자동집계 → 송신
          </CardTitle>
          <CardDescription>건물·월·검침일을 고르면, 해당 월 전기 검침값을 자동으로 모아 초안을 만듭니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <Label className="text-xs">건물</Label>
              <Select value={buildingId ? String(buildingId) : ""} onValueChange={(v) => setBuildingId(Number(v))}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="건물 선택" /></SelectTrigger>
                <SelectContent>
                  {buildings.map((b) => (
                    <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">부과월</Label>
              <Input type="month" value={billingMonth} onChange={(e) => setBillingMonth(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">검침일</Label>
              <Input type="date" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">검침자</Label>
              <Input value={workerName} onChange={(e) => setWorkerName(e.target.value)} placeholder="예: 김관리" className="mt-1" />
            </div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-4 grid gap-3 md:grid-cols-3">
            <div>
              <div className="text-xs text-muted-foreground">집계된 검침 행</div>
              <div className="text-2xl font-semibold">{aggregated.count.toLocaleString()}건</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">합산 사용량</div>
              <div className="text-2xl font-semibold">{aggregated.total.toLocaleString()} kWh</div>
            </div>
            <div className="flex items-end">
              {monthLog ? (
                <Badge variant="outline" className="text-xs">이번 달 송신 기록 있음 ({monthLog.status})</Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">송신 기록 없음</Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={onAggregate}
              disabled={readOnly || !buildingId || createMut.isPending}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              AI 자동집계 → 초안 생성
            </Button>
            <span className="text-xs text-muted-foreground self-center">
              초안 생성 후 아래 목록에서 ‘송신’ 버튼으로 한전에 전송합니다.
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5" /> 송신 이력
          </CardTitle>
          <CardDescription>건물 기준 최근 송신 내역. 초안은 ‘송신’ 버튼으로 한전에 보낼 수 있습니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">송신 이력이 없습니다.</div>
          ) : (
            <div className="space-y-2">
              {logs.map((l) => (
                <div key={l.id} className="rounded-lg border p-3 flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">{l.billingMonth}</span>
                      <span className="text-muted-foreground">검침일 {l.readingDate}</span>
                      {statusBadge(l.status)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      합산 {l.totalUsage ?? "-"} kWh · 미터 {l.meterCount}개
                      {l.workerName ? ` · ${l.workerName}` : ""}
                      {l.transmittedAt ? ` · 송신 ${new Date(l.transmittedAt).toLocaleString("ko-KR")}` : ""}
                    </div>
                  </div>
                  {l.status === "draft" && !readOnly && (
                    <Button size="sm" onClick={() => onSend(l.id)} disabled={sendMut.isPending} className="gap-1">
                      <Send className="h-3.5 w-3.5" /> 송신
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
