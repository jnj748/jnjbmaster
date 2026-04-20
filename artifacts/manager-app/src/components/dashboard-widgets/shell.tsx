import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
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

/**
 * DashboardShell — single entry point for every role's dashboard.
 *
 * Responsibilities:
 *  • Provide a responsive grid that stacks 1-col on mobile and expands to
 *    2/4-col on md/xl.
 *  • Wrap each widget in its own Suspense + ErrorBoundary so loading and
 *    failure are isolated per-widget.
 *
 * Each role-specific page header / building context lives inside the
 * widgets themselves for now. Sub-widget extraction (so the shell can own
 * a unified header) is tracked under the large-page-decomposition task.
 */
export function DashboardShell({ widgets }: { widgets: WidgetDefinition[] }) {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 auto-rows-min"
      data-dashboard-shell
    >
      {widgets.map((w) => {
        const Cmp = w.component;
        return (
          <div key={w.key} className={spanClass(w.span)} data-widget-key={w.key}>
            <WidgetErrorBoundary widgetKey={w.key}>
              <Suspense fallback={<WidgetSkeleton />}>
                <Cmp />
              </Suspense>
            </WidgetErrorBoundary>
          </div>
        );
      })}
    </div>
  );
}
