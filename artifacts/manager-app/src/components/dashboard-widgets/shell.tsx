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

  return (
    <div className="p-3 sm:p-4" data-dashboard-shell>
      <ShellHeader role={role} />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 auto-rows-min">
        {widgets.map((w) => {
          const Cmp = w.component;
          return (
            <div
              key={w.key}
              className={spanClass(w.span)}
              data-widget-key={w.key}
            >
              <WidgetErrorBoundary widgetKey={w.key}>
                <Suspense fallback={<WidgetSkeleton />}>
                  <Cmp />
                </Suspense>
              </WidgetErrorBoundary>
            </div>
          );
        })}
      </div>
    </div>
  );
}
