// [Task #132] 시설기사 가입 승인 대기 화면.
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Hourglass, RefreshCw, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

export default function FacilityPendingPage() {
  const { token, user, logout, setUser, refreshUser } = useAuth();
  const [, setLocation] = useLocation();
  const [request, setRequest] = useState<{ status: string; createdAt: string; note: string | null; targetBuildingId: number | null } | null>(null);
  const [loading, setLoading] = useState(true);
  // [Task #341] 신청이 중복으로 인해 진행되지 않은 경우 본인 화면에도 동일 안내를 노출.
  const [dupMessage, setDupMessage] = useState<string | null>(null);

  async function refresh() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/facility-signup-requests/me`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      setRequest(d.request);
      // me에서 approvalStatus가 active로 바뀌었으면 컨텍스트도 갱신 후 메인으로.
      const meRes = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      const meD = await meRes.json();
      if (meD.user) setUser(meD.user);
      if (meD.user?.approvalStatus === "active") {
        if (refreshUser) await refreshUser();
        setLocation("/");
        return;
      }
      // [Task #341] 신청 행이 pending 인 채로 매칭된 건물에 이미 다른 활성 시설담당자가 있으면 안내.
      // 두 가지 경로 모두 커버한다.
      //   1) 서버가 승인 시도 시 409로 차단하면서 신청 행 note에 차단 사유를 기록한 경우 → note를 그대로 표시.
      //   2) 신청만 들어와 있는 시점에서 사전 점검(check-manager)으로 중복이 잡힐 경우 → 표준 안내문 표시.
      const noteMatchesDup = typeof d.request?.note === "string"
        && d.request.note.includes("이미 해당 건물의 가입자가 존재합니다");
      if (d.request?.status === "pending" && noteMatchesDup) {
        setDupMessage(d.request.note);
      } else if (d.request?.status === "pending" && d.request?.targetBuildingId) {
        try {
          const params = new URLSearchParams({
            role: "facility_staff",
            buildingId: String(d.request.targetBuildingId),
          });
          const r = await fetch(`${API_BASE}/buildings/check-manager?${params}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const j = await r.json().catch(() => ({}));
          if (r.ok && j?.exists) {
            setDupMessage(j.message || "이미 해당 건물의 가입자가 존재합니다. 자세한 문의는 관리의달인으로 문의주시기 바랍니다. 1800-0416");
          } else {
            setDupMessage(null);
          }
        } catch {/* 사전 점검 실패는 무시 */}
      } else {
        setDupMessage(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-7 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
          <Hourglass className="w-6 h-6 text-amber-600" />
        </div>
        <h1 className="mt-3 text-xl font-bold text-slate-900">승인 대기 중</h1>
        <p className="mt-2 text-sm text-slate-500">
          {user?.name ?? "회원"}님의 시설기사 가입 요청이 접수되었습니다. 관리소장 또는 플랫폼이 승인하면 모든 기능을 사용할 수 있습니다.
        </p>
        {request?.status === "rejected" && (
          <div className="mt-4 rounded-lg bg-red-50 text-red-700 p-3 text-xs text-left">
            반려되었습니다.{request.note ? ` 사유: ${request.note}` : ""}
          </div>
        )}
        {/* [Task #341] 신청 건물에 이미 활성 시설담당자가 있어 진행 불가한 경우 */}
        {dupMessage && (
          <div
            role="alert"
            data-testid="facility-duplicate-notice"
            className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 text-left leading-relaxed"
          >
            {dupMessage}
          </div>
        )}
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> 상태 새로고침
          </button>
          <button
            onClick={() => { logout(); setLocation("/login"); }}
            className="inline-flex items-center gap-1 px-3 py-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <LogOut className="w-4 h-4" /> 로그아웃
          </button>
        </div>
        <p className="mt-4 text-[11px] text-slate-400">문의: 1800-0416</p>
      </div>
    </div>
  );
}
