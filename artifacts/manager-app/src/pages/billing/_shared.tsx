// [Task #799] 부과관리 풀세트 — 11 페이지 공유 유틸 + 좌측 서브내비.
//
// 모든 부과관리 페이지가 공통으로 쓰는 fetch 헬퍼·KRW 포맷·서브내비 컴포넌트.
import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Receipt, Sparkles, Calendar, Calculator, BarChart3, CreditCard,
  Send, Edit3, MailCheck, Lock, PlusCircle, ListChecks } from "lucide-react";

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "/");
export const apiBase = `${BASE}api`;

export function useApi() {
  const { token } = useAuth();
  return useMemo(() => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
      const res = await fetch(`${apiBase}${path}`, {
        method, credentials: "include",
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`${res.status} ${text}`);
      }
      return res.json() as Promise<T>;
    };
  }, [token]);
}

export const krw = (n: number | null | undefined) => `₩${Math.round(Number(n ?? 0)).toLocaleString()}`;

// 사이드 서브내비 — 11 페이지 그룹.
export const BILLING_NAV: Array<{ path: string; label: string; icon: typeof Receipt }> = [
  { path: "/billing/months",          label: "부과월",        icon: Calendar },
  { path: "/billing/items",           label: "부과항목",      icon: ListChecks },
  { path: "/billing/late-fee-rates",  label: "연체율",        icon: Sparkles },
  { path: "/billing/extra-charges",   label: "별도 부과",     icon: PlusCircle },
  { path: "/billing/run",             label: "부과 처리",     icon: Calculator },
  { path: "/billing/summary",         label: "부과총괄표",    icon: BarChart3 },
  { path: "/billing/adjustments",     label: "조정대장",      icon: Edit3 },
  { path: "/billing/notices",         label: "고지서 발행",   icon: Send },
  { path: "/billing/auto-debit",      label: "자동이체 의뢰", icon: CreditCard },
  { path: "/billing/notice-delivery", label: "발송 확인",     icon: MailCheck },
  { path: "/billing/close",           label: "부과마감",      icon: Lock },
];

// 페이지 공통 스캐폴드 — 헤더 + 서브내비 + slot.
export function BillingShell({
  title, description, children, action,
}: {
  title: string; description: string;
  children: React.ReactNode; action?: React.ReactNode;
}) {
  const [location] = useLocation();
  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl">
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Receipt className="w-6 h-6" />{title}</h1>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        {action}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {BILLING_NAV.map((it) => {
          const active = location.startsWith(it.path);
          const Icon = it.icon;
          return (
            <Link key={it.path} href={it.path}
              className={`text-sm px-3 py-1.5 rounded-md border inline-flex items-center gap-1.5 transition ${
                active ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"
              }`}
              data-testid={`subnav-${it.path.split("/").pop()}`}
            >
              <Icon className="w-3.5 h-3.5" />{it.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}

// 가벼운 통계 카드 (카테고리별 합계 등).
export function StatCard({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardDescription>{title}</CardDescription></CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

// 빈 상태.
export function Empty({ message }: { message: string }) {
  return (
    <Card>
      <CardContent className="py-12 text-center text-muted-foreground text-sm">{message}</CardContent>
    </Card>
  );
}

// 현재 월(YYYY-MM) 기본값.
export const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export type BillingItem = {
  id: number; code: string; name: string; parentCode: string | null;
  category: "maintenance" | "heating" | "gas" | "meter" | "separate";
  basis: "area" | "unit_count" | "fixed" | "meter" | "usage";
  unitPrice: number; isProgressive: boolean; isDailyBased: boolean;
  exemptionRate: number; optOutAllowed: boolean; isTaxable: boolean;
  printOnNotice: boolean; printOnAdjustment: boolean; isActive: boolean;
  sortOrder: number; notes: string | null;
};

export type LateFeeRate = {
  id: number; noticeKind: string; periodStart: string; periodEnd: string | null;
  baseRate: number; tiers: Array<{ fromDay: number; toDay: number; rate: number; isProgressive: boolean }>;
  applyCalculation: boolean; notes: string | null;
};

export type BillingMonthRow = {
  id: number; billingMonth: string; periodStart: string | null; periodEnd: string | null;
  dueDate: string | null; noticeFormat: string;
  stage: "created" | "calculated" | "noticed" | "closed";
  autoClose: boolean; autoDebitEnabled: boolean;
  printRequestedAt: string | null; noticeIssuedAt: string | null;
  closedAt: string | null; runId: number | null; notes: string | null;
};

export type ExtraCharge = {
  id: number; unitId: number; unitNumber: string; billingMonth: string;
  itemCode: string | null; label: string; amount: number; appliedToRun: boolean; notes: string | null;
};

export type NoticeDelivery = {
  id: number; billId: number | null; unitNumber: string | null; billingMonth: string;
  channel: "email" | "sms" | "kakao" | "post"; recipient: string | null;
  status: "queued" | "sent" | "delivered" | "read" | "failed";
  sentAt: string | null; resultCode: string | null; errorMessage: string | null; retryCount: number;
};

export type SummaryResp = {
  month: string; compareMonth: string;
  run: { id: number; billingMonth: string; status: string; totalAmount: number; unitCount: number } | null;
  unitCount: number; total: number;
  byCategory: Array<{ key: string; amount: number }>;
  adjustmentTotal: number; extraTotal: number;
  adjustments: Array<{ id: number; unitId: number; adjustmentType: string; amount: number; reason: string }>;
  extras: ExtraCharge[];
  lines: Array<{ id: number; unitNumber: string; totalAmount: number; breakdown: Record<string, number> }>;
  compare: {
    previous: { month: string; total: number; unitCount: number };
    totalDiff: number; totalRate: number;
    byCategory: Array<{ key: string; current: number; previous: number; diff: number; rate: number }>;
  };
};

export const STAGE_LABELS: Record<BillingMonthRow["stage"], string> = {
  created: "생성됨", calculated: "산출 완료", noticed: "고지 발행", closed: "마감",
};
export const STAGE_COLORS: Record<BillingMonthRow["stage"], string> = {
  created: "bg-slate-100 text-slate-700",
  calculated: "bg-blue-100 text-blue-700",
  noticed: "bg-amber-100 text-amber-700",
  closed: "bg-emerald-100 text-emerald-700",
};
