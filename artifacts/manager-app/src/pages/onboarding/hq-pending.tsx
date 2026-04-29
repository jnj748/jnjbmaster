// [Task #596] 본부장(hq_executive) 가입 직후 "관할 건물 할당 대기" 화면.
//   본부장은 더 이상 super-user 가 아니다 — platform_admin 이 hq_building_assignments
//   매핑을 1건 이상 부여해야 실제 건물 데이터에 접근할 수 있다.
//   이 화면은 매핑이 0건인 동안 본부장을 가두고, 일정 주기로 /hq/assigned-buildings
//   를 폴링해 매핑이 생기면 즉시 메인(/) 으로 진입시킨다.
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Hourglass, RefreshCw, LogOut, Briefcase } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

type Assignment = {
  buildingId: number;
  buildingName: string;
  addressFull: string | null;
};

export default function HqPendingPage() {
  const { token, user, logout, refreshUser } = useAuth();
  const [, setLocation] = useLocation();
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function refresh() {
    if (!token) return;
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(`${API_BASE}/hq/assigned-buildings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "할당 정보를 불러오지 못했습니다");
      }
      const data: { unrestricted: boolean; assignments: Assignment[] } = await res.json();
      setAssignments(data.assignments);
      if (data.unrestricted || data.assignments.length > 0) {
        if (refreshUser) await refreshUser();
        setLocation("/");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "오류");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // 30초 주기 폴링 — admin 이 매핑을 부여하면 다음 사이클에 자동 진입.
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-slate-50 px-4 py-10"
      data-testid="hq-pending-page"
    >
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-sm p-7 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center">
          <Briefcase className="w-6 h-6 text-indigo-600" />
        </div>
        <h1 className="mt-3 text-xl font-bold text-slate-900">관할 건물 할당 대기</h1>
        <p className="mt-2 text-sm text-slate-500">
          {user?.name ?? "본부장"}님은 본부장(HQ) 권한으로 가입되었습니다.
          <br />
          플랫폼 운영자가 관할 건물을 부여하면 자동으로 대시보드가 열립니다.
        </p>

        <div
          className="mt-5 rounded-lg bg-slate-50 border border-slate-200 p-3 text-left text-xs text-slate-600"
          data-testid="hq-pending-status"
        >
          <div className="flex items-center gap-2">
            <Hourglass className="w-4 h-4 text-amber-500" />
            <span>
              현재 할당된 건물:{" "}
              <strong data-testid="hq-pending-count">
                {assignments == null ? "-" : assignments.length}
              </strong>
              개
            </span>
          </div>
          {err && <div className="mt-2 text-red-600">{err}</div>}
        </div>

        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            onClick={refresh}
            disabled={loading}
            data-testid="hq-pending-refresh"
            className="inline-flex items-center gap-1 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> 상태 새로고침
          </button>
          <button
            onClick={() => {
              logout();
              setLocation("/login");
            }}
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
