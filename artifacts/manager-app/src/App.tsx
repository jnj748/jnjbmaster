import { lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation as useLocationForGate } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { BuildingProvider } from "@/contexts/building-context";
import { OnboardingProvider } from "@/contexts/onboarding-context";
import { OnboardingGate } from "@/components/onboarding-gate";
import { OnboardingModal } from "@/components/onboarding-modal";
import { BrowsingBanner } from "@/components/browsing-banner";
import {
  getRoutesForRole,
  getEffectiveRole,
  ROOT_DASHBOARDS,
  type Role,
} from "@/lib/permissions";
const Login = lazy(() => import("@/pages/login"));
const AuthCallback = lazy(() => import("@/pages/auth-callback"));
const SocialSignup = lazy(() => import("@/pages/social-signup"));
const TenantCardForm = lazy(() => import("@/pages/tenant-card-form"));
const OnboardingPage = lazy(() => import("@/pages/onboarding"));
// [Task #132] 통합 가입 후 역할 선택·역할별 위저드.
const RoleSelectPage = lazy(() => import("@/pages/onboarding/role-select"));
const ManagerWizardPage = lazy(() => import("@/pages/onboarding/manager-wizard"));
const AccountantWizardPage = lazy(() => import("@/pages/onboarding/accountant-wizard"));
const FacilityWizardPage = lazy(() => import("@/pages/onboarding/facility-wizard"));
const PartnerWizardPage = lazy(() => import("@/pages/onboarding/partner-wizard"));
const FacilityPendingPage = lazy(() => import("@/pages/onboarding/facility-pending"));
const DocumentPreviewPage = lazy(() => import("@/pages/document-preview"));
// 레이아웃 진단 페이지는 개발 환경에서만 번들에 포함합니다.
const LayoutCheck = import.meta.env.DEV
  ? lazy(() => import("@/pages/layout-check"))
  : null;

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
  const [location] = useLocationForGate();

  // [Task #132] 가입 후 역할 미선택이면 무조건 /onboarding/role-select 로 강제.
  if (user && user.roleSelected === false) {
    if (!location.startsWith("/onboarding/role-select")) {
      return (
        <Suspense fallback={<PageLoader />}>
          <Switch>
            <Route path="/onboarding/role-select" component={RoleSelectPage} />
            <Route>
              <Redirect to="/onboarding/role-select" />
            </Route>
          </Switch>
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/onboarding/role-select" component={RoleSelectPage} />
        </Switch>
      </Suspense>
    );
  }

  // [Task #132] 시설기사 가입 미활성(pending/rejected):
  // - 위저드(/onboarding/role-select, /onboarding/facility-staff)와 대기화면(/onboarding/facility-pending)은 통과
  // - 그 외 모든 경로는 대기화면으로 강제 이동 (rejected도 동일하게 가두어 백엔드 403과 정합)
  if (user?.role === "facility_staff" && user?.approvalStatus !== "active") {
    const allowedPrefixes = [
      "/onboarding/facility-pending",
      "/onboarding/facility-staff",
      "/onboarding/role-select",
    ];
    const isAllowed = allowedPrefixes.some((p) => location.startsWith(p));
    if (!isAllowed) {
      return (
        <Suspense fallback={<PageLoader />}>
          <Switch>
            <Route path="/onboarding/facility-pending" component={FacilityPendingPage} />
            <Route path="/onboarding/facility-staff" component={lazy(() => import("@/pages/onboarding/facility-wizard"))} />
            <Route path="/onboarding/role-select" component={lazy(() => import("@/pages/onboarding/role-select"))} />
            <Route>
              <Redirect to="/onboarding/facility-pending" />
            </Route>
          </Switch>
        </Suspense>
      );
    }
    return (
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/onboarding/facility-pending" component={FacilityPendingPage} />
          <Route path="/onboarding/facility-staff" component={lazy(() => import("@/pages/onboarding/facility-wizard"))} />
          <Route path="/onboarding/role-select" component={lazy(() => import("@/pages/onboarding/role-select"))} />
        </Switch>
      </Suspense>
    );
  }

  return (
    <BuildingProvider>
      <OnboardingProvider>
        <OnboardingGate>
          <Layout>
            <BrowsingBanner />
            <Suspense fallback={<PageLoader />}>
              <Switch>
                {LayoutCheck && (
                  <Route path="/__layout-check" component={LayoutCheck} />
                )}
                <Route path="/tenant-card/:token" component={TenantCardForm} />
                {/* [Task #141] 폐지된 라우트의 레거시 북마크는 흡수된 화면(또는 탭)으로 안내. */}
                <Route path="/building-setup">
                  <Redirect to="/settings?tab=building" />
                </Route>
                <Route path="/owners">
                  <Redirect to="/units?tab=owners" />
                </Route>
                <Route path="/daily-reports">
                  <Redirect to="/reports?tab=daily" />
                </Route>
                <Route path="/onboarding" component={OnboardingPage} />
                <Route path="/onboarding/role-select" component={RoleSelectPage} />
                <Route path="/onboarding/manager" component={ManagerWizardPage} />
                <Route path="/onboarding/accountant" component={AccountantWizardPage} />
                <Route path="/onboarding/facility-staff" component={FacilityWizardPage} />
                <Route path="/onboarding/facility-pending" component={FacilityPendingPage} />
                <Route path="/onboarding/partner" component={PartnerWizardPage} />
                <Route path="/facility-approvals" component={lazy(() => import("@/pages/facility-approvals"))} />
                <Route path="/documents/preview" component={DocumentPreviewPage} />
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
          <OnboardingModal />
        </OnboardingGate>
      </OnboardingProvider>
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
          {LayoutCheck && (
            <Route path="/__layout-check" component={LayoutCheck} />
          )}
          <Route path="/tenant-card/:token" component={TenantCardForm} />
          {/* [Task #132·#141] /portal 폐지 — 통합 로그인 화면(/login)으로 일원화. /login/hq는 본사 전용으로 유지. */}
          <Route path="/login" component={Login} />
          <Route path="/login/:portalType" component={Login} />
          <Route path="/auth/callback" component={AuthCallback} />
          <Route path="/auth/social-signup" component={SocialSignup} />
          <Route>
            <Redirect to="/login" />
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
