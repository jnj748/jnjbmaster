import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/**
 * [Task #772 — 키보드 사절 7규칙] 항목 칩 셀렉트 — 자주 쓰는 카테고리/계정과목/
 * 사유 등을 손가락 한 번 탭으로 고를 수 있게 한다.
 */
export interface ChipOption<V extends string = string> {
  value: V;
  label: string;
  hint?: string;
}

export interface ChipSelectProps<V extends string = string> {
  label?: string;
  options: ChipOption<V>[];
  value?: V | null;
  onChange: (value: V) => void;
  disabled?: boolean;
}

export function ChipSelect<V extends string = string>({
  label,
  options,
  value,
  onChange,
  disabled,
}: ChipSelectProps<V>) {
  return (
    <div className="space-y-2" data-testid="accountant-chip-select">
      {label ? <Label className="text-sm font-medium">{label}</Label> : null}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              className={cn(
                "rounded-full border px-4 py-2 text-sm font-medium transition-colors",
                "min-h-10",
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-background text-foreground hover:bg-muted",
                disabled && "cursor-not-allowed opacity-60",
              )}
              aria-pressed={active}
            >
              <span>{opt.label}</span>
              {opt.hint ? (
                <span className="ml-1.5 text-xs opacity-70">{opt.hint}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
