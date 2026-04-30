// [Task #611] 지출결의서함 — 경리 전용.
//
// 본부장/관리인 라인이 통과되면 (또는 긴급집행 즉시 발행시) 자동으로
// 한 row 가 이 인박스에 적재된다. 경리는 "출납 기록"을 누르면
// settlements 출납이 동기화되며 같은 라인의 입금요청서도 활성화된다.
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, FileText } from "lucide-react";
import { useLocation } from "wouter";

interface ExpenseVoucher {
  id: number;
  approvalId: number;
  buildingId: number | null;
  title: string;
  amount: number | string;
  status: "pending" | "recorded";
  voucherNumber: string | null;
  payeeName: string | null;
  payeeAccount: string | null;
  awaitingPostApproval: boolean;
  recordedAt: string | null;
  recordedBy: number | null;
  recordedByName: string | null;
  settlementId: number | null;
  createdAt: string;
  // [Task #682] 인박스 행에 출처(예: RFQ #N) 백링크.
  sourceEntityType: string | null;
  sourceEntityId: number | null;
  sourceApprovalId: number | null;
  sourceApprovalTitle: string | null;
}

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

export default function ExpenseVoucherInboxPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [rows, setRows] = useState<ExpenseVoucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [voucherNos, setVoucherNos] = useState<Record<number, string>>({});
  // [Task #611] /expense-vouchers/:id/record 는 paidAt + paymentMethod 가 필수.
  const today = new Date().toISOString().slice(0, 10);
  const [paidDates, setPaidDates] = useState<Record<number, string>>({});
  const [paymentMethods, setPaymentMethods] = useState<Record<number, string>>({});
  const [accountMemos, setAccountMemos] = useState<Record<number, string>>({});
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/expense-vouchers`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        if (!res.ok) throw new Error(`로드 실패 (${res.status})`);
        const data: ExpenseVoucher[] = await res.json();
        if (!cancelled) setRows(data);
      } catch (e) {
        toast({
          title: "지출결의서를 불러오지 못했습니다",
          description: e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요.",
          variant: "destructive",
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, toast, refreshKey]);

  const pending = useMemo(() => rows.filter((r) => r.status === "pending"), [rows]);
  const recorded = useMemo(() => rows.filter((r) => r.status === "recorded"), [rows]);

  const onRecord = async (voucher: ExpenseVoucher) => {
    const paidAt = paidDates[voucher.id] ?? today;
    const paymentMethod = paymentMethods[voucher.id] ?? "";
    if (!paidAt || !paymentMethod.trim()) {
      toast({
        title: "지급일과 지급방식을 입력해주세요",
        description: "출납 기록에는 지급일과 지급방식(예: 계좌이체, 카드)이 필수입니다.",
        variant: "destructive",
      });
      return;
    }
    setBusyId(voucher.id);
    try {
      const res = await fetch(`${API_BASE}/expense-vouchers/${voucher.id}/record`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          paidAt,
          paymentMethod: paymentMethod.trim(),
          accountMemo: accountMemos[voucher.id]?.trim() || null,
          voucherNumber: voucherNos[voucher.id] ?? voucher.voucherNumber ?? null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `출납 기록 실패 (${res.status})`);
      }
      toast({ title: "출납 기록 완료", description: "settlements 가 동기화되었습니다." });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({
        title: "출납 기록 실패",
        description: e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="container mx-auto max-w-4xl p-4 pb-32">
      <div className="mb-4 flex items-center gap-2">
        <Receipt className="h-5 w-5 text-emerald-600" />
        <h1 className="text-xl font-bold">지출결의서함</h1>
      </div>
      <p className="mb-4 text-sm text-gray-600">
        결재 라인이 통과된 안건의 지출결의서가 자동으로 들어옵니다. 출납을 기록하면
        설정·정산 출납과 자동으로 동기화됩니다.
      </p>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          <Section title={`처리 대기 (${pending.length})`}>
            {pending.length === 0 ? (
              <EmptyMsg text="처리 대기 중인 지출결의서가 없습니다." />
            ) : (
              pending.map((v) => (
                <VoucherCard
                  key={v.id}
                  voucher={v}
                  busy={busyId === v.id}
                  onOpenSource={(href) => setLocation(href)}
                  voucherNo={voucherNos[v.id] ?? ""}
                  onChangeNo={(no) => setVoucherNos((m) => ({ ...m, [v.id]: no }))}
                  paidAt={paidDates[v.id] ?? today}
                  onChangePaidAt={(d) => setPaidDates((m) => ({ ...m, [v.id]: d }))}
                  paymentMethod={paymentMethods[v.id] ?? ""}
                  onChangePaymentMethod={(p) =>
                    setPaymentMethods((m) => ({ ...m, [v.id]: p }))
                  }
                  accountMemo={accountMemos[v.id] ?? ""}
                  onChangeAccountMemo={(t) =>
                    setAccountMemos((m) => ({ ...m, [v.id]: t }))
                  }
                  onRecord={() => onRecord(v)}
                />
              ))
            )}
          </Section>

          <Section title={`기록 완료 (${recorded.length})`} className="mt-6">
            {recorded.length === 0 ? (
              <EmptyMsg text="기록된 지출결의서가 없습니다." />
            ) : (
              recorded.map((v) => (
                <VoucherCard
                  key={v.id}
                  voucher={v}
                  onOpenSource={(href) => setLocation(href)}
                  readOnly
                />
              ))
            )}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <h2 className="mb-2 text-sm font-semibold text-gray-700">{title}</h2>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function EmptyMsg({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center text-sm text-gray-500">{text}</CardContent>
    </Card>
  );
}

function VoucherCard({
  voucher,
  busy,
  voucherNo,
  onChangeNo,
  paidAt,
  onChangePaidAt,
  paymentMethod,
  onChangePaymentMethod,
  accountMemo,
  onChangeAccountMemo,
  onRecord,
  onOpenSource,
  readOnly,
}: {
  voucher: ExpenseVoucher;
  busy?: boolean;
  voucherNo?: string;
  onChangeNo?: (s: string) => void;
  paidAt?: string;
  onChangePaidAt?: (s: string) => void;
  paymentMethod?: string;
  onChangePaymentMethod?: (s: string) => void;
  accountMemo?: string;
  onChangeAccountMemo?: (s: string) => void;
  onRecord?: () => void;
  onOpenSource?: (href: string) => void;
  readOnly?: boolean;
}) {
  const amount = typeof voucher.amount === "string" ? Number(voucher.amount) : voucher.amount;
  // [Task #682] 출처 백링크 — 현재는 RFQ 만 라우팅 지원, 그 외엔 라벨만.
  const sourceHref =
    voucher.sourceEntityType === "rfq" && voucher.sourceEntityId
      ? `/rfqs?focus=${voucher.sourceEntityId}`
      : null;
  const sourceLabel = voucher.sourceEntityType
    ? voucher.sourceEntityType === "rfq"
      ? `관련 RFQ #${voucher.sourceEntityId}`
      : `관련 ${voucher.sourceEntityType} #${voucher.sourceEntityId}`
    : null;
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium">{voucher.title}</p>
            {/* [Task #682 review-fix #2] 결재 #N 도 클릭 가능한 백링크로 노출.
                /approvals?focus=N 으로 이동해 결재함에서 해당 안건이 자동 강조된다. */}
            <button
              type="button"
              onClick={() => onOpenSource?.(`/approvals?focus=${voucher.sourceApprovalId ?? voucher.approvalId}`)}
              className="text-xs text-blue-600 hover:underline"
              data-testid={`voucher-approval-link-${voucher.id}`}
            >
              결재 #{voucher.sourceApprovalId ?? voucher.approvalId}
              {voucher.sourceApprovalTitle ? ` — ${voucher.sourceApprovalTitle}` : ""}
            </button>
            {sourceLabel ? (
              sourceHref ? (
                <button
                  type="button"
                  onClick={() => onOpenSource?.(sourceHref)}
                  className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  data-testid={`voucher-source-link-${voucher.id}`}
                >
                  <FileText className="h-3 w-3" />
                  {sourceLabel}
                </button>
              ) : (
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-gray-500">
                  <FileText className="h-3 w-3" />
                  {sourceLabel}
                </p>
              )
            ) : null}
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold">
              {Number.isFinite(amount) ? amount.toLocaleString() : "-"} 원
            </p>
            {voucher.awaitingPostApproval ? (
              <Badge variant="destructive" className="mt-1">
                긴급집행 사후결재 대기
              </Badge>
            ) : voucher.status === "recorded" ? (
              <Badge className="mt-1 bg-emerald-600">기록 완료</Badge>
            ) : (
              <Badge variant="outline" className="mt-1">
                기록 대기
              </Badge>
            )}
          </div>
        </div>
        {voucher.payeeName ? (
          <p className="text-sm text-gray-700">
            지급처: {voucher.payeeName} {voucher.payeeAccount ? `· ${voucher.payeeAccount}` : ""}
          </p>
        ) : null}
        {voucher.recordedAt ? (
          <p className="text-xs text-gray-500">
            {voucher.recordedByName ?? ""} · {new Date(voucher.recordedAt).toLocaleString()}
            {voucher.voucherNumber ? ` · 전표 #${voucher.voucherNumber}` : ""}
          </p>
        ) : null}
        {!readOnly ? (
          <div className="space-y-2 border-t pt-2">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="block text-xs text-gray-600">
                지급일 *
                <Input
                  type="date"
                  value={paidAt ?? ""}
                  onChange={(e) => onChangePaidAt?.(e.target.value)}
                />
              </label>
              <label className="block text-xs text-gray-600">
                지급방식 *
                <Input
                  placeholder="예: 계좌이체, 카드, 현금"
                  value={paymentMethod ?? ""}
                  onChange={(e) => onChangePaymentMethod?.(e.target.value)}
                />
              </label>
              <label className="block text-xs text-gray-600">
                전표 번호 (선택)
                <Input
                  value={voucherNo ?? ""}
                  onChange={(e) => onChangeNo?.(e.target.value)}
                />
              </label>
              <label className="block text-xs text-gray-600">
                출납 메모 (선택)
                <Input
                  value={accountMemo ?? ""}
                  onChange={(e) => onChangeAccountMemo?.(e.target.value)}
                />
              </label>
            </div>
            <div className="flex justify-end">
              <Button onClick={onRecord} disabled={busy}>
                {busy ? "기록 중…" : "출납 기록"}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
