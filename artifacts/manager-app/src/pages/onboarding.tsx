// [Task #106] 관리소장 온보딩 위저드 — building-setup 재활용 + 진행 상태 헤더.

import { lazy, Suspense } from "react";
import { Redirect } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { useOnboarding } from "@/contexts/onboarding-context";

const BuildingSetup = lazy(() => import("@/pages/building-setup"));

function StepRow({ done, label, hint }: { done: boolean; label: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2">
      {done ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
      ) : (
        <Circle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
      )}
      <div className="min-w-0">
        <div className={`text-sm ${done ? "text-emerald-700 font-medium" : ""}`}>{label}</div>
        {hint && !done && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  const { user } = useAuth();
  const { status } = useOnboarding();

  // 보수: manager 외 역할은 온보딩 화면 진입 차단(직접 URL 접근 시 대시보드로).
  if (user && user.role !== "manager") {
    return <Redirect to="/" />;
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 sm:p-5 space-y-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold">건물 등록 위저드</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              아래 항목을 모두 채우면 자동화 기능이 활성화됩니다.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StepRow
              done={!!status?.gate1.hasBuilding}
              label="1. 건물 기본 정보"
              hint="건축물대장 검색으로 자동 채움"
            />
            <StepRow
              done={!!status?.gate1.hasCompletionDate}
              label="2. 준공일자"
              hint="하자담보·정기점검 일정의 기준"
            />
            <StepRow
              done={!!status?.gate1.hasLegalInspections}
              label="3. 법정업무 등록"
              hint="법정점검 자동 일정 생성"
            />
          </div>
          {status && (
            <div className="pt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">전체 진행률</span>
                <span className="font-semibold">{status.progressPercent}%</span>
              </div>
              <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${status.progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        }
      >
        <BuildingSetup />
      </Suspense>
    </div>
  );
}
