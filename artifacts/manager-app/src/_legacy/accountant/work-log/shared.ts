import {
  Wrench, Receipt, MessageSquareWarning, ClipboardList,
  CreditCard, Landmark, FileSignature, MessagesSquare,
  Flame, Zap, Cog, MoreHorizontal, type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

export type Role = "manager" | "accountant" | "facility_staff";

/** 직책별 업무기록 카테고리 (서버 enum 과 일치). */
export const MANAGER_CATEGORIES = ["facility", "bill", "complaint", "admin"] as const;
export const ACCOUNTANT_CATEGORIES = ["receivable", "expense", "draft", "complaint"] as const;
export const FACILITY_CATEGORIES = ["fire", "electric", "mechanical", "other"] as const;
export type Category =
  | (typeof MANAGER_CATEGORIES)[number]
  | (typeof ACCOUNTANT_CATEGORIES)[number]
  | (typeof FACILITY_CATEGORIES)[number];
export type Status = "ok" | "issue";

/** 직책 라벨 (한글). */
export const ROLE_LABEL: Record<Role, string> = {
  manager: "소장",
  accountant: "경리",
  facility_staff: "시설",
};

/** 모든 카테고리 라벨/아이콘 (직책 무관, 표시용). */
export const CATEGORY_LABEL: Record<string, string> = {
  // manager
  facility: "시설",
  bill: "관리비",
  complaint: "민원",
  admin: "행정",
  // accountant
  receivable: "수납·연체",
  expense: "지출",
  draft: "결재·기안",
  // facility_staff
  fire: "소방",
  electric: "전기",
  mechanical: "기계설비",
  other: "기타",
};
export const CATEGORY_ICON: Record<string, LucideIcon> = {
  facility: Wrench,
  bill: Receipt,
  complaint: MessageSquareWarning,
  admin: ClipboardList,
  receivable: CreditCard,
  expense: Landmark,
  draft: FileSignature,
  // 두 직책 공용 — accountant.complaint 도 동일 아이콘
  fire: Flame,
  electric: Zap,
  mechanical: Cog,
  other: MoreHorizontal,
};

/** 직책별 업무기록 카테고리 옵션 (모달용). */
export interface CategoryOption {
  value: Category;
  label: string;
  icon: LucideIcon;
  hint: string;
}
export function getCategoriesFor(role: Role): CategoryOption[] {
  switch (role) {
    case "accountant":
      return [
        { value: "receivable", label: "수납·연체", icon: CreditCard, hint: "관리비 수납 / 연체 / 독촉" },
        { value: "expense", label: "지출", icon: Landmark, hint: "운영비 지출 / 세금 / 공과금" },
        { value: "draft", label: "결재·기안", icon: FileSignature, hint: "결재 / 품의 / 기안 메모" },
        { value: "complaint", label: "민원", icon: MessagesSquare, hint: "주민 회계 문의·요청" },
      ];
    case "facility_staff":
      return [
        { value: "fire", label: "소방", icon: Flame, hint: "소화·경보·피난 설비" },
        { value: "electric", label: "전기", icon: Zap, hint: "수배전·조명·승강기 전기계통" },
        { value: "mechanical", label: "기계설비", icon: Cog, hint: "급배수·공조·승강기 기계계통" },
        { value: "other", label: "기타", icon: MoreHorizontal, hint: "그 외 시설·점검 메모" },
      ];
    default:
      return [
        { value: "facility", label: "시설", icon: Wrench, hint: "엘리베이터·누수·전기 등" },
        { value: "bill", label: "관리비", icon: Receipt, hint: "검침·청구·납부 메모" },
        { value: "complaint", label: "민원", icon: MessageSquareWarning, hint: "주민 요청·소음·주차" },
        { value: "admin", label: "행정", icon: ClipboardList, hint: "공문·결재·보고·회의 준비 등" },
      ];
  }
}

export interface WorkLogEntry {
  id: number;
  category: string;
  memo: string;
  photoUrl: string | null;
  occurredAt: string;
  occurredDate: string;
  authorName: string;
  authorRole?: Role;
  // [Task #708] 메모 자동 매칭/사용자 명시로 연결된 호실 목록. 서버 응답
  // 키는 unitId 가 아니라 `id` 임에 유의 (serializeEntry 참고).
  linkedUnits?: Array<{
    id: number;
    dong: string;
    unitNumber: string;
    matchSource: "auto" | "manual";
  }>;
}

export interface DailyJournal {
  id: number;
  journalDate: string;
  role?: Role;
  authorName: string;
  securityStatus: Status; securityMemo: string | null; securityPhotoUrl: string | null;
  cleaningStatus: Status; cleaningMemo: string | null; cleaningPhotoUrl: string | null;
  facilityStatus: Status; facilityMemo: string | null; facilityPhotoUrl: string | null;
  complaintStatus: Status; complaintMemo: string | null; complaintPhotoUrl: string | null;
}

export interface LateArrival {
  role: "accountant" | "facility_staff";
  journal: DailyJournal;
}

export interface DailyReport {
  date: string;
  role?: Role;
  buildingName: string | null;
  authorName: string;
  journal: DailyJournal | null;
  entries: WorkLogEntry[];
  statutory: {
    completed: { name: string; result: string | null; memo: string | null }[];
    postponed: { id: number; name: string; nextDueDate: string | null }[];
    drafted: { id: number; title: string; draftType: string }[];
  };
  lateArrivals?: LateArrival[];
}

export interface WeeklyReport {
  weekStart: string; weekEnd: string;
  buildingName: string | null;
  days: { date: string; hasJournal: boolean; issueCount: number; entryCount: number; topMemos: string[] }[];
  sectionTotals: Record<"security" | "cleaning" | "facility" | "complaint", { issues: number; memos: string[] }>;
  byCategory: Record<string, number>;
  totalEntries: number;
  totalJournals: number;
  issues: number;
  textSummary: string;
}

export interface MonthlyWeekRollup {
  weekStart: string;
  weekEnd: string;
  totalJournals: number;
  totalEntries: number;
  issues: number;
  byCategory: Record<string, number>;
  sectionTotals: Record<"security" | "cleaning" | "facility" | "complaint", { issues: number; memos: string[] }>;
  textSummary: string;
}

export interface MonthlyReport {
  month: string; monthStart: string; monthEnd: string;
  buildingName: string | null;
  weeks: MonthlyWeekRollup[];
  totalEntries: number;
  totalJournals: number;
  issues: number;
  byCategory: Record<string, number>;
  sectionTotals: Record<"security" | "cleaning" | "facility" | "complaint", { issues: number; memos: string[] }>;
  textSummary: string;
}

/** 일일 일지 4영역 정의 (직책별 라벨이 다름). */
export interface SectionDef {
  key: "security" | "cleaning" | "facility" | "complaint";
  label: string;
  /** 카테고리 키 — 일보 컬럼명은 공통이지만 직책별 의미가 달라 별도 prompt 사용. */
  prompt?: string;
}
const SECTIONS_BY_ROLE: Record<Role, SectionDef[]> = {
  manager: [
    { key: "security", label: "보안 / 출입" },
    { key: "cleaning", label: "청소 / 미화" },
    { key: "facility", label: "시설 / 점검" },
    { key: "complaint", label: "민원 / 소통" },
  ],
  accountant: [
    { key: "security", label: "수납 / 연체" },
    { key: "cleaning", label: "지출" },
    { key: "facility", label: "결재 / 기안" },
    { key: "complaint", label: "민원" },
  ],
  facility_staff: [
    { key: "security", label: "소방" },
    { key: "cleaning", label: "전기" },
    { key: "facility", label: "기계설비" },
    { key: "complaint", label: "기타" },
  ],
};
export function getSectionsFor(role: Role): SectionDef[] {
  return SECTIONS_BY_ROLE[role];
}
/** 매니저 보고서 미리보기에서 부하 직책 일보 라벨 매핑에 사용. */
export function getSectionLabelFor(role: Role, key: SectionDef["key"]): string {
  return SECTIONS_BY_ROLE[role].find((s) => s.key === key)?.label ?? key;
}

/** [기존 호환] 기본은 매니저 4영역. 새 코드는 getSectionsFor(role) 를 쓴다. */
export const SECTIONS = SECTIONS_BY_ROLE.manager;

/** KST(UTC+9) 기준 YYYY-MM-DD. */
function toKstDateKey(d: Date): string {
  const ms = d.getTime() + 9 * 60 * 60 * 1000;
  return new Date(ms).toISOString().split("T")[0];
}
export function todayISO(): string {
  return toKstDateKey(new Date());
}
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().split("T")[0];
}
export function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(iso, diff);
}
export function formatWeekLabel(mondayIso: string): string {
  const [y, m, d] = mondayIso.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(y, m - 1, 1));
  const firstDow = firstOfMonth.getUTCDay();
  const firstMondayDay = 1 + ((8 - firstDow) % 7);
  const weekNum = Math.floor((d - firstMondayDay) / 7) + 1;
  return `${String(m).padStart(2, "0")}월 ${weekNum}주차`;
}
export function thisMonth(): string {
  const today = todayISO();
  return today.slice(0, 7);
}

