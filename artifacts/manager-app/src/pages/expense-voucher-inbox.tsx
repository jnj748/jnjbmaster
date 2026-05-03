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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, FileText, Repeat, Copy } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { IngestionPicker, linkIngestionRef } from "@/components/documents/ingestion-picker";

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
  // [Task #707] 분리부과 스케줄 — 부속명세서 자리표시.
  //   (필드명의 `installment` 은 레거시 명칭. 의미상 분리부과. replit.md 참조)
  installmentTotalAmount?: number | string | null;
  installmentMonths?: number | null;
  installmentMonthlyAmount?: number | string | null;
  installmentStartDate?: string | null;
  installmentEndDate?: string | null;
  // [Task #775] 정기/주기 메타 — 인박스 분기 + "지난번과 동일" 복제 버튼 노출용.
  isRecurring?: boolean;
  recurrenceCycle?: string | null;
  // [Task #794] 출납 시 사용한 자금 계정 코드 (예: 1010 현금, 1020 예금, 1021 OO은행).
  paymentAccountCode?: string | null;
}

// [Task #794] /accounting/accounts 응답 행 — 출납등록 시 자금 계정 선택지로 사용.
interface CashAccount { code: string; name: string; type: string; isHeader: boolean }

type VoucherTypeFilter = "all" | "recurring" | "onetime";

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
  // [Task #794] 행별 자금 계정 코드 선택 상태. 미선택 시 NULL 로 보내 기본 1020 예금 유지.
  const [accountCodes, setAccountCodes] = useState<Record<number, string>>({});
  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [accountMemos, setAccountMemos] = useState<Record<number, string>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  // [Task #775] 정기/비정기 인박스 분기. ?type=recurring|onetime 쿼리로 서버 필터.
  const [typeFilter, setTypeFilter] = useState<VoucherTypeFilter>("all");
  const [duplicating, setDuplicating] = useState<number | null>(null);
  // [Task #782] 행별로 마지막에 가져온 보관함 ingestion id — 출납 기록 시 linkedRefs 에 저장.
  const [linkedIngestion, setLinkedIngestion] = useState<Record<number, number>>({});

  // [Task #782] linkIngestionRef 호출용 베이스 — 위 API_BASE 와 동일하지만 명시적으로 보관.
  const apiBase = API_BASE;

  // [Task #794] 출납등록 시 선택할 자금 계정 목록 — 자산(asset) 타입 비-헤더 계정 중
  //   1010(현금) / 1020(예금) 또는 사용자가 등록한 통장·카드용 자산 계정만 노출.
  useEffect(() => {
    let cancelled = false;
    const loadAccounts = async () => {
      try {
        const res = await fetch(`${API_BASE}/accounting/accounts`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { accounts: CashAccount[] };
        const filtered = (data.accounts ?? []).filter(
          (a) =>
            a.type === "asset" &&
            !a.isHeader &&
            (a.code === "1010" ||
              a.code === "1020" ||
              /예금|현금|계좌|카드|통장/.test(a.name)),
        );
        if (!cancelled) setCashAccounts(filtered);
      } catch {
        // 자금 계정 목록은 출납등록 동작의 필수 조건이 아니므로 조용히 폴백.
      }
    };
    void loadAccounts();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const url = `${API_BASE}/expense-vouchers${typeFilter !== "all" ? `?type=${typeFilter}` : ""}`;
        const res = await fetch(url, {
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
  }, [token, toast, refreshKey, typeFilter]);

  // [Task #775] "지난번과 동일" — 정기지출 voucher 를 새 결재 라인 draft 로 복제.
  const onDuplicate = async (voucher: ExpenseVoucher) => {
    setDuplicating(voucher.id);
    try {
      const res = await fetch(`${API_BASE}/expense-vouchers/${voucher.id}/duplicate`, {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `복제 실패 (${res.status})`);
      }
      const draft = await res.json();
      toast({
        title: "결재 라인 복제 완료",
        description: "기안서 임시저장(Draft)에서 다음 회차 정보를 입력해 상신해주세요.",
      });
      setLocation(`/approvals/create?from=${draft.id}`);
    } catch (e) {
      toast({
        title: "복제 실패",
        description: e instanceof Error ? e.message : "잠시 후 다시 시도해 주세요.",
        variant: "destructive",
      });
    } finally {
      setDuplicating(null);
    }
  };

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
          // [Task #794] 자금 계정 코드 — 미선택 시 NULL 로 보내 기본 1020 예금 유지.
          accountCode: accountCodes[voucher.id]?.trim() || null,
          accountMemo: accountMemos[voucher.id]?.trim() || null,
          voucherNumber: voucherNos[voucher.id] ?? voucher.voucherNumber ?? null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `출납 기록 실패 (${res.status})`);
      }
      // [Task #782] 보관함 자료에서 가져왔다면 ingestion 에 expenseVoucherId 를 기록.
      const ingId = linkedIngestion[voucher.id];
      if (ingId) {
        await linkIngestionRef(apiBase, token, ingId, { expenseVoucherId: voucher.id });
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

      {/* [Task #775] 정기·비정기·전체 인박스 탭. 정기지출 카드에는 "지난번과 동일" 복제 버튼이 뜬다. */}
      <Tabs
        value={typeFilter}
        onValueChange={(v) => setTypeFilter(v as VoucherTypeFilter)}
        className="mb-4"
      >
        <TabsList>
          <TabsTrigger value="all" data-testid="voucher-tab-all">전체</TabsTrigger>
          <TabsTrigger value="recurring" data-testid="voucher-tab-recurring">
            <Repeat className="mr-1 h-3.5 w-3.5" />정기
          </TabsTrigger>
          <TabsTrigger value="onetime" data-testid="voucher-tab-onetime">비정기</TabsTrigger>
        </TabsList>
      </Tabs>

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
                  accountCode={accountCodes[v.id] ?? ""}
                  onChangeAccountCode={(c) =>
                    setAccountCodes((m) => ({ ...m, [v.id]: c }))
                  }
                  cashAccounts={cashAccounts}
                  accountMemo={accountMemos[v.id] ?? ""}
                  onChangeAccountMemo={(t) =>
                    setAccountMemos((m) => ({ ...m, [v.id]: t }))
                  }
                  onRecord={() => onRecord(v)}
                  onDuplicate={v.isRecurring ? () => onDuplicate(v) : undefined}
                  duplicating={duplicating === v.id}
                  onPickIngestion={(adapted, ingestionId) => {
                    setLinkedIngestion((m) => ({ ...m, [v.id]: ingestionId }));
                    if (adapted.date) setPaidDates((m) => ({ ...m, [v.id]: adapted.date! }));
                    if (adapted.memo) setAccountMemos((m) => ({ ...m, [v.id]: adapted.memo! }));
                    if (adapted.accountCandidates[0]) {
                      setPaymentMethods((m) => ({ ...m, [v.id]: m[v.id] || adapted.accountCandidates[0] }));
                    }
                    toast({ title: "보관함 자료를 가져왔습니다", description: "지급일·메모를 검토 후 기록하세요." });
                  }}
                  linkedIngestionId={linkedIngestion[v.id]}
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
                  onDuplicate={v.isRecurring ? () => onDuplicate(v) : undefined}
                  duplicating={duplicating === v.id}
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
  accountCode,
  onChangeAccountCode,
  cashAccounts,
  accountMemo,
  onChangeAccountMemo,
  onRecord,
  onOpenSource,
  readOnly,
  onDuplicate,
  duplicating,
  onPickIngestion,
  linkedIngestionId,
}: {
  voucher: ExpenseVoucher;
  busy?: boolean;
  voucherNo?: string;
  onChangeNo?: (s: string) => void;
  paidAt?: string;
  onChangePaidAt?: (s: string) => void;
  paymentMethod?: string;
  onChangePaymentMethod?: (s: string) => void;
  // [Task #794] 자금 계정 코드 (1010 현금/1020 예금/사용자 정의 통장 등) — readOnly 면 미사용.
  accountCode?: string;
  onChangeAccountCode?: (s: string) => void;
  cashAccounts?: CashAccount[];
  accountMemo?: string;
  onChangeAccountMemo?: (s: string) => void;
  onRecord?: () => void;
  onOpenSource?: (href: string) => void;
  readOnly?: boolean;
  onDuplicate?: () => void;
  duplicating?: boolean;
  // [Task #782] 보관함에서 가져오기 — 영수증/세금계산서/청구서/통장내역/의결문 기반 회계 자동 채움.
  onPickIngestion?: (adapted: import("@/components/documents/ingestion-picker").JournalAdapted, ingestionId: number) => void;
  linkedIngestionId?: number;
}) {
  const amount = typeof voucher.amount === "string" ? Number(voucher.amount) : voucher.amount;
  // [Task #707] 분리부과 메타 — 결재 라인의 "계약·증빙 등록" 단계에서 입력된 값을
  //   그대로 복사. 표시 전에 안전하게 number 로 정규화.
  const installmentTotal = voucher.installmentTotalAmount != null
    ? Number(voucher.installmentTotalAmount)
    : null;
  const installmentMonthly = voucher.installmentMonthlyAmount != null
    ? Number(voucher.installmentMonthlyAmount)
    : null;
  const hasInstallment = !!(
    voucher.installmentMonths || installmentTotal || installmentMonthly
  );
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
            {hasInstallment ? (
              <Badge
                className="mt-1 ml-1 bg-amber-100 text-amber-900 hover:bg-amber-100"
                data-testid={`voucher-installment-badge-${voucher.id}`}
                title="월말 관리비 부과 시 부속명세서의 근거 자료"
              >
                분리부과 — 부속명세서 근거
              </Badge>
            ) : null}
            {voucher.isRecurring ? (
              <Badge
                className="mt-1 ml-1 bg-sky-100 text-sky-900 hover:bg-sky-100"
                data-testid={`voucher-recurring-badge-${voucher.id}`}
                title={voucher.recurrenceCycle ?? "정기지출"}
              >
                <Repeat className="mr-1 h-3 w-3" />정기
              </Badge>
            ) : null}
          </div>
        </div>
        {onDuplicate ? (
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDuplicate}
              disabled={duplicating}
              data-testid={`voucher-duplicate-${voucher.id}`}
            >
              <Copy className="mr-1 h-3.5 w-3.5" />
              {duplicating ? "복제 중…" : "지난번과 동일"}
            </Button>
          </div>
        ) : null}
        {hasInstallment ? (
          <div
            className="rounded-md border border-amber-200 bg-amber-50/40 p-2"
            data-testid={`voucher-installment-table-${voucher.id}`}
          >
            <p className="mb-1 text-xs font-medium text-amber-900">
              분리부과 스케줄 (부속명세서 자리표시)
            </p>
            <table className="w-full text-xs">
              <tbody>
                {installmentTotal != null ? (
                  <tr>
                    <td className="py-0.5 pr-2 text-gray-600">총액</td>
                    <td className="py-0.5 text-right font-medium">
                      {installmentTotal.toLocaleString()} 원
                    </td>
                  </tr>
                ) : null}
                {voucher.installmentMonths != null ? (
                  <tr>
                    <td className="py-0.5 pr-2 text-gray-600">개월수</td>
                    <td className="py-0.5 text-right">{voucher.installmentMonths}개월</td>
                  </tr>
                ) : null}
                {installmentMonthly != null ? (
                  <tr>
                    <td className="py-0.5 pr-2 text-gray-600">월 납입액</td>
                    <td className="py-0.5 text-right font-medium">
                      {installmentMonthly.toLocaleString()} 원
                    </td>
                  </tr>
                ) : null}
                {voucher.installmentStartDate && voucher.installmentEndDate ? (
                  <tr>
                    <td className="py-0.5 pr-2 text-gray-600">기간</td>
                    <td className="py-0.5 text-right">
                      {voucher.installmentStartDate} ~ {voucher.installmentEndDate}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}
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
            {/* [Task #782] 보관함의 영수증·청구서 등으로 지급일·메모·방식 자동 채움. */}
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <IngestionPicker
                target="journal"
                testId={`voucher-ingestion-picker-${voucher.id}`}
                description="확인된 영수증·세금계산서·청구서·통장내역·의결문에서 지급일과 메모를 가져옵니다."
                onPick={(adapted, ingestionId) => onPickIngestion?.(adapted, ingestionId)}
              />
              {linkedIngestionId ? (
                <Badge variant="secondary" data-testid={`voucher-ingestion-linked-${voucher.id}`}>
                  보관함 #{linkedIngestionId}
                </Badge>
              ) : null}
            </div>
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
              {/* [Task #794] 자금 계정 — 사용자가 통장/카드/현금 등 등록한 자산 계정 중 선택.
                  미선택 시 기본 1020 예금으로 분개되며, 선택 시 자동으로 자금 출처 분기 분개가 추가된다. */}
              <label className="block text-xs text-gray-600 sm:col-span-2">
                자금 계정 (선택)
                <Select
                  value={accountCode ?? ""}
                  onValueChange={(v) => onChangeAccountCode?.(v)}
                >
                  <SelectTrigger
                    data-testid={`voucher-account-code-${voucher.id}`}
                  >
                    <SelectValue placeholder="기본 1020 예금" />
                  </SelectTrigger>
                  <SelectContent>
                    {(cashAccounts ?? []).map((a) => (
                      <SelectItem key={a.code} value={a.code}>
                        {a.code} {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
