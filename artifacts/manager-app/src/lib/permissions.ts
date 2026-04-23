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
  Plus,
  Megaphone,
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
// [Task #290] 파트너 전용 화면 — 본인 업체 프로필 / 크레딧 잔액·충전 신청.
const PartnerVendorProfile = lazy(() => import("@/pages/partner-vendor-profile"));
const PartnerCredits = lazy(() => import("@/pages/partner-credits"));
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
// [Task #267] 플랫폼관리자 — 5개 역할별 현황 페이지(가입자/활성건물/최근활동/사용자목록 진입).
const PlatformRoleManagers = lazy(() => import("@/pages/platform-role-status").then((m) => ({ default: m.ManagersStatus })));
const PlatformRoleAccountants = lazy(() => import("@/pages/platform-role-status").then((m) => ({ default: m.AccountantsStatus })));
const PlatformRoleFacility = lazy(() => import("@/pages/platform-role-status").then((m) => ({ default: m.FacilityStaffStatus })));
const PlatformRoleHq = lazy(() => import("@/pages/platform-role-status").then((m) => ({ default: m.HqExecutivesStatus })));
const PlatformRolePartners = lazy(() => import("@/pages/platform-role-status").then((m) => ({ default: m.PartnersStatus })));

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
  accountant: "경리/회계",
  facility_staff: "시설기사",
  hq_executive: "총괄책임자",
  platform_admin: "플랫폼 관리자",
  partner: "파트너사",
};

export const GROUP_TITLES: Record<Group, string> = {
  dashboard: "오늘의 한눈 대시보드",
  residents: "입주민과 함께하는 호실 관리",
  facility: "든든하게 지키는 시설관리",
  accounting: "꼼꼼하게 챙기는 회계·관리비",
  reports: "차곡차곡 쌓는 보고·전자결재",
  marketplace: "함께 키우는 파트너 마켓",
  settings: "내 손에 맞춘 설정",
};

