// [Task #132] 가입 직후 역할 선택 화면. 카드 선택 시 /auth/select-role 호출 후 위저드 이동.
import { useState } from "react";
import { useLocation } from "wouter";
import { Building2, Calculator, Wrench, Store, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

const ROLES: Array<{
  role: "manager" | "accountant" | "facility_staff" | "partner";
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  next: string;
}> = [
  { role: "manager", label: "관리소장", desc: "건물 등록·법정점검 일정 자동화", icon: Building2, color: "blue", next: "/onboarding/manager" },
  { role: "accountant", label: "경리·회계", desc: "회계/관리비 초기자료 등록", icon: Calculator, color: "emerald", next: "/onboarding/accountant" },
  { role: "facility_staff", label: "시설기사", desc: "기본 정보 등록 후 승인 대기", icon: Wrench, color: "amber", next: "/onboarding/facility-staff" },
  { role: "partner", label: "파트너사", desc: "사업자등록증·취급분야 등록", icon: Store, color: "violet", next: "/onboarding/partner" },
];

const COLOR: Record<string, string> = {
  blue: "bg-blue-50 text-blue-700 border-blue-100 hover:border-blue-300",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-100 hover:border-emerald-300",
  amber: "bg-amber-50 text-amber-700 border-amber-100 hover:border-amber-300",
  violet: "bg-violet-50 text-violet-700 border-violet-100 hover:border-violet-300",
};

export default function RoleSelectPage() {
  const { user, token, applyToken, refreshUser } = useAuth();
  const [, setLocation] = useLocation();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const alreadySelected = !!user?.roleSelected;
  const directRole = alreadySelected ? ROLES.find((r) => r.role === user?.role) : undefined;

  async function chooseRole(r: typeof ROLES[number]) {
    setErr("");
    if (alreadySelected) {
      setLocation(r.next);
      return;
    }
    setSubmitting(r.role);
    try {
      const res = await fetch(`${API_BASE}/auth/select-role`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ role: r.role }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "역할 설정 실패");
      }
      const data = await res.json();
      if (data.token) applyToken(data.token);
      await refreshUser();
      setLocation(r.next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "오류");
      setSubmitting(null);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:py-8 flex flex-col">
      <div className="max-w-3xl w-full mx-auto flex-1 flex flex-col">
        <div className="text-center mb-4 sm:mb-6">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">건물과는 어떤 관계이신가요?</h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            역할을 선택하면 AI비서가 설정을 도와드립니다.
          </p>
          {alreadySelected && (
            <p className="mt-1 text-[11px] text-slate-400">이미 역할이 확정된 계정입니다. 위저드만 다시 진행할 수 있습니다.</p>
          )}
        </div>

        {err && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:gap-4 flex-1 content-start">
          {ROLES.map((r) => {
            const Icon = r.icon;
            const highlight = directRole?.role === r.role;
            const isSubmitting = submitting === r.role;
            return (
              <button
                key={r.role}
                disabled={!!submitting}
                onClick={() => chooseRole(r)}
                className={`text-left rounded-xl border bg-white p-3 sm:p-5 transition-shadow shadow-sm hover:shadow disabled:opacity-60 ${
                  highlight ? "ring-2 ring-blue-400" : ""
                }`}
                data-testid={`role-${r.role}`}
              >
                <div className={`inline-flex w-9 h-9 sm:w-10 sm:h-10 rounded-lg items-center justify-center border ${COLOR[r.color]}`}>
                  {isSubmitting ? <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" /> : <Icon className="w-4 h-4 sm:w-5 sm:h-5" />}
                </div>
                <div className="mt-2 sm:mt-3 text-sm sm:text-base font-semibold text-slate-900">{r.label}</div>
                <p className="mt-1 text-[11px] sm:text-xs text-slate-500 leading-snug">{r.desc}</p>
                {highlight && (
                  <div className="mt-1.5 text-[11px] text-blue-700">현재 계정의 역할입니다</div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
