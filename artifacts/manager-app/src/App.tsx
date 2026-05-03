import { lazy, Suspense, useEffect, useState } from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation as useLocationForGate } from "wouter";

// [DEV 분할 프리뷰 격자] DEV 빌드에서만 lazy import — prod 빌드에서는 import.meta.env.DEV
//   가드로 lazy 호출 자체가 dead code 제거되어 청크 분리도 만들어지지 않는다.
//   진입은 AppRouter 의 첫 분기 (인증 게이트 무관, 격자가 자체적으로 4 토큰 발급).
const DevPreviewGrid = import.meta.env.DEV
  ? lazy(() => import("@/pages/dev/preview-grid"))
  : null;
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { SplashScreen } from "@/components/splash-screen";
import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { BuildingProvider } from "@/contexts/building-context";
import { OnboardingProvider, useOnboarding } from "@/contexts/onboarding-context";
import { OnboardingGate } from "@/components/onboarding-gate";
import { useUsageTracker } from "@/hooks/use-usage-tracker";
import { useCategoryLabelsBootstrap } from "@/hooks/use-category-labels";
import { useMenuOverrides, useMenuOverridesLoaded } from "@/hooks/use-menu-overrides";
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
// [Task #758] 게스트 전자서명 — 비로그인 외부 결재자 일회용 링크 페이지.
const GuestSign = lazy(() => import("@/pages/guest-sign"));
const OnboardingPage = lazy(() => import("@/pages/onboarding"));
// [Task #132] 통합 가입 후 역할 선택·역할별 위저드.
const RoleSelectPage = lazy(() => import("@/pages/onboarding/role-select"));
const ManagerWizardPage = lazy(() => import("@/pages/onboarding/manager-wizard"));
const AccountantWizardPage = lazy(() => import("@/pages/onboarding/accountant-wizard"));
const FacilityWizardPage = lazy(() => import("@/pages/onboarding/facility-wizard"));
const PartnerWizardPage = lazy(() => import("@/pages/onboarding/partner-wizard"));
const FacilityPendingPage = lazy(() => import("@/pages/onboarding/facility-pending"));
// [Task #596] 본부장(hq_executive) 가입 후 관할 건물 할당 대기 화면.
const HqPendingPage = lazy(() => import("@/pages/onboarding/hq-pending"));
// [Task #516] 호실·소유자 마스터 풀스크린 마법사. 첫 필수업무 카드에서 진입한다.
const UnitsMasterWizardPage = lazy(() => import("@/pages/onboarding/units-master"));
const DocumentPreviewPage = lazy(() => import("@/pages/document-preview"));
const RecentDocumentsPage = lazy(() => import("@/pages/recent-documents"));
// [Task #485] 권한 부족으로 routes.map 에 마운트되지 않은 /settings/* 진입을
//   전역 catch-all 보다 먼저 잡아 SettingsPage 의 안전 리다이렉트로 흘려보낸다.
const SettingsPageLazy = lazy(() => import("@/pages/settings"));
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

// [Task #485] 레거시 /settings(?tab=...) 진입을 새 단독 페이지로 흡수.
//   - ?tab=building → /settings/building
//   - ?tab=platform → /settings/platform
//   - 그 외/없음   → /settings/profile
//   기존 북마크 호환을 위해 ?tab 외의 쿼리와 #해시(예: OAuth 콜백 #linked=...)는
//   그대로 새 경로에 보존한다.
function preserveSearchAndHash(targetPath: string, dropParams: string[] = []): string {
  if (typeof window === "undefined") return targetPath;
  const search = new URLSearchParams(window.location.search);
  for (const k of dropParams) search.delete(k);
  const qs = search.toString();
  const hash = window.location.hash || "";
  return `${targetPath}${qs ? `?${qs}` : ""}${hash}`;
}

function SettingsRootRedirect() {
  const search =
    typeof window !== "undefined" ? window.location.search : "";
  const tab = new URLSearchParams(search).get("tab");
  if (tab === "building") return <Redirect to={preserveSearchAndHash("/settings/building", ["tab"])} />;
  if (tab === "platform") return <Redirect to={preserveSearchAndHash("/settings/platform", ["tab"])} />;
  return <Redirect to={preserveSearchAndHash("/settings/profile", ["tab"])} />;
}

// [Task #485] /building-setup 레거시 북마크는 /settings/building 으로 흡수하되
//   딥링크 동작 보존을 위해 쿼리(예: ?tab=units-import)와 해시(예: #address-info)는
//   그대로 신규 경로에 전달한다.
function BuildingSetupRedirect() {
  return <Redirect to={preserveSearchAndHash("/settings/building")} />;
}

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