const GROUP_ORDER_BY_ROLE: Record<Role, Group[]> = {
  manager: ["dashboard", "facility", "accounting", "reports", "residents", "marketplace", "settings"],
  // [플랫폼관리자 메뉴 구조조정] 플랫폼관리자는 개별 건물 실무를 직접 수행하지
  //   않으므로 dashboard/residents/facility/accounting 그룹의 사이드바 노출을
  //   전부 제거하고, "보고/마켓플레이스/설정" 3 그룹만 사용한다. 통합 대시보드
  //   ("/")는 ROOT_DASHBOARDS 로 항상 진입 가능하므로 영향 없음.
  platform_admin: ["marketplace", "reports", "settings"],
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
  // [플랫폼관리자 메뉴 구조조정] 일정·업무관리·AI비서·업무일지는 현장 운영 도구로,
  //   플랫폼관리자 사이드바에서는 숨긴다 (라우트 접근은 지원/디버깅용으로 유지).
  {
    path: "/calendar", component: CalendarPage,
    label: "일정", icon: CalendarDays, group: "dashboard",
    access: ["manager", "accountant", "platform_admin"],
    sideMenu: ["manager", "accountant"],
  },
  {
    path: "/tasks", component: Tasks,
    label: "업무 관리", icon: CheckSquare, group: "dashboard",
    access: ["manager", "platform_admin"],
    sideMenu: ["manager"],
  },
  {
    path: "/ai-assistant", component: AiAssistant,
    label: "AI 관리비서", icon: Sparkles, group: "dashboard",
    access: ["manager", "platform_admin"],
    sideMenu: ["manager"],
    bottomNav: ["manager"],
    bottomLabel: "AI비서",
    bottomOrder: 20,
  },
  // [Task #182] 상시 업무기록(타임라인+FAB) + 일/주/월 보고서 자동생성
  {
    path: "/work-log", component: WorkLog,
    label: "업무일지", icon: NotebookPen, group: "reports",
    access: ["manager", "platform_admin"],
    sideMenu: ["manager"],
    bottomNav: ["manager"],
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
  // [플랫폼관리자 메뉴 구조조정] 호실/입주민/차량은 건물별 운영 데이터로,
  //   플랫폼관리자 사이드바에서는 숨긴다.
  {
    path: "/units", component: Units,
    label: "호실 관리", icon: Building, group: "residents",
    access: ["manager", "accountant", "platform_admin"],
    sideMenu: ["manager", "accountant"],
    bottomNav: ["accountant"],
    bottomLabelOverrides: { accountant: "호실" },
  },
  {
    path: "/tenants", component: Tenants,
    label: "입주민 관리", icon: Users, group: "residents",
    access: ["manager", "accountant", "platform_admin"],
    sideMenu: ["manager", "accountant"],
  },
  {
    path: "/vehicles", component: Vehicles,
    label: "차량 관리", icon: Car, group: "residents",
    access: ["manager", "platform_admin", "facility_staff"],
    sideMenu: ["manager"],
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
    // [네비 정비] 관리소장 하단 탭에서 "시설" 제거 — 일정/시설은 사이드바·더보기로 진입.
    //   facility_staff 의 본업 화면이므로 그쪽은 유지.
    bottomNav: ["facility_staff"],
    bottomLabel: "시설",
    bottomOrder: 10,
  },
  // [플랫폼관리자 메뉴 구조조정] 시설 운영 항목 4종은 플랫폼관리자 사이드바에서 숨김.
  {
    path: "/inspections", component: Inspections,
    label: "법정 점검", icon: Shield, group: "facility",
    access: ["manager", "platform_admin", "facility_staff", "hq_executive"],
    sideMenu: ["manager", "facility_staff", "hq_executive"],
    bottomNav: ["facility_staff", "hq_executive"],
    bottomLabel: "점검",
    labelOverrides: { hq_executive: "점검보고서" },
  },
  {
    path: "/safety-checklists", component: SafetyChecklists,
    label: "안전점검표", icon: ClipboardCheck, group: "facility",
    access: ["manager", "platform_admin", "facility_staff"],
    sideMenu: ["manager", "facility_staff"],
  },
  {
    path: "/maintenance-logs", component: MaintenanceLogs,
    label: "시설 업무일지", icon: Wrench, group: "facility",
    access: ["manager", "platform_admin", "facility_staff"],
    sideMenu: ["manager", "facility_staff"],
  },
  {
    path: "/safety-training", component: SafetyTraining,
    label: "안전교육", icon: GraduationCap, group: "facility",
    access: ["manager", "platform_admin", "facility_staff", "hq_executive"],
    sideMenu: ["manager", "facility_staff", "hq_executive"],
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
    // [Task #246] manager 역할은 회계 탭을 하단 네비에서 제외 (사이드바·더보기에서는 유지).
    // [플랫폼관리자 메뉴 구조조정] 모바일 하단 "회계" 탭에서도 platform_admin 제거.
    bottomNav: ["accountant"],
    bottomLabel: "회계",
    bottomOrder: 30,
  },
  // [관리소장 모드 단순화] 회계 그룹은 관리소장에게 "관리비 요약"만 노출.
  //   회계 엔진/검침/고지·수납/고지서/민원·투표/지출/세무/수수료는 경리·회계(accountant)
  //   및 플랫폼 관리자 전용으로 한정.
  // [플랫폼관리자 메뉴 구조조정] 회계 운영 항목은 플랫폼관리자 사이드바에서 숨김.
  {
    path: "/erp/accounting", component: ErpPhase2,
    label: "회계 엔진", icon: Calculator, group: "accounting",
    access: ["platform_admin", "accountant"],
    sideMenu: ["accountant"],
  },
  {
    path: "/erp/metering", component: ErpPhase1,
    label: "검침/에너지", icon: Droplets, group: "accounting",
    access: ["platform_admin", "accountant"],
    sideMenu: ["accountant"],
  },
  {
    path: "/erp/billing", component: ErpPhase3,
    label: "고지/수납", icon: Receipt, group: "accounting",
    access: ["platform_admin", "accountant"],
    sideMenu: ["accountant"],
    bottomNav: ["accountant"],
    bottomLabelOverrides: { accountant: "부과" },
  },
  // [Task #170] 관리비 OCR · 요약 (회계 그룹)
  {
    path: "/erp/fees-summary", component: ErpFeesSummary,
    label: "관리비 요약", icon: BarChart3, group: "accounting",
    access: ["manager", "platform_admin", "accountant"],
    sideMenu: ["manager", "accountant"],
  },
  // [Task #178] 건물 단위 관리비 응대 자료 (월별 5개 영역 한장 요약)
  // [메뉴 통합] 관리소장 사이드바에서는 "관리비 요약"으로 일원화 — 응대 자료는
  //   관리비 요약 페이지 내부 진입 버튼으로 접근. URL/직접 접근은 유지.
  {
    path: "/erp/building-records", component: BuildingRecords,
    label: "관리비 응대 자료", icon: Clipboard, group: "accounting",
    access: ["manager", "platform_admin", "accountant", "hq_executive"],
    sideMenu: ["accountant", "hq_executive"],
  },
  {
    path: "/erp/bills", component: ErpBills,
    label: "관리비 고지서", icon: FileText, group: "accounting",
    // manager는 라우트 접근만 유지(관리비 요약의 "고지서 업로드하러 가기" 버튼 진입용),
    //   사이드바/회계 허브 카드에서는 숨김.
    access: ["manager", "platform_admin", "accountant"],
    sideMenu: ["accountant"],
  },
  {
    path: "/erp/governance", component: ErpPhase4,
    label: "민원/투표", icon: MessageSquare, group: "accounting",
    access: ["platform_admin", "accountant", "hq_executive"],
    sideMenu: ["accountant", "hq_executive"],
    labelOverrides: { hq_executive: "에스컬레이션 민원" },
  },
  {
    path: "/spending", component: ExecutiveSpending,
    label: "지출 현황", icon: DollarSign, group: "accounting",
    access: ["platform_admin", "accountant"],
    sideMenu: ["accountant"],
  },
  {
    path: "/tax-schedules", component: TaxSchedules,
    label: "세무 일정", icon: Calculator, group: "accounting",
    access: ["platform_admin", "accountant"],
    sideMenu: ["accountant"],
  },
  {
    path: "/commissions", component: Commissions,
    label: "수수료", icon: Coins, group: "accounting",
    access: ["platform_admin", "accountant", "partner"],
    sideMenu: ["accountant", "partner"],
  },

  // ── Reports / approvals group ───────────────────────────────────
  {
    path: "/drafts", component: Drafts,
    label: "기안서", icon: ClipboardList, group: "reports",
    // [관리소장 메뉴 숨김] 기안서 기능은 문서생성으로 대체되어 manager 접근 제거
    access: ["platform_admin", "accountant"],
    // [플랫폼관리자 메뉴 구조조정] 기안서 작성은 경리 실무 — 플랫폼관리자 사이드바에서 숨김.
    sideMenu: ["accountant"],
  },
  {
    path: "/approvals", component: Approvals,
    label: "결재함", icon: ClipboardCheck, group: "reports",
    access: ["manager", "platform_admin", "accountant"],
    // [관리소장 메뉴 숨김] 결재함은 회계 사이드바에만 노출 (플랫폼관리자 제외).
    sideMenu: ["accountant"],
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
    // [관리소장 메뉴 숨김] 일간/주간 보고는 본사 총괄 사이드바에만 노출.
    // [플랫폼관리자 메뉴 구조조정] 플랫폼관리자 사이드바에서도 숨김.
    sideMenu: ["hq_executive"],
    bottomNav: ["hq_executive"],
    bottomLabel: "보고서",
    labelOverrides: { hq_executive: "월간보고서" },
  },

  // ── Partner marketplace group ───────────────────────────────────
  // [플랫폼관리자 메뉴 구조조정] 견적 요청은 관리소장 실무 — 플랫폼관리자 사이드바에서 숨김.
  {
    path: "/rfqs", component: Rfqs,
    label: "견적 요청", icon: Send, group: "marketplace",
    access: ["manager", "platform_admin"],
    sideMenu: ["manager"],
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
    // [Task #290] partner 는 협력업체 풀에서 제외 — 본인 업체는 /me/vendor 로 진입.
    access: ["manager", "platform_admin", "hq_executive", "accountant"],
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
    // [Task #267] platform_admin 의 사이드바·하단 네비는 커스텀 브랜치에서 직접 구성.
    sideMenu: ["hq_executive"],
  },
  // [Task #267] 플랫폼관리자 전용 — 5개 역할별 현황 페이지(가입자/활성건물/최근활동/사용자목록 진입).
  //   사이드바 노출은 커스텀 브랜치(getSidebarSections platform_admin)에서 직접 구성하므로 hidden:true.
  { path: "/platform/managers", component: PlatformRoleManagers,
    label: "관리소장 현황", icon: Building2, group: "dashboard",
    access: ["platform_admin"], hidden: true },
  { path: "/platform/accountants", component: PlatformRoleAccountants,
    label: "경리·회계 현황", icon: Calculator, group: "dashboard",
    access: ["platform_admin"], hidden: true },
  { path: "/platform/facility-staff", component: PlatformRoleFacility,
    label: "시설기사 현황", icon: HardHat, group: "dashboard",
    access: ["platform_admin"], hidden: true },
  { path: "/platform/hq-executives", component: PlatformRoleHq,
    label: "본사총괄 현황", icon: Shield, group: "dashboard",
    access: ["platform_admin"], hidden: true },
  { path: "/platform/partners", component: PlatformRolePartners,
    label: "파트너사 현황", icon: Package, group: "dashboard",
    access: ["platform_admin"], hidden: true },
  // [Task #267] 파트너 크레딧 — 관리자 대시보드의 VendorCreditsPanel 만 떼어 단독 페이지로 진입.
  { path: "/platform/credits",
    component: lazy(() => import("@/pages/platform-credits")),
    label: "파트너 크레딧", icon: Coins, group: "settings",
    access: ["platform_admin"], hidden: true },
  // [Task #283] 역할별 캠페인 알림 관리 — 단일 페이지가 ?role= 쿼리로 5개 역할 범위를 전환.
  { path: "/platform/campaigns",
    component: lazy(() => import("@/pages/platform-campaigns")),
    label: "캠페인 알림", icon: Megaphone, group: "settings",
    access: ["platform_admin"], hidden: true },
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
    // [관리소장 메뉴 숨김] 사이드바에서는 플랫폼 관리자만 노출. 접근 권한 자체는 유지.
    sideMenu: ["platform_admin"],
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
    // 플랫폼관리자 전용 — 모든 관리소장 AI 비서가 공통 참조하는
    // 법령·개정안·운영 가이드 자료실.
    path: "/platform-knowledge-docs",
    component: lazy(() => import("@/pages/platform-knowledge-docs")),
    label: "AI 공통 자료", icon: FileText, group: "settings",
    access: ["platform_admin", "hq_executive"],
  },
  {
    // [Task #221] 플랫폼관리자 전용 — 필수/제안업무 템플릿 일괄 관리.
    path: "/settings/task-templates",
    component: lazy(() => import("@/pages/task-templates")),
    label: "업무 템플릿 관리", icon: ClipboardList, group: "settings",
    access: ["platform_admin"],
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
  // [플랫폼관리자 메뉴 정비] 역할×메뉴 활성/비활성 그리드. 플랫폼관리자 전용.
  //   사이드바 노출은 platformAdminSidebar() 가 직접 추가하므로 여기서는 hidden.
  {
    path: "/settings/menu-overrides",
    component: lazy(() => import("@/pages/menu-overrides")),
    label: "유저유형별 메뉴 활성화", icon: Settings, group: "settings",
    access: ["platform_admin"],
    sideMenu: [],
    hidden: true,
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

// [Task #290] 파트너 메뉴 라벨/아이콘 — 협력업체 풀(/vendors) 진입 제거,
//   "내 업체 정보"(/me/vendor)와 "크레딧"(/me/credits) 추가.
const PARTNER_HOME_LABEL = "홈";
const PARTNER_RFQ_LABEL = "견적 요청";
const PARTNER_QUOTES_LABEL = "내 견적·작업";
const PARTNER_CREDITS_LABEL = "크레딧";
const PARTNER_COMMISSIONS_LABEL = "정산·수수료";
const PARTNER_MY_VENDOR_LABEL = "내 업체 정보";
const PARTNER_RFQ_ICON: LucideIcon = FileText;
const PARTNER_QUOTES_ICON: LucideIcon = Send;
const PARTNER_CREDITS_ICON: LucideIcon = Coins;
const PARTNER_COMMISSIONS_ICON: LucideIcon = DollarSign;
const PARTNER_MY_VENDOR_ICON: LucideIcon = Building2;

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Optional query-string suffix appended to `path` when navigating
   *  (e.g. `?role=manager`). Active matching also requires every key/value
   *  here to match the current URL, so the same `path` can appear multiple
   *  times for different scopes. */
  query?: Record<string, string>;
  /** When set, tapping this nav item should open a sheet listing the group's
   *  items rather than navigating to `path`. */
  groupSheet?: Group;
  /** [Task #256] 카테고리 색 매핑(category-colors.ts)을 위한 라우트 그룹.
   *  하단 네비/사이드바 아이콘에 카테고리 색을 입히는 데 사용한다. */
  group?: Group;
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
    // [Task #290] 파트너는 협력업체 풀(`/vendors`) 대신 본인 업체 전용 페이지
    //   (`/me/vendor`)와 크레딧 페이지(`/me/credits`)에만 접근한다.
    //   /settings 는 의도적으로 노출하지 않는다.
    return [
      { path: "/rfqs", component: VendorPortal },
      { path: "/commissions", component: Commissions },
      { path: "/me/vendor", component: PartnerVendorProfile },
      { path: "/me/credits", component: PartnerCredits },
    ];
  }
  return ROUTES.filter((r) => r.access.includes(role)).map((r) => ({
    path: r.path,
    component: r.component,
  }));
}

// [카테고리 메뉴 제어] 플랫폼 관리자가 사용자별로 끈 카테고리.
//   "dashboard" 는 항상 활성으로 강제(홈 진입 보장)하고, 그 외 그룹만 필터.
function isCategoryEnabled(group: Group, disabled?: readonly string[] | null): boolean {
  if (group === "dashboard") return true;
  if (!disabled || disabled.length === 0) return true;
  return !disabled.includes(group);
}

// [Task #267] 플랫폼관리자 전용 사이드바.
//   ROUTES.access 는 그대로 두어 직접 URL 접근은 보존하되, 사이드바에서 실무 메뉴(시설/회계/입주민/
//   보고/AI 비서 등)는 일괄 숨긴다.
// [Task #283] 역할별 7 그룹 시안으로 확장 → 그러나 5개 역할 × 5개 콘텐츠 메뉴 = 25개 항목 중복 발생.
// [플랫폼관리자 메뉴 정비] 약관·공지/캠페인·AI 자료·업무 템플릿은 이미 각 페이지 내부에
//   "역할별 탭"이 있으므로 사이드바에서는 단일 진입점만 노출한다. 역할 그룹에는 "현황"과
//   그 역할 고유의 운영 메뉴(시설기사 승인 / 협력업체·크레딧)만 남기고, 콘텐츠 메뉴는
//   "콘텐츠 관리" 그룹 한 곳으로 모은다.

type TargetRole = "manager" | "accountant" | "facility_staff" | "hq_executive" | "partner";

function platformAdminSidebar(): NavSection[] {
  return [
    {
      title: "관리소장",
      items: [{ path: "/platform/managers", label: "현황", icon: Building2 }],
    },
    {
      title: "경리·회계",
      items: [{ path: "/platform/accountants", label: "현황", icon: Calculator }],
    },
    {
      title: "시설기사",
      items: [
        { path: "/platform/facility-staff", label: "현황", icon: HardHat },
        { path: "/facility-approvals", label: "시설기사 승인", icon: UserCheck },
      ],
    },
    {
      title: "본사총괄",
      items: [{ path: "/platform/hq-executives", label: "현황", icon: Shield }],
    },
    {
      title: "파트너사",
      items: [
        { path: "/platform/partners", label: "현황", icon: Package },
        { path: "/vendors", label: "협력업체", icon: Building2 },
        { path: "/platform/credits", label: "파트너 크레딧", icon: Coins },
      ],
    },
    {
      title: "콘텐츠 관리",
      items: [
        { path: "/platform-consents", label: "약관 관리", icon: FileText },
        { path: "/platform-announcements", label: "본사 알림(공지·캠페인)", icon: Megaphone },
        { path: "/platform-knowledge-docs", label: "AI 공통 자료", icon: BookOpen },
        { path: "/settings/task-templates", label: "업무 템플릿", icon: ClipboardList },
      ],
    },
    {
      title: "공통·시스템",
      items: [
        { path: "/users", label: "사용자 관리", icon: Users },
        { path: "/document-templates", label: "서식 관리", icon: FileText },
        { path: "/report-system", label: "보고 체계", icon: BarChart3 },
      ],
    },
    {
      title: "설정",
      items: [
        { path: "/settings/menu-overrides", label: "유저유형별 메뉴 활성화", icon: Settings },
        { path: "/settings/profile", label: "내정보 수정", icon: User },
        { path: "/settings/building", label: "건물정보 수정", icon: Building },
      ],
    },
  ];
}

// ── Role × menu block overrides ───────────────────────────────────
// [플랫폼관리자 메뉴 정비] 플랫폼관리자가 "유저유형별 메뉴 활성화" 그리드에서
//   특정 역할의 메뉴를 끄면, 사이드바·하단 네비·라우트 가드에서 모두 숨겨야 한다.
//   서버는 enabled=false 행만 저장한다(부재 = 활성 기본값). 여기서는 path 를
//   blockId 로 사용하며, ROUTES 의 path 와 1:1 매핑한다.
export type MenuOverride = { role: string; blockId: string; enabled: boolean };

export function isMenuBlockEnabled(
  role: Role,
  blockId: string,
  overrides?: readonly MenuOverride[] | null,
): boolean {
  if (!overrides || overrides.length === 0) return true;
  // 플랫폼관리자는 본인 사이드바 토글 대상이 아니므로 항상 활성.
  if (role === "platform_admin") return true;
  for (const o of overrides) {
    if (o.role === role && o.blockId === blockId && o.enabled === false) return false;
  }
  return true;
}

/** Returns the sidebar sections for a role, grouped per role's group order. */
export function getSidebarSections(
  role: Role,
  disabledCategories?: readonly string[] | null,
  overrides?: readonly MenuOverride[] | null,
): NavSection[] {
  if (role === "platform_admin") return platformAdminSidebar();
  if (role === "partner") {
    // [Task #290] 파트너 사이드바 — 협력업체 풀(/vendors) 제거, 본인 업체 정보 + 크레딧 추가.
    //   동선: 홈 → 견적 요청 → 내 견적·작업 → 크레딧 → 정산·수수료 → 내 업체 정보.
    //   [meno-overrides] HEAD 의 isMenuBlockEnabled 필터링 동작 유지: 루트("/")는 항상 노출.
    const partnerItems: NavItem[] = [
      { ...rootItem("partner"), label: PARTNER_HOME_LABEL },
      { path: "/rfqs", label: PARTNER_RFQ_LABEL, icon: PARTNER_RFQ_ICON },
      { path: "/rfqs", query: { tab: "quotes" }, label: PARTNER_QUOTES_LABEL, icon: PARTNER_QUOTES_ICON },
      { path: "/me/credits", label: PARTNER_CREDITS_LABEL, icon: PARTNER_CREDITS_ICON },
      { path: "/commissions", label: PARTNER_COMMISSIONS_LABEL, icon: PARTNER_COMMISSIONS_ICON },
      { path: "/me/vendor", label: PARTNER_MY_VENDOR_LABEL, icon: PARTNER_MY_VENDOR_ICON },
    ];
    return [
      {
        items: partnerItems.filter(
          (it) => it.path === "/" || isMenuBlockEnabled("partner", it.path, overrides),
        ),
      },
    ];
  }

  const groups = GROUP_ORDER_BY_ROLE[role];
  const sections: NavSection[] = [];

  for (const group of groups) {
    // [카테고리 메뉴 제어] 플랫폼 관리자가 끈 카테고리는 사이드바에서 숨김.
    if (!isCategoryEnabled(group, disabledCategories)) continue;
    const items: NavItem[] = [];
    if (group === "dashboard") {
      items.push(rootItem(role));
    }
    for (const entry of ROUTES) {
      if (entry.group !== group) continue;
      if (entry.hidden) continue;
      const visibleTo = entry.sideMenu ?? entry.access;
      if (!visibleTo.includes(role)) continue;
      // [플랫폼관리자 메뉴 정비] 역할×메뉴 그리드에서 비활성된 블록은 숨김.
      if (!isMenuBlockEnabled(role, entry.path, overrides)) continue;
      items.push({
        path: entry.path,
        label: labelFor(entry, role),
        icon: entry.icon,
        // [Task #256] 사이드바 아이콘에 카테고리 색을 입히기 위해 그룹을 함께 전달.
        group: entry.group,
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
export function getBottomNavItems(
  role: Role,
  disabledCategories?: readonly string[] | null,
  overrides?: readonly MenuOverride[] | null,
): NavItem[] {
  // [Task #267] 플랫폼관리자 하단 네비도 사이드바와 동일 원칙으로 정리.
  //   홈(현황 카드) / 사용자 / 설정. 시설/회계/AI비서/업무일지 같은 실무 탭은 노출하지 않는다.
  if (role === "platform_admin") {
    return [
      { ...rootItem("platform_admin"), label: "관리", group: "dashboard" },
      { path: "/users", label: "사용자", icon: Users, group: "settings" },
      { path: "/settings/profile", label: "설정", icon: Settings, group: "settings" },
    ];
  }
  if (role === "partner") {
    // [Task #290] 파트너 하단 네비 — 사이드바 6 항목과 동일한 동선.
    //   "내 견적·작업" 까지 노출하고, 내 업체 정보는 더보기 드로어로 빠진다.
    return [
      { ...rootItem("partner"), label: PARTNER_HOME_LABEL },
      { path: "/rfqs", label: "견적", icon: PARTNER_RFQ_ICON },
      { path: "/rfqs", query: { tab: "quotes" }, label: "내 견적", icon: PARTNER_QUOTES_ICON },
      { path: "/me/credits", label: PARTNER_CREDITS_LABEL, icon: PARTNER_CREDITS_ICON },
      { path: "/commissions", label: "수수료", icon: PARTNER_COMMISSIONS_ICON },
    ];
  }
  // [네비 정비] 관리소장 하단 네비 5칸: 홈 / 일지 / 업무기록(+) / AI비서 / 더보기.
  //   "더보기"는 layout.tsx 가 항상 마지막에 추가하므로 여기서는 4칸만 반환.
  //   "/__quick_entry" 는 라우트가 아닌 sentinel 경로 — layout.tsx 에서 업무기록 다이얼로그를 연다.
  if (role === "manager") {
    const managerItems: NavItem[] = [
      { ...rootItem("manager"), label: "홈", group: "dashboard" },
      { path: "/work-log", label: "일지", icon: NotebookPen, group: "reports" },
      { path: "/__quick_entry", label: "업무기록", icon: Plus, group: "dashboard" },
      { path: "/ai-assistant", label: "AI비서", icon: Sparkles, group: "dashboard" },
    ];
    // [카테고리 메뉴 제어] 끈 카테고리에 속한 하단 탭 제거(dashboard 는 항상 통과).
    return managerItems.filter((it) => isCategoryEnabled((it.group ?? "dashboard") as Group, disabledCategories));
  }
  const items: NavItem[] = [{ ...rootItem(role), label: roleHomeShort(role), group: "dashboard" }];
  const tail: { entry: RouteEntry; item: NavItem }[] = [];
  for (const entry of ROUTES) {
    const inBottom = entry.bottomNav ?? [];
    if (!inBottom.includes(role)) continue;
    // [카테고리 메뉴 제어] 끈 카테고리에 속하는 하단 탭은 숨김.
    if (!isCategoryEnabled(entry.group, disabledCategories)) continue;
    // [플랫폼관리자 메뉴 정비] 역할×메뉴 그리드에서 비활성된 블록은 하단 탭에서도 숨김.
    if (!isMenuBlockEnabled(role, entry.path, overrides)) continue;
    tail.push({
      entry,
      item: {
        path: entry.path,
        label: bottomLabelFor(entry, role),
        icon: entry.icon,
        groupSheet: entry.bottomGroupSheet,
        group: entry.group,
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

/** Resolve the menu group for a given path (or null if none). */
export function getRouteGroup(path: string): Group | null {
  const match = ROUTES.find((r) => path === r.path || path.startsWith(r.path + "/"));
  return match?.group ?? null;
}

/** True if the route's group is currently enabled for the user. */
export function isRouteCategoryEnabled(path: string, disabledCategories?: readonly string[] | null): boolean {
  const group = getRouteGroup(path);
  if (!group) return true;
  return isCategoryEnabled(group, disabledCategories);
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
