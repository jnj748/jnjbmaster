import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2 } from "lucide-react";
import { useBuilding } from "@/contexts/building-context";
import type { Role } from "@/lib/permissions";
import { WidgetErrorBoundary } from "./error-boundary";
import type { WidgetDefinition, WidgetSpan } from "./types";

function spanClass(span: WidgetSpan = "full"): string {
  switch (span) {
    case "quarter":
      return "md:col-span-2 xl:col-span-1";
    case "third":
      return "md:col-span-2 xl:col-span-2";
    case "half":
      return "md:col-span-2 xl:col-span-2";
    case "full":
    default:
      return "md:col-span-2 xl:col-span-4";
  }
}

function WidgetSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  );
}

interface DashboardShellProps {
  widgets: WidgetDefinition[];
  role: Role;
}

function ShellHeader({ role: _role }: { role: Role }) {
  const { building } = useBuilding();
  const buildingName = building?.name ?? null;

  if (!buildingName) return null;

  return (
    <header className="flex items-center gap-2 mb-2" data-dashboard-header>
      <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
      <h1 className="text-base font-bold sm:text-lg truncate">{buildingName}</h1>
    </header>
  );
}

// DashboardShell owns the role/building header, the empty state, the
// responsive grid (1↔2↔4 col), and per-widget Suspense + ErrorBoundary
// isolation. Role pages should not render their own page headers — the
// shell is the single source of dashboard framing.
export function DashboardShell({ widgets, role }: DashboardShellProps) {
  if (widgets.length === 0) {
    return (
      <div className="p-6">
        <ShellHeader role={role} />
        <p className="text-sm text-muted-foreground">
          이 역할에 구성된 대시보드 위젯이 없습니다.
        </p>
      </div>
    );
  }

  // [Task #327 → 사용자 배치 변경 v2] 모바일(≤899px) 위젯 순서:
  //   1) *-main 위젯 (필수업무/제안업무/일지자동작성/KPI 4개)
  //   2) delinquency-summary-widget — 사용자 요청에 따라 KPI(연체 세대 항목)
  //      바로 다음에 "연체 세대 현황" 카드를 노출.
  //   3) 나머지 보조 위젯(campaign-banner / building-info / pending-approvals 등)
  // *-main 이 없으면 원래 순서를 유지하되 연체세대 위젯만 앞으로 끌어올린다.
  const mainWidget = widgets.find((w) => w.key.endsWith("-main"));
  const delinquencyWidget = widgets.find(
    (w) => w.key === "delinquency-summary-widget",
  );
  const mobileWidgets = (() => {
    const ordered: typeof widgets = [];
    if (mainWidget) ordered.push(mainWidget);
    if (delinquencyWidget && delinquencyWidget !== mainWidget) {
      ordered.push(delinquencyWidget);
    }
    for (const w of widgets) {
      if (w === mainWidget || w === delinquencyWidget) continue;
      ordered.push(w);
    }
    return ordered;
  })();

  function renderWidget(w: WidgetDefinition, withSpan: boolean) {
    const Cmp = w.component;
    return (
      <div
        key={w.key}
        className={withSpan ? spanClass(w.span) : ""}
        data-widget-key={w.key}
      >
        <WidgetErrorBoundary widgetKey={w.key}>
          <Suspense fallback={<WidgetSkeleton />}>
            <Cmp />
          </Suspense>
        </WidgetErrorBoundary>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4" data-dashboard-shell>
      <ShellHeader role={role} />
      {/* 모바일: *-main 위젯만 (자체 컴팩트 뷰 포함) */}
      <div className="dash-mobile-only">
        <div className="space-y-3">
          {mobileWidgets.map((w) => renderWidget(w, false))}
        </div>
      </div>
      {/* 데스크탑: 기존 다단 그리드 그대로
          [Task #784] 한 화면(1440×900) 안에 모든 위젯이 들어오도록 그리드 간격을
          gap-4 → gap-3 으로 압축. 위젯 내부 컴팩트화와 함께 폴드 라인을 끌어올린다. */}
      <div className="dash-desktop-only">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 auto-rows-min">
          {widgets.map((w) => renderWidget(w, true))}
        </div>
      </div>
    </div>
  );
}
