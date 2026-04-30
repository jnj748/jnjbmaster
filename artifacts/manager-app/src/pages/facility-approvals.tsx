// [Task #132] 시설기사 가입 승인 처리 화면 (관리소장 / 본사 / 플랫폼).
// [Task #651] 경리(accountant) 가입 신청도 동일 화면에서 처리한다.
//   - 상단 탭으로 시설담당 / 경리 분리 조회.
//   - 시설담당 행에는 자격증 사진 미리보기.
//   - 본부장(hq_executive) 의 거절·승인은 매니저가 되돌릴 수 없음을 행마다 안내.
//   - hq_executive / platform_admin 은 거절된 신청을 다시 pending 으로 되돌리는 reopen 가능.
import { useEffect, useState } from "react";
import { Check, X, RefreshCw, UserCheck, RotateCcw } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AuthImage } from "@/components/auth-image";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

type RequestedRole = "facility_staff" | "accountant";

type ReqRow = {
  id: number;
  userId: number;
  user?: { id: number; name: string | null; email: string | null; phone: string | null } | null;
  requestedRole: RequestedRole;
  requestedAddress: string | null;
  sido: string | null;
  sigungu: string | null;
  targetBuildingId: number | null;
  licensePhotoUrl: string | null;
  status: "pending" | "approved" | "rejected";
  decidedByRole: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  createdAt: string;
  note: string | null;
};

const ROLE_LABEL: Record<RequestedRole, string> = {
  facility_staff: "시설담당",
  accountant: "경리·회계",
};

