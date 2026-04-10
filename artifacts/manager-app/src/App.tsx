import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import Dashboard from "@/pages/dashboard";
import Approvals from "@/pages/approvals";
import ExecutiveSpending from "@/pages/executive-spending";
import Tasks from "@/pages/tasks";
import Inspections from "@/pages/inspections";
import TaxSchedules from "@/pages/tax-schedules";
import Vendors from "@/pages/vendors";
import Commissions from "@/pages/commissions";
import Rfqs from "@/pages/rfqs";
import WorkReportsPage from "@/pages/work-reports";
import Reports from "@/pages/reports";
import Drafts from "@/pages/drafts";
import Tenants from "@/pages/tenants";
import Owners from "@/pages/owners";
import Vehicles from "@/pages/vehicles";
import Users from "@/pages/users";
import PortalSelect from "@/pages/portal-select";
import Login from "@/pages/login";
import FacilityDashboard from "@/pages/facility-dashboard";
import SafetyChecklists from "@/pages/safety-checklists";
import MaintenanceLogs from "@/pages/maintenance-logs";
import SafetyTraining from "@/pages/safety-training";
import ApprovalCreate from "@/pages/approval-create";
import DocumentTemplates from "@/pages/document-templates";
import DailyReportsPage from "@/pages/daily-reports";
import ReportSystemPage from "@/pages/report-system";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function AuthenticatedRoutes() {
  const { user } = useAuth();

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/approvals" component={Approvals} />
        <Route path="/approvals/create" component={ApprovalCreate} />
        <Route path="/document-templates" component={DocumentTemplates} />
        <Route path="/daily-reports" component={DailyReportsPage} />
        <Route path="/report-system" component={ReportSystemPage} />
        <Route path="/spending" component={ExecutiveSpending} />
        <Route path="/tasks" component={Tasks} />
        <Route path="/inspections" component={Inspections} />
        <Route path="/tax-schedules" component={TaxSchedules} />
        <Route path="/vendors" component={Vendors} />
        <Route path="/commissions" component={Commissions} />
        <Route path="/rfqs" component={Rfqs} />
        <Route path="/work-reports" component={WorkReportsPage} />
        <Route path="/reports" component={Reports} />
        <Route path="/drafts" component={Drafts} />
        <Route path="/tenants" component={Tenants} />
        <Route path="/owners" component={Owners} />
        <Route path="/vehicles" component={Vehicles} />
        <Route path="/facility" component={FacilityDashboard} />
        <Route path="/safety-checklists" component={SafetyChecklists} />
        <Route path="/maintenance-logs" component={MaintenanceLogs} />
        <Route path="/safety-training" component={SafetyTraining} />
        <Route path="/users" component={Users} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function AppRouter() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-500">로딩 중...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/portal" component={PortalSelect} />
        <Route path="/login/:portalType" component={Login} />
        <Route>
          <Redirect to="/portal" />
        </Route>
      </Switch>
    );
  }

  return <AuthenticatedRoutes />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <AppRouter />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
