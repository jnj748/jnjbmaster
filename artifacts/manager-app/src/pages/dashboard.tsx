import { useAuth } from "@/contexts/auth-context";
import { getEffectiveRole } from "@/lib/permissions";
import { DashboardShell } from "@/components/dashboard-widgets/shell";
import { getWidgetsForRole } from "@/components/dashboard-widgets/registry";

// Unified dashboard entry for every role. The shell owns header /
// empty state / grid / per-widget isolation; the catalog
// (components/dashboard-widgets/registry.tsx) owns role composition.
export default function Dashboard() {
  const { user } = useAuth();
  const role = getEffectiveRole(user);
  const widgets = getWidgetsForRole(role);

  return <DashboardShell widgets={widgets} role={role} />;
}
