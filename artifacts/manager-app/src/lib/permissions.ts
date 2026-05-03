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
  // [Task #413] 시설관리 → 필수업무 페이지 사이드바 아이콘.
  AlertTriangle,
  Users,
  User,
  UserCheck,
  Car,
  // [Task #797] 키 발급/회수 사이드바 아이콘.
  KeyRound,
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
  // [Task #734] 이벤트 크레딧 일괄 지급 메뉴/카드 아이콘.
  Gift,
  // [Task #796] XpBIZ 환경설정 풀세트 사이드바 아이콘.
  Gauge,
  KeyRound,
  Wallet,
  // [Task #740 가입흐름재설정] 파트너 분야(2단 카테고리) 관리 메뉴 아이콘.
  Layers,
  // [Task #774] 부과자료 업로드센터 메뉴 아이콘.
  UploadCloud,
  // [Task #775] 결재 진행상황(파이프라인) 메뉴 아이콘.
  Activity,
  // [Task #780] T9 마감·보고엔진 v01 — 월마감 메뉴 아이콘.
  Lock,
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
// [Task #797] 입주자관리 — AI 자동화 기반 6종 추가 화면.
const KeyIssuancePage = lazy(() => import("@/pages/residents/key-issuance"));
const InterimSettlementPage = lazy(() => import("@/pages/residents/interim-settlement"));
const PrivacyAccessLogPage = lazy(() => import("@/pages/residents/privacy-access-log"));
const MoveInOutPage = lazy(() => import("@/pages/residents/move-in-out"));
const LongTermRepairAllocationPage = lazy(() => import("@/pages/long-term-repair-allocation"));
const Users_ = lazy(() => import("@/pages/users"));
const FacilityDashboard = lazy(() => import("@/pages/facility-dashboard"));
// [Task #413] 시설관리 → 필수업무 / 제안업무 — 사용자 건물의 모든 임박/초과 업무를
//   60일 컷오프 없이 노출하는 전용 페이지.
const FacilityMandatoryTasks = lazy(() => import("@/pages/facility-mandatory-tasks"));
const FacilitySuggestedTasks = lazy(() => import("@/pages/facility-suggested-tasks"));
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
const PartnerCreditsTopupSuccess = lazy(() => import("@/pages/partner-credits-topup-success"));
const PartnerCreditsTopupFail = lazy(() => import("@/pages/partner-credits-topup-fail"));
const Attendance = lazy(() => import("@/pages/attendance"));
const BuildingInfo = lazy(() => import("@/pages/building-info"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const CalendarPage = lazy(() => import("@/pages/calendar"));
const VotingPage = lazy(() => import("@/pages/voting"));
const ContractsPage = lazy(() => import("@/pages/contracts"));
// [Task #416] 협력업체 주소록 — 현재 건물 기준 vendor+contract 카드 화면.
const BuildingVendorDirectoryPage = lazy(() => import("@/pages/building-vendor-directory"));
const Units = lazy(() => import("@/pages/units"));
const AiAssistant = lazy(() => import("@/pages/ai-assistant"));
const ErpPhase1 = lazy(() => import("@/pages/erp/phase-1-metering"));
const ErpPhase2 = lazy(() => import("@/pages/erp/phase-2-accounting"));
const ErpPhase3 = lazy(() => import("@/pages/erp/phase-3-billing"));
const ErpPhase4 = lazy(() => import("@/pages/erp/phase-4-governance"));
const ErpBills = lazy(() => import("@/pages/erp/bills"));
// [Task #779] T8 고지·수납엔진 — 고지서 발행/수납/통장매칭/미수/연체 통합.
const ErpBillingLedger = lazy(() => import("@/pages/erp/billing-ledger"));
const ErpFeesSummary = lazy(() => import("@/pages/erp/fees-summary"));
const AccountingHub = lazy(() => import("@/pages/erp/accounting-hub"));
const BuildingRecords = lazy(() => import("@/pages/erp/building-records"));
// [Task #776] 예산·집행통제 엔진 v01.
const ErpBudgets = lazy(() => import("@/pages/erp/budgets"));
// [Task #780] T9 마감·보고엔진 v01.
const ErpClosings = lazy(() => import("@/pages/erp/closings"));
// [Task #774] 부과자료 업로드센터 — OCR/문서엔진 v01 진입 페이지.
const ErpUploadCenter = lazy(() => import("@/pages/erp/upload-center"));
const WorkLog = lazy(() => import("@/pages/work-log"));
// [Task #267] 플랫폼 — 5개 역할별 현황 페이지(가입자/활성건물/최근활동/사용자목록 진입).
const PlatformRoleManagers = lazy(() => import("@/pages/platform-role-status").then((m) => ({ default: m.ManagersStatus })));
const PlatformRoleAccountants = lazy(() => import("@/pages/platform-role-status").then((m) => ({ default: m.AccountantsStatus })));
const PlatformRoleFacility = lazy(() => import("@/pages/platform-role-status").then((m) => ({ default: m.FacilityStaffStatus })));
const PlatformRoleHq = lazy(() => import("@/pages/platform-role-status").then((m) => ({ default: m.HqExecutivesStatus })));
const PlatformRolePartners = lazy(() => import("@/pages/platform-role-status").then((m) => ({ default: m.PartnersStatus })));

// [Task #611] 결재 라인 — 지출결의서 / 입금요청서 / 본부장 임계 금액 화면.
const ExpenseVoucherInbox = lazy(() => import("@/pages/expense-voucher-inbox"));
// [Task #775] 결재 진행상황 화면 — 정체 단계 표시 + 독촉 알림.
const ApprovalPipelineStatus = lazy(() => import("@/pages/approval-pipeline-status"));
// [Task #773] 감사로그 — platform_admin / hq_executive / custodian 만 진입.
const AuditLogsPage = lazy(() => import("@/pages/audit-logs"));
// [Task #781] T10 외부연동 — 발송 이력 / Popbill 설정.
const DispatchHistoryPage = lazy(() => import("@/pages/dispatch-history"));
const PopbillSettingsPage = lazy(() => import("@/pages/popbill-settings"));
const PaymentRequestInbox = lazy(() => import("@/pages/payment-request-inbox"));
const HqApprovalThresholds = lazy(() => import("@/pages/hq-approval-thresholds"));

// [Task #772] 경리 신 IA "준비 중" Coming Soon 스텁 — 후속 엔진 태스크(T2~T10)에서 채워진다.
const AccountantComingSoon = lazy(() => import("@/pages/accountant/coming-soon"));

// [역할 라벨 SoT] 역할 키 / 표시 라벨은 @workspace/shared/role-labels 에서
//   단일 소스로 정의한다. 라벨이 바뀌면 그 파일만 수정하면 프런트엔드와
//   백엔드가 동시에 반영된다.
import { ROLE_LABELS as SHARED_ROLE_LABELS, type AppRole, roleLabel } from "@workspace/shared/role-labels";

export type Role = AppRole;

export { roleLabel };

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
  /** [Task #665] Independent block id used by the role×menu grid and
   *  isMenuBlockEnabled. Defaults to `path`. Use a distinct id when two
   *  ROUTES entries share the same `path` but represent independently
   *  toggleable menu items (e.g. /rfqs vs /rfqs?tab=quotes). */
  blockId?: string;
  /** [Task #665] Optional query string to append when navigating from
   *  sidebar/bottom-nav. Combined with `path` for the actual href. */
  query?: Record<string, string>;
  /** [Task #665] Per-role component override. Useful when the same path is
   *  served by a different page component for a particular role
   *  (e.g. /rfqs → VendorPortal for partners, Rfqs for managers). */
  componentOverrides?: Partial<Record<Role, AnyComponent>>;
  /** [Task #665] When "sidebarOnly", this entry contributes to the sidebar /
   *  bottom-nav / role×menu grid but does NOT register an additional SPA
   *  route (its path is expected to already be registered by another entry). */
  routeMode?: "default" | "sidebarOnly";
  /** [Task #665] Sort order within the partner sidebar / bottom nav.
   *  Lower numbers appear first. Defaults to 100. */
  partnerOrder?: number;
}

/**
 * [Task #665] Paths that are permanently blocked for partner regardless of
 * any explicit grid override. The grid surfaces these as a disabled cell so
 * platform admins understand the menu cannot be enabled for partners.
 */
export const PARTNER_BLOCKED_PATHS: ReadonlySet<string> = new Set<string>([
  // [Task #637] "계약 성사까지만 매칭" — 정산·수수료는 파트너 화면에서 분리.
  "/commissions",
]);

/** Resolve the grid block id for a route entry (defaults to its path). */
export function blockIdOf(entry: Pick<RouteEntry, "blockId" | "path">): string {
  return entry.blockId ?? entry.path;
}

/** Resolve the effective role for permission/menu derivation.
 *  Partner portal users are mapped to "partner" regardless of stored role,
 *  giving a single, consistent identity for both routing and navigation. */
export function getEffectiveRole(user: { role?: string | null; portalType?: string | null } | null | undefined): Role {
  if (!user) return "manager";
  if (user.portalType === "partner") return "partner";
  // [Task #611] 관리인(custodian) 포털 — 결재함/입금요청함 전용 단순 메뉴.
  if (user.portalType === "custodian" || user.role === "custodian") return "custodian";
  return (user.role as Role) ?? "manager";
}

export const ROLE_LABELS = SHARED_ROLE_LABELS;

export const GROUP_TITLES: Record<Group, string> = {
  dashboard: "오늘의 한눈 대시보드",
  residents: "입주민과 함께하는 호실 관리",
  facility: "든든하게 지키는 시설관리",
  accounting: "꼼꼼하게 챙기는 회계·관리비",
  reports: "차곡차곡 쌓는 보고·전자결재",
  marketplace: "함께 키우는 파트너 마켓",
  settings: "내 손에 맞춘 설정",
};

// [Task #725] GROUP_ORDER_BY_ROLE 의 의미를 "표시 순서"로 좁힌다.
//   더 이상 "노출 게이트"가 아니다 — 사이드바 노출은 ROUTES.sideMenu 와 본사 그리드
//   명시적 ON 만으로 결정된다(getSidebarSections 단일 진리 원천). 여기서는 단지
//   각 역할의 그룹이 어떤 순서로 정렬되는지를 정의할 뿐이며, 정의되지 않은 그룹은
//   FALLBACK_GROUP_ORDER 로 뒤에 자연스럽게 이어 붙는다.
//
//   ※ 과거 Task #416/#583/#649 에서 그룹을 추가했던 이유는 당시 코드가 그룹 목록을
//     노출 게이트로 사용했기 때문이다. 지금도 그룹은 그대로 유지하지만, 사유는
//     "표시 순서 우선 지정" 으로 바뀌었다(누군가 그룹을 빼면 사이드바 노출이 끊기는
//     게 아니라, fallback 순서로 밀려 정렬만 달라진다).
const GROUP_ORDER_BY_ROLE: Record<Role, Group[]> = {
  manager: ["dashboard", "facility", "reports", "accounting", "residents", "marketplace", "settings"],
  // [플랫폼 메뉴 구조조정] 플랫폼 사이드바는 platformAdminSidebar() 가 직접 구성하므로
  //   여기 값은 fallback 용도일 뿐이다.
  platform_admin: ["marketplace", "reports", "settings"],
  accountant: ["dashboard", "accounting", "facility", "reports", "residents", "marketplace"],
  // [Task #725] facility_staff 에 accounting 그룹을 명시적으로 추가 — 검침/관리비
  //   응대 자료 등 시설담당이 access·sideMenu 에 포함된 회계 항목들이 "시설관리"
  //   다음, "보고" 앞에 합리적으로 정렬되도록 한다. (그룹을 빼더라도 fallback 순서로
  //   사이드바 끝에 붙어서 노출은 보장되지만, 시각적 정렬을 위해 명시적으로 둔다.)
  facility_staff: ["dashboard", "facility", "accounting", "reports", "marketplace"],
  hq_executive: ["dashboard", "facility", "accounting", "reports", "residents", "marketplace", "settings"],
  partner: ["dashboard", "marketplace"],
  // [Task #611] 관리인 — 결재함과 입금요청함만 노출. 그 외 화면은 access 자체가 없다.
  custodian: ["reports", "accounting"],
};

// [Task #725] 역할별 그룹 순서에 빠진 그룹의 fallback 정렬 — manager 의 순서를
//   기준으로 자연스러운 카테고리 흐름(대시보드 → 시설 → 회계 → 보고 → 입주민 →
//   마켓 → 설정)을 사용한다. 단, "dashboard" 그룹은 rootItem 을 자동으로 끼워주는
//   특수 그룹이라 fallback 으로 자동 추가하지 않는다(역할이 명시적으로 옵트인한 경우만).
const FALLBACK_GROUP_ORDER: readonly Group[] = [
  "facility",
  "accounting",
  "reports",
  "residents",
  "marketplace",
  "settings",
];

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
  // [플랫폼 메뉴 구조조정] 일정·업무관리·AI비서·업무일지는 현장 운영 도구로,
  //   플랫폼 사이드바에서는 숨긴다 (라우트 접근은 지원/디버깅용으로 유지).
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
  // [직책별 일보 분리] 소장/경리/시설과장 모두 자기 직책의 업무기록과 일보를 만든다.
  //   각자 자기 모달로 자기 직책 일보를 채우며, 소장 일보 미리보기에는 같은 건물의
  //   부하 직책 업무기록이 직책 라벨과 함께 자동 편입된다.
  {
    path: "/work-log", component: WorkLog,
    label: "업무일지", icon: NotebookPen, group: "reports",
    access: ["manager", "accountant", "facility_staff", "platform_admin"],
    sideMenu: ["manager", "accountant", "facility_staff"],
    bottomNav: ["manager", "accountant", "facility_staff"],
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
  // [플랫폼 메뉴 구조조정] 호실/입주민/차량은 건물별 운영 데이터로,
  //   플랫폼 사이드바에서는 숨긴다.
  {
    path: "/units", component: Units,
    label: "호실 관리", icon: Building, group: "residents",
    // [요청] 시설담당 대시보드 "호실정보조회" 카드에서 검색 결과 클릭 시 호실관리
    //   페이지로 이동하므로 시설담당자도 라우트 진입을 허용한다. 사이드바에는
    //   별도 노출하지 않고(아래 sideMenu 그대로), 카드 클릭 동선으로만 진입.
    access: ["manager", "accountant", "platform_admin", "facility_staff"],
    sideMenu: ["manager", "accountant"],
    // [모바일 5탭 단순화] 경리 모바일 하단탭에서 "호실" 제거 — 사이드바·더보기로 진입.
    bottomNav: [],
  },
  {
    path: "/tenants", component: Tenants,
    label: "입주민 관리", icon: Users, group: "residents",
    // [요청] 시설담당 대시보드 "호실정보조회" 위젯이 입주자 검색 API 도 호출하므로
    //   라우트 진입 자체는 허용한다(검색 결과는 호실 페이지로 이동하므로 시설담당이
    //   입주민 페이지를 직접 열 일은 거의 없지만, 수동 URL 진입을 차단하지 않음).
    //   사이드바는 그대로 매니저/경리만.
    access: ["manager", "accountant", "platform_admin", "facility_staff"],
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
  // [Task #797] AI 자동화 기반 입주자관리 부가 화면 — 음성/자연어/자동집계 중심.
  {
    path: "/residents/key-issuance", component: KeyIssuancePage,
    label: "키 발급/회수", icon: KeyRound, group: "residents",
    access: ["manager", "platform_admin"],
    sideMenu: ["manager"],
  },
  {
    path: "/residents/interim-settlement", component: InterimSettlementPage,
    label: "중간 정산서", icon: Receipt, group: "residents",
    access: ["manager", "accountant", "platform_admin"],
    sideMenu: ["manager", "accountant"],
  },
  {
    path: "/residents/privacy-access-log", component: PrivacyAccessLogPage,
    label: "개인정보 접근이력", icon: Shield, group: "residents",
    access: ["manager", "platform_admin"],
    sideMenu: ["manager"],
  },
  {
    path: "/residents/move-in-out", component: MoveInOutPage,
    label: "전입/전출 현황", icon: UserCheck, group: "residents",
    access: ["manager", "accountant", "platform_admin"],
    sideMenu: ["manager"],
  },
  {
    path: "/long-term-repair-allocation", component: LongTermRepairAllocationPage,
    label: "장기수선충당금 산출", icon: Calculator, group: "residents",
    access: ["manager", "accountant", "platform_admin"],
    sideMenu: ["manager", "accountant"],
  },

  // ── Facility group ──────────────────────────────────────────────
  {
    path: "/facility", component: FacilityDashboard,
    label: "시설관리", icon: HardHat, group: "facility",
    access: ["manager", "platform_admin", "facility_staff"],
    // 시설 그룹 자체가 4-아이콘 허브 역할을 하므로 사이드바에서 숨김.
    // 그룹 헤더 클릭 시 /facility 로 이동 (layout.tsx 의 facilityGroupHref).
    sideMenu: [],
    // [모바일 5탭 단순화] 시설기사 모바일 하단탭에서 "시설" 제거 —
    //   시설관리 허브는 더보기 드로어로 진입(여러 시설 화면이 사이드바에 풀세트로 노출됨).
    bottomNav: [],
  },
  // [플랫폼 메뉴 구조조정] 시설 운영 항목 4종은 플랫폼 사이드바에서 숨김.
  {
    path: "/inspections", component: Inspections,
    label: "법정 점검", icon: Shield, group: "facility",
    access: ["manager", "platform_admin", "facility_staff", "hq_executive"],
    sideMenu: ["manager", "facility_staff", "hq_executive"],
    // [모바일 5탭 단순화] 시설기사 모바일 하단탭에서 "점검" 제거 — 본부장만 유지.
    bottomNav: ["hq_executive"],
    bottomLabel: "점검",
    labelOverrides: { hq_executive: "점검보고서" },
  },
  // [Task #413] 사용자 건물의 모든 필수/제안 업무를 60일 컷오프 없이 보여주는 전용 페이지.
  //   매니저/시설담당자/플랫폼 관리자가 사이드바·하단탭에서 진입한다.
  //   하단탭은 facility_staff 본업 화면이라 표시(매니저는 사이드바에서만 노출).
  // [Task #681] 경리(accountant) 대시보드 "필수업무현황" 카드의 "모두보기" 링크가
  //   /facility/mandatory-tasks 로 향한다(공용 목록). 경리도 access 에 포함해야
  //   링크 클릭 시 권한 차단이 발생하지 않는다. sideMenu/bottomNav 에는 추가하지
  //   않아 경리의 메뉴 구조는 그대로 둔다(대시보드 카드를 통해서만 진입).
  {
    path: "/facility/mandatory-tasks", component: FacilityMandatoryTasks,
    label: "필수업무", icon: AlertTriangle, group: "facility",
    access: ["manager", "platform_admin", "facility_staff", "accountant"],
    sideMenu: ["manager", "facility_staff", "platform_admin"],
    // [모바일 5탭 단순화] 시설기사 모바일 하단탭에서 "필수업무" 제거 — 사이드바·더보기로 진입.
    bottomNav: [],
  },
  {
    path: "/facility/suggested-tasks", component: FacilitySuggestedTasks,
    label: "제안업무", icon: Sparkles, group: "facility",
    access: ["manager", "platform_admin", "facility_staff"],
    sideMenu: ["manager", "facility_staff", "platform_admin"],
    // [모바일 5탭 단순화] 시설기사 모바일 하단탭에서 "제안업무" 제거 — 사이드바·더보기로 진입.
    bottomNav: [],
  },
  {
    // [Task #650] 경리(accountant) 역할도 안전점검표 페이지에 접근할 수 있도록 access 에 추가.
    path: "/safety-checklists", component: SafetyChecklists,
    label: "안전점검표", icon: ClipboardCheck, group: "facility",
    access: ["manager", "platform_admin", "facility_staff", "accountant"],
    sideMenu: ["manager", "facility_staff", "accountant"],
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
    // [모바일 5탭 단순화] 경리 모바일 하단탭에서 "회계" 허브 제거 — 사이드바·더보기로 진입.
    bottomNav: [],
  },
  // [관리소장 모드 단순화] 회계 그룹은 관리소장에게 "관리비 요약"만 노출.
  //   회계 엔진/검침/고지·수납/고지서/민원·투표/지출/세무/수수료는 경리·회계(accountant)
  //   및 플랫폼 전용으로 한정.
  // [플랫폼 메뉴 구조조정] 회계 운영 항목은 플랫폼 사이드바에서 숨김.
  {
    path: "/erp/accounting", component: ErpPhase2,
    label: "회계 엔진", icon: Calculator, group: "accounting",
    access: ["platform_admin", "accountant"],
    sideMenu: ["accountant"],
  },
  {
    // [Task #630] 가시성 정책 (사장 답변):
    //   - 입력·수정 가능: 같은 건물 직원(소장·경리·시설) + 본사 어드민.
    //   - 읽기만: 본부장(관할 건물 묶음). UI 가 자동으로 조회 전용 모드 전환.
    //   - 비가시: 파트너 (access 에서 제외).
    path: "/erp/metering", component: ErpPhase1,
    label: "검침", icon: Droplets, group: "accounting",
    access: ["manager", "platform_admin", "accountant", "facility_staff", "hq_executive"],
    sideMenu: ["manager", "accountant", "facility_staff", "hq_executive"],
    // [모바일 5탭] 경리/시설기사 모바일 하단탭에 "검침" 노출.
    bottomNav: ["accountant", "facility_staff"],
    bottomLabel: "검침",
    bottomOrder: 40,
  },
  {
    path: "/erp/billing", component: ErpPhase3,
    label: "고지/수납", icon: Receipt, group: "accounting",
    access: ["platform_admin", "accountant"],
    sideMenu: ["accountant"],
    // [모바일 5탭 단순화] 경리 모바일 하단탭에서 "부과" 제거 — 사이드바·더보기로 진입.
    bottomNav: [],
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
  // [Task #774] 부과자료 업로드센터 — 한 화면에서 모든 자료 업로드+OCR+보관함.
  // [Task #776] 예산·집행통제 — 항목 × 월 매트릭스 + 의결 버전 + 집행률.
  {
    path: "/erp/budgets", component: ErpBudgets,
    label: "예산·집행통제", icon: Sparkles, group: "accounting",
    access: ["manager", "platform_admin", "accountant", "hq_executive", "custodian"],
    sideMenu: ["manager", "accountant", "hq_executive"],
  },
  {
    path: "/erp/upload-center", component: ErpUploadCenter,
    label: "부과자료 업로드", icon: UploadCloud, group: "accounting",
    access: ["manager", "platform_admin", "accountant"],
    sideMenu: ["manager", "accountant"],
  },
  {
    path: "/erp/bills", component: ErpBills,
    label: "관리비 고지서", icon: FileText, group: "accounting",
    // manager는 라우트 접근만 유지(관리비 요약의 "고지서 업로드하러 가기" 버튼 진입용),
    //   사이드바/회계 허브 카드에서는 숨김.
    access: ["manager", "platform_admin", "accountant"],
    sideMenu: ["accountant"],
  },
  // [Task #779] T8 고지·수납엔진 v01 — 발행/수납/통장매칭/미수/연체 통합 화면.
  {
    path: "/erp/billing-ledger", component: ErpBillingLedger,
    label: "고지·수납 ledger", icon: Receipt, group: "accounting",
    access: ["manager", "platform_admin", "accountant"],
    sideMenu: ["accountant"],
  },
  // [Task #780] T9 마감·보고엔진 v01 — 게이트 5종 + 잠금/해제 + 표준보고 5종.
  {
    path: "/erp/closings", component: ErpClosings,
    label: "월마감·보고", icon: Lock, group: "accounting",
    access: ["manager", "platform_admin", "accountant", "hq_executive"],
    sideMenu: ["accountant", "hq_executive"],
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
    // [Task #637] "계약 성사까지만 매칭" 정책에 맞춰 partner 분리.
    //   /commissions 페이지 자체는 accountant·platform_admin 가 계속 사용하며,
    //   파트너는 사이드바·하단 네비·라우트 모두에서 차단.
    path: "/commissions", component: Commissions,
    label: "수수료", icon: Coins, group: "accounting",
    access: ["platform_admin", "accountant"],
    sideMenu: ["accountant"],
  },

  // ── Reports / approvals group ───────────────────────────────────
  {
    path: "/drafts", component: Drafts,
    label: "기안서", icon: ClipboardList, group: "reports",
    // [관리소장 메뉴 숨김] 기안서 기능은 문서생성으로 대체되어 manager 접근 제거
    access: ["platform_admin", "accountant"],
    // [플랫폼 메뉴 구조조정] 기안서 작성은 경리 실무 — 플랫폼 사이드바에서 숨김.
    sideMenu: ["accountant"],
  },
  {
    path: "/approvals", component: Approvals,
    label: "결재함", icon: ClipboardCheck, group: "reports",
    // [Task #611] 본부장(hq_executive) / 관리인(custodian) 도 자기 결재함을 본다.
    access: ["manager", "platform_admin", "accountant", "hq_executive", "custodian"],
    // [관리소장 메뉴 숨김] 결재함은 회계 사이드바에만 노출 (플랫폼 제외).
    sideMenu: ["accountant", "hq_executive", "custodian"],
    // [모바일 5탭 단순화] 경리 모바일 하단탭에서 "결재" 제거 — 사이드바·더보기로 진입.
    //   관리인(custodian) 은 결재함이 본업이므로 그대로 유지.
    bottomNav: ["custodian"],
    bottomLabel: "결재",
  },
  {
    path: "/approvals/create", component: ApprovalCreate,
    label: "결재 상신", icon: ClipboardList, group: "reports",
    // [Task #719] 알림 다이얼로그(AlertActionDialog)·일/주/월간 보고서·공고문 템플릿 등
    //   "기안서로 만들기" 진입점은 모든 건물 역할(관리소장/경리/시설기사/관리인)에서
    //   공유되므로, 작성 화면 access 도 4 역할 모두 포함한다. 사이드바에는 hidden 으로
    //   숨겨 자유 진입 메뉴는 만들지 않고, 알림/보고서 등 표준 진입점에서만 접근.
    access: [
      "manager",
      "platform_admin",
      "accountant",
      "facility_staff",
      "custodian",
    ],
    hidden: true,
  },
  // [Task #611] 지출결의서함 — 경리 전용. 본부장/관리인 라인 통과 후 자동 발행된 항목을
  //   기록하면 settlements 출납이 동기화되며, 같은 라인의 paymentRequest 가 관리인 함으로 흘러간다.
  {
    path: "/expense-vouchers", component: ExpenseVoucherInbox,
    label: "지출결의서함", icon: Receipt, group: "accounting",
    access: ["accountant", "platform_admin"],
    sideMenu: ["accountant"],
  },
  // [Task #775] 결재 진행상황 — 결재함 카드의 "진행상황" 진입.
  //   id 쿼리스트링 기반 단일 라우트(상신자/경리/관리자/본부장 모두 열람 가능).
  {
    path: "/approval-pipeline-status", component: ApprovalPipelineStatus,
    label: "결재 진행상황", icon: Activity, group: "accounting",
    access: ["manager", "accountant", "hq_executive", "platform_admin"],
    hidden: true,
  },
  // [Task #611] 입금요청함 — 관리인 전용. 송금 완료시 settlements 동기화 + 라인 종결.
  {
    path: "/payment-requests", component: PaymentRequestInbox,
    label: "입금요청함", icon: Send, group: "accounting",
    access: ["custodian", "platform_admin"],
    sideMenu: ["custodian"],
    bottomNav: ["custodian"],
    bottomLabel: "입금요청",
  },
  // [Task #611] 본부장 임계 금액 설정 — 본부장/관리자가 건물별로 본부장 결재 임계 금액을 설정.
  {
    path: "/hq-approval-thresholds", component: HqApprovalThresholds,
    label: "본부장 임계 금액", icon: DollarSign, group: "settings",
    access: ["hq_executive", "platform_admin"],
    sideMenu: ["hq_executive", "platform_admin"],
  },
  {
    path: "/report-system", component: ReportSystemPage,
    label: "보고 체계", icon: BarChart3, group: "reports",
    access: ["manager", "platform_admin"],
    // [관리소장 메뉴 숨김] 보고 체계는 플랫폼 사이드바에만 노출.
    sideMenu: ["platform_admin"],
  },
  {
    path: "/reports", component: Reports,
    label: "일간/주간 보고", icon: FileText, group: "reports",
    access: ["manager", "platform_admin", "hq_executive"],
    // [관리소장 메뉴 숨김] 일간/주간 보고는 본사 총괄 사이드바에만 노출.
    // [플랫폼 메뉴 구조조정] 플랫폼 사이드바에서도 숨김.
    sideMenu: ["hq_executive"],
    bottomNav: ["hq_executive"],
    bottomLabel: "보고서",
    labelOverrides: { hq_executive: "월간보고서" },
  },

  // ── Partner marketplace group ───────────────────────────────────
  // [플랫폼 메뉴 구조조정] 견적 요청은 관리소장 실무 — 플랫폼 사이드바에서 숨김.
  // [Task #665] 파트너 사이드바·하단 네비도 ROUTES 단일 출처로 구동되도록
  //   partner 를 access/sideMenu/bottomNav 에 포함시키고, 파트너에게는 같은 path 가
  //   다른 컴포넌트(VendorPortal)로 마운트되도록 componentOverrides 사용.
  // [Task #738] 기존엔 파트너 사이드바에 "견적 요청" + "내 견적·작업" 두 엔트리가
  //   같은 /rfqs 경로를 가리켜 중복으로 보였다. 두 항목을 단일 "견적·내 견적서"
  //   엔트리로 통합 — 파트너는 VendorPortal 내부 탭(대시보드/견적 요청/내 견적서)
  //   으로 두 흐름을 모두 사용한다. 본사 메뉴 오버라이드 그리드에서도 한 행으로 정리.
  {
    path: "/rfqs", component: Rfqs,
    componentOverrides: { partner: VendorPortal },
    label: "견적 요청", icon: Send, group: "marketplace",
    labelOverrides: { partner: "견적·내 견적서" },
    access: ["manager", "platform_admin", "partner"],
    sideMenu: ["manager", "partner"],
    bottomNav: ["partner"],
    bottomLabelOverrides: { partner: "견적" },
    partnerOrder: 10,
  },
  {
    path: "/work-reports", component: WorkReportsPage,
    label: "작업 검수", icon: ClipboardCheck, group: "marketplace",
    access: ["manager", "platform_admin"],
    // [관리소장 메뉴 숨김] 작업 검수는 플랫폼 사이드바에만 노출.
    sideMenu: ["platform_admin"],
  },
  {
    path: "/vendors", component: Vendors,
    // [Task #726] 본부장이 보는 /vendors 화면을 파트너사(=platform 유형) 전용으로
    //   정리하면서 사이드바·하단 네비 라벨도 모두 "파트너사 관리"로 통일한다.
    //   기존 `labelOverrides.hq_executive = "용역 계약"` 은 의미가 사라지므로 제거.
    // [Task #726 후속] 역할 구조도 정리 — 본부장(hq_executive)은 본사/플랫폼 쪽이
    //   아니라 관리소장들의 상위(건물 운영 라인)에 위치한다. 파트너사(platform) 풀
    //   관리·등록·삭제는 platform_admin 의 전속 업무이므로 hq_executive 의 access /
    //   sideMenu / bottomNav 모두에서 /vendors 를 제거. 더불어 /vendors 전체 화면을
    //   사실상 platform_admin 만 들어오는 페이지로 좁힌다(manager/accountant 는 자기
    //   건물의 협력업체 흐름을 /building/vendor-directory 로 사용).
    label: "파트너사 관리", icon: Building2, group: "marketplace",
    // [Task #290] partner 는 협력업체 풀에서 제외 — 본인 업체는 /me/vendor 로 진입.
    access: ["platform_admin"],
    sideMenu: ["platform_admin"],
  },
  {
    // [Task #369] 관리소장·경리도 사이드바 "파트너 마켓 > 용역 계약" 으로
    //   진입할 수 있도록 노출 확대. 본사 라벨 오버라이드("계약 갱신")는 유지.
    //   배치 위치: marketplace 그룹 내 "협력업체(/vendors)" 바로 아래.
    path: "/contracts", component: ContractsPage,
    label: "용역 계약", icon: FileText, group: "marketplace",
    access: ["manager", "platform_admin", "accountant", "hq_executive"],
    sideMenu: ["manager", "platform_admin", "hq_executive", "accountant"],
    labelOverrides: { hq_executive: "계약 갱신" },
  },
  {
    // [Task #416] 협력업체 주소록 — 현재 건물 기준 업체·계약 카드 + 계약연장검토 배너.
    //   시설기사도 진입 가능(읽기 전용 + tel: 통화). marketplace 그룹.
    path: "/building/vendor-directory", component: BuildingVendorDirectoryPage,
    label: "협력업체 주소록", icon: Building2, group: "marketplace",
    access: ["manager", "platform_admin", "accountant", "facility_staff"],
    sideMenu: ["manager", "platform_admin", "accountant", "facility_staff"],
  },
  // [Task #665] 파트너 전용 — 본사 그리드에 행으로 노출되도록 ROUTES 단일 출처에 등록.
  //   기존엔 getRoutesForRole/getSidebarSections 의 partnerBase 하드코딩이라
  //   "파트너 컬럼" 자체가 없어 본사가 끌 수 없었다.
  {
    path: "/me/credits", component: PartnerCredits,
    label: "크레딧", icon: Coins, group: "marketplace",
    access: ["partner"],
    sideMenu: ["partner"],
    bottomNav: ["partner"],
    bottomLabelOverrides: { partner: "크레딧" },
    partnerOrder: 30,
  },
  {
    path: "/me/vendor", component: PartnerVendorProfile,
    label: "내 업체 정보", icon: Building2, group: "marketplace",
    access: ["partner"],
    sideMenu: ["partner"],
    partnerOrder: 40,
  },
  // [Task #665] 토스 결제 콜백 — 사이드바·그리드 노출은 없고 라우트만 등록.
  {
    path: "/me/credits/topup/success", component: PartnerCreditsTopupSuccess,
    label: "충전 완료", icon: Coins, group: "marketplace",
    access: ["partner"],
    hidden: true,
  },
  {
    path: "/me/credits/topup/fail", component: PartnerCreditsTopupFail,
    label: "충전 실패", icon: Coins, group: "marketplace",
    access: ["partner"],
    hidden: true,
  },

  // ── Settings group ──────────────────────────────────────────────
  {
    path: "/users", component: Users_,
    label: "사용자 관리", icon: Users, group: "settings",
    // [관리소장 메뉴 숨김] 사용자 관리는 플랫폼/본사 권한 전용.
    access: ["platform_admin", "hq_executive"],
    // [Task #267] platform_admin 의 사이드바·하단 네비는 커스텀 브랜치에서 직접 구성.
    sideMenu: ["hq_executive"],
  },
  // [Task #267] 플랫폼 전용 — 5개 역할별 현황 페이지(가입자/활성건물/최근활동/사용자목록 진입).
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
    label: `${SHARED_ROLE_LABELS.hq_executive} 현황`, icon: Shield, group: "dashboard",
    access: ["platform_admin"], hidden: true },
  // [Task #596] hq_executive ↔ 건물 매핑 관리(platform_admin 전용).
  { path: "/platform/hq-assignments",
    component: lazy(() => import("@/pages/platform-hq-assignments")),
    label: `${SHARED_ROLE_LABELS.hq_executive} 관할 건물`, icon: Shield, group: "dashboard",
    access: ["platform_admin"], hidden: true },
  { path: "/platform/partners", component: PlatformRolePartners,
    label: "파트너사 현황", icon: Package, group: "dashboard",
    access: ["platform_admin"], hidden: true },
  // [Task #296] 유저유형별 이용현황 분석 대시보드 — 플랫폼 전용.
  { path: "/platform/usage-analytics",
    component: lazy(() => import("@/pages/platform-usage-analytics")),
    label: "유저유형별 이용현황", icon: BarChart3, group: "settings",
    access: ["platform_admin"], hidden: true },
  // [Task #582] 추천인 관리 — 가입자가 입력한 추천인 휴대폰을 본사가 집계·수동 보상 기록.
  { path: "/platform/referrers",
    component: lazy(() => import("@/pages/platform-referrers")),
    label: "추천인 관리", icon: Users, group: "settings",
    access: ["platform_admin"], hidden: true },
  // [Task #267] 파트너 크레딧 — 관리자 대시보드의 VendorCreditsPanel 만 떼어 단독 페이지로 진입.
  { path: "/platform/credits",
    component: lazy(() => import("@/pages/platform-credits")),
    label: "파트너 크레딧 현황", icon: Coins, group: "settings",
    access: ["platform_admin"], hidden: true },
  // [Task #773] 감사로그 화면 — platform_admin / hq_executive / custodian 만 사이드바 노출.
  //   사이드바 그룹은 'settings' 로 두어 본사 그리드(역할×메뉴)에서 끄고 켤 수 있게 한다.
  { path: "/audit-logs", component: AuditLogsPage,
    label: "감사로그", icon: Shield, group: "settings",
    access: ["platform_admin", "hq_executive", "custodian"],
    sideMenu: ["platform_admin", "hq_executive", "custodian"] },
  // [Task #781] T10 외부연동 — 발송 이력(전 역할 운영자 가시화) / Popbill 설정(매니저·플랫폼).
  { path: "/dispatch-history", component: DispatchHistoryPage,
    label: "발송 이력", icon: Megaphone, group: "settings",
    access: ["platform_admin", "manager", "accountant", "hq_executive", "custodian"],
    sideMenu: ["manager", "accountant", "hq_executive"] },
  { path: "/popbill-settings", component: PopbillSettingsPage,
    label: "Popbill 발송 설정", icon: Megaphone, group: "settings",
    access: ["platform_admin", "manager"],
    sideMenu: ["manager"] },
  // [Task #298] 견적 유형(카테고리 × 프리미엄)별 크레딧 정책 통합 관리.
  { path: "/platform/quote-credit-policies",
    component: lazy(() => import("@/pages/platform-quote-credit-policies")),
    label: "크레딧정책설정", icon: Coins, group: "settings",
    access: ["platform_admin"], hidden: true },
  // [Task #734] 이벤트 크레딧 일괄 지급 — 필터/직접 선택/엑셀 업로드 3-step 위저드.
  { path: "/platform/credit-events",
    component: lazy(() => import("@/pages/platform-credit-events")),
    label: "이벤트 크레딧 지급", icon: Gift, group: "settings",
    access: ["platform_admin"], hidden: true },
  // [Task #740 가입흐름재설정] 파트너 분야(대분류·자식) 마스터 관리 — 가입 위저드/매칭 자동 반영.
  { path: "/platform/vendor-categories",
    component: lazy(() => import("@/pages/platform-vendor-categories")),
    label: "파트너 분야 관리", icon: Layers, group: "settings",
    access: ["platform_admin"], hidden: true },
  // [Task #283] 역할별 캠페인 알림 관리 — 단일 페이지가 ?role= 쿼리로 5개 역할 범위를 전환.
  { path: "/platform/campaigns",
    component: lazy(() => import("@/pages/platform-campaigns")),
    label: "캠페인 알림", icon: Megaphone, group: "settings",
    access: ["platform_admin"], hidden: true },
  // [Task #323] 공지문 템플릿 — 매니저용 선택 페이지(/notices/templates)와 플랫폼 CRUD 페이지(/platform/notice-templates).
  // [Task #504] 열람·사용 권한은 관리소장/경리/시설담당까지 확대(편집은 platform_admin 전용).
  { path: "/notices/templates",
    component: lazy(() => import("@/pages/manager-notice-templates")),
    label: "공지문 템플릿", icon: FileText, group: "facility",
    access: ["manager", "accountant", "facility_staff", "platform_admin"],
    sideMenu: ["manager", "accountant", "facility_staff"] },
  { path: "/platform/notice-templates",
    component: lazy(() => import("@/pages/platform-notice-templates")),
    label: "공지문 템플릿 관리", icon: FileText, group: "settings",
    access: ["platform_admin"], hidden: true },
  // [Task #650] 안전점검표 템플릿 관리 — 사이드바는 platformAdminSidebar() 의 "공통·시스템"
  //   그룹에서 직접 추가. ROUTES 에는 hidden 상태로만 등록해 직접 URL 진입을 보존.
  { path: "/platform/safety-checklist-templates",
    component: lazy(() => import("@/pages/platform-safety-checklist-templates")),
    label: "안전점검표 템플릿 관리", icon: FileText, group: "settings",
    access: ["platform_admin"], hidden: true },
  {
    // [Task #132] 시설기사 가입 승인 (관리소장/본사/플랫폼)
    // [Task #651] 경리 가입 승인도 동일 페이지에서 탭으로 처리한다.
    //   라벨/사이드바 노출을 매니저까지 확대.
    path: "/facility-approvals", component: lazy(() => import("@/pages/facility-approvals")),
    label: "경리·시설담당 가입 승인", icon: UserCheck, group: "settings",
    access: ["manager", "platform_admin", "hq_executive"],
    sideMenu: ["manager", "platform_admin", "hq_executive"],
  },
  {
    path: "/document-templates", component: DocumentTemplates,
    label: "서식 관리", icon: FileText, group: "settings",
    access: ["manager", "platform_admin"],
    // [관리소장 메뉴 숨김] 사이드바에서는 플랫폼만 노출. 접근 권한 자체는 유지.
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
    // [Task #726 후속] 본부장은 본사/플랫폼 라인이 아니라 관리소장들의 상위(건물
    //   운영 라인)이다. 플랫폼 전체 사용자에게 보내는 공지 작성은 platform_admin
    //   전속 업무이므로 hq_executive 의 access 에서 제거.
    path: "/platform-announcements", component: lazy(() => import("@/pages/platform-announcements")),
    label: "공지 관리", icon: FileText, group: "settings",
    access: ["platform_admin"],
  },
  {
    // 플랫폼 전용 — 모든 관리소장 AI 비서가 공통 참조하는
    // 법령·개정안·운영 가이드 자료실.
    // [Task #726 후속] 본부장은 건물 운영 라인의 상위 역할로, 플랫폼 공통 자료
    //   편집 권한이 필요 없다(건물 운영용 자료는 별도 채널). access 정리.
    path: "/platform-knowledge-docs",
    component: lazy(() => import("@/pages/platform-knowledge-docs")),
    label: "AI 공통 자료", icon: FileText, group: "settings",
    access: ["platform_admin"],
  },
  {
    // [Task #221] 플랫폼 전용 — 필수/제안업무 템플릿 일괄 관리.
    path: "/settings/task-templates",
    component: lazy(() => import("@/pages/task-templates")),
    label: "업무 템플릿 관리", icon: ClipboardList, group: "settings",
    access: ["platform_admin"],
  },
  // ── [Task #796] XpBIZ 환경설정 풀세트 ─────────────────────────
  {
    path: "/settings/metering-environment",
    component: lazy(() => import("@/pages/building-settings")),
    label: "검침환경", icon: Gauge, group: "settings",
    access: ["manager", "platform_admin", "accountant"],
    sideMenu: ["manager", "accountant"],
  },
  {
    path: "/settings/metering-usage",
    component: lazy(() => import("@/pages/building-settings")),
    label: "검침 사용현황 설정", icon: Gauge, group: "settings",
    access: ["manager", "platform_admin", "accountant"],
    sideMenu: ["manager", "accountant"],
  },
  {
    path: "/settings/notice-output",
    component: lazy(() => import("@/pages/building-settings")),
    label: "고지서 출력환경", icon: Receipt, group: "settings",
    access: ["manager", "platform_admin", "accountant"],
    sideMenu: ["manager", "accountant"],
  },
  {
    path: "/settings/billing-environment",
    component: lazy(() => import("@/pages/building-settings")),
    label: "관리비 부과환경", icon: Calculator, group: "settings",
    access: ["manager", "platform_admin", "accountant"],
    sideMenu: ["manager", "accountant"],
  },
  {
    path: "/settings/year-end-tax",
    component: lazy(() => import("@/pages/building-settings")),
    label: "연말정산 기본정보", icon: Calculator, group: "settings",
    access: ["manager", "platform_admin", "accountant"],
    sideMenu: ["manager", "accountant"],
  },
  {
    path: "/settings/access-cards",
    component: lazy(() => import("@/pages/building-settings")),
    label: "출입카드 관리", icon: KeyRound, group: "settings",
    access: ["manager", "platform_admin", "accountant"],
    sideMenu: ["manager", "accountant"],
  },
  {
    path: "/accountant/prepaid-deposits",
    component: lazy(() => import("@/pages/building-settings")),
    label: "호실 선수관리비", icon: Wallet, group: "accounting",
    access: ["manager", "platform_admin", "accountant"],
    sideMenu: ["accountant"],
  },
  // [Task #485] /settings 루트는 App.tsx 의 정적 리다이렉트가 처리한다
  //   (레거시 ?tab=building / ?tab=platform 쿼리도 함께 흡수). ROUTES 에는
  //   하위 단독 페이지 3 개만 등록한다.
  {
    path: "/settings/profile", component: SettingsPage,
    label: "내정보 수정", icon: User, group: "settings",
    access: ["manager", "platform_admin", "hq_executive", "accountant", "facility_staff"],
    sideMenu: ["manager", "platform_admin"],
  },
  {
    path: "/settings/building", component: SettingsPage,
    label: "건물정보 수정", icon: Building, group: "settings",
    // [Task #675] 호실 기초정보(추가/수정/삭제/CSV/자동 생성)가 호실관리 화면에서
    //   설정 → 건물정보 수정으로 이관됨에 따라, 기존에 호실관리에서 같은 작업을
    //   할 수 있던 경리(accountant)도 이 화면에 진입할 수 있어야 한다.
    access: ["manager", "platform_admin", "accountant"],
    // [Task #725] 사이드바 게이트 단일화 이전에는 accountant 의 GROUP_ORDER 에
    //   "settings" 가 빠져 있어 sideMenu 에 accountant 를 넣어두어도 실제로는 보이지
    //   않았다. 이번 구조 수정으로 노출이 살아나면 의도하지 않은 신규 노출이 되므로
    //   기존 사이드바 동작을 유지하기 위해 accountant 를 sideMenu 에서 명시적으로 제거.
    //   접근 권한(access)은 그대로 — 호실관리 화면의 "건물 정보 수정하러 가기" 동선은
    //   그대로 동작한다. 경리에게 사이드바 노출을 정책적으로 추가하려면 본사 그리드의
    //   "유저유형별 메뉴 활성화" 에서 ON 으로 토글하면 된다.
    sideMenu: ["manager", "platform_admin"],
  },
  {
    // [Task #485] 플랫폼 BM (수익화 정책·크레딧·수수료) 단독 페이지.
    //   기존 /settings 의 "플랫폼 BM" 탭을 분리해 별도 라우트·메뉴로 노출한다.
    //   사이드바 노출은 platformAdminSidebar() 의 "설정" 그룹에서 직접 push.
    //   (platform_admin 사이드바는 기능별로 큐레이션되므로 ROUTES 의 sideMenu 가
    //   아니라 별도 함수에서 구성하는 것이 본 코드베이스의 기존 패턴이다.)
    // [Task #726 후속] 플랫폼 BM(수익화 정책·크레딧·수수료)은 본사/플랫폼 운영의
    //   핵심 결정이라 platform_admin 전속이다. 본부장은 건물 운영 라인의 상위
    //   역할이므로 access 에서 제거.
    path: "/settings/platform", component: SettingsPage,
    label: "플랫폼 BM", icon: Coins, group: "settings",
    access: ["platform_admin"],
  },
  // [플랫폼 메뉴 정비] 역할×메뉴 활성/비활성 그리드. 플랫폼 전용.
  //   사이드바 노출은 platformAdminSidebar() 가 직접 추가하므로 여기서는 hidden.
  {
    path: "/settings/menu-overrides",
    component: lazy(() => import("@/pages/menu-overrides")),
    label: "유저유형별 메뉴 활성화", icon: Settings, group: "settings",
    access: ["platform_admin"],
    sideMenu: [],
    hidden: true,
  },

  // ── [Task #772] 경리 신 IA Coming Soon 스텁 ─────────────────────────
  // 사이드바 노출은 accountantSidebar() 가 직접 구성하므로 sideMenu/hidden 처리는
  // 그곳에서 한다. 여기서는 라우트 등록만 보장 — `canAccess` 는 access 화이트리스트로 통과.
  {
    path: "/accountant/charging/auto-journal", component: AccountantComingSoon,
    label: "자동분개", icon: Sparkles, group: "accounting",
    access: ["accountant", "platform_admin"], sideMenu: [], hidden: true,
  },
  {
    path: "/accountant/charging/rules", component: AccountantComingSoon,
    label: "부과 기준", icon: Sparkles, group: "accounting",
    access: ["accountant", "platform_admin"], sideMenu: [], hidden: true,
  },
  {
    path: "/accountant/ledger", component: AccountantComingSoon,
    label: "총계정원장", icon: Sparkles, group: "accounting",
    access: ["accountant", "platform_admin"], sideMenu: [], hidden: true,
  },
  {
    path: "/accountant/balance-sheet", component: AccountantComingSoon,
    label: "재무상태표", icon: Sparkles, group: "accounting",
    access: ["accountant", "platform_admin"], sideMenu: [], hidden: true,
  },
  {
    path: "/accountant/income-statement", component: AccountantComingSoon,
    label: "손익계산서", icon: Sparkles, group: "accounting",
    access: ["accountant", "platform_admin"], sideMenu: [], hidden: true,
  },
  {
    path: "/accountant/closing/monthly", component: AccountantComingSoon,
    label: "월마감", icon: Sparkles, group: "reports",
    access: ["accountant", "platform_admin"], sideMenu: [], hidden: true,
  },
  {
    path: "/accountant/closing/yearly", component: AccountantComingSoon,
    label: "연마감", icon: Sparkles, group: "reports",
    access: ["accountant", "platform_admin"], sideMenu: [], hidden: true,
  },
  {
    path: "/accountant/settings/categories", component: AccountantComingSoon,
    label: "계정과목 설정", icon: Sparkles, group: "settings",
    access: ["accountant", "platform_admin"], sideMenu: [], hidden: true,
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
  // [Task #611] 관리인은 결재함이 사실상 첫 화면이지만,
  //   루트(/) 진입은 통합 대시보드 셸로 통일.
  custodian: Dashboard,
};

const ROOT_LABELS: Record<Role, string> = {
  manager: "대시보드",
  platform_admin: `${SHARED_ROLE_LABELS.platform_admin} 관리`,
  hq_executive: `${SHARED_ROLE_LABELS.hq_executive} 대시보드`,
  accountant: "대시보드",
  facility_staff: "대시보드",
  partner: "대시보드",
  custodian: "결재함",
};

const ROOT_ICONS: Record<Role, LucideIcon> = {
  manager: LayoutDashboard,
  platform_admin: Shield,
  hq_executive: LayoutDashboard,
  accountant: LayoutDashboard,
  facility_staff: ClipboardCheck,
  partner: LayoutDashboard,
  custodian: ClipboardCheck,
};

// [Task #290] 파트너 메뉴 라벨/아이콘 — 협력업체 풀(/vendors) 진입 제거,
//   "내 업체 정보"(/me/vendor)와 "크레딧"(/me/credits) 추가.
// [Task #665] 파트너 메뉴 라벨/아이콘은 ROUTES 엔트리에서 단일 출처로 정의한다.
//   여기엔 "홈" 라벨만 남는다 (ROUTES 의 rootItem 은 ROOT_LABELS 를 쓰지만 파트너는
//   "대시보드" 대신 짧은 "홈" 을 노출하므로 별도 상수로 둔다).
const PARTNER_HOME_LABEL = "홈";

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
export function getRoutesForRole(
  role: Role,
  overrides?: readonly MenuOverride[] | null,
): { path: string; component: AnyComponent }[] {
  // [Task #665] 파트너 메뉴도 ROUTES 단일 출처로 통합. partnerBase 하드코딩 제거.
  // [요청] 본사가 그리드에서 명시적으로 켠 메뉴는 access 화이트리스트가 비어 있어도 라우트를 등록한다.
  // [Task #591] `hidden` 은 사이드바 노출만 차단하는 플래그이므로 라우트 등록에서는 제외하지 않는다.
  // [Task #637] /commissions 는 정책상 파트너 영구 차단 — 명시적 ON 이어도 우회 불가.
  const seen = new Set<string>();
  const routes: { path: string; component: AnyComponent }[] = [];
  for (const r of ROUTES) {
    // 같은 path 의 보조 엔트리(예: /rfqs#quotes)는 사이드바 표현용이므로 라우트로는 등록하지 않는다.
    if (r.routeMode === "sidebarOnly") continue;
    if (seen.has(r.path)) continue;
    if (role === "partner" && PARTNER_BLOCKED_PATHS.has(r.path)) continue;
    const allowed =
      r.access.includes(role) ||
      isMenuExplicitlyEnabled(role, blockIdOf(r), overrides);
    if (!allowed) continue;
    const component = r.componentOverrides?.[role] ?? r.component;
    routes.push({ path: r.path, component });
    seen.add(r.path);
  }
  return routes;
}

// [카테고리 메뉴 제어] 플랫폼이 사용자별로 끈 카테고리.
//   "dashboard" 는 항상 활성으로 강제(홈 진입 보장)하고, 그 외 그룹만 필터.
function isCategoryEnabled(group: Group, disabled?: readonly string[] | null): boolean {
  if (group === "dashboard") return true;
  if (!disabled || disabled.length === 0) return true;
  return !disabled.includes(group);
}

// [Task #267] 플랫폼 전용 사이드바.
//   ROUTES.access 는 그대로 두어 직접 URL 접근은 보존하되, 사이드바에서 실무 메뉴(시설/회계/입주민/
//   보고/AI 비서 등)는 일괄 숨긴다.
// [Task #283] 역할별 7 그룹 시안으로 확장 → 그러나 5개 역할 × 5개 콘텐츠 메뉴 = 25개 항목 중복 발생.
// [플랫폼 메뉴 정비] 약관·공지/캠페인·AI 자료·업무 템플릿은 이미 각 페이지 내부에
//   "역할별 탭"이 있으므로 사이드바에서는 단일 진입점만 노출한다. 역할 그룹에는 "현황"과
//   그 역할 고유의 운영 메뉴(시설기사 승인 / 협력업체·크레딧)만 남기고, 콘텐츠 메뉴는
//   "콘텐츠 관리" 그룹 한 곳으로 모은다.

type TargetRole = "manager" | "accountant" | "facility_staff" | "hq_executive" | "partner";

function platformAdminSidebar(): NavSection[] {
  return [
    {
      title: SHARED_ROLE_LABELS.manager,
      items: [{ path: "/platform/managers", label: "현황", icon: Building2 }],
    },
    {
      title: SHARED_ROLE_LABELS.accountant,
      items: [{ path: "/platform/accountants", label: "현황", icon: Calculator }],
    },
    {
      title: SHARED_ROLE_LABELS.facility_staff,
      items: [
        { path: "/platform/facility-staff", label: "현황", icon: HardHat },
        { path: "/facility-approvals", label: "경리·시설담당 가입 승인", icon: UserCheck },
      ],
    },
    {
      title: SHARED_ROLE_LABELS.hq_executive,
      items: [
        { path: "/platform/hq-executives", label: "현황", icon: Shield },
        // [Task #596] 본부장 관할 건물 매핑 관리.
        { path: "/platform/hq-assignments", label: "관할 건물", icon: Building2 },
      ],
    },
    {
      title: SHARED_ROLE_LABELS.partner,
      items: [
        { path: "/platform/partners", label: "현황", icon: Package },
        { path: "/vendors", label: "파트너사 관리", icon: Building2 },
        { path: "/platform/credits", label: `${SHARED_ROLE_LABELS.partner} 크레딧 현황`, icon: Coins },
        // [Task #298] 카테고리 × 프리미엄 단위 크레딧/환불 정책 통합 관리.
        { path: "/platform/quote-credit-policies", label: "크레딧정책설정", icon: Coins },
        // [Task #734] 이벤트 크레딧 일괄 지급 — 필터/직접/엑셀 3가지 방식 지원.
        { path: "/platform/credit-events", label: "이벤트 크레딧 지급", icon: Gift },
        // [Task #740 가입흐름재설정] 파트너 분야(대분류·자식) 마스터 관리.
        { path: "/platform/vendor-categories", label: "파트너 분야 관리", icon: Layers },
      ],
    },
    {
      title: "콘텐츠 관리",
      items: [
        { path: "/platform-consents", label: "약관 관리", icon: FileText },
        { path: "/platform-announcements", label: `${SHARED_ROLE_LABELS.hq_executive} 알림(공지·캠페인)`, icon: Megaphone },
        // [Task #415] 플랫폼 관리자 사이드바에 공지문 템플릿 관리 진입점 노출.
        { path: "/platform/notice-templates", label: "공지문 템플릿 관리", icon: FileText },
        { path: "/platform-knowledge-docs", label: "AI 공통 자료", icon: BookOpen },
        { path: "/settings/task-templates", label: "업무 템플릿", icon: ClipboardList },
      ],
    },
    {
      title: "공통·시스템",
      items: [
        { path: "/users", label: "사용자 관리", icon: Users },
        // [Task #582] 추천인 관리 대시보드 — 가입 시 입력된 추천인 휴대폰 단위로 집계.
        { path: "/platform/referrers", label: "추천인 관리", icon: Users },
        { path: "/document-templates", label: "서식 관리", icon: FileText },
        // [Task #650] 안전점검표(직원 일일점검표) 카테고리/기본 항목을 본사가 직접 관리.
        { path: "/platform/safety-checklist-templates", label: "안전점검표 템플릿 관리", icon: FileText },
        { path: "/report-system", label: "보고 체계", icon: BarChart3 },
        // [Task #296] 유저유형별 이용현황 분석 대시보드.
        { path: "/platform/usage-analytics", label: "유저유형별 이용현황", icon: BarChart3 },
      ],
    },
    {
      title: "설정",
      items: [
        { path: "/settings/menu-overrides", label: "유저유형별 메뉴 활성화", icon: Settings },
        { path: "/settings/profile", label: "내정보 수정", icon: User },
        { path: "/settings/building", label: "건물정보 수정", icon: Building },
        // [Task #485] 플랫폼 BM 은 별도 단독 페이지로 분리.
        { path: "/settings/platform", label: "플랫폼 BM", icon: Coins },
      ],
    },
  ];
}

// [Task #772] 경리 신 IA — 7개 신코드 그룹 + "입주민·시설·파트너" 보존 그룹.
//   다른 역할 사이드바와 IA 가 완전히 다르므로(부과엔진/보고·마감/문서·결재 등 신
//   카테고리), platformAdminSidebar() 와 동일하게 직접 NavSection[] 를 구성한다.
//   라우트 등록과 access 가드는 위 ROUTES 단일 출처에 그대로 위임된다 — 여기서는
//   "어떤 라벨/순서로 노출되는가" 만 결정한다.
function accountantSidebar(
  disabledCategories?: readonly string[] | null,
  overrides?: readonly MenuOverride[] | null,
): NavSection[] {
  // 데스크 바깥에서도 라벨/아이콘을 ROUTES 와 동기화하기 위해 path 로 lookup.
  // [Task #772] 신 IA 사이드바도 다른 역할과 동일하게 본사 그리드의 메뉴 override
  //   (isMenuBlockEnabled=false 로 끈 항목)와 카테고리 끄기(disabledCategories)
  //   를 그대로 존중한다 — 단지 "어떤 그룹/순서로 묶어서 노출할지" 만 직접 구성한다.
  //   따라서 본사가 그리드에서 경리 메뉴를 끄면 즉시 사이드바에서도 사라진다.
  const byPath = new Map<string, RouteEntry>();
  for (const r of ROUTES) byPath.set(r.path, r);
  const link = (path: string, override?: { label?: string; icon?: LucideIcon }): NavItem | null => {
    const entry = byPath.get(path);
    if (!entry) return null;
    // 본사 그리드에서 경리에게 OFF 한 메뉴는 숨김.
    if (!isMenuBlockEnabled("accountant", blockIdOf(entry), overrides)) return null;
    // 본사 그리드에서 카테고리 자체를 끈 경우도 숨김 ("dashboard" 는 항상 통과).
    if (!isCategoryEnabled(entry.group, disabledCategories)) return null;
    return {
      path,
      label: override?.label ?? labelFor(entry, "accountant"),
      icon: override?.icon ?? entry.icon,
      group: entry.group,
    };
  };
  const compact = (items: (NavItem | null)[]): NavItem[] =>
    items.filter((it): it is NavItem => it !== null);

  return [
    {
      title: "오늘의 한눈 대시보드",
      items: compact([
        rootItem("accountant"),
        link("/calendar"),
        link("/work-log"),
      ]),
    },
    {
      title: "부과엔진",
      items: compact([
        // 신규 — 후속 엔진(T2)에서 채워질 핵심 화면.
        link("/accountant/charging/auto-journal", { label: "자동분개", icon: Sparkles }),
        link("/accountant/charging/rules", { label: "부과 기준", icon: Sparkles }),
        // 보존 — 호실 마스터(부과 단위의 출발점).
        link("/units"),
      ]),
    },
    {
      title: "지출·문서·결재",
      items: compact([
        link("/expense-vouchers"),
        link("/drafts"),
        link("/approvals"),
        link("/commissions"),
      ]),
    },
    {
      title: "회계 엔진",
      items: compact([
        link("/erp/accounting"),
        link("/accountant/ledger", { label: "총계정원장", icon: Sparkles }),
        link("/accountant/balance-sheet", { label: "재무상태표", icon: Sparkles }),
        link("/accountant/income-statement", { label: "손익계산서", icon: Sparkles }),
        link("/tax-schedules"),
      ]),
    },
    {
      title: "검침·고지·수납",
      items: compact([
        link("/erp/upload-center"),
        link("/erp/metering"),
        link("/erp/billing"),
        link("/erp/bills"),
        link("/erp/fees-summary"),
      ]),
    },
    {
      title: "보고·마감",
      items: compact([
        link("/erp/budgets"),
        link("/erp/building-records"),
        link("/erp/closings"),
        link("/accountant/closing/monthly", { label: "월마감", icon: Sparkles }),
        link("/accountant/closing/yearly", { label: "연마감", icon: Sparkles }),
      ]),
    },
    {
      title: "설정",
      items: compact([
        link("/settings/profile"),
        link("/settings/building"),
        link("/accountant/settings/categories", { label: "계정과목 설정", icon: Sparkles }),
      ]),
    },
    {
      // 신코드 7개 그룹에 자연 매핑되지 않는 기존 기능 보존 그룹.
      title: "입주민·시설·파트너",
      items: compact([
        link("/tenants"),
        link("/erp/governance"),
        link("/safety-checklists"),
        link("/notices/templates"),
        link("/contracts"),
        link("/building/vendor-directory"),
      ]),
    },
  ].filter((s) => s.items.length > 0);
}

// ── Role × menu block overrides ───────────────────────────────────
// [플랫폼 메뉴 정비] 플랫폼이 "유저유형별 메뉴 활성화" 그리드에서
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
  // 플랫폼는 본인 사이드바 토글 대상이 아니므로 항상 활성.
  if (role === "platform_admin") return true;
  for (const o of overrides) {
    if (o.role === role && o.blockId === blockId && o.enabled === false) return false;
  }
  return true;
}

/**
 * 본사가 그리드에서 명시적으로 켠(enabled=true) 셀인지 여부.
 *  - 부재(=기본값) 는 false (= 명시적 활성 아님). 명시적 활성일 때만 access 화이트리스트를 우회한다.
 *  - 본사(platform_admin) 는 그리드 대상이 아니므로 항상 false.
 */
export function isMenuExplicitlyEnabled(
  role: Role,
  blockId: string,
  overrides?: readonly MenuOverride[] | null,
): boolean {
  if (!overrides || overrides.length === 0) return false;
  if (role === "platform_admin") return false;
  for (const o of overrides) {
    if (o.role === role && o.blockId === blockId) return o.enabled === true;
  }
  return false;
}

/** Returns the sidebar sections for a role, grouped per role's group order. */
export function getSidebarSections(
  role: Role,
  disabledCategories?: readonly string[] | null,
  overrides?: readonly MenuOverride[] | null,
): NavSection[] {
  if (role === "platform_admin") return platformAdminSidebar();
  // [Task #772] 경리 신 IA — 7개 신코드 그룹 + 보존 그룹 1개 = 총 8개 그룹.
  //   본사 그리드 override / 카테고리 끄기 정책은 accountantSidebar 내부에서 그대로 존중한다.
  if (role === "accountant") return accountantSidebar(disabledCategories, overrides);
  if (role === "partner") {
    // [Task #665] 파트너 사이드바도 다른 역할과 동일하게 ROUTES 단일 출처로 구동.
    //   하드코딩된 partnerItems 를 제거하고, sideMenu/access + isMenuBlockEnabled +
    //   isMenuExplicitlyEnabled 조합으로 노출 여부를 결정한다.
    //   순서: rootItem 다음에 partnerOrder 오름차순. 시각적으로는 단일 섹션(타이틀 없음).
    // [Task #637] /commissions 는 정책상 파트너 영구 차단 — 명시적 ON 이어도 우회 불가.
    const home: NavItem = { ...rootItem("partner"), label: PARTNER_HOME_LABEL };
    const tail: { entry: RouteEntry; item: NavItem }[] = [];
    for (const entry of ROUTES) {
      if (entry.hidden) continue;
      if (PARTNER_BLOCKED_PATHS.has(entry.path)) continue;
      const visibleTo = entry.sideMenu ?? entry.access;
      const explicit = isMenuExplicitlyEnabled("partner", blockIdOf(entry), overrides);
      if (!visibleTo.includes("partner") && !explicit) continue;
      if (!isMenuBlockEnabled("partner", blockIdOf(entry), overrides)) continue;
      tail.push({
        entry,
        item: {
          path: entry.path,
          query: entry.query,
          label: labelFor(entry, "partner"),
          icon: entry.icon,
          group: entry.group,
        },
      });
    }
    tail.sort(
      (a, b) => (a.entry.partnerOrder ?? 100) - (b.entry.partnerOrder ?? 100),
    );
    return [{ items: [home, ...tail.map((t) => t.item)] }];
  }

  // [Task #725] 사이드바 노출 단일 진리 원천 — ROUTES.sideMenu (기본값: access) 와
  //   본사 그리드의 명시적 ON 만으로 후보를 결정한다. GROUP_ORDER_BY_ROLE 는 더 이상
  //   "어떤 그룹을 보여줄지" 결정하지 않으며, 단지 "그룹의 표시 순서"만 정한다.
  //   그 결과: 본사가 그리드에서 켠 메뉴는 그 메뉴가 어떤 그룹에 속해 있든(역할의
  //   GROUP_ORDER_BY_ROLE 에 그 그룹이 없어도) 사이드바에 즉시 등장하며, sideMenu 에
  //   포함된 메뉴는 추가 코드 수정 없이 기본값으로도 노출된다.
  //
  //   기존의 "차단" 정책(hidden / isMenuBlockEnabled=false / 카테고리 끄기 / 파트너
  //   영구 차단)은 그대로 유지 — 노출 권한만 늘어나며, 어떠한 차단도 우회되지 않는다.
  const candidates: { entry: RouteEntry; item: NavItem }[] = [];
  for (const entry of ROUTES) {
    if (entry.hidden) continue;
    if (!isCategoryEnabled(entry.group, disabledCategories)) continue;
    const visibleTo = entry.sideMenu ?? entry.access;
    const explicit = isMenuExplicitlyEnabled(role, blockIdOf(entry), overrides);
    if (!visibleTo.includes(role) && !explicit) continue;
    if (!isMenuBlockEnabled(role, blockIdOf(entry), overrides)) continue;
    candidates.push({
      entry,
      item: {
        path: entry.path,
        // [Task #665] query 가 지정된 보조 엔트리(예: /rfqs?tab=quotes)도 sidebar 에서 동작.
        query: entry.query,
        label: labelFor(entry, role),
        icon: entry.icon,
        // [Task #256] 사이드바 아이콘에 카테고리 색을 입히기 위해 그룹을 함께 전달.
        group: entry.group,
      },
    });
  }

  // 후보를 그룹별로 묶는다(원본 ROUTES 순서 보존).
  const byGroup = new Map<Group, NavItem[]>();
  for (const c of candidates) {
    const arr = byGroup.get(c.entry.group);
    if (arr) arr.push(c.item);
    else byGroup.set(c.entry.group, [c.item]);
  }

  // 그룹 순서: 역할의 명시적 GROUP_ORDER_BY_ROLE 를 우선, 거기에 없는 그룹은
  //   FALLBACK_GROUP_ORDER 로 뒤에 자연 순서로 이어 붙인다. "dashboard" 는 rootItem 을
  //   끼워주는 특수 그룹이므로 fallback 으로 자동 추가하지 않는다(예: custodian 처럼
  //   dashboard 를 의도적으로 노출하지 않는 역할에 대시보드 헤더가 갑툭튀 하지 않게).
  //   단, 본사 그리드에서 dashboard 그룹 메뉴를 명시적 ON 한 경우(예: custodian 에게
  //   /calendar 를 ON)에는 그 의지를 존중하기 위해 dashboard 그룹도 fallback 에
  //   포함한다 — 이때는 rootItem(/) 은 sideMenu 로 결정되므로 헤더만 추가될 뿐
  //   기본 노출 정책을 우회하지 않는다.
  const orderedGroups: Group[] = [];
  const seenGroups = new Set<Group>();
  for (const g of GROUP_ORDER_BY_ROLE[role]) {
    if (!seenGroups.has(g)) {
      orderedGroups.push(g);
      seenGroups.add(g);
    }
  }
  for (const g of FALLBACK_GROUP_ORDER) {
    if (seenGroups.has(g)) continue;
    if (!byGroup.has(g)) continue; // 후보가 없는 그룹은 추가하지 않음.
    orderedGroups.push(g);
    seenGroups.add(g);
  }
  // dashboard 그룹은 명시적 ON 후보가 있을 때만 fallback 으로 추가.
  if (!seenGroups.has("dashboard") && byGroup.has("dashboard")) {
    orderedGroups.push("dashboard");
    seenGroups.add("dashboard");
  }

  const sections: NavSection[] = [];
  for (const group of orderedGroups) {
    // [카테고리 메뉴 제어] 플랫폼이 끈 카테고리는 헤더 자체를 숨김(후보 단계에서도 이미 걸러짐).
    if (!isCategoryEnabled(group, disabledCategories)) continue;
    const items: NavItem[] = [];
    if (group === "dashboard") {
      items.push(rootItem(role));
    }
    const groupItems = byGroup.get(group);
    if (groupItems) items.push(...groupItems);
    if (items.length === 0) continue;
    const section: NavSection = { title: GROUP_TITLES[group], items };
    if (group === "facility") {
      const facilityHub = ROUTES.find((r) => r.path === "/facility");
      if (facilityHub && facilityHub.access.includes(role)) {
        section.headerHref = "/facility";
      }
    }
    sections.push(section);
  }
  return sections;
}

/** Returns the mobile bottom nav items for a role (excluding the "더보기" toggle). */
export function getBottomNavItems(
  role: Role,
  disabledCategories?: readonly string[] | null,
  overrides?: readonly MenuOverride[] | null,
): NavItem[] {
  // [Task #267] 플랫폼 하단 네비도 사이드바와 동일 원칙으로 정리.
  //   홈(현황 카드) / 사용자 / 설정. 시설/회계/AI비서/업무일지 같은 실무 탭은 노출하지 않는다.
  if (role === "platform_admin") {
    return [
      { ...rootItem("platform_admin"), label: "관리", group: "dashboard" },
      { path: "/users", label: "사용자", icon: Users, group: "settings" },
      { path: "/settings/profile", label: "설정", icon: Settings, group: "settings" },
    ];
  }
  if (role === "partner") {
    // [Task #665] 파트너 하단 네비도 ROUTES 단일 출처로 구동.
    //   bottomNav 에 partner 가 포함된 엔트리만 추출하고 partnerOrder 로 정렬.
    //   본사 그리드에서 OFF 된 블록(blockId 단위)은 즉시 숨겨진다.
    // [Task #637] /commissions 는 정책상 파트너 영구 차단 — bottomNav 에 등록도 안 돼 있다.
    const home: NavItem = { ...rootItem("partner"), label: PARTNER_HOME_LABEL };
    const tail: { entry: RouteEntry; item: NavItem }[] = [];
    for (const entry of ROUTES) {
      if (entry.hidden) continue;
      if (PARTNER_BLOCKED_PATHS.has(entry.path)) continue;
      const inBottom = entry.bottomNav ?? [];
      if (!inBottom.includes("partner")) continue;
      if (!isMenuBlockEnabled("partner", blockIdOf(entry), overrides)) continue;
      tail.push({
        entry,
        item: {
          path: entry.path,
          query: entry.query,
          label: bottomLabelFor(entry, "partner"),
          icon: entry.icon,
          group: entry.group,
        },
      });
    }
    tail.sort(
      (a, b) => (a.entry.partnerOrder ?? 100) - (b.entry.partnerOrder ?? 100),
    );
    return [home, ...tail.map((t) => t.item)];
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
    // [플랫폼 메뉴 정비] 역할×메뉴 그리드에서 비활성된 블록은 하단 탭에서도 숨김.
    if (!isMenuBlockEnabled(role, blockIdOf(entry), overrides)) continue;
    tail.push({
      entry,
      item: {
        path: entry.path,
        query: entry.query,
        label: bottomLabelFor(entry, role),
        icon: entry.icon,
        groupSheet: entry.bottomGroupSheet,
        group: entry.group,
      },
    });
  }
  tail.sort((a, b) => (a.entry.bottomOrder ?? 100) - (b.entry.bottomOrder ?? 100));
  for (const t of tail) items.push(t.item);
  // [Task #607] 경리(accountant)·시설기사(facility_staff)도 manager 와 동일하게
  //   "/__quick_entry" sentinel 을 노출 — layout.tsx 가 이 항목을 보고 모바일
  //   가운데 + 버튼과 데스크톱 우하단 플로팅 배너 버튼을 함께 활성화한다.
  //   group 은 dashboard(항상 노출) 로 두어 카테고리 메뉴 제어로 가려질 일이 없게 한다.
  //   기존 다른 하단 탭 순서는 유지하고, 가운데 위치(items 길이 절반 지점)에 끼워
  //   넣어 시각적으로 중앙에 오도록 배치한다.
  if (role === "accountant" || role === "facility_staff") {
    const insertAt = Math.floor(items.length / 2);
    items.splice(insertAt, 0, {
      path: "/__quick_entry",
      label: "업무기록",
      icon: Plus,
      group: "dashboard",
    });
  }
  return items;
}

function roleHomeShort(role: Role): string {
  switch (role) {
    // [모바일 5탭 단순화] 사장님 요청: 시설기사 모바일 첫 탭도 "홈" 으로 통일.
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
export function canAccess(
  role: Role,
  path: string,
  overrides?: readonly MenuOverride[] | null,
): boolean {
  if (path === "/") return true;
  if (role === "partner") {
    // [Task #637] /commissions 는 정책상 파트너 영구 차단 — 명시적 ON 이어도 우회 불가.
    if (PARTNER_BLOCKED_PATHS.has(path)) return false;
    for (const blocked of PARTNER_BLOCKED_PATHS) {
      if (path.startsWith(blocked + "/")) return false;
    }
    // [Task #665] /me/credits, /me/vendor 등 파트너 전용 라우트도 ROUTES 등록을 통해 허용된다.
    //   /vendors 처럼 access 에 partner 가 없는 경로는 자연히 거부된다.
    const match = ROUTES.find((r) => path === r.path || path.startsWith(r.path + "/"));
    if (!match) return false;
    if (match.access.includes("partner")) return true;
    // [요청] 본사가 그리드에서 파트너에게 명시적으로 켠 메뉴도 접근 허용.
    return isMenuExplicitlyEnabled("partner", blockIdOf(match), overrides);
  }
  const match = ROUTES.find((r) => path === r.path || path.startsWith(r.path + "/"));
  if (!match) return false;
  if (match.access.includes(role)) return true;
  // [요청] 본사가 그리드에서 명시적으로 켠 메뉴는 access 화이트리스트를 우회.
  return isMenuExplicitlyEnabled(role, blockIdOf(match), overrides);
}
