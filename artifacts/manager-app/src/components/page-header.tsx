import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * 표준 페이지 헤더 — 모든 메뉴 화면에서 동일한 형식으로 사용.
 * - 메뉴명 (title)
 * - 설명 (description)
 * - 아이콘/액션 (actions)
 *
 * 모바일에서는 제목/설명 위에 액션이 아래로 줄바꿈되어 한글 제목이 세로로
 * 깨지는 현상을 방지합니다.
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-bold leading-tight break-keep">{title}</h1>
        {description && (
          <p className="text-muted-foreground text-sm mt-1 break-keep">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>
      )}
    </div>
  );
}
