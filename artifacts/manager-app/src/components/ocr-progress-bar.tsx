// [Task #472] OCR 진행도 가로바 — 메모/관리비 고지서/계약서/회계담당자 위저드
// 네 위치에서 동일하게 사용하는 표시 컴포넌트.
//
// useOcrProgress 의 결과를 받아 idle 일 땐 아무것도 그리지 않고, 진행 중일 땐
// "사진 업로드 중 N%" / "AI가 글자 인식 중 N%" 라벨과 함께 작은 가로바를
// 보여준다. 실패 시(isError) 즉시 사라진다.

import { Progress } from "@/components/ui/progress";
import { useOcrProgress } from "@/hooks/use-ocr-progress";
import { cn } from "@/lib/utils";

interface OcrProgressBarProps {
  isUploading: boolean;
  uploadProgress: number;
  isOcrPending: boolean;
  /** 선택: OCR 이후 추가 저장 단계 진행 중 여부. */
  isSaving?: boolean;
  /** 선택: 저장 단계 라벨(미지정 시 "저장 중"). */
  savingLabel?: string;
  /** 선택: 직전 작업 실패 신호. true 가 되면 가로바가 즉시 사라진다. */
  isError?: boolean;
  className?: string;
  testId?: string;
}

export function OcrProgressBar({
  isUploading,
  uploadProgress,
  isOcrPending,
  isSaving,
  savingLabel,
  isError,
  className,
  testId,
}: OcrProgressBarProps) {
  const { percent, phase, label, active } = useOcrProgress({
    isUploading,
    uploadProgress,
    isOcrPending,
    isSaving,
    savingLabel,
    isError,
  });

  if (!active) return null;

  // 라벨에 이미 "N%" 가 붙어있어 우측 백분율 칩과 중복되지 않도록, 라벨에서는
  // 단계 텍스트만 떼어 좌측에 보여주고 우측에 큰 모노폰트 백분율을 둔다.
  const phaseText = label.replace(/\s\d+%$/, "");

  return (
    <div
      className={cn("w-full space-y-1", className)}
      data-testid={testId ?? "ocr-progress-bar"}
      data-phase={phase}
      data-percent={percent}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between text-[11px] leading-tight text-muted-foreground">
        <span className="truncate">{phaseText}</span>
        <span className="font-mono tabular-nums shrink-0 ml-2">{percent}%</span>
      </div>
      <Progress value={percent} className="h-1.5" />
    </div>
  );
}
