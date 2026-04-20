import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2 } from "lucide-react";
import { useBuilding } from "@/contexts/building-context";
import { ROLE_LABELS, type Role } from "@/lib/permissions";
import { WidgetErrorBoundary } from "./error-boundary";
import type { WidgetDefinition, WidgetSpan } from "./types";

/**
 * Tailwind class for a widget's desktop column span. Mobile is always 1
 * column (single stack); the grid template at the shell level expands at
 * `md` and `xl` breakpoints.
 */
function spanClass(span: WidgetSpan = "full"): string {
  switch (span) {
    case "quarter":
      return "md:col-span-2 xl:col-span-1";
    case "third":
      // Approximated on a 4-col grid; on md (2-col) we let it wrap naturally.
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
  /** Ordered widget catalog entries to render. */
  widgets: WidgetDefinition[];
  /** Current user role — drives the shell-level header label. */
  role: Role;
}

/**
 * ShellHeader — single, role-agnostic header rendered above the widget
 * grid. Owns the "what role am I, which building am I looking at" framing
 * for every dashboard so individual widgets don't have to repeat it.
 */
function ShellHeader({ role }: { role: Role }) {
  const { building } = useBuilding();
  const roleLabel = ROLE_LABELS[role];
  const buildingName = building?.name ?? null;

  return (
    <header
      className="flex flex-col gap-1 mb-4"
      data-dashboard-header
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium">{roleLabel}</span>
        {buildingName && (
          <>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              <span className="truncate max-w-[14rem]">{buildingName}</span>
            </span>
          </>
        )}
      </div>
      <h1 className="text-lg font-bold sm:text-xl">대시보드</h1>
    </header>
  );
}

/**
 * DashboardShell — single entry point for every role's dashboard.
 *
 * Responsibilities owned at the shell level (so widgets don't repeat them):
 *  • Role-agnostic header (current role label + active building name).
 *  • Empty-state when the role has no widgets configured.
 *  • Responsive grid that stacks 1-col on mobile and expands to 2/4-col
 *    on md/xl.
 *  • Per-widget Suspense + ErrorBoundary so loading / failure are isolated
 *    and one bad widget cannot blank the entire dashboard.
 *
 * Per-widget chrome (titles, sections, building-specific copy) still lives
 * inside each widget — sub-widget extraction of remaining role-specific
 * pieces continues under #146 (large-page decomposition).
 */
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
