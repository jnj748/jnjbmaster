import { Star } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  readOnly?: boolean;
  className?: string;
}

// 0.5 단위로 1.0 ~ 5.0 범위의 별점을 표시/입력하는 컴포넌트.
// readOnly 가 true 면 표시 전용으로 동작한다.
export function StarRating({
  value,
  onChange,
  size = 28,
  readOnly = false,
  className,
}: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value;

  function handleClick(idx: number, half: boolean) {
    if (readOnly || !onChange) return;
    const v = idx + (half ? 0.5 : 1);
    onChange(v);
  }

  return (
    <div className={cn("flex items-center gap-0.5", className)} onMouseLeave={() => setHover(null)}>
      {[0, 1, 2, 3, 4].map((i) => {
        const filled = display - i;
        return (
          <div
            key={i}
            className="relative"
            style={{ width: size, height: size }}
            data-testid={`star-${i + 1}`}
          >
            <Star
              className="absolute inset-0 text-muted-foreground/30"
              style={{ width: size, height: size }}
            />
            <Star
              className="absolute inset-0 text-yellow-400 fill-yellow-400 overflow-hidden"
              style={{
                width: size,
                height: size,
                clipPath:
                  filled >= 1
                    ? "inset(0 0 0 0)"
                    : filled >= 0.5
                      ? "inset(0 50% 0 0)"
                      : "inset(0 100% 0 0)",
              }}
            />
            {!readOnly && (
              <>
                <button
                  type="button"
                  className="absolute left-0 top-0 h-full w-1/2 cursor-pointer"
                  onMouseEnter={() => setHover(i + 0.5)}
                  onClick={() => handleClick(i, true)}
                  aria-label={`${i + 0.5} 별점`}
                />
                <button
                  type="button"
                  className="absolute right-0 top-0 h-full w-1/2 cursor-pointer"
                  onMouseEnter={() => setHover(i + 1)}
                  onClick={() => handleClick(i, false)}
                  aria-label={`${i + 1} 별점`}
                />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

// 작은 인라인 표시용. 평균 별점 + 건수.
export function VendorRatingInline({
  avgRating,
  reviewCount,
  size = 14,
  className,
}: {
  avgRating: number | null | undefined;
  reviewCount: number | null | undefined;
  size?: number;
  className?: string;
}) {
  if (!reviewCount || reviewCount <= 0 || avgRating == null) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>평가 없음</span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm", className)}>
      <Star
        className="text-yellow-400 fill-yellow-400"
        style={{ width: size, height: size }}
      />
      <span className="font-medium">{avgRating.toFixed(1)}</span>
      <span className="text-xs text-muted-foreground">({reviewCount}건)</span>
    </span>
  );
}
