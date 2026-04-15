import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { BuildingProvider } from "@/contexts/building-context";
import Dashboard from "@/pages/dashboard";
import NotFound from "@/pages/not-found";

const Approvals = lazy(() => import("@/pages/approvals"));
const ApprovalCreate = lazy(() => import("@/pages/approval-create"));
const ExecutiveSpending = lazy(() => import("@/pages/executive-spending"));
const Tasks = lazy(() => import("@/pages/tasks"));
const Inspections = lazy(() => import("@/pages/inspections"));
const TaxSchedules = lazy(() => import("@/pages/tax-schedules"));
const Vendors = lazy(() => import("@/pages/vendors"));
const Commissions = lazy(() => import("@/pages/commissions"));
const Rfqs = lazy(() => import("@/pages/rfqs"));
const WorkReportsPage = lazy(() => import("@/pages/work-reports"));
const Reports = lazy(() => import("@/pages/reports"));
const Drafts = lazy(() => import("@/pages/drafts"));
const Tenants = lazy(() => import("@/pages/tenants"));
const Owners = lazy(() => import("@/pages/owners"));
const Vehicles = lazy(() => import("@/pages/vehicles"));
const Users = lazy(() => import("@/pages/users"));
import Login from "@/pages/login";
const PortalSelect = lazy(() => import("@/pages/portal-select"));
const FacilityDashboard = lazy(() => import("@/pages/facility-dashboard"));
const SafetyChecklists = lazy(() => import("@/pages/safety-checklists"));
const MaintenanceLogs = lazy(() => import("@/pages/maintenance-logs"));
const SafetyTraining = lazy(() => import("@/pages/safety-training"));
const DocumentTemplates = lazy(() => import("@/pages/document-templates"));
const DailyReportsPage = lazy(() => import("@/pages/daily-reports"));
const ReportSystemPage = lazy(() => import("@/pages/report-system"));
import PartnerDashboard from "@/pages/partner-dashboard";
const VendorPortal = lazy(() => import("@/pages/vendor-portal"));
const Attendance = lazy(() => import("@/pages/attendance"));
const BuildingSetup = lazy(() => import("@/pages/building-setup"));
const AccountingDashboard = lazy(() => import("@/pages/accounting-dashboard"));
const CalendarPage = lazy(() => import("@/pages/calendar"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="flex flex-col items-center gap-2">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-muted-foreground">로딩 중...</span>
      </div>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

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
  { path: "/building-setup", component: BuildingSetup },
  { path: "/accounting", component: AccountingDashboard },
  { path: "/calendar", component: CalendarPage },
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
    <BuildingProvider>
      <Layout>
        <Suspense fallback={<PageLoader />}>
          <Switch>
            <Route path="/" component={DashboardComponent} />
            {routes.map((r) => (
              <Route key={r.path} path={r.path} component={r.component} />
            ))}
            <Route>
              <Redirect to="/" />
            </Route>
          </Switch>
        </Suspense>
      </Layout>
    </BuildingProvider>
  );
}

function AppRouter() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-500">로딩 중...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/portal" component={PortalSelect} />
          <Route path="/login/:portalType" component={Login} />
          <Route>
            <Redirect to="/portal" />
          </Route>
        </Switch>
      </Suspense>
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
