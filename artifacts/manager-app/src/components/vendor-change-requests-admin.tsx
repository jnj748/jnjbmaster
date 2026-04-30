// [Task #661] 본사 관리자(파트너 마켓 운영자) — 파트너 사업자정보 변경 신청 검토 큐.
//   - GET  /admin/vendor-change-requests?status=pending|approved|rejected|all
//   - POST /admin/vendor-change-requests/:id/approve
//   - POST /admin/vendor-change-requests/:id/reject (사유 필수)
//   - 사용자 관리 페이지 하단에 별도 섹션으로 노출. 탭이 없으므로 status 필터로 분리.
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck, FileText, ArrowRight, CheckCircle2, XCircle, Clock } from "lucide-react";
import { AuthImage } from "@/components/auth-image";
import { VendorAvatar } from "@/components/vendor-avatar";

const FIELD_LABEL: Record<string, string> = {
  name: "상호 (업체명)",
  businessRegNumber: "사업자등록번호",
  representativeName: "대표자명",
  category: "분야 (CSV)",
};

const CATEGORY_LABEL: Record<string, string> = {
  elevator: "승강기",
  water_tank: "저수조",
  fire_safety: "소방",
  electrical: "전기",
  gas: "가스",
  septic: "정화조",
  cleaning: "청소",
  security: "보안",
  waterproofing: "방수",
  maintenance_repair: "영선/수선유지",
  defect_diagnosis: "하자진단",
  building_maintenance: "건물관리",
  mechanical: "기계설비",
  other: "기타",
};

interface VendorRow {
  id: number;
  name: string;
  profileImageUrl: string | null;
}

interface RequesterRow {
  id: number;
  name: string;
  email: string | null;
}

interface ChangeRequestRow {
  request: {
    id: number;
    vendorId: number;
    requestedBy: number;
    status: "pending" | "approved" | "rejected";
    fields: Array<{ field: string; before: string | null; after: string | null }>;
    bizCertUrl: string;
    reason: string | null;
    decidedBy: number | null;
    decidedAt: string | null;
    decisionReason: string | null;
    createdAt: string;
  };
  vendor: VendorRow | null;
  requester: RequesterRow | null;
}

type StatusFilter = "pending" | "approved" | "rejected" | "all";

const STATUS_LABEL: Record<ChangeRequestRow["request"]["status"], string> = {
  pending: "검토 대기",
  approved: "승인됨",
  rejected: "반려됨",
};

function formatChangeValue(field: string, value: string | null): string {
  if (!value) return "—";
  if (field === "category") {
    return value
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => CATEGORY_LABEL[c] ?? c)
      .join(" · ");
  }
  return value;
}

interface Props {
  token: string;
  apiBase: string;
}

