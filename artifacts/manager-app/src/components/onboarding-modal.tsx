// [Task #106] 관리소장 첫 로그인 모달.
// 표시 조건: role=manager AND onboardingPreference=null AND status 로드 완료.
// '지금 시작'  → preference='started' 저장 후 /onboarding 으로 이동.
// '나중에'    → preference='browsing' 저장 후 모달 닫기(현재 페이지 유지).

import { useState } from "react";
import { useLocation } from "wouter";
// [Task #174] 신규 관리소장은 위저드(`/onboarding/manager`)로 직행한다.
// 위저드/역할선택 페이지에서는 이 모달을 강제로 숨겨 중복 노출을 방지한다.
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
} from "@/components/ui/responsive-dialog";
import { Building2, Eye } from "lucide-react";
import { useOnboarding } from "@/contexts/onboarding-context";
import { useAuth } from "@/contexts/auth-context";

export function OnboardingModal() {
  const { user } = useAuth();
  const { status, isLoading, isManager, setPreference } = useOnboarding();
  const [location, setLocation] = useLocation();
  const [submitting, setSubmitting] = useState<"started" | "browsing" | null>(null);

  // 표시 안 함 조건:
  // - manager 외 역할 / 로딩 중 / 이미 선택 완료
  // - isLegacyExempt: 출시 이전 계정 또는 이미 Gate1 완료(기존 운영 manager 보호)
  const onWizardRoute =
    location.startsWith("/onboarding/manager") ||
    location.startsWith("/onboarding/role-select");
  const open = !!(
    isManager &&
    !isLoading &&
    status &&
    !status.isLegacyExempt &&
    status.preference === null &&
    user &&
    !onWizardRoute
  );

  const handleStart = async () => {
    setSubmitting("started");
    try {
      // [Task #174] 신규 매니저는 모바일 위저드로 진입.
      // 레거시 진입 경로(`/onboarding`)는 더 이상 사용하지 않는다.
      if (isManager) {
        setLocation("/onboarding/manager");
      } else {
        await setPreference("started");
        setLocation("/onboarding");
      }
    } finally {
      setSubmitting(null);
    }
  };

  const handleBrowsing = async () => {
    setSubmitting("browsing");
    try {
      await setPreference("browsing");
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={() => { /* 강제 선택 — 외부 닫기 불가 */ }}>
      <ResponsiveDialogContent className="sm:max-w-md" onEscapeKeyDown={(e) => e.preventDefault()} onPointerDownOutside={(e) => e.preventDefault()}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>환영합니다, {user?.name} 관리소장님</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            관리의달인을 처음 사용하시는군요. 어떻게 시작하시겠어요?
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <div className="space-y-3 py-2">
          <button
            onClick={handleStart}
            disabled={submitting !== null}
            className="w-full flex items-start gap-3 p-4 rounded-lg border-2 border-primary bg-primary/5 hover:bg-primary/10 transition-colors text-left disabled:opacity-50"
          >
            <Building2 className="w-6 h-6 text-primary shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="font-semibold text-sm">지금 바로 시작</div>
              <p className="text-xs text-muted-foreground mt-1">
                건물 정보 등록 → 법정업무 자동 생성. 약 5~10분 소요.
              </p>
            </div>
          </button>

          <button
            onClick={handleBrowsing}
            disabled={submitting !== null}
            className="w-full flex items-start gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
          >
            <Eye className="w-6 h-6 text-muted-foreground shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="font-semibold text-sm">먼저 둘러볼게요</div>
              <p className="text-xs text-muted-foreground mt-1">
                메뉴를 살펴본 뒤 나중에 등록할 수 있어요. 자동화 기능은 등록 후 활성화됩니다.
              </p>
            </div>
          </button>
        </div>

        {submitting && (
          <p className="text-center text-xs text-muted-foreground">
            {submitting === "started" ? "이동 중..." : "저장 중..."}
          </p>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
