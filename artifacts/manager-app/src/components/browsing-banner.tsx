// [Task #106] 둘러보기 모드 상단 배너.
// preference='browsing' AND gate1.completed=false 일 때 모든 페이지 상단에 한 줄 안내.

import { Eye, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { useOnboarding } from "@/contexts/onboarding-context";

export function BrowsingBanner() {
  const { status, isManager } = useOnboarding();

  if (!isManager || !status) return null;
  if (status.preference !== "browsing") return null;
  if (status.gate1.completed) return null;

  return (
    <div className="bg-amber-50 border-b border-amber-200 px-3 sm:px-6 py-2 text-xs sm:text-sm text-amber-900 flex items-center gap-2">
      <Eye className="w-4 h-4 shrink-0" />
      <span className="flex-1 min-w-0">
        둘러보기 모드입니다. 자동화 기능은 건물 정보 등록 후 활성화됩니다.
      </span>
      <Link href="/onboarding">
        <button className="flex items-center gap-1 font-medium underline shrink-0">
          지금 등록 <ArrowRight className="w-3 h-3" />
        </button>
      </Link>
    </div>
  );
}
