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
import PartnerDashboard from "@/pages/partner-dashboard";
import VendorPortal from "@/pages/vendor-portal";
import Attendance from "@/pages/attendance";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

const managerRoutes = [
  { path: "/approvals", component: Approvals },
  { path: "/approvals/create", component: ApprovalCreate },
  { path: "/document-templates", component: DocumentTemplates },
  { path: "/daily-reports", component: DailyReportsPage },
  { path: "/report-system", component: ReportSystemPage },
  { path: "/spending", component: ExecutiveSpending },
  { path: "/tasks", component: Tasks },
  { path: "/inspections", component: Inspections },
  { path: "/tax-schedules", component: TaxSchedules },
  { path: "/rfqs", component: Rfqs },
  { path: "/work-reports", component: WorkReportsPage },
  { path: "/reports", component: Reports },
  { path: "/drafts", component: Drafts },
  { path: "/tenants", component: Tenants },
  { path: "/owners", component: Owners },
  { path: "/vehicles", component: Vehicles },
  { path: "/facility", component: FacilityDashboard },
  { path: "/safety-checklists", component: SafetyChecklists },
  { path: "/maintenance-logs", component: MaintenanceLogs },
  { path: "/safety-training", component: SafetyTraining },
  { path: "/attendance", component: Attendance },
  { path: "/users", component: Users },
  { path: "/vendors", component: Vendors },
  { path: "/commissions", component: Commissions },
];

const partnerRoutes = [
  { path: "/rfqs", component: VendorPortal },
  { path: "/vendors", component: Vendors },
  { path: "/commissions", component: Commissions },
];

function AuthenticatedRoutes() {
  const { user } = useAuth();
  const isPartner = user?.role === "partner";
  const routes = isPartner ? partnerRoutes : managerRoutes;
  const DashboardComponent = isPartner ? PartnerDashboard : Dashboard;

  return (
    <Layout>
      <Switch>
        <Route path="/" component={DashboardComponent} />
        {routes.map((r) => (
          <Route key={r.path} path={r.path} component={r.component} />
        ))}
        <Route>
          <Redirect to="/" />
        </Route>
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
