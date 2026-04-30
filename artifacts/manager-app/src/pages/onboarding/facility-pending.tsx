// [Task #132] 시설기사 가입 승인 대기 화면.
// [Task #651] 경리도 동일 화면을 공유한다 — 승인되면 경리는 /onboarding/accountant-setup,
//             시설담당은 / 로 이동한다.
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Hourglass, RefreshCw, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

export default function FacilityPendingPage() {
  const { token, user, logout, setUser, refreshUser } = useAuth();
  const [, setLocation] = useLocation();
  const [request, setRequest] = useState<{ status: string; createdAt: string; note: string | null; targetBuildingId: number | null; requestedRole?: string } | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/facility-signup-requests/me`, { headers: { Authorization: `Bearer ${token}` } });
      const d = await res.json();
      setRequest(d.request);
      const meRes = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      const meD = await meRes.json();
      if (meD.user) setUser(meD.user);
      if (meD.user?.approvalStatus === "active") {
        if (refreshUser) await refreshUser();
        // [Task #651] 경리는 승인 직후 사후 설정 위저드로 안내.
        if (meD.user?.role === "accountant") setLocation("/onboarding/accountant-setup");
        else setLocation("/");
        return;
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [token]);

  // [Task #651] 역할별 라벨링.
  const roleLabel = user?.role === "accountant" ? "경리·회계" : "시설기사";

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-7 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
          <Hourglass className="w-6 h-6 text-amber-600" />
        </div>
        <h1 className="mt-3 text-xl font-bold text-slate-900">승인 대기 중</h1>
        <p className="mt-2 text-sm text-slate-500">
          {user?.name ?? "회원"}님의 {roleLabel} 가입 요청이 접수되었습니다. 본부장 또는 관리소장이 승인하면 모든 기능을 사용할 수 있습니다.
        </p>
        {request?.status === "rejected" && (
          <div className="mt-4 rounded-lg bg-red-50 text-red-700 p-3 text-xs text-left">
            반려되었습니다.{request.note ? ` 사유: ${request.note}` : ""}
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