export function VendorChangeRequestsAdminSection({ token, apiBase }: Props) {
  const [status, setStatus] = useState<StatusFilter>("pending");
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [decisionTarget, setDecisionTarget] = useState<ChangeRequestRow | null>(null);
  const [decisionMode, setDecisionMode] = useState<"approve" | "reject" | null>(null);
  const [decisionReason, setDecisionReason] = useState("");

  const queryKey = useMemo(() => ["admin", "vendorChangeRequests", status] as const, [status]);
  const listQuery = useQuery<ChangeRequestRow[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`${apiBase}/admin/vendor-change-requests?status=${status}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`목록 조회 실패 (${res.status})`);
      const d = await res.json();
      return (d?.requests ?? []) as ChangeRequestRow[];
    },
  });

  const decideMutation = useMutation<unknown, Error, { id: number; mode: "approve" | "reject"; reason: string }>({
    mutationFn: async ({ id, mode, reason }) => {
      const res = await fetch(`${apiBase}/admin/vendor-change-requests/${id}/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || `${mode === "approve" ? "승인" : "반려"} 실패 (${res.status})`);
      }
      return null;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "vendorChangeRequests"] });
      toast({
        title: vars.mode === "approve" ? "변경 신청을 승인했습니다" : "변경 신청을 반려했습니다",
      });
      setDecisionTarget(null);
      setDecisionMode(null);
      setDecisionReason("");
    },
    onError: (err) => {
      toast({ title: "처리 실패", description: err.message, variant: "destructive" });
    },
  });

  function openDecision(row: ChangeRequestRow, mode: "approve" | "reject") {
    setDecisionTarget(row);
    setDecisionMode(mode);
    setDecisionReason("");
  }

  function closeDecision() {
    setDecisionTarget(null);
    setDecisionMode(null);
    setDecisionReason("");
  }

  function confirmDecision() {
    if (!decisionTarget || !decisionMode) return;
    if (decisionMode === "reject" && !decisionReason.trim()) {
      toast({ title: "반려 사유는 필수입니다", variant: "destructive" });
      return;
    }
    decideMutation.mutate({
      id: decisionTarget.request.id,
      mode: decisionMode,
      reason: decisionReason.trim(),
    });
  }

  return (
    <div className="mt-10">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-teal-600" />
            파트너 사업자정보 변경 신청
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 mb-3" data-testid="vendor-change-status-tabs">
            {(["pending", "approved", "rejected", "all"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                data-testid={`vendor-change-status-${s}`}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  status === s
                    ? "bg-teal-600 text-white border-teal-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                {s === "pending"
                  ? "검토 대기"
                  : s === "approved"
                    ? "승인됨"
                    : s === "rejected"
                      ? "반려됨"
                      : "전체"}
              </button>
            ))}
          </div>

          {listQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : listQuery.error ? (
            <div className="rounded-lg bg-red-50 text-red-700 p-3 text-sm">
              목록을 불러오지 못했습니다: {(listQuery.error as Error).message}
            </div>
          ) : (listQuery.data ?? []).length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              {status === "pending" ? "검토 대기 중인 신청이 없습니다." : "조건에 맞는 신청이 없습니다."}
            </div>
          ) : (
            <ul className="space-y-3" data-testid="vendor-change-list">
              {listQuery.data!.map((row) => (
                <ChangeRequestCard
                  key={row.request.id}
                  row={row}
                  apiBase={apiBase}
                  onApprove={() => openDecision(row, "approve")}
                  onReject={() => openDecision(row, "reject")}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!decisionTarget} onOpenChange={(v) => !v && closeDecision()}>
        <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {decisionMode === "approve"
                ? "사업자정보 변경 신청 승인"
                : "사업자정보 변경 신청 반려"}
            </SheetTitle>
            <SheetDescription>
              {decisionMode === "approve"
                ? "승인하면 변경된 값이 즉시 업체 프로필에 반영되고, 새 사업자등록증이 비고에 기록됩니다."
                : "반려 사유를 입력해 주세요. 신청자에게 안내되며 새 신청 전 참고 자료가 됩니다."}
            </SheetDescription>
          </SheetHeader>

          {decisionTarget && (
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                <p className="text-xs text-slate-500">대상 업체</p>
                <div className="flex items-center gap-2">
                  <VendorAvatar
                    profileImageUrl={decisionTarget.vendor?.profileImageUrl}
                    alt={decisionTarget.vendor?.name}
                    size="sm"
                  />
                  <span className="font-medium">{decisionTarget.vendor?.name ?? "—"}</span>
                </div>
                <ul className="space-y-1 text-xs">
                  {decisionTarget.request.fields.map((c, i) => (
                    <li key={`${c.field}-${i}`} className="flex flex-wrap items-center gap-1.5">
                      <span className="text-slate-500 w-32 shrink-0">{FIELD_LABEL[c.field] ?? c.field}</span>
                      <span className="text-slate-400 line-through">{formatChangeValue(c.field, c.before)}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <span className="text-slate-800 font-medium">{formatChangeValue(c.field, c.after)}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {decisionMode === "reject" ? (
                <div>
                  <label className="text-xs text-slate-600 font-medium">반려 사유 (필수)</label>
                  <Textarea
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                    maxLength={1000}
                    placeholder="예) 첨부된 사업자등록증과 신청 내용이 일치하지 않습니다."
                    data-testid="vendor-change-reject-reason"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-xs text-slate-600 font-medium">메모 (선택)</label>
                  <Textarea
                    value={decisionReason}
                    onChange={(e) => setDecisionReason(e.target.value)}
                    maxLength={1000}
                    placeholder="내부 검토 메모"
                    data-testid="vendor-change-approve-note"
                  />
                </div>
              )}
            </div>
          )}

          <SheetFooter className="flex-row gap-2 mt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={closeDecision}>
              취소
            </Button>
            <Button
              type="button"
              className={`flex-1 ${decisionMode === "reject" ? "bg-red-600 hover:bg-red-700" : ""}`}
              onClick={confirmDecision}
              disabled={decideMutation.isPending}
              data-testid="vendor-change-confirm"
            >
              {decideMutation.isPending
                ? "처리 중..."
                : decisionMode === "approve"
                  ? "승인"
                  : "반려"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ChangeRequestCard({
  row,
  apiBase,
  onApprove,
  onReject,
}: {
  row: ChangeRequestRow;
  apiBase: string;
  onApprove: () => void;
  onReject: () => void;
}) {
  const [showCert, setShowCert] = useState(false);
  const r = row.request;
  const isPending = r.status === "pending";

  return (
    <li
      className="rounded-xl border border-slate-200 bg-white p-3"
      data-testid={`vendor-change-row-${r.id}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <VendorAvatar
            profileImageUrl={row.vendor?.profileImageUrl}
            alt={row.vendor?.name}
            size="sm"
          />
          <div className="min-w-0">
            <p className="font-medium text-slate-800 truncate">{row.vendor?.name ?? "(업체 없음)"}</p>
            <p className="text-[11px] text-slate-500 truncate">
              신청자 {row.requester?.name ?? "—"} · {new Date(r.createdAt).toLocaleString("ko-KR")}
            </p>
          </div>
        </div>
        <Badge
          variant={isPending ? "default" : "secondary"}
          className={
            r.status === "approved"
              ? "bg-emerald-100 text-emerald-700"
              : r.status === "rejected"
                ? "bg-red-100 text-red-700"
                : "bg-amber-100 text-amber-800"
          }
        >
          {r.status === "pending" && <Clock className="w-3 h-3 mr-0.5" />}
          {r.status === "approved" && <CheckCircle2 className="w-3 h-3 mr-0.5" />}
          {r.status === "rejected" && <XCircle className="w-3 h-3 mr-0.5" />}
          {STATUS_LABEL[r.status]}
        </Badge>
      </div>

      <ul className="mt-3 space-y-1 text-xs">
        {r.fields.map((c, i) => (
          <li
            key={`${c.field}-${i}`}
            className="flex flex-wrap items-center gap-1.5 rounded bg-slate-50 px-2 py-1"
          >
            <span className="text-slate-500 w-24 shrink-0">{FIELD_LABEL[c.field] ?? c.field}</span>
            <span className="text-slate-400 line-through truncate max-w-[40%]">
              {formatChangeValue(c.field, c.before)}
            </span>
            <ArrowRight className="w-3 h-3 text-slate-400" />
            <span className="text-slate-800 font-medium truncate">{formatChangeValue(c.field, c.after)}</span>
          </li>
        ))}
      </ul>

      {r.reason && (
        <p className="mt-2 text-xs text-slate-600">
          <span className="font-medium text-slate-700">신청자 메모:</span> {r.reason}
        </p>
      )}

      {r.decisionReason && r.status !== "pending" && (
        <p className="mt-1 text-xs text-slate-600">
          <span className="font-medium text-slate-700">
            {r.status === "rejected" ? "반려 사유" : "검토 메모"}:
          </span>{" "}
          {r.decisionReason}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setShowCert((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
          data-testid={`vendor-change-toggle-cert-${r.id}`}
        >
          <FileText className="w-3.5 h-3.5" />
          {showCert ? "사업자등록증 닫기" : "새 사업자등록증 보기"}
        </button>
        {isPending && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onReject}
              className="text-red-600 border-red-200 hover:bg-red-50"
              data-testid={`vendor-change-reject-${r.id}`}
            >
              반려
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={onApprove}
              data-testid={`vendor-change-approve-${r.id}`}
            >
              승인
            </Button>
          </div>
        )}
      </div>

      {showCert && (
        <div className="mt-2 border-t border-slate-100 pt-2">
          <CertificatePreview apiBase={apiBase} url={r.bizCertUrl} />
        </div>
      )}
    </li>
  );
}

function CertificatePreview({ apiBase, url }: { apiBase: string; url: string }) {
  const isPdf = /\.pdf($|\?)/i.test(url);
  const src = `${apiBase}/storage/objects/${url.replace(/^\/objects\//, "").replace(/^\//, "")}`;
  if (isPdf) {
    return (
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-700 hover:bg-slate-50"
      >
        <FileText className="w-3.5 h-3.5" />
        PDF 새 창에서 열기
      </a>
    );
  }
  return (
    <AuthImage
      src={src}
      alt="사업자등록증"
      className="max-h-72 w-auto rounded border border-slate-200"
    />
  );
}
