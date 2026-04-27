import { Wrench, Receipt, MessageSquareWarning } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";

export type Category = "facility" | "bill" | "complaint";
export type Status = "ok" | "issue";

export interface WorkLogEntry {
  id: number;
  category: Category;
  memo: string;
  photoUrl: string | null;
  occurredAt: string;
  occurredDate: string;
  authorName: string;
}

export interface DailyJournal {
  id: number;
  journalDate: string;
  authorName: string;
  securityStatus: Status; securityMemo: string | null; securityPhotoUrl: string | null;
  cleaningStatus: Status; cleaningMemo: string | null; cleaningPhotoUrl: string | null;
  facilityStatus: Status; facilityMemo: string | null; facilityPhotoUrl: string | null;
  complaintStatus: Status; complaintMemo: string | null; complaintPhotoUrl: string | null;
}

export interface DailyReport {
  date: string;
  buildingName: string | null;
  authorName: string;
  journal: DailyJournal | null;
  entries: WorkLogEntry[];
  statutory: {
    completed: { name: string; result: string | null; memo: string | null }[];
    postponed: { id: number; name: string; nextDueDate: string | null }[];
    drafted: { id: number; title: string; draftType: string }[];
  };
}

export interface WeeklyReport {
  weekStart: string; weekEnd: string;
  buildingName: string | null;
  days: { date: string; hasJournal: boolean; issueCount: number; entryCount: number; topMemos: string[] }[];
  sectionTotals: Record<"security" | "cleaning" | "facility" | "complaint", { issues: number; memos: string[] }>;
  byCategory: { facility: number; bill: number; complaint: number };
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
  byCategory: { facility: number; bill: number; complaint: number };
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
  byCategory: { facility: number; bill: number; complaint: number };
  sectionTotals: Record<"security" | "cleaning" | "facility" | "complaint", { issues: number; memos: string[] }>;
  textSummary: string;
}

export const CATEGORY_LABEL: Record<Category, string> = {
  facility: "시설", bill: "관리비", complaint: "민원",
};
export const CATEGORY_ICON: Record<Category, typeof Wrench> = {
  facility: Wrench, bill: Receipt, complaint: MessageSquareWarning,
};

export const SECTIONS: { key: "security" | "cleaning" | "facility" | "complaint"; label: string }[] = [
  { key: "security", label: "보안 / 출입" },
  { key: "cleaning", label: "청소 / 미화" },
  { key: "facility", label: "시설 / 점검" },
  { key: "complaint", label: "민원 / 소통" },
];

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
