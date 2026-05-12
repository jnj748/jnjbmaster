// [Task #781] T10 외부연동 — 발송 이력 화면.
//   채널/상태/대상 칩 필터 + 실패 잡 재시도 버튼 + 마지막 에러 노출.

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

interface JobRow {
  id: number;
  buildingId: number | null;
  channel: string;
  target: string;
  status: "queued" | "sending" | "sent" | "failed" | "dead" | "cancelled";
  attempts: number;
  maxAttempts: number;
  scheduledAt: string;
  lastError: string | null;
  providerMessageId: string | null;
  triggerSource: string | null;
  relatedMonth: string | null;
  relatedEntityType: string | null;
  relatedEntityId: number | null;
  createdAt: string;
}

const CHANNELS = ["aligo_kakao", "aligo_lms", "aligo_sms", "openbanking", "nts_verify", "pg", "kyc"] as const;
const STATUSES = ["queued", "sending", "sent", "failed", "dead", "cancelled"] as const;

const STATUS_LABEL: Record<string, string> = {
  queued: "대기", sending: "발송중", sent: "성공", failed: "실패", dead: "최종실패", cancelled: "취소",
};
const CHANNEL_LABEL: Record<string, string> = {
  aligo_kakao: "알림톡",
  aligo_lms: "LMS",
  aligo_sms: "SMS",
  openbanking: "오픈뱅킹(예약)", nts_verify: "국세청(예약)", pg: "PG(예약)", kyc: "KYC(예약)",
};

export default function DispatchHistoryPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [channels, setChannels] = useState<Set<string>>(new Set());
  const [statuses, setStatuses] = useState<Set<string>>(new Set());

  const fetchRows = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      for (const c of channels) params.append("channel", c);
      for (const s of statuses) params.append("status", s);
      params.set("limit", "200");
      const r = await fetch(`${API_BASE}/dispatch/jobs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setRows(data.rows ?? []);
    } catch (e) {
      toast({ title: "이력 조회 실패", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRows(); }, [token, channels, statuses]);

  const retry = async (id: number) => {
    if (!token) return;
    try {
      const r = await fetch(`${API_BASE}/dispatch/jobs/${id}/retry`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(await r.text());
      toast({ title: "재시도 큐에 등록되었습니다" });
      fetchRows();
    } catch (e) {
      toast({ title: "재시도 실패", description: (e as Error).message, variant: "destructive" });
    }
  };

  const toggle = (set: Set<string>, v: string, setFn: (s: Set<string>) => void) => {
    const n = new Set(set);
    n.has(v) ? n.delete(v) : n.add(v);
    setFn(n);
  };

  const stats = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">발송 이력</h1>
        <div className="text-sm text-muted-foreground">
          성공 {stats.sent ?? 0} · 실패 {(stats.failed ?? 0) + (stats.dead ?? 0)} · 대기 {stats.queued ?? 0} · 진행 {stats.sending ?? 0}
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">필터</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center mr-1">채널</span>
            {CHANNELS.map((c) => (
              <Badge key={c} variant={channels.has(c) ? "default" : "outline"} className="cursor-pointer"
                     onClick={() => toggle(channels, c, setChannels)}>
                {CHANNEL_LABEL[c]}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground self-center mr-1">상태</span>
            {STATUSES.map((s) => (
              <Badge key={s} variant={statuses.has(s) ? "default" : "outline"} className="cursor-pointer"
                     onClick={() => toggle(statuses, s, setStatuses)}>
                {STATUS_LABEL[s]}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{loading ? "불러오는 중..." : `총 ${rows.length}건`}</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="border rounded p-3 flex items-start justify-between gap-3">
                <div className="space-y-1 text-sm">
                  <div className="flex flex-wrap gap-2 items-center">
                    <Badge variant="secondary">#{row.id}</Badge>
                    <Badge>{CHANNEL_LABEL[row.channel] ?? row.channel}</Badge>
                    <Badge variant={row.status === "sent" ? "default" : (row.status === "failed" || row.status === "dead") ? "destructive" : "outline"}>
                      {STATUS_LABEL[row.status] ?? row.status}
                    </Badge>
                    {row.relatedMonth && <Badge variant="outline">월 {row.relatedMonth}</Badge>}
                    {row.triggerSource && <span className="text-xs text-muted-foreground">{row.triggerSource}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    대상 <span className="font-mono">{row.target}</span> · 시도 {row.attempts}/{row.maxAttempts} · 예약 {new Date(row.scheduledAt).toLocaleString("ko-KR")}
                  </div>
                  {row.lastError && (
                    <div className="text-xs text-destructive break-all">에러: {row.lastError}</div>
                  )}
                  {row.providerMessageId && (
                    <div className="text-xs text-muted-foreground">provider id: {row.providerMessageId}</div>
                  )}
                </div>
                <div className="shrink-0">
                  {(row.status === "failed" || row.status === "dead") && (
                    <Button size="sm" variant="outline" onClick={() => retry(row.id)}>재시도</Button>
                  )}
                </div>
              </div>
            ))}
            {!loading && rows.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-8">조회된 발송 이력이 없습니다.</div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
