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
  type LucideIcon,
} from "lucide-react";

import Dashboard from "@/pages/dashboard";
import PartnerDashboard from "@/pages/partner-dashboard";

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
const Users_ = lazy(() => import("@/pages/users"));
const FacilityDashboard = lazy(() => import("@/pages/facility-dashboard"));
const SafetyChecklists = lazy(() => import("@/pages/safety-checklists"));
const MaintenanceLogs = lazy(() => import("@/pages/maintenance-logs"));
const SafetyTraining = lazy(() => import("@/pages/safety-training"));
const DocumentTemplates = lazy(() => import("@/pages/document-templates"));
const DailyReportsPage = lazy(() => import("@/pages/daily-reports"));
const ReportSystemPage = lazy(() => import("@/pages/report-system"));
const HqDashboard = lazy(() => import("@/pages/hq-dashboard"));
const AccountantDashboard2 = lazy(() => import("@/pages/accountant-dashboard"));
const FacilityWorktool = lazy(() => import("@/pages/facility-worktool"));
const AdminDashboard = lazy(() => import("@/pages/admin-dashboard"));
const VendorPortal = lazy(() => import("@/pages/vendor-portal"));
const Attendance = lazy(() => import("@/pages/attendance"));
const BuildingInfo = lazy(() => import("@/pages/building-info"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const AccountingDashboard = lazy(() => import("@/pages/accounting-dashboard"));
const CalendarPage = lazy(() => import("@/pages/calendar"));
const Metering = lazy(() => import("@/pages/metering"));
const BillingPage = lazy(() => import("@/pages/billing"));
const ComplaintsPage = lazy(() => import("@/pages/complaints"));
const VotingPage = lazy(() => import("@/pages/voting"));
const ContractsPage = lazy(() => import("@/pages/contracts"));
const Units = lazy(() => import("@/pages/units"));
const AiAssistant = lazy(() => import("@/pages/ai-assistant"));

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
  /** Hide from sidebar even if role has access (e.g. sub-routes). */
  hidden?: boolean;
  /** Per-role label override for sidebar / page title. */
  labelOverrides?: Partial<Record<Role, string>>;
  /** Per-role label for the mobile bottom nav (shorter). */
  bottomLabel?: string;
  bottomLabelOverrides?: Partial<Record<Role, string>>;
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
  manager: ["dashboard", "residents", "facility", "accounting", "reports", "marketplace", "settings"],
  platform_admin: ["dashboard", "residents", "facility", "accounting", "reports", "marketplace", "settings"],
  accountant: ["dashboard", "accounting", "reports", "residents"],
  facility_staff: ["dashboard", "facility"],
  hq_executive: ["dashboard", "residents", "facility", "reports", "marketplace", "settings"],
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
    label: "AI 도우미", icon: Sparkles, group: "dashboard",
    access: ["manager", "platform_admin"],
  },
  {
    path: "/building-info", component: BuildingInfo,
    label: "건물 정보", icon: Building, group: "dashboard",
    access: ["manager", "platform_admin", "hq_executive", "accountant", "facility_staff"],
    sideMenu: ["manager", "platform_admin"],
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
    bottomNav: ["manager", "platform_admin"],
    bottomLabelOverrides: { manager: "입주민", platform_admin: "입주민" },
  },
  {
    path: "/owners", component: Owners,
    label: "소유자 관리", icon: UserCheck, group: "residents",
    access: ["manager", "platform_admin"],
  },
  {
    path: "/vehicles", component: Vehicles,
    label: "차량 관리", icon: Car, group: "residents",
    access: ["manager", "platform_admin", "facility_staff"],
    sideMenu: ["manager", "platform_admin"],
  },
  {
    path: "/complaints", component: ComplaintsPage,
    label: "민원 관리", icon: MessageSquare, group: "residents",
    access: ["manager", "platform_admin", "accountant", "facility_staff", "hq_executive"],
    sideMenu: ["manager", "platform_admin", "accountant", "hq_executive"],
    labelOverrides: { hq_executive: "에스컬레이션 민원" },
  },
  {
    path: "/voting", component: VotingPage,
    label: "전자투표", icon: Vote, group: "residents",
    access: ["manager", "platform_admin", "accountant"],
  },

  // ── Facility group ──────────────────────────────────────────────
  {
    path: "/facility", component: FacilityDashboard,
    label: "시설관리", icon: HardHat, group: "facility",
    access: ["manager", "platform_admin", "facility_staff"],
    bottomNav: ["manager", "platform_admin", "facility_staff"],
    bottomLabel: "시설",
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
    label: "기전 업무일지", icon: Wrench, group: "facility",
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
    label: "출퇴근 관리", icon: Clock, group: "facility",
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
  {
    path: "/accounting", component: AccountingDashboard,
    label: "관리비회계", icon: DollarSign, group: "accounting",
    access: ["manager", "platform_admin", "accountant"],
    bottomNav: ["manager", "platform_admin", "accountant"],
    bottomLabel: "회계",
  },
  {
    path: "/metering", component: Metering,
    label: "검침 관리", icon: Droplets, group: "accounting",
    access: ["manager", "platform_admin", "accountant"],
  },
  {
    path: "/billing", component: BillingPage,
    label: "관리비 부과/수납", icon: Receipt, group: "accounting",
    access: ["manager", "platform_admin", "accountant"],
    bottomNav: ["accountant"],
    bottomLabelOverrides: { accountant: "부과" },
  },
  {
    path: "/spending", component: ExecutiveSpending,
    label: "지출 현황", icon: DollarSign, group: "accounting",
    access: ["manager", "platform_admin", "accountant"],
  },
  {
    path: "/tax-schedules", component: TaxSchedules,
    label: "세무 일정", icon: Calculator, group: "accounting",
    access: ["manager", "platform_admin", "accountant"],
  },
  {
    path: "/commissions", component: Commissions,
    label: "수수료", icon: Coins, group: "accounting",
    access: ["manager", "platform_admin", "accountant", "partner"],
  },

  // ── Reports / approvals group ───────────────────────────────────
  {
    path: "/drafts", component: Drafts,
    label: "기안서", icon: ClipboardList, group: "reports",
    access: ["manager", "platform_admin", "accountant"],
  },
  {
    path: "/approvals", component: Approvals,
    label: "결재함", icon: ClipboardCheck, group: "reports",
    access: ["manager", "platform_admin", "accountant"],
    bottomNav: ["manager", "platform_admin", "accountant"],
    bottomLabel: "결재",
  },
  {
    path: "/approvals/create", component: ApprovalCreate,
    label: "결재 상신", icon: ClipboardList, group: "reports",
    access: ["manager", "platform_admin", "accountant"],
    hidden: true,
  },
  {
    path: "/daily-reports", component: DailyReportsPage,
    label: "일간보고", icon: BookOpen, group: "reports",
    access: ["manager", "platform_admin"],
  },
  {
    path: "/report-system", component: ReportSystemPage,
    label: "보고 체계", icon: BarChart3, group: "reports",
    access: ["manager", "platform_admin"],
  },
  {
    path: "/reports", component: Reports,
    label: "주간보고", icon: FileText, group: "reports",
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
    access: ["manager", "platform_admin", "hq_executive"],
    bottomNav: ["platform_admin"],
    bottomLabelOverrides: { platform_admin: "사용자" },
  },
  {
    path: "/document-templates", component: DocumentTemplates,
    label: "서식 관리", icon: FileText, group: "settings",
    access: ["manager", "platform_admin"],
  },
  {
    path: "/settings", component: SettingsPage,
    label: "설정", icon: Settings, group: "settings",
    access: ["manager", "platform_admin", "hq_executive", "accountant", "facility_staff"],
    sideMenu: ["manager", "platform_admin"],
  },
];

// ── Role-specific root ("/") dashboard mapping ───────────────────
export const ROOT_DASHBOARDS: Record<Role, AnyComponent> = {
  manager: Dashboard,
  platform_admin: AdminDashboard,
  hq_executive: HqDashboard,
  accountant: AccountantDashboard2,
  facility_staff: FacilityWorktool,
  partner: PartnerDashboard,
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
}

export interface NavSection {
  title?: string;
  items: NavItem[];
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
      sections.push({ title: GROUP_TITLES[group], items });
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
  for (const entry of ROUTES) {
    const inBottom = entry.bottomNav ?? [];
    if (!inBottom.includes(role)) continue;
    items.push({
      path: entry.path,
      label: bottomLabelFor(entry, role),
      icon: entry.icon,
    });
  }
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
