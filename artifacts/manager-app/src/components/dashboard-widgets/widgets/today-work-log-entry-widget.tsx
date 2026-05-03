// [Task #495] dashboard-manager-legacy 에서 추출.
//   [원본 주석 보존]
//   [Task #205] 대시보드의 "제안업무현황" 바로 아래에서 오늘 업무일지 자동 작성 진입점.
//   당일 일지 존재 여부에 따라 안내 문구/색을 달리해 시니어 사용자 인지를 돕는다.
//
//   [Task #503] 데스크톱 매니저 2열 레이아웃의 우측 강조 카드로도 사용된다.
//
//   [Task #706] prominent / compact 두 갈래를 단일 가로 컴팩트 카드로 통합한다.
//   세 역할(소장/시설/경리) 의 모든 대시보드에서 동일한 모양·동일한 문구를
//   본다 — 왼쪽 작은 원형 아이콘 + 오른쪽 굵은 한 줄 제목 + 안내 두 줄.
//   prominent variant 는 더 이상 부모 셀 높이를 채우지 않는다(`h-full` 제거).
//   문구도 다음으로 통일:
//     - 미작성: "금일 업무일지 생성 전입니다." / "여기를 눌러 자동생성해보세요."
//     - 작성완료: 기존 한 줄 안내 "금일 업무일지가 생성완료되었습니다" 유지.

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { NotebookPen } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { CATEGORY_ICON_CLASS, CATEGORY_BG_CLASS } from "@/lib/category-colors";

export interface TodayWorkLogEntryProps {
  /**
   * [Task #706] prominent / compact 모두 동일한 가로 컴팩트 레이아웃을 사용한다.
   * 세 역할 대시보드에서 같은 카드가 보이도록 하는 통합 결과로, prop 값은
   * 호환을 위해 남겨두지만 시각적 차이는 없다.
   */
  variant?: "compact" | "prominent";
  className?: string;
}

export function TodayWorkLogEntry({ variant: _variant = "compact", className }: TodayWorkLogEntryProps = {}) {
  const { token } = useAuth();
  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");
  const todayKst = (() => {
    const ms = Date.now() + 9 * 60 * 60 * 1000;
    return new Date(ms).toISOString().split("T")[0];
  })();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-today-journal", todayKst],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/daily-journals/${todayKst}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) return null;
      if (res.status === 204) return null;
      return (await res.json()) as null | { id: number };
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: true,
    enabled: !!token,
  });

  const hasJournal = !!data;
  // [Task #706] 미작성 안내 두 줄 / 작성완료 한 줄 — 세 역할에서 동일.
  const messageLine1 = hasJournal
    ? "금일 업무일지가 생성완료되었습니다"
    : "금일 업무일지 생성 전입니다.";
  const messageLine2 = hasJournal ? null : "여기를 눌러 자동생성해보세요.";
  const messageClass = hasJournal ? "text-emerald-600" : "text-amber-700";

  // [Task #706] 컴팩트 가로 레이아웃: 왼쪽 작은 원형 아이콘 + 오른쪽 굵은 한 줄
  //   제목 + 안내 2줄. prominent 분기를 제거해 세 역할 대시보드에서 동일한
  //   카드를 보여 주고, 부모 셀 높이를 채우지 않도록 h-full 도 사용하지 않는다.
  return (
    <Card className={className}>
      <CardContent className="p-2.5">
        <Link href="/work-log?openDaily=1">
          <button
            type="button"
            data-testid="dashboard-today-worklog"
            className="w-full flex items-center gap-3 py-0.5 px-1 hover-elevate active-elevate-2 rounded-lg text-left"
          >
            {/* [Task #256] reports 카테고리 — category-colors.ts 단일 토큰 참조 */}
            <span className={`w-8 h-8 rounded-full ${CATEGORY_BG_CLASS.reports} flex items-center justify-center shrink-0`}>
              <NotebookPen className={`w-4 h-4 ${CATEGORY_ICON_CLASS.reports}`} />
            </span>
            <span className="flex flex-col min-w-0 flex-1">
              <span className="text-sm font-bold">오늘 업무일지 자동 작성하기</span>
              <span
                className={`text-[11px] font-medium leading-snug ${messageClass}`}
                data-testid="dashboard-today-worklog-status"
              >
                {isLoading ? (
                  "확인 중..."
                ) : (
                  <>
                    <span className="block">{messageLine1}</span>
                    {messageLine2 && <span className="block">{messageLine2}</span>}
                  </>
                )}
              </span>
            </span>
          </button>
        </Link>
      </CardContent>
    </Card>
  );
}
