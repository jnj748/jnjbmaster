import { useState } from "react";
import { Zap, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { ROLE_LABELS } from "@workspace/shared/role-labels";

// [역할 라벨 SoT] 빠른 로그인 버튼 라벨도 ROLE_LABELS 에서 가져온다.
const TEST_ACCOUNTS = [
  { email: "manager@test.com", label: ROLE_LABELS.manager, portalType: "building" as const, color: "bg-blue-100 text-blue-700 hover:bg-blue-200" },
  { email: "accountant@test.com", label: ROLE_LABELS.accountant, portalType: "building" as const, color: "bg-sky-100 text-sky-700 hover:bg-sky-200" },
  { email: "facility@test.com", label: ROLE_LABELS.facility_staff, portalType: "building" as const, color: "bg-teal-100 text-teal-700 hover:bg-teal-200" },
  { email: "hq@test.com", label: ROLE_LABELS.hq_executive, portalType: "hq" as const, color: "bg-indigo-100 text-indigo-700 hover:bg-indigo-200" },
  { email: "admin@test.com", label: ROLE_LABELS.platform_admin, portalType: "hq" as const, color: "bg-purple-100 text-purple-700 hover:bg-purple-200" },
  { email: "partner@test.com", label: ROLE_LABELS.partner, portalType: "partner" as const, color: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" },
];

const TEST_PASSWORD = "test1234!";

export default function DevQuickLogin() {
  const { login } = useAuth();
  const [, navigate] = useLocation();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleQuickLogin = async (account: typeof TEST_ACCOUNTS[0]) => {
    setLoading(account.email);
    setError("");
    try {
      await login(account.email, TEST_PASSWORD, account.portalType);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="mt-10 w-full max-w-2xl px-6">
      <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-semibold text-amber-700">
            테스트 계정으로 빠른 로그인
          </span>
          <span className="text-xs text-amber-500 ml-auto">개발 환경 전용</span>
        </div>

        {error && (
          <div className="mb-3 p-2 rounded-lg bg-red-50 text-red-600 text-xs">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {TEST_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              onClick={() => handleQuickLogin(account)}
              disabled={loading !== null}
              className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${account.color}`}
            >
              {loading === account.email ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : null}
              {account.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
