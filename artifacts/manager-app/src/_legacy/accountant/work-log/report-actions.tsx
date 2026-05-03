import { Button } from "@/components/ui/button";
import { ImageDown, Share2, Printer, FileText } from "lucide-react";
import type { A4DocumentFrameHandle } from "@/components/a4-document-frame";
// [Task #554] printIsolatedNode 는 daily/weekly/monthly-tab 에서 직접 import.
// 이 파일은 withReadyDoc(frame transform 해제) 책임만 유지한다.

/**
 * [Task #205] 일/주/월 일지 공통 액션 버튼.
 * "이미지로 저장 / 공유 / 인쇄" 3개를 가로 풀폭 균등 배치한다.
 * 세 탭에서 명칭·아이콘·동작이 동일해야 한다.
 */
export function ReportActionRow({
  onSaveImage, onShare, onPrint,
  onMakeApproval,
  saving = false, sharing = false,
  testidPrefix,
}: {
  onSaveImage: () => void;
  onShare: () => void;
  onPrint: () => void;
  /** [Task #610] 일/주/월 일지 → 기안서로 만들기 진입. undefined 면 미노출. */
  onMakeApproval?: () => void;
  saving?: boolean;
  sharing?: boolean;
  testidPrefix: string;
}) {
  // [Task #332] 모바일(약 360px)에서 1/3 컬럼이 좁아 "이미지로 저장" 라벨이
  // 컨테이너 밖으로 삐져나오는 현상을 방지한다.
  // - grid 1:1:1 균등 배치는 그대로 유지하되, 각 셀이 실제로 줄어들 수 있도록
  //   `min-w-0` 을 부여한다(grid item 기본 min-width 는 auto 라 콘텐츠를 밀어냄).
  // - Button 의 기본 `whitespace-nowrap` 을 `whitespace-normal` 로 풀고,
  //   한국어가 단어 중간에서 잘리지 않도록 `break-keep` 를 함께 적용해
  //   좁은 폭에서 "이미지로 / 저장" 처럼 자연스럽게 줄바꿈되도록 한다.
  // - 좌우 패딩(`px-2`)·아이콘 간격(`gap-1`)·폰트 크기(`text-xs sm:text-sm`)를
  //   컴팩트하게 줄여 컬럼 폭 안에서 안정적으로 표시되게 한다.
  // - 줄바꿈 시 높이가 자연스럽게 늘어나도록 `min-h-9 h-auto py-1.5` 로 보정한다.
  // - 라벨/아이콘 자체는 변경하지 않는다.
  const actionButtonClass =
    "w-full min-w-0 px-2 gap-1 text-xs sm:text-sm whitespace-normal break-keep leading-tight min-h-9 h-auto py-1.5";
  // [Task #610] 기안서 진입 버튼이 있으면 4컬럼, 없으면 기존 3컬럼.
  const cols = onMakeApproval ? "grid-cols-4" : "grid-cols-3";
  return (
    <div className={`grid ${cols} gap-2 print:hidden`} data-testid={`${testidPrefix}-actions`}>
      <Button
        variant="outline"
        onClick={onSaveImage}
        disabled={saving}
        data-testid={`${testidPrefix}-save-image`}
        className={actionButtonClass}
      >
        <ImageDown className="w-4 h-4 shrink-0" />
        <span className="min-w-0">{saving ? "저장 중..." : "이미지로 저장"}</span>
      </Button>
      <Button
        variant="outline"
        onClick={onShare}
        disabled={sharing}
        data-testid={`${testidPrefix}-share`}
        className={actionButtonClass}
      >
        <Share2 className="w-4 h-4 shrink-0" />
        <span className="min-w-0">{sharing ? "공유 중..." : "공유"}</span>
      </Button>
      <Button
        variant="outline"
        onClick={onPrint}
        data-testid={`${testidPrefix}-print`}
        className={actionButtonClass}
      >
        <Printer className="w-4 h-4 shrink-0" />
        <span className="min-w-0">인쇄</span>
      </Button>
      {onMakeApproval && (
        <Button
          variant="outline"
          onClick={onMakeApproval}
          data-testid={`${testidPrefix}-make-approval`}
          className={actionButtonClass}
        >
          <FileText className="w-4 h-4 shrink-0" />
          <span className="min-w-0">기안서로 만들기</span>
        </Button>
      )}
    </div>
  );
}

export async function withReadyDoc<T>(
  frameRef: React.RefObject<A4DocumentFrameHandle | null>,
  fn: () => Promise<T> | T,
): Promise<T> {
  if (frameRef.current) return await frameRef.current.withFullScale(fn);
  return await fn();
}
