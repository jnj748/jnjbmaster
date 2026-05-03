// [Task #495] dashboard-manager-legacy 에서 추출. 매니저 대시보드 하단의
//   세대수/등록 차량/미납 관리비/미납 호실 4지표 그리드 전용 카드.
//   다른 페이지(facility-dashboard, building-info)들도 자체 StatCard 를 갖고
//   있어 모양/props 가 미세히 다르므로, 본 파일은 dashboard-manager-legacy 에
//   있던 시그니처/스타일 그대로 옮겨 회귀를 막는다.
//
// [Task #715] 4지표 카드 줄정렬·줄바꿈·오버플로우 정리:
//   - Card 루트에 `h-full` 을 줘서 어떤 한 카드의 본문이 길어져도 같은 행의
//     나머지 카드들이 동일 높이로 늘어나도록 한다(grid 의 align-items: stretch
//     기본값과 결합).
//   - 값 영역을 `min-w-0` 컨테이너로 감싸 자식의 `truncate` 가 실제로 동작하게
//     하고, 값 텍스트에는 `whitespace-nowrap truncate` 을 걸어 "26만원" 같은
//     문자열이 단어 중간에서 줄바꿈되지 않게 한다.
//   - 가변 폭 텍스트(미납 관리비 등)를 위한 `valueClassName` 옵션을 추가해
//     호출부에서 폰트 크기를 한 단계 작게 줄 수 있게 한다.

import type React from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
  href,
  valueClassName,
}: {
  title: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
  href?: string;
  valueClassName?: string;
}) {
  const content = (
    <Card
      className={cn(
        "h-full",
        href && "hover:bg-muted/50 transition-colors cursor-pointer",
      )}
    >
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground font-medium truncate">{title}</p>
            <p
              className={cn(
                "font-bold mt-0.5 whitespace-nowrap truncate",
                valueClassName ?? "text-lg sm:text-xl",
              )}
            >
              {value}
            </p>
            {subtitle && (
              <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>
            )}
          </div>
          <div className={`p-1.5 sm:p-2 rounded-lg ${color} shrink-0`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
  if (href) return <Link href={href} className="block h-full">{content}</Link>;
  return content;
}
