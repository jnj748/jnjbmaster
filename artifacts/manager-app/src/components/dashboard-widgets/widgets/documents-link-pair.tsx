// [Task #495] manager-main-widget 에서 추가 분리.
//   [원본 주석 보존]
//   [Task #250] 문서 산출물 진입(최근 문서함) + 처리 내역 진입을 한 묶음으로 그룹핑.
//   위/아래 다른 섹션과 시각적으로 분리하기 위해 외곽은 부모의 space-y-6 를 그대로
//   쓰되, 두 카드 사이는 space-y-2(모바일) / sm:space-y-2.5 로 좁혀 가독성 + 페어
//   관계를 명확히 한다. 카드 내부 여백·타이포는 모바일에서도 한 줄에 깔끔히 들어가도록
//   정돈.

import { Link } from "wouter";
import { FolderOpen, ListChecks } from "lucide-react";
import { CATEGORY_ICON_CLASS } from "@/lib/category-colors";

export function DocumentsLinkPair() {
  return (
    <div className="space-y-2 sm:space-y-2.5">
      <Link href="/recent-documents">
        <button
          type="button"
          data-testid="btn-recent-documents"
          className="w-full flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 sm:py-3.5 text-left hover:bg-muted/50 transition"
        >
          <span className="flex items-center gap-3 min-w-0">
            {/* [Task #256] system 카테고리 — 처리 내역(reports)과 색으로 구분 */}
            <FolderOpen className={`w-5 h-5 ${CATEGORY_ICON_CLASS.system} shrink-0`} />
            <span className="flex flex-col min-w-0">
              <span className="font-medium text-sm leading-tight">최근 문서함</span>
              <span className="text-[11px] sm:text-xs text-muted-foreground leading-snug truncate">
                기안·견적·공고·일지 보고서·외부 업로드
              </span>
            </span>
          </span>
          <span className="text-xs text-muted-foreground shrink-0">열기 →</span>
        </button>
      </Link>

      <Link href="/work-log?tab=activity">
        <button
          type="button"
          data-testid="btn-activity-log"
          className="w-full flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 sm:py-3.5 text-left hover:bg-muted/50 transition"
        >
          <span className="flex items-center gap-3 min-w-0">
            {/* [Task #256] reports 카테고리 — 업무일지 화면과 동일 토큰 */}
            <ListChecks className={`w-5 h-5 ${CATEGORY_ICON_CLASS.reports} shrink-0`} />
            <span className="flex flex-col min-w-0">
              <span className="font-medium text-sm leading-tight">처리 내역</span>
              <span className="text-[11px] sm:text-xs text-muted-foreground leading-snug truncate">
                메모·처리완료·일지를 시간순으로
              </span>
            </span>
          </span>
          <span className="text-xs text-muted-foreground shrink-0">열기 →</span>
        </button>
      </Link>
    </div>
  );
}
