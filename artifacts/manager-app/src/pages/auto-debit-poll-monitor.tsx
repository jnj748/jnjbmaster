// [Task #833] 자동이체 폴링 잡 모니터링 — 본사 운영 화면.
//
//   - 마지막 실행 / 잡 활성 여부(PG_AUTO_DEBIT_POLL_URL) / 지연 여부 배지
//   - 24시간 요약(스캔/업데이트 누계, 오류 횟수)
//   - 최근 실행 이력 테이블

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, CheckCircle2, Clock } from "lucide-react";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

interface RunRow {
  id: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  enabled: boolean;
  scanned: number;
  updated: number;
  error: string | null;
}

interface MonitorResponse {
  config: {
    pollUrlConfigured: boolean;
    webhookSecretConfigured: boolean;
    intervalMs: number;
    staleThresholdMs: number;
  };
  status: {
    lastStartedAt: string | null;
    lastFinishedAt: string | null;
    lastEnabled: boolean | null;
    lastError: string | null;
    isStale: boolean;
  };
  summary24h: {
    total: number;
    enabled: number;
    withErrors: number;
    totalScanned: number;
    totalUpdated: number;
  };
  runs: RunRow[];
}

function formatMin(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}초`;
  if (ms < 60 * 60_000) return `${Math.round(ms / 60_000)}분`;
  return `${Math.round(ms / 3_600_000)}시간`;
}

function fmtDateTime(s: string | null): string {
  if (!s) return "-";
  const d = new Date(s);
  return d.toLocaleString("ko-KR", { hour12: false });
}

export default function AutoDebitPollMonitorPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<MonitorResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/admin/auto-debit-poll-runs?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(await r.text());
      setData(await r.json());
    } catch (e) {
      toast({ title: "조회 실패", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [token]);
  useEffect(() => {
    const t = setInterval(fetchData, 60_000);
    return () => clearInterval(t);
  }, [token]);

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">자동이체 폴링 모니터</h1>
        <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </div>

      {data && !data.config.pollUrlConfigured && (
        <Card className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="pt-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">PG 폴링 URL 미설정</p>
              <p className="text-muted-foreground">
                <code>PG_AUTO_DEBIT_POLL_URL</code> 환경변수가 설정되어 있지 않아 폴링 잡은 no-op
                상태로 동작합니다. 운영 PG 연동을 위해 환경변수를 설정하세요.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {data && data.status.isStale && data.config.pollUrlConfigured && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-destructive">폴링 잡 정지 의심</p>
              <p className="text-muted-foreground">
                마지막 실행 이후 {formatMin(data.config.staleThresholdMs)} 이상 경과했습니다.
                서버 상태를 확인하세요. (마지막 실행: {fmtDateTime(data.status.lastStartedAt)})
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">마지막 실행</CardTitle></CardHeader>
          <CardContent>
            <div className="text-sm font-mono">{fmtDateTime(data?.status.lastStartedAt ?? null)}</div>
            {data?.status.lastEnabled === true ? (
              <Badge variant="default" className="mt-1"><CheckCircle2 className="w-3 h-3 mr-1" />활성</Badge>
            ) : data?.status.lastEnabled === false ? (
              <Badge variant="outline" className="mt-1">no-op</Badge>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">폴링 주기</CardTitle></CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{data ? formatMin(data.config.intervalMs) : "-"}</div>
            <div className="text-xs text-muted-foreground">지연 임계: {data ? formatMin(data.config.staleThresholdMs) : "-"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">24시간 처리</CardTitle></CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{data?.summary24h.totalScanned ?? 0}건 스캔</div>
            <div className="text-xs text-muted-foreground">{data?.summary24h.totalUpdated ?? 0}건 업데이트</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">24시간 실행</CardTitle></CardHeader>
          <CardContent>
            <div className="text-lg font-bold">{data?.summary24h.total ?? 0}회</div>
            <div className="text-xs text-muted-foreground">
              오류 {data?.summary24h.withErrors ?? 0}회
              {data && data.config.webhookSecretConfigured ? " · webhook ✓" : " · webhook 미설정"}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">최근 실행 이력</CardTitle></CardHeader>
        <CardContent>
          {!data || data.runs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Clock className="w-6 h-6 mx-auto mb-2 opacity-40" />
              아직 실행 이력이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-3">시작 시각</th>
                    <th className="py-2 pr-3">소요</th>
                    <th className="py-2 pr-3">상태</th>
                    <th className="py-2 pr-3 text-right">스캔</th>
                    <th className="py-2 pr-3 text-right">업데이트</th>
                    <th className="py-2">에러</th>
                  </tr>
                </thead>
                <tbody>
                  {data.runs.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs">{fmtDateTime(r.startedAt)}</td>
                      <td className="py-2 pr-3 text-xs">{r.durationMs}ms</td>
                      <td className="py-2 pr-3">
                        {r.error ? (
                          <Badge variant="destructive">오류</Badge>
                        ) : r.enabled ? (
                          <Badge variant="default">활성</Badge>
                        ) : (
                          <Badge variant="outline">no-op</Badge>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">{r.scanned}</td>
                      <td className="py-2 pr-3 text-right font-mono">{r.updated}</td>
                      <td className="py-2 text-xs text-destructive truncate max-w-xs" title={r.error ?? undefined}>
                        {r.error ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
