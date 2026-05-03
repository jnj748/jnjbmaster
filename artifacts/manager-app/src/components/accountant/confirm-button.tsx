import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import type { ComponentProps } from "react";

/**
 * [Task #772 — 키보드 사절 7규칙] 입력 결과를 한 번에 확정시키는 큰 버튼.
 * 페이지 하단 sticky 영역에서 단독으로 쓰기 좋게 디자인되어 있다.
 */
export interface ConfirmButtonProps
  extends Omit<ComponentProps<typeof Button>, "size" | "variant"> {
  label?: string;
}

export function ConfirmButton({
  label = "확정",
  className,
  children,
  ...props
}: ConfirmButtonProps) {
  return (
    <Button
      type="button"
      size="lg"
      className={cn(
        "h-14 w-full text-base font-semibold",
        "shadow-lg",
        className,
      )}
      data-testid="accountant-confirm-button"
      {...props}
    >
      <Check className="size-5" />
      {children ?? label}
    </Button>
  );
}
