import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { BuildingProvider } from "@/contexts/building-context";
import {
  getRoutesForRole,
  getEffectiveRole,
  ROOT_DASHBOARDS,
  type Role,
} from "@/lib/permissions";
import Login from "@/pages/login";

const PortalSelect = lazy(() => import("@/pages/portal-select"));
const TenantCardForm = lazy(() => import("@/pages/tenant-card-form"));
const LayoutCheck = lazy(() => import("@/pages/layout-check"));

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

function AuthenticatedRoutes() {
  const { user } = useAuth();
  const role = getEffectiveRole(user);
  const routes = getRoutesForRole(role);
  const DashboardComponent = ROOT_DASHBOARDS[role] ?? ROOT_DASHBOARDS.manager;

  return (
    <BuildingProvider>
      <Layout>
        <Suspense fallback={<PageLoader />}>
          <Switch>
            <Route path="/__layout-check" component={LayoutCheck} />
            <Route path="/tenant-card/:token" component={TenantCardForm} />
            <Route path="/building-setup">
              <Redirect to="/settings" />
            </Route>
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
          <Route path="/__layout-check" component={LayoutCheck} />
          <Route path="/tenant-card/:token" component={TenantCardForm} />
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
