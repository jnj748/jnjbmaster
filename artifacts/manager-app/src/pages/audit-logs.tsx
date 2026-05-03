// [Task #773] 감사로그 화면 — platform_admin / hq_executive / custodian(관리단장) 만 진입.
//   - 칩 필터(액션 카테고리) + 기간 필터 + 액터 ID 필터.
//   - CSV 내보내기 (서버에서 BOM + 헤더 포함).
//   - 직접 입력 칸은 본문 검색에 두지 않는다 (감사로그는 칩 + 기간으로만 좁힌다).

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmWithReason } from "@/components/confirm-with-reason";
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_LABELS,
  actionLabel,
  type AuditAction,
} from "@workspace/shared/permissions-matrix";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

interface AuditLogRow {
  id: number;
  actorId: number | null;
  actorName: string | null;
  role: string;
  action: string;
  targetType: string | null;
  targetId: number | null;
  buildingId: number | null;
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  createdAt: string;
}

// 칩 그룹: 7대 표준 액션 카테고리.
const ACTION_GROUPS: { label: string; actions: readonly AuditAction[] }[] = [
  { label: "지출결의서", actions: ["expense_voucher.create", "expense_voucher.update", "expense_voucher.cancel"] },
  { label: "분개", actions: ["journal.post", "journal.reverse"] },
  { label: "관리비", actions: ["billing.calculate", "billing.finalize", "fees.payment.record", "fees.kakao.notify", "fees.interim.calculate"] },
  { label: "마감", actions: ["closing.lock", "closing.unlock"] },
  { label: "발송", actions: ["dispatch.send", "dispatch.retry"] },
  { label: "권한·내보내기", actions: ["permission.change", "data.export"] },
  { label: "결재", actions: AUDIT_ACTIONS.filter((a) => a.startsWith("approval.")) },
];

const VIEW_ROLES = new Set(["platform_admin", "hq_executive", "custodian"]);