// [Task #596] 본부장(hq_executive) 가입 직후 매핑이 0건이면 /onboarding/hq-pending
//   으로 자동 라우팅한다. platform_admin 이 hq_building_assignments 를 1건이라도
//   부여하면 hq-pending 페이지가 자체적으로 "/" 로 진입시킨다.
function HqAssignmentGate() {
  const { user, token } = useAuth();
  const [location, setLocation] = useLocationForGate();
  const [hasAssignments, setHasAssignments] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!token || user?.role !== "hq_executive") return;
      try {
        const BASE = (import.meta as ImportMeta & { env: { BASE_URL?: string } }).env.BASE_URL ?? "/";
        const API_BASE = `${BASE}api`.replace(/\/+/g, "/");
        const res = await fetch(`${API_BASE}/hq/assigned-buildings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data: { unrestricted: boolean; assignments: unknown[] } = await res.json();
        if (cancelled) return;
        setHasAssignments(data.unrestricted || data.assignments.length > 0);
      } catch {
        /* noop — 다음 진입 시 재시도 */
      }
    }
    check();
    return () => { cancelled = true; };
  }, [token, user?.role, user?.id]);
  useEffect(() => {
    if (user?.role !== "hq_executive") return;
    if (hasAssignments === false && !location.startsWith("/onboarding/hq-pending")
        && !location.startsWith("/onboarding/role-select")) {
      setLocation("/onboarding/hq-pending");
    }
  }, [hasAssignments, location, setLocation, user?.role]);
  return null;
}

// [Task #651 round-5] 활성 경리는 자기 건물의 부과면적(area_basis) 이 설정될
//   때까지 /onboarding/accountant-setup 으로 강제 라우팅된다. 서버 /auth/me
//   가 산출한 user.accountantSetupRequired 를 단일 출처(SSOT)로 사용한다.
function AccountantSetupGate() {
  const { user } = useAuth();
  const [location, setLocation] = useLocationForGate();
  useEffect(() => {
    if (user?.role !== "accountant") return;
    if (user?.approvalStatus !== "active") return;
    if (!user?.accountantSetupRequired) return;
    if (location.startsWith("/onboarding/accountant-setup")) return;
    if (location.startsWith("/onboarding/role-select")) return;
    setLocation("/onboarding/accountant-setup");
  }, [user?.role, user?.approvalStatus, user?.accountantSetupRequired, location, setLocation]);
  return null;
}

function AuthenticatedRoutes() {
  const { user } = useAuth();
  const role = getEffectiveRole(user);
  // [요청] 본사가 그리드에서 명시적으로 켠 메뉴는 access 화이트리스트가 비어 있어도
  //   라우트로 등록되어야 한다. useMenuOverrides 의 모듈 캐시는 layout.tsx 와 공유된다.
  const menuOverrides = useMenuOverrides(!!user);
  // 첫 fetch 가 끝나기 전에 catch-all redirect 가 동작하면 explicit ON 메뉴 딥링크 시
  //   사용자 의도 URL 을 잃는다 → loaded 가 true 일 때만 catch-all 을 활성.
  const overridesLoaded = useMenuOverridesLoaded(!!user);
  const routes = getRoutesForRole(role, menuOverrides);
  // [Task #296] 인증된 사용자의 라우트 변경을 자동 수집(분석용).
  useUsageTracker();
  // [Task #312] 카테고리 한글 라벨을 DB 단일 출처에서 부트스트랩한다.
  useCategoryLabelsBootstrap();
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
  // [Task #651] 경리(accountant) 도 동일한 승인 큐를 공유하므로 같은 게이트로 가둔다.
  // - 위저드(/onboarding/role-select, /onboarding/facility-staff, /onboarding/accountant)
  //   와 대기화면(/onboarding/facility-pending) 은 통과.
  // - 그 외 모든 경로는 대기화면으로 강제 이동 (rejected도 동일하게 가두어 백엔드 403과 정합)
  if ((user?.role === "facility_staff" || user?.role === "accountant") && user?.approvalStatus !== "active") {
    const allowedPrefixes = [
      "/onboarding/facility-pending",
      "/onboarding/facility-staff",
      "/onboarding/accountant",
      "/onboarding/role-select",
    ];
    const isAllowed = allowedPrefixes.some((p) => location.startsWith(p));
    if (!isAllowed) {
      return (
        <Suspense fallback={<PageLoader />}>
          <Switch>
            <Route path="/onboarding/facility-pending" component={FacilityPendingPage} />
            <Route path="/onboarding/facility-staff" component={lazy(() => import("@/pages/onboarding/facility-wizard"))} />
            <Route path="/onboarding/accountant" component={lazy(() => import("@/pages/onboarding/accountant-wizard"))} />
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
          <Route path="/onboarding/accountant" component={lazy(() => import("@/pages/onboarding/accountant-wizard"))} />
          <Route path="/onboarding/role-select" component={lazy(() => import("@/pages/onboarding/role-select"))} />
        </Switch>
      </Suspense>
    );
  }

  return (
    <BuildingProvider>
      <OnboardingProvider>
        <ManagerOnboardingRedirect />
        <HqAssignmentGate />
        <AccountantSetupGate />
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
                {/* [Task #758] 게스트 전자서명 — 로그인 사용자가 직접 본인 핸드폰에 받은 링크를 열 수도 있다. */}
                <Route path="/guest-sign/:token" component={GuestSign} />
                {/* [Task #141] 폐지된 라우트의 레거시 북마크는 흡수된 화면(또는 탭)으로 안내. */}
                {/* [Task #485] /building-setup 은 새 단독 페이지(/settings/building)로 직행.
                    쿼리(예: ?tab=units-import)·해시(예: #address-info)는 보존. */}
                <Route path="/building-setup">
                  <BuildingSetupRedirect />
                </Route>
                {/* [Task #485] /settings 루트와 레거시 ?tab=building / ?tab=platform 쿼리는
                    새 단독 페이지로 흡수한다. (북마크·외부 링크 호환) */}
                <Route path="/settings">
                  <SettingsRootRedirect />
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
                {/* [Task #651] 경리 승인 후 사후 설정 위저드 (부과면적/OCR/회계자료). */}
                <Route path="/onboarding/accountant-setup" component={lazy(() => import("@/pages/onboarding/accountant-setup"))} />
                <Route path="/onboarding/facility-staff" component={FacilityWizardPage} />
                <Route path="/onboarding/facility-pending" component={FacilityPendingPage} />
                <Route path="/onboarding/hq-pending" component={HqPendingPage} />
                <Route path="/onboarding/partner" component={PartnerWizardPage} />
                {/* [Task #516] 호실·소유자 마스터 풀스크린 마법사. */}
                <Route path="/onboarding/units-master" component={UnitsMasterWizardPage} />
                <Route path="/documents/preview" component={DocumentPreviewPage} />
                <Route path="/recent-documents" component={RecentDocumentsPage} />
                <Route path="/" component={DashboardComponent} />
                {routes.map((r) => {
                  const enabled = isRouteCategoryEnabled(r.path, user?.disabledCategories);
                  const Component = enabled ? r.component : FeatureUnavailablePage;
                  return <Route key={r.path} path={r.path} component={Component} />;
                })}
                {/* [Task #485] 권한이 없어 routes.map 에서 마운트되지 않은 설정
                    하위 페이지(/settings/building, /settings/platform)에 직접
                    진입한 경우, 전역 catch-all 로 빠져 "/" 로 튕기는 대신 SettingsPage
                    가 권한 검사 후 /settings/profile 로 안전하게 안내하도록 한다.
                    routes.map 의 정상 마운트가 우선이고, 이 catch 는 마지막 fallback.
                    예: 경리/시설기사가 /settings/building 으로 진입,
                        매니저가 /settings/platform 으로 진입. */}
                <Route path="/settings/profile" component={SettingsPageLazy} />
                <Route path="/settings/building" component={SettingsPageLazy} />
                <Route path="/settings/platform" component={SettingsPageLazy} />
                {overridesLoaded ? (
                  <Route>
                    <Redirect to="/" />
                  </Route>
                ) : (
                  // overrides 첫 로드 전에는 catch-all 을 비활성해
                  //   explicit ON 메뉴 딥링크가 "/" 로 튕기지 않도록 유예한다.
                  <Route>
                    <PageLoader />
                  </Route>
                )}
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
  const [location] = useLocationForGate();

  // [DEV 분할 프리뷰 격자] 인증 게이트 이전에 분기 — 격자 자체가 4명 토큰 발급.
  //   prod 빌드에서는 DevPreviewGrid 가 null 이므로 이 분기 전체가 dead code.
  if (import.meta.env.DEV && DevPreviewGrid && location.startsWith("/__dev/preview-grid")) {
    return (
      <Suspense fallback={<SplashScreen />}>
        <DevPreviewGrid />
      </Suspense>
    );
  }

  if (isLoading) {
    return <SplashScreen />;
  }

  if (!user) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Switch>
          {LayoutCheck && (
            <Route path="/__layout-check" component={LayoutCheck} />
          )}
          <Route path="/tenant-card/:token" component={TenantCardForm} />
          {/* [Task #758] 게스트 전자서명 — 비로그인 외부 결재자가 접근. */}
          <Route path="/guest-sign/:token" component={GuestSign} />
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
