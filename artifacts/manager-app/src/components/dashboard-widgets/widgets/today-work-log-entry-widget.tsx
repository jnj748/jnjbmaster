// [Task #495] dashboard-manager-legacy 에서 추출.
//   [원본 주석 보존]
//   [Task #205] 대시보드의 "제안업무현황" 바로 아래에서 오늘 업무일지 자동 작성 진입점.
//   당일 일지 존재 여부에 따라 안내 문구/색을 달리해 시니어 사용자 인지를 돕는다.

import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { NotebookPen } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { CATEGORY_ICON_CLASS, CATEGORY_BG_CLASS } from "@/lib/category-colors";

export function TodayWorkLogEntry() {
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
  // [Task #382] 일지가 아직 없는 날에는 안내를 두 줄로 분리해 시니어 사용자가
  //   "현재 상태"와 "해야 할 행동(클릭)"을 명확히 구분 인지하도록 한다.
  //   일지가 이미 있는 날은 기존 한 줄 안내 유지.
  const messageLine1 = hasJournal
    ? "금일 업무일지가 생성완료되었습니다"
    : "금일 업무일지 생성 전입니다.";
  const messageLine2 = hasJournal ? null : "여기를 눌러 자동으로 생성해보세요.";
  const messageClass = hasJournal ? "text-emerald-600" : "text-red-600";

  // [Task #246] 컴팩트 가로 레이아웃: 왼쪽 아이콘 + 오른쪽 2줄 텍스트.
  // 화면 점유율을 줄이기 위해 아이콘/폰트 크기를 절반 수준으로 축소했다.
  return (
    <Card>
      <CardContent className="p-3">
        <Link href="/work-log?openDaily=1">
          <button
            type="button"
            data-testid="dashboard-today-worklog"
            className="w-full flex items-center gap-3 py-1 px-1 hover-elevate active-elevate-2 rounded-lg text-left"
          >
            {/* [Task #256] reports 카테고리 — category-colors.ts 단일 토큰 참조 */}
            <span className={`w-8 h-8 rounded-full ${CATEGORY_BG_CLASS.reports} flex items-center justify-center shrink-0`}>
              <NotebookPen className={`w-4 h-4 ${CATEGORY_ICON_CLASS.reports}`} />
            </span>
            <span className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-semibold">오늘 업무일지 자동 작성하기</span>
              {/* [Task #382] 안내 문구는 상태(있음/없음)에 따라 1~2 줄로 표시한다.
                  block + leading-snug 으로 두 줄이 깔끔히 쌓이도록 한다. */}
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
