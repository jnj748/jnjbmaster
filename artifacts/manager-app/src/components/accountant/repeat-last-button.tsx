import { Button } from "@/components/ui/button";
import { History } from "lucide-react";

/**
 * [Task #772 — 키보드 사절 7규칙] "지난번과 동일" 한 번 탭으로 직전 입력값을
 * 그대로 다시 채워주는 버튼.
 */
export interface RepeatLastButtonProps {
  onRepeat: () => void;
  hint?: string;
  disabled?: boolean;
}

export function RepeatLastButton({ onRepeat, hint, disabled }: RepeatLastButtonProps) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      className="w-full justify-start gap-2"
      onClick={onRepeat}
      disabled={disabled}
      data-testid="accountant-repeat-last-button"
    >
      <History className="size-4" />
      <span className="font-medium">지난번과 동일</span>
      {hint ? (
        <span className="ml-auto text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </Button>
  );
}
