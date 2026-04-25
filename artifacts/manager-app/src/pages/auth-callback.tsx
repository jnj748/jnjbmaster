import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { ROLE_LABELS } from "@workspace/shared/role-labels";

const ERROR_MESSAGES: Record<string, string> = {
  rate_limit: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
  invalid_provider: "지원하지 않는 공급자입니다.",
  invalid_state: "인증 세션이 만료되었습니다. 다시 시도해 주세요.",
  missing_params: "인증 응답이 올바르지 않습니다.",
  oauth_failed: "소셜 로그인 중 오류가 발생했습니다.",
  hq_not_allowed: `${ROLE_LABELS.hq_executive} 포털은 소셜 로그인을 사용할 수 없습니다.`,
  portal_mismatch: "이 계정은 다른 포털용입니다.",
  access_denied: "소셜 로그인이 취소되었습니다.",
};

export default function AuthCallback() {
  const { applyToken } = useAuth();
  const [, setLocation] = useLocation();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    const params = new URLSearchParams(hash);
    const token = params.get("token");
    const err = params.get("error");

    if (err) {
      setError(ERROR_MESSAGES[err] || `오류: ${err}`);
      return;
    }
    if (token) {
      applyToken(token);
      setLocation("/");
      return;
    }
    setError("인증 응답이 비어 있습니다.");
  }, [applyToken, setLocation]);

  // [Task #368/#377] 인증 셸 통일: 모바일은 dvh + overflow-hidden(앱 느낌),
  // 데스크톱(md+)은 셸 해제 + 화면 중앙 정렬. 시니어 가시성 위해 폰트·여백 한 단계 확대.
  if (error) {
    return (
      <div
        className="flex items-center justify-center bg-slate-50 overflow-hidden md:overflow-visible h-[100dvh] md:h-auto md:min-h-screen"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-md w-full mx-4">
          <h1 className="text-lg md:text-xl font-semibold text-slate-900 mb-2">로그인 실패</h1>
          <p className="text-sm text-slate-600 mb-6">{error}</p>
          <button
            onClick={() => setLocation("/login")}
            className="w-full py-2.5 rounded-lg bg-slate-900 text-white font-medium text-sm md:text-base hover:bg-slate-800"
          >
            로그인으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center justify-center bg-slate-50 overflow-hidden md:overflow-visible h-[100dvh] md:h-auto md:min-h-screen"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-slate-500">로그인 처리 중...</span>
      </div>
    </div>
  );
}