export default function AuditLogsPage() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set());
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  // [Task #773] 직접 입력은 두지 않는다 — 이미 로드된 결과 행에서 추출한 옵션으로
  //   드롭다운(=칩 동등) 만 노출한다. 빈 값은 "전체" 의미.
  const [actorId, setActorId] = useState<string>("");
  const [buildingId, setBuildingId] = useState<string>("");
  const [actorOptions, setActorOptions] = useState<{ id: number; name: string }[]>([]);
  const [buildingOptions, setBuildingOptions] = useState<number[]>([]);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 200;
  // [Task #773] CSV 내보내기는 data.export(=감사 대상 액션) 이므로 사유 칩으로 한 번 더 확인.
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);

  const allowed = !!user && VIEW_ROLES.has(user.role);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedActions.size > 0) params.set("action", Array.from(selectedActions).join(","));
    if (from) params.set("from", new Date(from).toISOString());
    if (to) params.set("to", new Date(to).toISOString());
    if (actorId.trim()) params.set("actorId", actorId.trim());
    if (buildingId.trim()) params.set("buildingId", buildingId.trim());
    params.set("limit", String(PAGE_SIZE));
    params.set("offset", String(page * PAGE_SIZE));
    return params.toString();
  }, [selectedActions, from, to, actorId, buildingId, page]);

  useEffect(() => {
    // 필터가 바뀌면 첫 페이지로.
    setPage(0);
  }, [selectedActions, from, to, actorId, buildingId]);

  useEffect(() => {
    if (!allowed || !token) return;
    let aborted = false;
    setLoading(true);
    fetch(`${API_BASE}/audit-logs?${queryString}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json() as Promise<{ items: AuditLogRow[]; total: number }>;
      })
      .then((data) => {
        if (aborted) return;
        setRows(data.items);
        setTotal(data.total);
        // 결과 행에서 옵션 누적 — 이전 옵션을 덮어쓰지 말고 합집합 유지(필터를 좁히면
        // 옵션이 사라지는 UX 회귀 방지).
        setActorOptions((prev) => {
          const map = new Map(prev.map((o) => [o.id, o.name]));
          for (const r of data.items) {
            if (r.actorId != null) map.set(r.actorId, r.actorName ?? `#${r.actorId}`);
          }
          return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.id - b.id);
        });
        setBuildingOptions((prev) => {
          const set = new Set(prev);
          for (const r of data.items) if (r.buildingId != null) set.add(r.buildingId);
          return Array.from(set).sort((a, b) => a - b);
        });
      })
      .catch((err) => {
        if (aborted) return;
        toast({ variant: "destructive", title: "감사로그 조회 실패", description: String(err) });
      })
      .finally(() => {
        if (!aborted) setLoading(false);
      });
    return () => {
      aborted = true;
    };
  }, [allowed, token, queryString, toast]);

  if (!allowed) {
    return (
      <div className="p-6" data-testid="audit-logs-forbidden">
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            감사로그 조회 권한이 없습니다. (platform_admin / 관리단장 / 본부장 전용)
          </CardContent>
        </Card>
      </div>
    );
  }

  function toggleAction(a: string) {
    setSelectedActions((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a);
      else next.add(a);
      return next;
    });
  }

  async function handleCsvExport(reason: string) {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/audit-logs.csv?${queryString}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          // 서버 audit 미들웨어가 X-Audit-Reason 헤더를 audit_logs.reason 으로 박는다.
          "X-Audit-Reason": reason,
        },
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-logs-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast({ variant: "destructive", title: "CSV 내보내기 실패", description: String(err) });
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6" data-testid="audit-logs-page">
      <Card>
        <CardHeader>
          <CardTitle>감사로그</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {ACTION_GROUPS.map((group) => (
              <div key={group.label} className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground w-24 shrink-0">
                  {group.label}
                </span>
                {group.actions.map((a) => {
                  const active = selectedActions.has(a);
                  return (
                    <button
                      key={a}
                      type="button"
                      data-testid={`action-chip-${a}`}
                      onClick={() => toggleAction(a)}
                      className={[
                        "rounded-full border px-3 py-1 text-xs transition",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input bg-background text-foreground hover:bg-accent",
                      ].join(" ")}
                    >
                      {AUDIT_ACTION_LABELS[a] ?? a}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <div>
              <label className="text-xs text-muted-foreground">시작일</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="audit-from" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">종료일</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="audit-to" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">건물</label>
              <Select value={buildingId || "__all__"} onValueChange={(v) => setBuildingId(v === "__all__" ? "" : v)}>
                <SelectTrigger data-testid="audit-building"><SelectValue placeholder="전체" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체</SelectItem>
                  {buildingOptions.map((b) => (
                    <SelectItem key={b} value={String(b)}>건물 #{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">행위자</label>
              <Select value={actorId || "__all__"} onValueChange={(v) => setActorId(v === "__all__" ? "" : v)}>
                <SelectTrigger data-testid="audit-actor"><SelectValue placeholder="전체" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체</SelectItem>
                  {actorOptions.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>{a.name} (#{a.id})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedActions(new Set());
                  setFrom("");
                  setTo("");
                  setActorId("");
                  setBuildingId("");
                }}
                data-testid="audit-reset"
              >
                초기화
              </Button>
              <Button onClick={() => setCsvDialogOpen(true)} data-testid="audit-csv-export">
                CSV 내보내기
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ConfirmWithReason
        open={csvDialogOpen}
        onOpenChange={setCsvDialogOpen}
        title="감사로그 CSV 내보내기"
        description="데이터 내보내기는 data.export 액션으로 기록됩니다. 사유를 선택해주세요."
        reasons={["내부 점검", "외부 감사 제출", "분쟁 대응", "회계 자료 보관", "기타"]}
        destructive
        confirmText="내보내기"
        onConfirm={async (reason) => {
          await handleCsvExport(reason);
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            결과 {total.toLocaleString()}건
            {loading ? <span className="ml-2 text-xs text-muted-foreground">불러오는 중…</span> : null}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left text-xs">
                <tr>
                  <th className="p-2">시각</th>
                  <th className="p-2">행위자</th>
                  <th className="p-2">액션</th>
                  <th className="p-2">대상</th>
                  <th className="p-2">건물</th>
                  <th className="p-2">사유</th>
                  <th className="p-2">IP</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-muted-foreground">
                      조건에 해당하는 감사 기록이 없습니다.
                    </td>
                  </tr>
                ) : null}
                {rows.map((r) => (
                  <tr key={r.id} className="border-t" data-testid={`audit-row-${r.id}`}>
                    <td className="p-2 whitespace-nowrap">{new Date(r.createdAt).toLocaleString("ko-KR")}</td>
                    <td className="p-2 whitespace-nowrap">
                      {r.actorName ?? "-"}{" "}
                      <Badge variant="outline" className="ml-1">
                        {r.role}
                      </Badge>
                    </td>
                    <td className="p-2 whitespace-nowrap">{actionLabel(r.action)}</td>
                    <td className="p-2 whitespace-nowrap text-muted-foreground">
                      {r.targetType ? `${r.targetType}#${r.targetId ?? "-"}` : "-"}
                    </td>
                    <td className="p-2 whitespace-nowrap">{r.buildingId ?? "-"}</td>
                    <td className="p-2 max-w-[240px] truncate" title={r.reason ?? ""}>
                      {r.reason ?? ""}
                    </td>
                    <td className="p-2 whitespace-nowrap text-xs text-muted-foreground">{r.ip ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0 || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              data-testid="audit-prev"
            >
              이전
            </Button>
            <span className="text-xs text-muted-foreground">
              {page + 1} / {Math.max(1, Math.ceil(total / PAGE_SIZE))}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={(page + 1) * PAGE_SIZE >= total || loading}
              onClick={() => setPage((p) => p + 1)}
              data-testid="audit-next"
            >
              다음
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
