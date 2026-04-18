import { cn } from "@/lib/utils";
import type { FacilityStatusBadge as Badge } from "@workspace/api-client-react";

interface Props {
  badge: Badge | undefined;
  /** Smaller variant for the desktop sidebar (10px font); larger for mobile drawer. */
  size?: "sm" | "md";
}

/**
 * Absolute-positioned colored dot/number rendered on top of a facility icon.
 * - Color + count are both shown so color-blind users get a redundant signal.
 * - When level === "none", renders nothing.
 * - aria-label comes pre-rendered from the API to keep i18n in one place.
 */
export function FacilityStatusBadge({ badge, size = "sm" }: Props) {
  if (!badge || badge.level === "none") return null;

  const colorClass =
    badge.level === "red"
      ? "bg-red-500 text-white"
      : "bg-yellow-400 text-yellow-950";

  const sizeClass =
    size === "sm"
      ? "min-w-[14px] h-[14px] text-[9px] px-1 -top-0.5 -right-0.5"
      : "min-w-[18px] h-[18px] text-[10px] px-1 -top-1 -right-1";

  return (
    <span
      role="status"
      aria-label={badge.ariaLabel}
      className={cn(
        "absolute rounded-full font-bold leading-none flex items-center justify-center shadow-sm",
        colorClass,
        sizeClass,
      )}
    >
      {badge.count > 0 ? (badge.count > 99 ? "99+" : badge.count) : ""}
    </span>
  );
}