/** "YYYY-MM-DD" → "M월 D일자" (lateArrivals 라벨용). */
export function formatJournalDateLabel(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}월 ${d}일자`;
}

/** 인증 컨텍스트에서 현재 사용자 직책을 안전하게 가져온다. */
export function useCurrentRole(): Role {
  const { user } = useAuth();
  const r = (user?.role ?? "manager") as string;
  if (r === "accountant") return "accountant";
  if (r === "facility_staff") return "facility_staff";
  return "manager"; // platform_admin / hq_executive / 기타는 manager 화면을 본다.
}

export function useApi() {
  const { token } = useAuth();
  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    if (res.status === 204) return null as T;
    return (await res.json()) as T;
  }
  return { call };
}

export type WorkLogTab = "timeline" | "daily" | "weekly" | "monthly" | "activity";

export function readInitialTab(): WorkLogTab {
  if (typeof window === "undefined") return "timeline";
  const sp = new URLSearchParams(window.location.search);
  const t = sp.get("tab");
  if (
    t === "daily" || t === "weekly" || t === "monthly" ||
    t === "timeline" || t === "activity"
  ) return t;
  return "timeline";
}

// [개선] 대시보드/타임라인의 "오늘 업무일지 만들기" 진입점은 일보 탭으로
// 먼저 보내지 않고, 곧장 작성 모달을 띄운다. 모달 저장 완료 후에 일보 탭으로
// 자동 이동하여 단계 수를 줄이고 두 진입점의 동작을 일관되게 만든다.
export function readInitialOpenDaily(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("openDaily") === "1";
}
