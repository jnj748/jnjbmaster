import { lazy, type LazyExoticComponent, type ComponentType } from "react";
import {
  LayoutDashboard,
  CheckSquare,
  Shield,
  Calculator,
  Building2,
  Coins,
  FileText,
  ClipboardList,
  ClipboardCheck,
  Users,
  User,
  UserCheck,
  Car,
  Package,
  Send,
  DollarSign,
  Wrench,
  GraduationCap,
  HardHat,
  BookOpen,
  BarChart3,
  Settings,
  Clock,
  Building,
  CalendarDays,
  Droplets,
  Receipt,
  MessageSquare,
  Vote,
  Sparkles,
  Clipboard,
  NotebookPen,
  type LucideIcon,
} from "lucide-react";

// [Task #142] 단일 대시보드 셸. 역할별 화면 차이는 위젯 카탈로그
// (components/dashboard-widgets/registry.tsx)에서 선언적으로 관리한다.
// [Task #145] 통합 대시보드 셸도 lazy 화 — 비-대시보드 진입 경로의 초기 번들 절감.
const Dashboard = lazy(() => import("@/pages/dashboard"));

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
// [Task #141] /owners 라우트 폐지 — Owners 컴포넌트는 호실 관리(/units) 화면의 "소유자 관리" 탭으로 흡수.
const Vehicles = lazy(() => import("@/pages/vehicles"));
const Users_ = lazy(() => import("@/pages/users"));
const FacilityDashboard = lazy(() => import("@/pages/facility-dashboard"));
const SafetyChecklists = lazy(() => import("@/pages/safety-checklists"));
const MaintenanceLogs = lazy(() => import("@/pages/maintenance-logs"));
const SafetyTraining = lazy(() => import("@/pages/safety-training"));
const DocumentTemplates = lazy(() => import("@/pages/document-templates"));
// [Task #141] /daily-reports 라우트 폐지 — DailyReports 컴포넌트는 보고서(/reports) 화면의 "일간 일지" 탭으로 흡수.
const ReportSystemPage = lazy(() => import("@/pages/report-system"));
// [Task #142] 역할별 대시보드 컴포넌트 직접 import 제거 — 모두 통합 셸을 통해
// 진입하며, 위젯 코드는 dashboard-widgets/registry.tsx 에서 lazy 로딩한다.
const VendorPortal = lazy(() => import("@/pages/vendor-portal"));
const Attendance = lazy(() => import("@/pages/attendance"));
const BuildingInfo = lazy(() => import("@/pages/building-info"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const CalendarPage = lazy(() => import("@/pages/calendar"));
const VotingPage = lazy(() => import("@/pages/voting"));
const ContractsPage = lazy(() => import("@/pages/contracts"));
const Units = lazy(() => import("@/pages/units"));
const AiAssistant = lazy(() => import("@/pages/ai-assistant"));
const ErpPhase1 = lazy(() => import("@/pages/erp/phase-1-metering"));
const ErpPhase2 = lazy(() => import("@/pages/erp/phase-2-accounting"));
const ErpPhase3 = lazy(() => import("@/pages/erp/phase-3-billing"));
const ErpPhase4 = lazy(() => import("@/pages/erp/phase-4-governance"));
const ErpBills = lazy(() => import("@/pages/erp/bills"));
const ErpFeesSummary = lazy(() => import("@/pages/erp/fees-summary"));
const AccountingHub = lazy(() => import("@/pages/erp/accounting-hub"));
const BuildingRecords = lazy(() => import("@/pages/erp/building-records"));
const WorkLog = lazy(() => import("@/pages/work-log"));

export type Role =
  | "manager"
  | "accountant"
  | "facility_staff"
  | "hq_executive"
  | "platform_admin"
  | "partner";

export type Group =
  | "dashboard"
  | "residents"
  | "facility"
  | "accounting"
  | "reports"
  | "marketplace"
  | "settings";

type AnyComponent = ComponentType<any> | LazyExoticComponent<ComponentType<any>>;

export interface RouteEntry {
  path: string;
  component: AnyComponent;
  label: string;
  icon: LucideIcon;
  group: Group;
  /** Roles allowed to navigate to this path (URL access). */
  access: Role[];
  /** Roles that see this in the sidebar. Defaults to access. */
  sideMenu?: Role[];
  /** Roles that see this in the bottom nav. Defaults to []. */
  bottomNav?: Role[];
  /** Sort key for bottom-nav placement (lower first). Defaults to 100. */
  bottomOrder?: number;
  /** Hide from sidebar even if role has access (e.g. sub-routes). */
  hidden?: boolean;
  /** Per-role label override for sidebar / page title. */
  labelOverrides?: Partial<Record<Role, string>>;
  /** Per-role label for the mobile bottom nav (shorter). */
  bottomLabel?: string;
  bottomLabelOverrides?: Partial<Record<Role, string>>;
  /** When set, the bottom-nav tab opens a sheet listing this group's items
   *  instead of navigating to the entry's path. Used to expose grouped menus
   *  on mobile. */
  bottomGroupSheet?: Group;
}

/** Resolve the effective role for permission/menu derivation.
 *  Partner portal users are mapped to "partner" regardless of stored role,
 *  giving a single, consistent identity for both routing and navigation. */
export function getEffectiveRole(user: { role?: string | null; portalType?: string | null } | null | undefined): Role {
  if (!user) return "manager";
  if (user.portalType === "partner") return "partner";
  return (user.role as Role) ?? "manager";
}

export const ROLE_LABELS: Record<Role, string> = {
  manager: "관리소장",
  accountant: "경리/행정",
  facility_staff: "시설기사",
  hq_executive: "총괄책임자",
  platform_admin: "플랫폼 관리자",
  partner: "파트너사",
};

export const GROUP_TITLES: Record<Group, string> = {
  dashboard: "대시보드",
  residents: "호실 및 입주민 관리",
  facility: "시설 및 안전관리",
  accounting: "회계 및 관리비",
  reports: "보고 및 전자결재",
  marketplace: "파트너 마켓플레이스",
  settings: "설정",
};

const GROUP_ORDER_BY_ROLE: Record<Role, Group[]> = {
  manager: ["dashboard", "facility", "accounting", "reports", "residents", "marketplace", "settings"],
  platform_admin: ["dashboard", "facility", "accounting", "reports", "residents", "marketplace", "settings"],
  accountant: ["dashboard", "accounting", "reports", "residents"],
  facility_staff: ["dashboard", "facility"],
  hq_executive: ["dashboard", "facility", "accounting", "reports", "residents", "marketplace", "settings"],
  partner: ["dashboard", "marketplace"],
};

const ALL_BUILDING: Role[] = ["manager", "accountant", "facility_staff", "platform_admin"];
const FULL_OPS: Role[] = ["manager", "platform_admin"];

/**
 * Single source of truth for all role × screen permissions.
 * Sidebar, mobile bottom nav, SPA route gating, and (manually) backend
 * `requireRole` middlewares should all stay in sync with this matrix.
 *
 * NOTE: "/" is a special, role-dispatched dashboard handled separately;
 * see ROOT_DASHBOARDS / ROOT_LABELS below.
 */
export const ROUTES: RouteEntry[] = [
  // ── Dashboard group (besides "/") ────────────────────────────────
  {
    path: "/calendar", component: CalendarPage,
    label: "일정", icon: CalendarDays, group: "dashboard",
    access: ["manager", "accountant", "platform_admin"],
  },
  {
    path: "/tasks", component: Tasks,
    label: "업무 관리", icon: CheckSquare, group: "dashboard",
    access: ["manager", "platform_admin"],
  },
  {
    path: "/ai-assistant", component: AiAssistant,
    label: "AI 관리비서", icon: Sparkles, group: "dashboard",
    access: ["manager", "platform_admin"],
    bottomNav: ["manager", "platform_admin"],
    bottomLabel: "AI비서",
    bottomOrder: 20,
  },
  // [Task #182] 상시 업무기록(타임라인+FAB) + 일/주/월 보고서 자동생성
  {
    path: "/work-log", component: WorkLog,
    label: "업무일지", icon: NotebookPen, group: "dashboard",
    access: ["manager", "platform_admin"],
    bottomNav: ["manager", "platform_admin"],
    bottomLabel: "업무일지",
    bottomOrder: 25,
  },
  {
    path: "/building-info", component: BuildingInfo,
    label: "건물 정보", icon: Building, group: "dashboard",
    access: ["manager", "platform_admin", "hq_executive", "accountant", "facility_staff"],
    // 사이드바·드로어에서 숨김 — 핵심 정보는 대시보드 카드로 임베드되며,
    // /building-info URL은 "자세히 보기" 링크로 유지됩니다.
    sideMenu: [],
  },

  // ── Residents group ─────────────────────────────────────────────
  {
    path: "/units", component: Units,
    label: "호실 관리", icon: Building, group: "residents",
    access: ["manager", "accountant", "platform_admin"],
    bottomNav: ["accountant"],
    bottomLabelOverrides: { accountant: "호실" },
  },
  {
    path: "/tenants", component: Tenants,
    label: "입주민 관리", icon: Users, group: "residents",
    access: ["manager", "accountant", "platform_admin"],
  },
  {
    path: "/vehicles", component: Vehicles,
    label: "차량 관리", icon: Car, group: "residents",
    access: ["manager", "platform_admin", "facility_staff"],
    sideMenu: ["manager", "platform_admin"],
  },
  {
    path: "/voting", component: VotingPage,
    label: "전자투표", icon: Vote, group: "residents",
    access: ["manager", "platform_admin", "accountant"],
    // 사이드바에서 숨김 (URL 직접 접근은 유지). 향후 정식 오픈 시 sideMenu 복구.
    sideMenu: [],
  },

  // ── Facility group ──────────────────────────────────────────────
  {
    path: "/facility", component: FacilityDashboard,
    label: "시설관리", icon: HardHat, group: "facility",
    access: ["manager", "platform_admin", "facility_staff"],
    // 시설 그룹 자체가 4-아이콘 허브 역할을 하므로 사이드바에서 숨김.
    // 그룹 헤더 클릭 시 /facility 로 이동 (layout.tsx 의 facilityGroupHref).
    sideMenu: [],
    bottomNav: ["manager", "platform_admin", "facility_staff"],
    bottomLabel: "시설",
    bottomOrder: 10,
  },
  {
    path: "/inspections", component: Inspections,
    label: "법정 점검", icon: Shield, group: "facility",
    access: ["manager", "platform_admin", "facility_staff", "hq_executive"],
    bottomNav: ["facility_staff", "hq_executive"],
    bottomLabel: "점검",
    labelOverrides: { hq_executive: "점검보고서" },
  },
  {
    path: "/safety-checklists", component: SafetyChecklists,
    label: "안전점검표", icon: ClipboardCheck, group: "facility",
    access: ["manager", "platform_admin", "facility_staff"],
  },
  {
    path: "/maintenance-logs", component: MaintenanceLogs,
    label: "시설 업무일지", icon: Wrench, group: "facility",
    access: ["manager", "platform_admin", "facility_staff"],
  },
  {
    path: "/safety-training", component: SafetyTraining,
    label: "안전교육", icon: GraduationCap, group: "facility",
    access: ["manager", "platform_admin", "facility_staff", "hq_executive"],
    labelOverrides: { hq_executive: "안전교육 현황" },
  },
  {
    path: "/attendance", component: Attendance,
    label: "출퇴근 관리", icon: Clock, group: "settings",
    // Canonical attendance policy (matches backend buildingStaff guard
    // in api-server/src/routes/attendance.ts):
    //   • URL access  : building-portal staff (manager / platform_admin
    //     / accountant / facility_staff). The page renders a personal
    //     clock-in section for everyone and a team-view section only
    //     when isManager (manager + platform_admin).
    //   • Sidebar item: surfaced only to platform_admin to keep the
    //     other roles' menus focused.
    //   • API parity  : /attendance/check|today|my|stats use the same
    //     building-staff role list; /attendance/all is restricted to
    //     manager + platform_admin only.
    access: ["manager", "platform_admin", "accountant", "facility_staff"],
    sideMenu: ["platform_admin"],
  },

  // ── Accounting group ────────────────────────────────────────────
  // [Task #122] 빈도 기반 재정렬: 매월 빈도 높은 ERP(회계 엔진→검침→고지/수납→민원/투표)
  //   → 분기/연간 빈도 낮은 항목(지출→세무→수수료) 순으로 노출.
  // [Task #124] 레거시 /accounting · /metering · /billing · /complaints · /erp/foundation
  //   라우트 및 컴포넌트는 ERP 통합 화면 안정 운영을 확인한 뒤 제거됨.
  // [Task #170] 회계 그룹 허브. 시설 허브와 동일하게 사이드바에선 숨기고,
  //   모바일 하단 네비 "회계" 탭 진입점으로 사용. 그룹 헤더 클릭 시도 진입.
  {
    path: "/erp/accounting-hub", component: AccountingHub,
    label: "회계", icon: Calculator, group: "accounting",
    access: ["manager", "platform_admin", "accountant"],
    sideMenu: [],
    bottomNav: ["manager", "platform_admin", "accountant"],
    bottomLabel: "회계",
    bottomOrder: 30,
  },
  // [관리소장 모드 단순화] 회계 그룹은 관리소장에게 "관리비 요약"만 노출.
  //   회계 엔진/검침/고지·수납/고지서/민원·투표/지출/세무/수수료는 경리·행정(accountant)
  //   및 플랫폼 관리자 전용으로 한정.
  {
    path: "/erp/accounting", component: ErpPhase2,
    label: "회계 엔진", icon: Calculator, group: "accounting",
    access: ["platform_admin", "accountant"],
  },
  {
    path: "/erp/metering", component: ErpPhase1,
    label: "검침/에너지", icon: Droplets, group: "accounting",
    access: ["platform_admin", "accountant"],
  },
  {
    path: "/erp/billing", component: ErpPhase3,
    label: "고지/수납", icon: Receipt, group: "accounting",
    access: ["platform_admin", "accountant"],
    bottomNav: ["accountant"],
    bottomLabelOverrides: { accountant: "부과" },
  },
  // [Task #170] 관리비 OCR · 요약 (회계 그룹)
  {
    path: "/erp/fees-summary", component: ErpFeesSummary,
    label: "관리비 요약", icon: BarChart3, group: "accounting",
    access: ["manager", "platform_admin", "accountant"],
  },
  // [Task #178] 건물 단위 관리비 응대 자료 (월별 5개 영역 한장 요약)
  // [메뉴 통합] 관리소장 사이드바에서는 "관리비 요약"으로 일원화 — 응대 자료는
  //   관리비 요약 페이지 내부 진입 버튼으로 접근. URL/직접 접근은 유지.
  {
    path: "/erp/building-records", component: BuildingRecords,
    label: "관리비 응대 자료", icon: Clipboard, group: "accounting",
    access: ["manager", "platform_admin", "accountant", "hq_executive"],
    sideMenu: ["platform_admin", "accountant", "hq_executive"],
  },
  {
    path: "/erp/bills", component: ErpBills,
    label: "관리비 고지서", icon: FileText, group: "accounting",
    // manager는 라우트 접근만 유지(관리비 요약의 "고지서 업로드하러 가기" 버튼 진입용),
    //   사이드바/회계 허브 카드에서는 숨김.
    access: ["manager", "platform_admin", "accountant"],
    sideMenu: ["platform_admin", "accountant"],
  },
  {
    path: "/erp/governance", component: ErpPhase4,
    label: "민원/투표", icon: MessageSquare, group: "accounting",
    access: ["platform_admin", "accountant", "hq_executive"],
    labelOverrides: { hq_executive: "에스컬레이션 민원" },
  },
  {
    path: "/spending", component: ExecutiveSpending,
    label: "지출 현황", icon: DollarSign, group: "accounting",
    access: ["platform_admin", "accountant"],
  },
  {
    path: "/tax-schedules", component: TaxSchedules,
    label: "세무 일정", icon: Calculator, group: "accounting",
    access: ["platform_admin", "accountant"],
  },
  {
    path: "/commissions", component: Commissions,
    label: "수수료", icon: Coins, group: "accounting",
    access: ["platform_admin", "accountant", "partner"],
  },

  // ── Reports / approvals group ───────────────────────────────────
  {
    path: "/drafts", component: Drafts,
    label: "기안서", icon: ClipboardList, group: "reports",
    // [관리소장 메뉴 숨김] 기안서 기능은 문서생성으로 대체되어 manager 접근 제거
    access: ["platform_admin", "accountant"],
  },
  {
    path: "/approvals", component: Approvals,
    label: "결재함", icon: ClipboardCheck, group: "reports",
    access: ["manager", "platform_admin", "accountant"],
    // [관리소장 메뉴 숨김] 결재함은 회계/플랫폼 관리자 사이드바에만 노출.
    sideMenu: ["platform_admin", "accountant"],
    bottomNav: ["accountant"],
    bottomLabel: "결재",
  },
  {
    path: "/approvals/create", component: ApprovalCreate,
    label: "결재 상신", icon: ClipboardList, group: "reports",
    access: ["manager", "platform_admin", "accountant"],
    hidden: true,
  },
  {
    path: "/report-system", component: ReportSystemPage,
    label: "보고 체계", icon: BarChart3, group: "reports",
    access: ["manager", "platform_admin"],
    // [관리소장 메뉴 숨김] 보고 체계는 플랫폼 관리자 사이드바에만 노출.
    sideMenu: ["platform_admin"],
  },
  {
    path: "/reports", component: Reports,
    label: "일간/주간 보고", icon: FileText, group: "reports",
    access: ["manager", "platform_admin", "hq_executive"],
    bottomNav: ["hq_executive"],
    bottomLabel: "보고서",
    labelOverrides: { hq_executive: "월간보고서" },
  },

  // ── Partner marketplace group ───────────────────────────────────
  {
    path: "/rfqs", component: Rfqs,
    label: "견적 요청", icon: Send, group: "marketplace",
    access: ["manager", "platform_admin"],
  },
  {
    path: "/work-reports", component: WorkReportsPage,
    label: "작업 검수", icon: ClipboardCheck, group: "marketplace",
    access: ["manager", "platform_admin"],
    // [관리소장 메뉴 숨김] 작업 검수는 플랫폼 관리자 사이드바에만 노출.
    sideMenu: ["platform_admin"],
  },
  {
    path: "/vendors", component: Vendors,
    label: "협력업체", icon: Building2, group: "marketplace",
    access: ["manager", "platform_admin", "hq_executive", "accountant", "partner"],
    sideMenu: ["manager", "platform_admin", "hq_executive"],
    bottomNav: ["hq_executive"],
    bottomLabel: "계약",
    labelOverrides: { hq_executive: "용역 계약" },
  },
  {
    path: "/contracts", component: ContractsPage,
    label: "용역 계약", icon: FileText, group: "marketplace",
    access: ["manager", "platform_admin", "accountant", "hq_executive"],
    sideMenu: ["hq_executive"],
    labelOverrides: { hq_executive: "계약 갱신" },
  },

  // ── Settings group ──────────────────────────────────────────────
  {
    path: "/users", component: Users_,
    label: "사용자 관리", icon: Users, group: "settings",
    // [관리소장 메뉴 숨김] 사용자 관리는 플랫폼 관리자/본사 권한 전용.
    access: ["platform_admin", "hq_executive"],
    bottomNav: ["platform_admin"],
    bottomLabelOverrides: { platform_admin: "사용자" },
  },
  {
    // [Task #132] 시설기사 가입 승인 (관리소장/본사/플랫폼관리자)
    path: "/facility-approvals", component: lazy(() => import("@/pages/facility-approvals")),
    label: "시설기사 승인", icon: UserCheck, group: "settings",
    access: ["manager", "platform_admin", "hq_executive"],
    // [관리소장 메뉴 숨김] 사이드바에서는 플랫폼 관리자/본사만 노출.
    sideMenu: ["platform_admin", "hq_executive"],
  },
  {
    path: "/document-templates", component: DocumentTemplates,
    label: "서식 관리", icon: FileText, group: "settings",
    access: ["manager", "platform_admin"],
  },
  {
    // [Task #133] 약관 문서 편집 (역할 × 동의 항목 × 버전)
    path: "/platform-consents", component: lazy(() => import("@/pages/platform-consents")),
    label: "약관 관리", icon: FileText, group: "settings",
    access: ["platform_admin"],
  },
  {
    // [Task #186] 플랫폼 공지(이벤트/업데이트) 관리 — 알림 벨에 노출
    path: "/platform-announcements", component: lazy(() => import("@/pages/platform-announcements")),
    label: "공지 관리", icon: FileText, group: "settings",
    access: ["platform_admin", "hq_executive"],
  },
  {
    path: "/settings", component: SettingsPage,
    label: "설정", icon: Settings, group: "settings",
    access: ["manager", "platform_admin", "hq_executive", "accountant", "facility_staff"],
    // [메뉴 분리] /settings 루트는 사이드바에서 숨기고, 하위 메뉴 두 개로 분리한다.
    //   - /settings/profile  → 내정보 수정
    //   - /settings/building → 건물정보 수정 (manager / platform_admin)
    sideMenu: [],
  },
  {
    path: "/settings/profile", component: SettingsPage,
    label: "내정보 수정", icon: User, group: "settings",
    access: ["manager", "platform_admin", "hq_executive", "accountant", "facility_staff"],
    sideMenu: ["manager", "platform_admin"],
  },
  {
    path: "/settings/building", component: SettingsPage,
    label: "건물정보 수정", icon: Building, group: "settings",
    access: ["manager", "platform_admin"],
    sideMenu: ["manager", "platform_admin"],
  },
];

// ── Role-specific root ("/") dashboard mapping ───────────────────
// [Task #142] 모든 역할이 동일한 통합 대시보드 셸을 통해 진입한다.
// 셸이 useAuth → getEffectiveRole 로 역할을 읽어 위젯 카탈로그
// (dashboard-widgets/registry.tsx)에서 위젯 구성을 가져와 렌더링한다.
export const ROOT_DASHBOARDS: Record<Role, AnyComponent> = {
  manager: Dashboard,
  platform_admin: Dashboard,
  hq_executive: Dashboard,
  accountant: Dashboard,
  facility_staff: Dashboard,
  partner: Dashboard,
};

const ROOT_LABELS: Record<Role, string> = {
  manager: "대시보드",
  platform_admin: "플랫폼 관리",
  hq_executive: "본사 대시보드",
  accountant: "대시보드",
  facility_staff: "일일 업무",
  partner: "대시보드",
};

const ROOT_ICONS: Record<Role, LucideIcon> = {
  manager: LayoutDashboard,
  platform_admin: Shield,
  hq_executive: LayoutDashboard,
  accountant: LayoutDashboard,
  facility_staff: ClipboardCheck,
  partner: LayoutDashboard,
};

// Partner has a custom RFQ portal page distinct from /rfqs.
const PARTNER_VENDORS_LABEL = "업체 정보";
const PARTNER_RFQ_LABEL = "견적 요청";
const PARTNER_RFQ_ICON: LucideIcon = FileText;
const PARTNER_VENDORS_ICON: LucideIcon = Package;

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** When set, tapping this nav item should open a sheet listing the group's
   *  items rather than navigating to `path`. */
  groupSheet?: Group;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
  /**
   * Optional click target for the section header. When set, the section header
   * acts as a hub link (e.g. facility group → /facility). Only populated when
   * the role has route access to that path; otherwise omitted to avoid
   * routing roles to pages they cannot access.
   */
  headerHref?: string;
}

const labelFor = (entry: RouteEntry, role: Role): string =>
  entry.labelOverrides?.[role] ?? entry.label;

const bottomLabelFor = (entry: RouteEntry, role: Role): string =>
  entry.bottomLabelOverrides?.[role] ?? entry.bottomLabel ?? entry.label;

const rootItem = (role: Role): NavItem => ({
  path: "/",
  label: ROOT_LABELS[role],
  icon: ROOT_ICONS[role],
});

/** Returns SPA route definitions {path, component} for a role. */
export function getRoutesForRole(role: Role): { path: string; component: AnyComponent }[] {
  if (role === "partner") {
    // Partner uses a custom portal component for /rfqs; vendors/commissions
    // are shared. /settings is intentionally NOT exposed (dead route removed).
    return [
      { path: "/rfqs", component: VendorPortal },
      { path: "/vendors", component: Vendors },
      { path: "/commissions", component: Commissions },
    ];
  }
  return ROUTES.filter((r) => r.access.includes(role)).map((r) => ({
    path: r.path,
    component: r.component,
  }));
}

/** Returns the sidebar sections for a role, grouped per role's group order. */
export function getSidebarSections(role: Role): NavSection[] {
  if (role === "partner") {
    // Partner sidebar is intentionally flat.
    return [
      {
        items: [
          rootItem("partner"),
          { path: "/rfqs", label: PARTNER_RFQ_LABEL, icon: PARTNER_RFQ_ICON },
          { path: "/vendors", label: PARTNER_VENDORS_LABEL, icon: PARTNER_VENDORS_ICON },
          { path: "/commissions", label: "수수료", icon: Coins },
        ],
      },
    ];
  }

  const groups = GROUP_ORDER_BY_ROLE[role];
  const sections: NavSection[] = [];

  for (const group of groups) {
    const items: NavItem[] = [];
    if (group === "dashboard") {
      items.push(rootItem(role));
    }
    for (const entry of ROUTES) {
      if (entry.group !== group) continue;
      if (entry.hidden) continue;
      const visibleTo = entry.sideMenu ?? entry.access;
      if (!visibleTo.includes(role)) continue;
      items.push({
        path: entry.path,
        label: labelFor(entry, role),
        icon: entry.icon,
      });
    }
    if (items.length > 0) {
      const section: NavSection = { title: GROUP_TITLES[group], items };
      if (group === "facility") {
        const facilityHub = ROUTES.find((r) => r.path === "/facility");
        if (facilityHub && facilityHub.access.includes(role)) {
          section.headerHref = "/facility";
        }
      }
      sections.push(section);
    }
  }
  return sections;
}

/** Returns the mobile bottom nav items for a role (excluding the "더보기" toggle). */
export function getBottomNavItems(role: Role): NavItem[] {
  if (role === "partner") {
    return [
      rootItem("partner"),
      { path: "/rfqs", label: "견적", icon: PARTNER_RFQ_ICON },
      { path: "/vendors", label: "업체", icon: PARTNER_VENDORS_ICON },
      { path: "/commissions", label: "수수료", icon: Coins },
    ];
  }
  const items: NavItem[] = [{ ...rootItem(role), label: roleHomeShort(role) }];
  const tail: { entry: RouteEntry; item: NavItem }[] = [];
  for (const entry of ROUTES) {
    const inBottom = entry.bottomNav ?? [];
    if (!inBottom.includes(role)) continue;
    tail.push({
      entry,
      item: {
        path: entry.path,
        label: bottomLabelFor(entry, role),
        icon: entry.icon,
        groupSheet: entry.bottomGroupSheet,
      },
    });
  }
  tail.sort((a, b) => (a.entry.bottomOrder ?? 100) - (b.entry.bottomOrder ?? 100));
  for (const t of tail) items.push(t.item);
  return items;
}

function roleHomeShort(role: Role): string {
  switch (role) {
    case "facility_staff": return "업무";
    case "platform_admin": return "관리";
    default: return "홈";
  }
}

/** True if role is allowed to navigate to the given path. */
export function canAccess(role: Role, path: string): boolean {
  if (path === "/") return true;
  if (role === "partner") {
    return ["/rfqs", "/vendors", "/commissions"].some((p) => path === p || path.startsWith(p + "/"));
  }
  const match = ROUTES.find((r) => path === r.path || path.startsWith(r.path + "/"));
  if (!match) return false;
  return match.access.includes(role);
}
