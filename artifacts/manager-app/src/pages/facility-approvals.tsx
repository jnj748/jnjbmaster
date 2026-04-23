// [Task #132] 시설기사 가입 승인 처리 화면 (관리소장 / 본사 / 플랫폼).
import { useEffect, useState } from "react";
import { Check, X, RefreshCw, UserCheck } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

type ReqRow = {
  id: number;
  userId: number;
  user?: { id: number; name: string | null; email: string | null; phone: string | null } | null;
  requestedAddress: string | null;
  sido: string | null;
  sigungu: string | null;
  targetBuildingId: number | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  note: string | null;
};

export default function FacilityApprovalsPage() {
  const { token, user } = useAuth();
  const isAdmin = user?.role === "platform_admin" || user?.role === "hq_executive";
  const [rows, setRows] = useState<ReqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [actionState, setActionState] = useState<Record<number, { buildingId?: string; note?: string; busy?: boolean }>>({});

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const qs = statusFilter === "all" ? "" : `?status=${statusFilter}`;
      const res = await fetch(`${API_BASE}/facility-signup-requests${qs}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      setRows(d.requests ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [token, statusFilter]);

  async function approve(id: number) {
    const st = actionState[id] ?? {};
    setActionState(s => ({ ...s, [id]: { ...st, busy: true } }));
    try {
      const body: Record<string, unknown> = {};
      if (isAdmin && st.buildingId) body.buildingId = parseInt(st.buildingId);
      if (st.note) body.note = st.note;
      const res = await fetch(`${API_BASE}/facility-signup-requests/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "승인에 실패했습니다");
        return;
      }
      await load();
    } finally {
      setActionState(s => ({ ...s, [id]: { ...(s[id] ?? {}), busy: false } }));
    }
  }
  async function reject(id: number) {
    const st = actionState[id] ?? {};
    if (!st.note) { alert("거절 사유를 입력하세요"); return; }
    setActionState(s => ({ ...s, [id]: { ...st, busy: true } }));
    try {
      const res = await fetch(`${API_BASE}/facility-signup-requests/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ note: st.note }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error ?? "거절에 실패했습니다");
        return;
      }
      await load();
    } finally {
      setActionState(s => ({ ...s, [id]: { ...(s[id] ?? {}), busy: false } }));
    }
  }

  return (
    <div className="space-y-4 p-2 sm:p-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <UserCheck className="w-5 h-5" /> 시설기사 가입 승인
          </CardTitle>
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border bg-white px-2 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
              data-testid="select-status-filter"
            >
              <option value="pending">대기중</option>
              <option value="approved">승인됨</option>
              <option value="rejected">거절됨</option>
              <option value="all">전체</option>
            </select>
            <Button variant="outline" size="sm" onClick={load} disabled={loading} data-testid="button-refresh">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500 py-8 text-center">표시할 요청이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {rows.map((r) => {
                const st = actionState[r.id] ?? {};
                return (
                  <div key={r.id} className="rounded-lg border p-3 sm:p-4 space-y-2" data-testid={`row-request-${r.id}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-sm">
                        <span className="font-semibold text-slate-900">{r.user?.name ?? `사용자#${r.userId}`}</span>
                        <span className="text-slate-500 ml-2">{r.user?.email}</span>
                        {r.user?.phone && <span className="text-slate-500 ml-2">{r.user.phone}</span>}
                      </div>
                      <Badge variant={r.status === "pending" ? "outline" : r.status === "approved" ? "default" : "destructive"}>
                        {r.status === "pending" ? "대기중" : r.status === "approved" ? "승인됨" : "거절됨"}
                      </Badge>
                    </div>
                    <div className="text-xs text-slate-600">
                      <div>요청 주소: {r.requestedAddress ?? "-"}</div>
                      <div>지역: {[r.sido, r.sigungu].filter(Boolean).join(" ") || "-"} · 건물ID: {r.targetBuildingId ?? "미지정"}</div>
                      <div>요청일: {new Date(r.createdAt).toLocaleString("ko-KR")}</div>
                      {r.note && <div className="mt-1">메모: {r.note}</div>}
                    </div>
                    {r.status === "pending" && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                        {isAdmin && (
                          <Input
                            placeholder="건물ID (선택)"
                            value={st.buildingId ?? ""}
                            onChange={(e) => setActionState(s => ({ ...s, [r.id]: { ...(s[r.id] ?? {}), buildingId: e.target.value } }))}
                            data-testid={`input-building-${r.id}`}
                          />
                        )}
                        <Textarea
                          placeholder="메모/사유 (거절 시 필수)"
                          rows={1}
                          value={st.note ?? ""}
                          onChange={(e) => setActionState(s => ({ ...s, [r.id]: { ...(s[r.id] ?? {}), note: e.target.value } }))}
                          data-testid={`input-note-${r.id}`}
                        />
                        <div className="flex gap-2">
                          <Button onClick={() => approve(r.id)} disabled={st.busy} className="flex-1" data-testid={`button-approve-${r.id}`}>
                            <Check className="w-4 h-4 mr-1" /> 승인
                          </Button>
                          <Button variant="destructive" onClick={() => reject(r.id)} disabled={st.busy} className="flex-1" data-testid={`button-reject-${r.id}`}>
                            <X className="w-4 h-4 mr-1" /> 거절
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
