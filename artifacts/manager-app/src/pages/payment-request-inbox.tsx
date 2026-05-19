// [Task #611] 입금요청함 — 관리인(custodian) 전용.
//
// 경리가 지출결의서를 출납 기록하면 같은 라인의 입금요청서가 활성화된다.
// 관리인은 송금을 마치면 "송금 완료"를 누르고, 그 시각이 settlements 출납에
// 자동 반영되며 라인이 종결된다.
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Send, FileText } from "lucide-react";
import { useLocation } from "wouter";
import { IngestionPicker, linkIngestionRef } from "@/components/documents/ingestion-picker";

interface PaymentRequest {
  id: number;
  approvalId: number;
  buildingId: number | null;
  expenseVoucherId: number | null;
  title: string;
  amount: number | string;
  status: "pending" | "remitted";
  payeeName: string | null;
  payeeAccount: string | null;
  payeeBank: string | null;
  awaitingPostApproval: boolean;
  remittedAt: string | null;
  remittedBy: number | null;
  remittedByName: string | null;
  remitMemo: string | null;
  createdAt: string;
  // [Task #682] 출처 백링크.
  sourceEntityType: string | null;
  sourceEntityId: number | null;
  sourceApprovalId: number | null;
  sourceApprovalTitle: string | null;
}

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