export default function FacilityApprovalsPage() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const isAdmin = user?.role === "platform_admin" || user?.role === "hq_executive";
  const isHqOrAdmin = isAdmin;
  const [tab, setTab] = useState<RequestedRole>("facility_staff");
  const [rows, setRows] = useState<ReqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [actionState, setActionState] = useState<Record<number, { buildingId?: string; note?: string; busy?: boolean }>>({});

  async function load() {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("role", tab);
      const res = await fetch(`${API_BASE}/facility-signup-requests?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      setRows(d.requests ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [token, statusFilter, tab]);

  // [Task #651] 매니저가 본부장 결정을 되돌리지 못함을 표면화.
  function actionsLockedForManager(r: ReqRow): boolean {
    return user?.role === "manager" && r.decidedByRole === "hq_executive";
  }

  async function approve(id: number) {
    const r = rows.find(x => x.id === id);
    if (r && actionsLockedForManager(r)) {
      toast({ title: "본부장이 결정한 신청은 관리소장이 되돌릴 수 없습니다.", variant: "destructive" });
      return;
    }
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
        toast({
          title: res.status === 409 ? "승인이 차단되었습니다" : "승인에 실패했습니다",
          description: d.error ?? "잠시 후 다시 시도해 주세요.",
          variant: "destructive",
        });
        return;
      }
      await load();
    } finally {
      setActionState(s => ({ ...s, [id]: { ...(s[id] ?? {}), busy: false } }));
    }
  }

  async function reject(id: number) {
    const r = rows.find(x => x.id === id);
    if (r && actionsLockedForManager(r)) {
      toast({ title: "본부장이 결정한 신청은 관리소장이 되돌릴 수 없습니다.", variant: "destructive" });
      return;
    }
    const st = actionState[id] ?? {};
    if (!st.note) { toast({ title: "거절 사유를 입력하세요", variant: "destructive" }); return; }
    setActionState(s => ({ ...s, [id]: { ...st, busy: true } }));
    try {
      const res = await fetch(`${API_BASE}/facility-signup-requests/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ note: st.note }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast({ title: "거절에 실패했습니다", description: d.error ?? "", variant: "destructive" });
        return;
      }
      await load();
    } finally {
      setActionState(s => ({ ...s, [id]: { ...(s[id] ?? {}), busy: false } }));
    }
  }

  // [Task #651] 거절된 신청을 다시 pending 으로 되돌린다.
  async function reopen(id: number) {
    setActionState(s => ({ ...s, [id]: { ...(s[id] ?? {}), busy: true } }));
    try {
      const res = await fetch(`${API_BASE}/facility-signup-requests/${id}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast({ title: "재오픈에 실패했습니다", description: d.error ?? "", variant: "destructive" });
        return;
      }
      toast({ title: "다시 대기로 전환했습니다." });
      await load();
    } finally {
      setActionState(s => ({ ...s, [id]: { ...(s[id] ?? {}), busy: false } }));
    }
  }

  function renderRows() {
    if (rows.length === 0) {
      return <p className="text-sm text-slate-500 py-8 text-center">표시할 요청이 없습니다.</p>;
    }
    return (
      <div className="space-y-3">
        {rows.map((r) => {
          const st = actionState[r.id] ?? {};
          const locked = actionsLockedForManager(r);
          return (
            <div key={r.id} className="rounded-lg border p-3 sm:p-4 space-y-2" data-testid={`row-request-${r.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  <span className="font-semibold text-slate-900">{r.user?.name ?? `사용자#${r.userId}`}</span>
                  <span className="text-slate-500 ml-2">{r.user?.email}</span>
                  {r.user?.phone && <span className="text-slate-500 ml-2">{r.user.phone}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{ROLE_LABEL[r.requestedRole]}</Badge>
                  <Badge variant={r.status === "pending" ? "outline" : r.status === "approved" ? "default" : "destructive"}>
                    {r.status === "pending" ? "대기중" : r.status === "approved" ? "승인됨" : "거절됨"}
                  </Badge>
                </div>
              </div>
              <div className="text-xs text-slate-600">
                <div>요청 주소: {r.requestedAddress ?? "-"}</div>
                <div>지역: {[r.sido, r.sigungu].filter(Boolean).join(" ") || "-"} · 건물ID: {r.targetBuildingId ?? "미지정"}</div>
                <div>요청일: {new Date(r.createdAt).toLocaleString("ko-KR")}</div>
                {r.note && <div className="mt-1">메모: {r.note}</div>}
                {r.decidedByRole && r.status !== "pending" && (
                  <div className="mt-1">
                    결정자: <span className="font-medium">{r.decidedByName ?? "(이름 없음)"}</span>
                    <span className="ml-1 text-slate-500">
                      · {r.decidedByRole === "hq_executive" ? "본부장" : r.decidedByRole === "manager" ? "관리소장" : "플랫폼"}
                    </span>
                    {r.decidedAt && (
                      <span className="ml-2 text-slate-500">
                        · {new Date(r.decidedAt).toLocaleString("ko-KR")}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {r.requestedRole === "facility_staff" && r.licensePhotoUrl && (
                <div className="mt-2">
                  <div className="text-[11px] text-slate-500 mb-1">자격증 사진</div>
                  <AuthImage
                    src={r.licensePhotoUrl}
                    alt="자격증 사진"
                    className="w-32 h-32 object-cover rounded-lg border border-slate-200"
                    data-testid={`license-photo-${r.id}`}
                  />
                </div>
              )}

              {locked && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-[11px] text-amber-800">
                  본부장이 결정한 신청입니다. 관리소장은 이 신청의 결정을 되돌릴 수 없습니다.
                </div>
              )}

              {r.status === "pending" && !locked && (
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

              {r.status === "rejected" && isHqOrAdmin && (
                <div className="pt-2">
                  <Button
                    variant="outline"
                    onClick={() => reopen(r.id)}
                    disabled={st.busy}
                    data-testid={`button-reopen-${r.id}`}
                  >
                    <RotateCcw className="w-4 h-4 mr-1" /> 다시 대기로 전환
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2 sm:p-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <UserCheck className="w-5 h-5" /> 경리·시설담당 가입 승인
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
          <Tabs value={tab} onValueChange={(v) => setTab(v as RequestedRole)} className="w-full">
            <TabsList className="grid grid-cols-2 max-w-md">
              <TabsTrigger value="facility_staff" data-testid="tab-facility">시설담당</TabsTrigger>
              <TabsTrigger value="accountant" data-testid="tab-accountant">경리·회계</TabsTrigger>
            </TabsList>
            <TabsContent value="facility_staff" className="mt-4">{renderRows()}</TabsContent>
            <TabsContent value="accountant" className="mt-4">{renderRows()}</TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
