import { useMemo } from "react";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";

/**
 * [Task #772 — 키보드 사절 7규칙] 경리 입력 화면에서 숫자 타이핑을 줄이기 위한
 * 큰 슬라이더. 5천원/1만원 단위 스냅을 기본으로, max 와 step 은 호출자가 결정.
 */
export interface AmountSliderProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max: number;
  step?: number;
  formatter?: (v: number) => string;
  disabled?: boolean;
}

const defaultFormatter = (v: number) => `${v.toLocaleString("ko-KR")}원`;

export function AmountSlider({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 10000,
  formatter = defaultFormatter,
  disabled,
}: AmountSliderProps) {
  const display = useMemo(() => formatter(value), [formatter, value]);
  return (
    <div className="space-y-3" data-testid="accountant-amount-slider">
      {label ? (
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">{label}</Label>
          <span className="text-lg font-bold tabular-nums">{display}</span>
        </div>
      ) : (
        <div className="text-right text-lg font-bold tabular-nums">{display}</div>
      )}
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(values) => onChange(values[0] ?? min)}
        disabled={disabled}
      />
      <div className="flex justify-between text-xs text-muted-foreground tabular-nums">
        <span>{formatter(min)}</span>
        <span>{formatter(max)}</span>
      </div>
    </div>
  );
}