export default function PaymentRequestInboxPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [rows, setRows] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [memos, setMemos] = useState<Record<number, string>>({});
  // [Task #611] /payment-requests/:id/remit 는 remittedAt 이 필수.
  const today = new Date().toISOString().slice(0, 10);
  const [remitDates, setRemitDates] = useState<Record<number, string>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  // [Task #782] 행별로 마지막에 가져온 보관함 ingestion id — 송금 완료 시 linkedRefs 에 저장.
  const [linkedIngestion, setLinkedIngestion] = useState<Record<number, number>>({});

  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/payment-requests`, {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        if (!res.ok) throw new Error(`로드 실패 (${res.status})`);
        const data: PaymentRequest[] = await res.json();
        if (!cancelled) setRows(data);
      } catch (e) {
        toast({
          title: "입금요청서를 불러오지 못했습니다",
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
  const remitted = useMemo(() => rows.filter((r) => r.status === "remitted"), [rows]);

  const onRemit = async (req: PaymentRequest) => {
    const remittedAt = remitDates[req.id] ?? today;
    if (!remittedAt) {
      toast({
        title: "송금일을 입력해주세요",
        description: "송금 완료 처리에는 송금일이 필수입니다.",
        variant: "destructive",
      });
      return;
    }
    setBusyId(req.id);
    try {
      const res = await fetch(`${API_BASE}/payment-requests/${req.id}/remit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          remittedAt,
          remittanceMemo: memos[req.id]?.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `송금 완료 처리 실패 (${res.status})`);
      }
      // [Task #782] 보관함 자료에서 가져왔다면 ingestion 에 paymentRequestId 를 기록.
      const ingId = linkedIngestion[req.id];
      if (ingId) {
        await linkIngestionRef(apiBase, token, ingId, { paymentRequestId: req.id });
      }
      toast({ title: "송금 완료", description: "settlements 출납이 동기화되었습니다." });
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast({
        title: "처리 실패",
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
        <Send className="h-5 w-5 text-blue-600" />
        <h1 className="text-xl font-bold">입금요청함</h1>
      </div>
      <p className="mb-4 text-sm text-gray-600">
        결재 라인이 통과되고 경리가 지출결의서를 기록한 안건이 입금 대기로 들어옵니다.
        실제 송금을 마친 뒤 "송금 완료"를 눌러 출납 동기화를 마치세요.
      </p>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <>
          <Section title={`송금 대기 (${pending.length})`}>
            {pending.length === 0 ? (
              <EmptyMsg text="처리 대기 중인 입금요청서가 없습니다." />
            ) : (
              pending.map((r) => (
                <PaymentCard
                  key={r.id}
                  request={r}
                  busy={busyId === r.id}
                  onOpenSource={(href) => setLocation(href)}
                  memo={memos[r.id] ?? ""}
                  onChangeMemo={(m) => setMemos((map) => ({ ...map, [r.id]: m }))}
                  remittedAt={remitDates[r.id] ?? today}
                  onChangeRemittedAt={(d) =>
                    setRemitDates((map) => ({ ...map, [r.id]: d }))
                  }
                  onRemit={() => onRemit(r)}
                  onPickIngestion={(adapted, ingestionId) => {
                    setLinkedIngestion((m) => ({ ...m, [r.id]: ingestionId }));
                    const first = adapted[0];
                    if (first?.date) setRemitDates((map) => ({ ...map, [r.id]: first.date! }));
                    const memo = adapted
                      .map((a) => [a.vendor, a.amount != null ? `${a.amount.toLocaleString()}원` : null].filter(Boolean).join(" "))
                      .filter(Boolean).join(" / ");
                    if (memo) setMemos((map) => ({ ...map, [r.id]: memo }));
                    toast({ title: "보관함 자료를 가져왔습니다", description: "송금일과 메모가 채워졌습니다." });
                  }}
                  linkedIngestionId={linkedIngestion[r.id]}
                />
              ))
            )}
          </Section>

          <Section title={`송금 완료 (${remitted.length})`} className="mt-6">
            {remitted.length === 0 ? (
              <EmptyMsg text="송금 완료된 항목이 없습니다." />
            ) : (
              remitted.map((r) => (
                <PaymentCard
                  key={r.id}
                  request={r}
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

function PaymentCard({
  request,
  busy,
  memo,
  onChangeMemo,
  remittedAt,
  onChangeRemittedAt,
  onRemit,
  onOpenSource,
  readOnly,
  onPickIngestion,
  linkedIngestionId,
}: {
  request: PaymentRequest;
  busy?: boolean;
  memo?: string;
  onChangeMemo?: (s: string) => void;
  remittedAt?: string;
  onChangeRemittedAt?: (s: string) => void;
  onRemit?: () => void;
  onOpenSource?: (href: string) => void;
  readOnly?: boolean;
  // [Task #782] 보관함에서 가져오기 — 통장내역 ingestion 으로 송금일·메모 자동 채움.
  onPickIngestion?: (adapted: import("@/components/documents/ingestion-picker").CollectionAdapted, ingestionId: number) => void;
  linkedIngestionId?: number;
}) {
  const amount =
    typeof request.amount === "string" ? Number(request.amount) : request.amount;
  // [Task #682] 출처 백링크.
  const sourceHref =
    request.sourceEntityType === "rfq" && request.sourceEntityId
      ? `/rfqs?focus=${request.sourceEntityId}`
      : null;
  const sourceLabel = request.sourceEntityType
    ? request.sourceEntityType === "rfq"
      ? `관련 견적 #${request.sourceEntityId}`
      : `관련 ${request.sourceEntityType} #${request.sourceEntityId}`
    : null;
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium">{request.title}</p>
            {/* [Task #682 review-fix #2] 결재 #N 도 클릭 가능한 백링크로 노출. */}
            <button
              type="button"
              onClick={() => onOpenSource?.(`/approvals?focus=${request.sourceApprovalId ?? request.approvalId}`)}
              className="text-xs text-blue-600 hover:underline"
              data-testid={`payment-approval-link-${request.id}`}
            >
              결재 #{request.sourceApprovalId ?? request.approvalId}
              {request.sourceApprovalTitle ? ` — ${request.sourceApprovalTitle}` : ""}
            </button>
            {sourceLabel ? (
              sourceHref ? (
                <button
                  type="button"
                  onClick={() => onOpenSource?.(sourceHref)}
                  className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  data-testid={`payment-source-link-${request.id}`}
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
            {request.awaitingPostApproval ? (
              <Badge variant="destructive" className="mt-1">
                긴급집행 사후결재 대기
              </Badge>
            ) : request.status === "remitted" ? (
              <Badge className="mt-1 bg-emerald-600">송금 완료</Badge>
            ) : (
              <Badge variant="outline" className="mt-1">
                송금 대기
              </Badge>
            )}
          </div>
        </div>
        {request.payeeName ? (
          <p className="text-sm text-gray-700">
            지급처: {request.payeeName}{" "}
            {request.payeeBank ? `· ${request.payeeBank}` : ""}{" "}
            {request.payeeAccount ? `· ${request.payeeAccount}` : ""}
          </p>
        ) : null}
        {request.remittedAt ? (
          <p className="text-xs text-gray-500">
            {request.remittedByName ?? ""} ·{" "}
            {new Date(request.remittedAt).toLocaleString()}
            {request.remitMemo ? ` · ${request.remitMemo}` : ""}
          </p>
        ) : null}
        {!readOnly ? (
          <div className="space-y-2 border-t pt-2">
            {/* [Task #782] 보관함의 통장내역으로 송금일·메모 자동 채움. */}
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <IngestionPicker
                target="collection"
                testId={`payment-ingestion-picker-${request.id}`}
                description="확인된 통장내역에서 송금일과 메모를 가져옵니다."
                onPick={(adapted, ingestionId) => onPickIngestion?.(adapted, ingestionId)}
              />
              {linkedIngestionId ? (
                <Badge variant="secondary" data-testid={`payment-ingestion-linked-${request.id}`}>
                  보관함 #{linkedIngestionId}
                </Badge>
              ) : null}
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="block text-xs text-gray-600">
                송금일 *
                <Input
                  type="date"
                  value={remittedAt ?? ""}
                  onChange={(e) => onChangeRemittedAt?.(e.target.value)}
                />
              </label>
              <label className="block text-xs text-gray-600">
                송금 메모 (선택)
                <Input
                  value={memo ?? ""}
                  onChange={(e) => onChangeMemo?.(e.target.value)}
                />
              </label>
            </div>
            <div className="flex justify-end">
              <Button onClick={onRemit} disabled={busy}>
                {busy ? "처리 중…" : "송금 완료"}
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
