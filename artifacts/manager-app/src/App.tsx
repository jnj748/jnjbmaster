import { lazy, Suspense, useEffect } from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation as useLocationForGate } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { BuildingProvider } from "@/contexts/building-context";
import { OnboardingProvider, useOnboarding } from "@/contexts/onboarding-context";
import { OnboardingGate } from "@/components/onboarding-gate";
import { useUsageTracker } from "@/hooks/use-usage-tracker";
// [성능] 진입 직후 화면에 보이지 않는 컴포넌트는 lazy 로 분리해 초기 번들에서 제외.
const OnboardingModal = lazy(() =>
  import("@/components/onboarding-modal").then((m) => ({ default: m.OnboardingModal })),
);
const BrowsingBanner = lazy(() =>
  import("@/components/browsing-banner").then((m) => ({ default: m.BrowsingBanner })),
);
import {
  getRoutesForRole,
  getEffectiveRole,
  isRouteCategoryEnabled,
  ROOT_DASHBOARDS,
  type Role,
} from "@/lib/permissions";
const Login = lazy(() => import("@/pages/login"));
const FeatureUnavailablePage = lazy(() => import("@/pages/feature-unavailable"));
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
const RecentDocumentsPage = lazy(() => import("@/pages/recent-documents"));
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

// [Task #174] 신규 관리소장은 OnboardingModal/`/onboarding` 진행 카드 대신
// 새로운 모바일 위저드(`/onboarding/manager`)로 직행한다. 레거시 면제 계정은 영향 없음.
function ManagerOnboardingRedirect() {
  const { status, isLoading, isManager } = useOnboarding();
  const { user } = useAuth();
  const [location, setLocation] = useLocationForGate();
  // [Task #268] status 캐시가 갱신되기 전 한 틱 동안 위저드로 다시 튕기는 루프를 막기 위해
  // 동기적으로 갱신되는 user.onboardingPreference 도 함께 본다.
  const shouldRedirect =
    isManager &&
    !isLoading &&
    !!status &&
    !status.isLegacyExempt &&
    status.preference === null &&
    (user?.onboardingPreference ?? null) === null &&
    !location.startsWith("/onboarding/manager") &&
    !location.startsWith("/onboarding/role-select");
  // 부수효과는 useEffect에서만 수행 — 렌더 중 navigate 호출 금지.
  useEffect(() => {
    if (shouldRedirect) setLocation("/onboarding/manager");
  }, [shouldRedirect, setLocation]);
  return null;
}

function AuthenticatedRoutes() {
  const { user } = useAuth();
  const role = getEffectiveRole(user);
  const routes = getRoutesForRole(role);
  // [Task #296] 인증된 사용자의 라우트 변경을 자동 수집(분석용).
  useUsageTracker();
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
        <ManagerOnboardingRedirect />
        <OnboardingGate>
          <Layout>
            <Suspense fallback={null}>
              <BrowsingBanner />
            </Suspense>
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
                <Route path="/documents/preview" component={DocumentPreviewPage} />
                <Route path="/recent-documents" component={RecentDocumentsPage} />
                <Route path="/" component={DashboardComponent} />
                {routes.map((r) => {
                  const enabled = isRouteCategoryEnabled(r.path, user?.disabledCategories);
                  const Component = enabled ? r.component : FeatureUnavailablePage;
                  return <Route key={r.path} path={r.path} component={Component} />;
                })}
                <Route>
                  <Redirect to="/" />
                </Route>
              </Switch>
            </Suspense>
          </Layout>
          <Suspense fallback={null}>
            <OnboardingModal />
          </Suspense>
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
