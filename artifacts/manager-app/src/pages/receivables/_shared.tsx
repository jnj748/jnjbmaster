// [Task #800] 수납·미납 관리 풀세트 — 6 페이지 공통 셸/유틸.
import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Wallet, AlertTriangle, Send, Banknote, GitCompare, RefreshCw } from "lucide-react";

const BASE = (import.meta.env.BASE_URL || "/").replace(/\/+$/, "/");
export const apiBase = `${BASE}api`;

export function useApi() {
  const { token } = useAuth();
  return useMemo(() => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
      const res = await fetch(`${apiBase}${path}`, {
        method, credentials: "include", headers,
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
export const today = () => new Date().toISOString().slice(0, 10);
export const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export const RECEIVABLES_NAV = [
  { path: "/receivables/overdue",              label: "미납대장",         icon: AlertTriangle },
  { path: "/receivables/overdue-notices",      label: "미납분 고지서",    icon: Send },
  { path: "/receivables/dunning",              label: "독촉장",           icon: Send },
  { path: "/receivables/payments",             label: "수납 처리",        icon: Banknote },
  { path: "/receivables/reconciliation",       label: "통장 비교",        icon: GitCompare },
  { path: "/receivables/auto-debit-results",   label: "자동이체 결과",    icon: RefreshCw },
] as const;

export function ReceivablesShell({
  title, description, children, action,
}: { title: string; description: string; children: React.ReactNode; action?: React.ReactNode }) {
  const [location] = useLocation();
  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl">
      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="w-6 h-6" />{title}
          </h1>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
        {action}
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {RECEIVABLES_NAV.map((it) => {
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

export function StatCard({ title, value, hint, tone }: { title: string; value: string; hint?: string; tone?: "default" | "warn" | "danger" | "ok" }) {
  const toneCls = tone === "danger" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-emerald-600" : "";
  return (
    <Card>
      <CardHeader className="pb-2"><CardDescription>{title}</CardDescription></CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold tabular-nums ${toneCls}`}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}

export function Empty({ message }: { message: string }) {
  return (
    <Card><CardContent className="py-12 text-center text-muted-foreground text-sm">{message}</CardContent></Card>
  );
}

// 공유 타입 ─────────────────────────────────────────────────
export type Bill = {
  id: number; unitId: number; unitNumber: string; billingMonth: string;
  totalAmount: number; paidAmount: number; remaining: number;
  dueDate: string; status: string; overdueDays: number;
  agingBucket?: "d0_30" | "d31_60" | "d61_90" | "d91_plus";
};
export type OverdueResp = {
  rows: Bill[];
  aging: { d0_30: number; d31_60: number; d61_90: number; d91_plus: number };
  total: number;
  asOf: string | null;
};
export type DunningRow = {
  id: number; unitId: number; unitNumber: string; billId: number | null;
  batchId: string | null; stage: number; overdueAmount: number; lateFeeAmount: number;
  recipientName: string | null; recipientContact: string | null;
  channel: "post" | "sms" | "kakao" | "email"; bodyText: string;
  status: "draft" | "queued" | "sent" | "delivered" | "failed" | "cancelled";
  sentAt: string | null; createdAt: string;
};
export type ReconRow = {
  id: number; bankTxId: number | null; billId: number | null; unitId: number | null;
  category: "overpaid" | "underpaid" | "duplicate" | "refund_due" | "wrong_account" | "dispute" | "other";
  amount: number;
  status: "open" | "investigating" | "resolved" | "wontfix";
  reason: string | null; resolution: string | null; aiSuggestion: string | null;
  createdAt: string; resolvedAt: string | null;
};
export type AutoDebitRow = {
  id: number; billingMonth: string; unitId: number; unitNumber: string; billId: number | null;
  bankCode: string | null; accountMasked: string | null; amount: number; attempt: number;
  status: "queued" | "requested" | "success" | "failed" | "cancelled";
  resultCode: string | null; resultMessage: string | null;
  requestedAt: string | null; completedAt: string | null;
  createdAt: string;
};
export type Payment = {
  id: number; billId: number | null; unitId: number | null; amount: number;
  channel: string; paidAt: string; isPartial: boolean; memo: string | null;
};

export const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  queued: "bg-blue-100 text-blue-700",
  sent: "bg-emerald-100 text-emerald-700",
  delivered: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  cancelled: "bg-slate-100 text-slate-500",
  open: "bg-amber-100 text-amber-700",
  investigating: "bg-blue-100 text-blue-700",
  resolved: "bg-emerald-100 text-emerald-700",
  wontfix: "bg-slate-100 text-slate-500",
  success: "bg-emerald-100 text-emerald-700",
  requested: "bg-blue-100 text-blue-700",
  issued: "bg-blue-100 text-blue-700",
  partial: "bg-amber-100 text-amber-700",
  paid: "bg-emerald-100 text-emerald-700",
  overdue: "bg-rose-100 text-rose-700",
};

export const BUCKET_LABEL: Record<string, string> = {
  d0_30: "0~30일", d31_60: "31~60일", d61_90: "61~90일", d91_plus: "91일+",
};
