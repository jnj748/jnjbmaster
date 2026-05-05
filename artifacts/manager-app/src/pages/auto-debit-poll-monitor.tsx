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
import { AlertTriangle, RefreshCw, CheckCircle2, Clock, Bell, Trash2, ShieldAlert } from "lucide-react";

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
    retainDays: number;
    // [Task #853] audit 테이블 자체의 보존/모니터링 설정.
    auditRetainDays: number;
    purgeStaleThresholdMs: number;
    purgeErrorWindowDays: number;
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
  lastAlertDispatch: {
    dispatchedAt: string;
    status: string;
  } | null;
  // [Task #852] 마지막 보존 정책 정리 결과. audit 테이블 기반이므로 서버 재시작
  //   후에도 유지된다. 한 번도 실행된 적 없으면 null.
  lastPurge: {
    ranAt: string;
    finishedAt: string;
    deleted: number;
    retentionDays: number;
    durationMs: number;
    error: string | null;
  } | null;
  // [Task #852] 모든 보존 정책 잡(usage_events/auto_debit_poll_runs 등)의 최근 정리 이력.
  recentPurges: Array<{
    id: number;
    jobName: string;
    startedAt: string;
    finishedAt: string;
    durationMs: number;
    retentionDays: number;
    deleted: number;
    error: string | null;
  }>;
  // [Task #853] "최근 N일간 오류 횟수" 카드용 집계.
  purgeErrors: {
    windowDays: number;
    total: number;
    byJob: Array<{
      jobName: string;
      errorCount: number;
      lastError: string | null;
      lastErrorAt: string | null;
    }>;
  };
  runs: RunRow[];
}

// [Task #852] jobName 한글 라벨. 알지 못하는 잡 이름은 그대로 노출한다.
// [Task #853] audit 테이블 자체 정리 잡 (operational_purge_runs) 라벨 추가.
const PURGE_JOB_LABELS: Record<string, string> = {
  auto_debit_poll_runs: "자동이체 폴링",
  usage_events: "이용현황 이벤트",
  operational_purge_runs: "정리 이력 audit",
};

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

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">마지막 알림 발송</CardTitle></CardHeader>
          <CardContent>
            <div className="text-sm font-mono">{data?.lastAlertDispatch ? fmtDateTime(data.lastAlertDispatch.dispatchedAt) : "-"}</div>
            {data?.lastAlertDispatch ? (
              <Badge variant={data.lastAlertDispatch.status === "sent" ? "default" : data.lastAlertDispatch.status === "failed" || data.lastAlertDispatch.status === "dead" ? "destructive" : "outline"} className="mt-1">
                <Bell className="w-3 h-3 mr-1" />
                {data.lastAlertDispatch.status === "sent" ? "발송 완료" : data.lastAlertDispatch.status === "queued" ? "대기중" : data.lastAlertDispatch.status === "sending" ? "발송중" : data.lastAlertDispatch.status}
              </Badge>
            ) : (
              <div className="text-xs text-muted-foreground mt-1">발송 이력 없음</div>
            )}
          </CardContent>
        </Card>
        {/* [Task #853] 최근 N일간 정리 잡 오류 횟수. audit 테이블 기준이며,
            잡별 errorCount/lastError/lastErrorAt 를 합산해 한 카드에 노출한다. */}
        <Card data-testid="card-purge-errors">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              최근 {data?.purgeErrors.windowDays ?? "N"}일 정리 오류
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-bold" data-testid="text-purge-errors-total">
              {data?.purgeErrors.total ?? 0}건
            </div>
            {data && data.purgeErrors.total > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {data.purgeErrors.byJob
                  .filter((j) => j.errorCount > 0)
                  .map((j) => (
                    <Badge
                      key={j.jobName}
                      variant="destructive"
                      className="text-xs"
                      title={j.lastError ?? undefined}
                      data-testid={`badge-purge-error-${j.jobName}`}
                    >
                      <ShieldAlert className="w-3 h-3 mr-1" />
                      {PURGE_JOB_LABELS[j.jobName] ?? j.jobName} {j.errorCount}회
                    </Badge>
                  ))}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground mt-1">오류 없음</div>
            )}
          </CardContent>
        </Card>
        {/* [Task #852] 보존 정책 정리 결과를 카드로 노출. audit 테이블 기반이므로
            서버 재시작 후에도 마지막 정리 정보가 유지된다. */}
        <Card data-testid="card-last-purge">
          <CardHeader className="pb-2"><CardTitle className="text-sm">마지막 정리</CardTitle></CardHeader>
          <CardContent>
            <div className="text-sm font-mono" data-testid="text-last-purge-ran-at">
              {data?.lastPurge ? fmtDateTime(data.lastPurge.ranAt) : "-"}
            </div>
            {data?.lastPurge ? (
              <Badge
                variant={data.lastPurge.error ? "destructive" : "outline"}
                className="mt-1"
                data-testid="badge-last-purge-deleted"
              >
                <Trash2 className="w-3 h-3 mr-1" />
                {data.lastPurge.error
                  ? "오류"
                  : `${data.lastPurge.deleted}건 삭제 · ${data.lastPurge.retentionDays}일 보존`}
              </Badge>
            ) : (
              <div className="text-xs text-muted-foreground mt-1">
                {data ? `정리 이력 없음 (보존 ${data.config.retainDays}일)` : ""}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* [Task #852] 모든 보존 정책 잡(자동이체 폴링/이용현황 이벤트 등)의 최근 정리 이력.
          audit 테이블(operational_purge_runs)에 누적되어 서버 재시작 후에도 유지된다. */}
      <Card data-testid="card-recent-purges">
        <CardHeader><CardTitle className="text-base">최근 정리 이력</CardTitle></CardHeader>
        <CardContent>
          {!data || data.recentPurges.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              <Trash2 className="w-6 h-6 mx-auto mb-2 opacity-40" />
              아직 정리 이력이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" data-testid="table-recent-purges">
                <thead className="text-left text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-3">시각</th>
                    <th className="py-2 pr-3">대상</th>
                    <th className="py-2 pr-3 text-right">삭제</th>
                    <th className="py-2 pr-3 text-right">보존(일)</th>
                    <th className="py-2 pr-3 text-right">소요</th>
                    <th className="py-2">에러</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentPurges.map((p) => (
                    <tr key={p.id} className="border-b last:border-0" data-testid={`row-purge-${p.id}`}>
                      <td className="py-2 pr-3 font-mono text-xs">{fmtDateTime(p.startedAt)}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline">{PURGE_JOB_LABELS[p.jobName] ?? p.jobName}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">{p.deleted}</td>
                      <td className="py-2 pr-3 text-right font-mono">{p.retentionDays}</td>
                      <td className="py-2 pr-3 text-right font-mono">{p.durationMs}ms</td>
                      <td className="py-2 text-xs text-destructive truncate max-w-xs" title={p.error ?? undefined}>
                        {p.error ?? "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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

      {data && (
        <p className="text-xs text-muted-foreground text-center">
          실행 이력은 {data.config.retainDays}일간 보존 후 자동 삭제됩니다. (환경변수 AUTO_DEBIT_POLL_RUN_RETAIN_DAYS)
          {/* [Task #853] audit 테이블 자체 보존 + 잡 stale 알림 임계 안내. */}
          <br />
          정리 이력 audit 은 {data.config.auditRetainDays}일간 보존되며, 각 정리 잡이 {formatMin(data.config.purgeStaleThresholdMs)} 이상 미실행되거나 마지막 실행에 오류가 있으면 본사에 알림이 발송됩니다.
        </p>
      )}
    </div>
  );
}
