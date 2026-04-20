// [Task #132] 가입 후 역할별 위저드 공용 셸. 진행률·이전/다음/건너뛰기 버튼 제공.
import type { ReactNode } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

interface WizardShellProps {
  title: string;
  subtitle?: string;
  currentStep: number;
  totalSteps: number;
  children: ReactNode;
  onPrev?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  loading?: boolean;
  allowSkip?: boolean;
  onSkip?: () => void;
}

export function WizardShell({
  title,
  subtitle,
  currentStep,
  totalSteps,
  children,
  onPrev,
  onNext,
  nextLabel = "다음",
  nextDisabled = false,
  loading = false,
  allowSkip = false,
  onSkip,
}: WizardShellProps) {
  const [, setLocation] = useLocation();
  const percent = Math.round((currentStep / totalSteps) * 100);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:py-10">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 sm:px-7 pt-5 pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-500">
                Step {currentStep} / {totalSteps}
              </span>
              <button
                type="button"
                onClick={() => setLocation("/")}
                className="text-slate-400 hover:text-slate-600"
                aria-label="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${percent}%` }}
              />
            </div>
            <h1 className="mt-4 text-lg sm:text-xl font-bold text-slate-900">{title}</h1>
            {subtitle && <p className="text-xs sm:text-sm text-slate-500 mt-1">{subtitle}</p>}
          </div>

          <div className="px-5 sm:px-7 py-5 sm:py-6">{children}</div>

          <div className="px-5 sm:px-7 py-4 border-t border-slate-100 flex items-center justify-between gap-3 bg-slate-50">
            <button
              type="button"
              onClick={onPrev}
              disabled={!onPrev || loading}
              className="inline-flex items-center gap-1 px-3 py-2 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              이전
            </button>

            <div className="flex items-center gap-2">
              {allowSkip && onSkip && (
                <button
                  type="button"
                  onClick={onSkip}
                  disabled={loading}
                  className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700"
                >
                  건너뛰기
                </button>
              )}
              <button
                type="button"
                onClick={onNext}
                disabled={nextDisabled || !onNext || loading}
                className="inline-flex items-center gap-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "처리 중..." : nextLabel}
                {!loading && <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
