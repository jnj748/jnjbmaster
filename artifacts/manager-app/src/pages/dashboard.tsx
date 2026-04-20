import { useAuth } from "@/contexts/auth-context";
import { getEffectiveRole } from "@/lib/permissions";
import { DashboardShell } from "@/components/dashboard-widgets/shell";
import { getWidgetsForRole } from "@/components/dashboard-widgets/registry";

/**
 * Unified dashboard entry for every role.
 *
 * Reads the effective role from auth context, looks up the role's
 * widget layout in the catalog, and lets DashboardShell render them
 * with per-widget Suspense + ErrorBoundary isolation.
 *
 * All six legacy ROOT_DASHBOARDS (manager / accountant / facility /
 * hq / partner / platform_admin) now route through this single shell;
 * what differs per role is just the widget composition declared in
 * components/dashboard-widgets/registry.tsx.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const role = getEffectiveRole(user);
  const widgets = getWidgetsForRole(role);

  if (widgets.length === 0) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        이 역할에 구성된 대시보드 위젯이 없습니다.
      </div>
    );
  }

  return <DashboardShell widgets={widgets} />;
}
