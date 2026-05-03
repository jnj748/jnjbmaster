import { useState, useEffect } from "react";
import {
  useListApprovals,
  useApproveApproval,
  useRejectApproval,
  getListApprovalsQueryKey,
  getGetApprovalStatsQueryKey,
  getGetExecutiveKpiQueryKey,
  type ListApprovalsParams,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { useBuilding } from "@/contexts/building-context";
import { ROLE_LABELS } from "@workspace/shared/role-labels";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useSearch } from "wouter";
import {
  ClipboardCheck,
  Check,
  X,
  Eye,
  DollarSign,
  Plus,
  Users,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import SignedCopyUploader, { type SignedCopySummary } from "@/components/signed-copy-uploader";
// [Task #758] 게스트(비가입자) 전자서명 링크 발급/추적 패널.
import GuestSignaturePanel from "@/components/guest-signature-panel";
import ContractEvidenceRegistration from "@/components/contract-evidence-registration";

// [Task #707 review fix] 다중 계약/세금계산서 첨부 파일 항목.
type ContractFileSummary = {
  id: number;
  approvalId: number;
  kind: "contract" | "tax_invoice";
  fileUrl: string;
  fileName: string;
  sortOrder: number;
  createdAt: string;
};

const categoryLabel = (c: string) => {
  const labels: Record<string, string> = {
    maintenance: "유지보수",
    inspection: "법정점검",
    facility: "시설관리",
    equipment: "장비",
    other: "기타",
  };
  return labels[c] || c;
};

const statusBadge = (status: string) => {
  switch (status) {
    case "pending":
      return <Badge variant="secondary">대기중</Badge>;
    case "in_progress":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">진행중</Badge>;
    case "approved":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">승인</Badge>;
    case "rejected":
      return <Badge variant="destructive">반려</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

interface ApprovalItem {
  id: number;
  title: string;
  description: string;
  category: string;
  status: string;
  requesterId?: number;
  requesterName: string;
  approverName: string | null;
  estimatedAmount: number | null;
  vendorName: string | null;
  vendorQuoteDetails: string | null;
  rejectionReason: string | null;
  totalSteps: number;
  currentStep: number;
  createdAt: string;
  approvedAt: string | null;
  // [Task #611] 새 파이프라인 필드.
  urgentExecution?: boolean;
  urgentConsentMemo?: string | null;
  hqThresholdSnapshot?: number | null;
  buildingId?: number | null;
  // [Task #707] 계약·증빙 등록 단계.
  awaitingContractEvidence?: boolean;
  contractEvidenceRegisteredAt?: string | null;
  contractEvidenceRegisteredByName?: string | null;
  contractFileUrl?: string | null;
  contractFileName?: string | null;
  taxInvoiceFileUrl?: string | null;
  taxInvoiceFileName?: string | null;
  taxInvoicePending?: boolean;
  taxInvoicePendingReason?: string | null;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  installmentTotalAmount?: number | null;
  installmentMonths?: number | null;
  installmentMonthlyAmount?: number | null;
  installmentStartDate?: string | null;
  installmentEndDate?: string | null;
}

interface ApprovalStep {
  id: number;
  approvalId: number;
  stepOrder: number;
  approverId: number;
  approverName: string;
  approverRole: string;
  status: string;
  comment: string | null;
  processedAt: string | null;
  // [Task #611] 오프라인/전자 결재 경로.
  path?: "offline" | "electronic" | null;
  signedCopyMissing?: boolean;
}

interface SignatureItem {
  id: number;
  userId: number;
  userName: string;
  signatureType: string;
  signatureData: string;
  createdAt: string;
  updatedAt: string;
}

export default function Approvals() {
  const { user, token } = useAuth();
  // [Task #707 review fix] 종이 결재본 업로드/오프라인 마감을 같은 건물의
  //   관리소장·경리에게도 허용한다. 백엔드(`/signed-copies`,
  //   `/process-offline`)와 동일한 권한 모델을 화면에 노출하기 위함.
  const { building } = useBuilding();
  const [, setLocation] = useLocation();
  // [Task #682 review-fix #2] /approvals?focus=N 으로 진입 시 해당 카드를 자동 스크롤·강조.
  const search = useSearch();
  const focusParam = new URLSearchParams(search).get("focus");
  const focusApprovalId = focusParam ? Number(focusParam) : null;
  const isManager = user?.role === "manager";
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedApproval, setSelectedApproval] = useState<ApprovalItem | null>(null);
  const [approvalSteps, setApprovalSteps] = useState<ApprovalStep[]>([]);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [userSignatures, setUserSignatures] = useState<SignatureItem[]>([]);
  const [selectedSignatureId, setSelectedSignatureId] = useState<number | null>(null);
  // [Task #611] 단계별 서명본 캐시 + 오프라인 결재완료 액션 처리 중 상태.
  const [signedCopiesByStep, setSignedCopiesByStep] = useState<Record<number, SignedCopySummary[]>>({});
  // [Task #707 review fix] 등록된 다중 계약/세금계산서 파일 — 결재 상세에서 노출.
  const [contractFilesByApproval, setContractFilesByApproval] = useState<Record<number, ContractFileSummary[]>>({});
  const [offlineProcessingStepId, setOfflineProcessingStepId] = useState<number | null>(null);
  const [showDrafts, setShowDrafts] = useState(false);
  const [drafts, setDrafts] = useState<ApprovalItem[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const BASE = import.meta.env.BASE_URL ?? "/";
  const API_BASE = `${BASE}api`;

  const { data: approvals, isLoading } = useListApprovals(
    statusFilter
      ? { status: statusFilter as ListApprovalsParams["status"] }
      : {},
  );

  // [Task #682 review-fix #2] focus 파라미터로 들어오면 해당 카드를 자동으로 스크롤·하이라이트.
  useEffect(() => {
    if (!focusApprovalId || !approvals || (approvals as ApprovalItem[]).length === 0) return;
    let cancelled = false;
    let tries = 0;
    const tick = () => {
      if (cancelled) return;
      const el = document.querySelector(
        `[data-testid="approval-card-${focusApprovalId}"]`,
      ) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("ring-2", "ring-primary", "ring-offset-2");
        setTimeout(() => {
          el.classList.remove("ring-2", "ring-primary", "ring-offset-2");
        }, 2400);
        const url = new URL(window.location.href);
        url.searchParams.delete("focus");
        window.history.replaceState({}, "", url.toString());
      } else if (tries < 12) {
        tries += 1;
        setTimeout(tick, 150);
      }
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [focusApprovalId, approvals]);

  useEffect(() => {
    if (showDrafts) {
      setDraftsLoading(true);
      fetch(`${API_BASE}/approvals/drafts`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((data: ApprovalItem[]) => setDrafts(data))
        .catch(() => setDrafts([]))
        .finally(() => setDraftsLoading(false));
    }
  }, [showDrafts, API_BASE, token]);

  const approveMutation = useApproveApproval();
  const rejectMutation = useRejectApproval();

  useEffect(() => {
    // [Task #611] 새 파이프라인은 1단계 라인(관리인 단독)도 step path 표시가 필요해
    //   totalSteps 1 인 경우에도 단계 정보를 가져온다.
    if (selectedApproval) {
      fetch(`${API_BASE}/approvals/${selectedApproval.id}/steps`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((data: ApprovalStep[]) => setApprovalSteps(Array.isArray(data) ? data : []))
        .catch(() => setApprovalSteps([]));
    } else {
      setApprovalSteps([]);
      setSignedCopiesByStep({});
    }

    if (selectedApproval) {
      fetch(`${API_BASE}/signatures`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((data: SignatureItem[]) => setUserSignatures(data))
        .catch(() => setUserSignatures([]));
      setSelectedSignatureId(null);
    }

    // [Task #707 review fix] 등록된 다중 계약/세금계산서 파일 조회.
    if (selectedApproval && selectedApproval.contractEvidenceRegisteredAt) {
      fetch(`${API_BASE}/approvals/${selectedApproval.id}/contract-files`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((data: ContractFileSummary[]) => {
          setContractFilesByApproval((prev) => ({
            ...prev,
            [selectedApproval.id]: Array.isArray(data) ? data : [],
          }));
        })
        .catch(() => undefined);
    }
  }, [selectedApproval, API_BASE, token]);

  // [Task #611] 단계 목록이 들어오면 오프라인 단계의 서명본을 일괄 조회.
  useEffect(() => {
    if (!selectedApproval || approvalSteps.length === 0 || !token) return;
    let cancelled = false;
    (async () => {
      const results: Record<number, SignedCopySummary[]> = {};
      for (const step of approvalSteps) {
        if (step.path !== "offline") continue;
        try {
          const res = await fetch(
            `${API_BASE}/approvals/${selectedApproval.id}/steps/${step.id}/signed-copies`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          if (res.ok) {
            const data: SignedCopySummary[] = await res.json();
            results[step.id] = Array.isArray(data) ? data : [];
          } else {
            results[step.id] = [];
          }
        } catch {
          results[step.id] = [];
        }
      }
      if (!cancelled) setSignedCopiesByStep(results);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedApproval, approvalSteps, API_BASE, token]);

  // [Task #611] 오프라인 단계 — 상신자(관리소장)/관리자가 본부장·관리인 결재 결과를 대신 마감.
  async function handleOfflineProcess(stepId: number, action: "approve" | "reject", comment?: string) {
    if (!selectedApproval) return;
    setOfflineProcessingStepId(stepId);
    try {
      const res = await fetch(
        `${API_BASE}/approvals/${selectedApproval.id}/steps/${stepId}/process-offline`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action, comment: comment || null }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast({ title: err?.error || "오프라인 결재 처리에 실패했습니다", variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: getListApprovalsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetApprovalStatsQueryKey() });
      toast({
        title: action === "approve" ? "오프라인 결재가 완료되었습니다" : "결재가 반려되었습니다",
      });
      setSelectedApproval(null);
    } catch {
      toast({ title: "오프라인 결재 처리에 실패했습니다", variant: "destructive" });
    } finally {
      setOfflineProcessingStepId(null);
    }
  }

  async function handleApprove(id: number) {
    try {
      await approveMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: getListApprovalsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetApprovalStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetExecutiveKpiQueryKey() });
      toast({ title: "결재가 승인되었습니다" });
      setSelectedApproval(null);
    } catch {
      toast({ title: "승인 처리에 실패했습니다", variant: "destructive" });
    }
  }

  async function handleStepProcess(stepId: number, action: "approve" | "reject", comment?: string) {
    if (!selectedApproval) return;
    try {
      const payload: Record<string, unknown> = { action, comment: comment || null };
      if (action === "approve" && selectedSignatureId) {
        payload.signatureId = selectedSignatureId;
      }
      const res = await fetch(`${API_BASE}/approvals/${selectedApproval.id}/steps/${stepId}/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast({ title: err?.error || "처리에 실패했습니다", variant: "destructive" });
        return;
      }
      queryClient.invalidateQueries({ queryKey: getListApprovalsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetApprovalStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetExecutiveKpiQueryKey() });
      toast({ title: action === "approve" ? "결재 단계가 승인되었습니다" : "결재 단계가 반려되었습니다" });
      setSelectedApproval(null);
    } catch {
      toast({ title: "처리에 실패했습니다", variant: "destructive" });
    }
  }

  function openRejectDialog(id: number) {
    setRejectingId(id);
    setRejectReason("");
    setRejectDialogOpen(true);
  }

  async function handleReject() {
    if (!rejectingId || !rejectReason.trim()) return;
    try {
      await rejectMutation.mutateAsync({
        id: rejectingId,
        data: { reason: rejectReason },
      });
      queryClient.invalidateQueries({ queryKey: getListApprovalsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetApprovalStatsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetExecutiveKpiQueryKey() });
      toast({ title: "결재가 반려되었습니다" });
      setRejectDialogOpen(false);
      setSelectedApproval(null);
    } catch {
      toast({ title: "반려 처리에 실패했습니다", variant: "destructive" });
    }
  }

  const filters = [
    { label: "전체", value: "" },
    { label: "대기중", value: "pending" },
    { label: "진행중", value: "in_progress" },
    { label: "승인", value: "approved" },
    { label: "반려", value: "rejected" },
  ];

  const isMultiStep = (a: ApprovalItem) => a.totalSteps > 1;
  const isSingleStepPending = (a: ApprovalItem) => !isMultiStep(a) && a.status === "pending";
  const isMultiStepInProgress = (a: ApprovalItem) => isMultiStep(a) && a.status === "in_progress";

  // [역할 라벨 SoT] @workspace/shared/role-labels 의 ROLE_LABELS 사용.
  const roleLabels: Record<string, string> = ROLE_LABELS;

  const stepStatusLabel = (status: string) => {
    switch (status) {
      case "pending": return "대기";
      case "approved": return "승인";
      case "rejected": return "반려";
      default: return status;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">결재함</h1>
          <p className="text-muted-foreground text-sm mt-1">
            결재 요청을 확인하고 승인 또는 반려 처리하세요
          </p>
        </div>
        <Button size="sm" className="gap-1" onClick={() => setLocation("/approvals/create")}>
          <Plus className="w-4 h-4" />
          결재 요청
        </Button>
      </div>

      <div className="flex gap-2">
        {filters.map((f) => (
          <Button
            key={f.value}
            variant={statusFilter === f.value && !showDrafts ? "default" : "outline"}
            size="sm"
            onClick={() => { setStatusFilter(f.value); setShowDrafts(false); }}
          >
            {f.label}
          </Button>
        ))}
        <Button
          variant={showDrafts ? "default" : "outline"}
          size="sm"
          onClick={() => setShowDrafts(!showDrafts)}
        >
          임시저장
        </Button>
      </div>

      {showDrafts ? (
        draftsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : drafts.length > 0 ? (
          <div className="space-y-3">
            {drafts.map((draft) => (
              <Card
                key={draft.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setLocation(`/approvals/create?draftId=${draft.id}`)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold">{draft.title || "임시 저장"}</p>
                        <Badge variant="secondary">임시저장</Badge>
                        <Badge variant="outline" className="text-xs">
                          {categoryLabel(draft.category)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(draft.createdAt)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardCheck className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">임시 저장된 결재 요청이 없습니다</p>
            </CardContent>
          </Card>
        )
      ) : isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : approvals && approvals.length > 0 ? (
        <div className="space-y-3">
          {(approvals as ApprovalItem[]).map((approval) => (
            <Card
              key={approval.id}
              data-testid={`approval-card-${approval.id}`}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedApproval(approval)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-semibold">{approval.title}</p>
                      {statusBadge(approval.status)}
                      <Badge variant="outline" className="text-xs">
                        {categoryLabel(approval.category)}
                      </Badge>
                      {isMultiStep(approval) && (
                        <Badge variant="outline" className="text-xs gap-1">
                          <Users className="w-3 h-3" />
                          {approval.currentStep}/{approval.totalSteps}단계
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {approval.description}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>요청자: {approval.requesterName}</span>
                      <span>
                        {formatDate(approval.createdAt)}
                      </span>
                      {approval.vendorName && (
                        <span>업체: {approval.vendorName}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-4">
                    {approval.estimatedAmount != null && (
                      <div className="text-right">
                        <p className="text-sm font-bold">
                          {"\u20A9"}{approval.estimatedAmount.toLocaleString()}
                        </p>
                      </div>
                    )}
                    {isManager && isSingleStepPending(approval) && (
                      <div className="flex gap-1 ml-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-11 w-11 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleApprove(approval.id);
                          }}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-11 w-11 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            openRejectDialog(approval.id);
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <ClipboardCheck className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">결재 요청이 없습니다</p>
          </CardContent>
        </Card>
      )}

      <ResponsiveDialog
        open={!!selectedApproval}
        onOpenChange={(open) => !open && setSelectedApproval(null)}
      >
        {selectedApproval && (
          <ResponsiveDialogContent className="max-w-lg">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5" />
                결재 상세
              </ResponsiveDialogTitle>
            </ResponsiveDialogHeader>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-lg">
                  {selectedApproval.title}
                </span>
                {statusBadge(selectedApproval.status)}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">분류</p>
                  <p className="font-medium">
                    {categoryLabel(selectedApproval.category)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">요청자</p>
                  <p className="font-medium">{selectedApproval.requesterName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">요청일</p>
                  <p className="font-medium">
                    {formatDate(selectedApproval.createdAt)}
                  </p>
                </div>
                {selectedApproval.estimatedAmount != null && (
                  <div>
                    <p className="text-muted-foreground">예상 금액</p>
                    <p className="font-medium flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />{"\u20A9"}
                      {selectedApproval.estimatedAmount.toLocaleString()}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <p className="text-muted-foreground text-sm mb-1">내용</p>
                <div className="p-3 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap">
                  {selectedApproval.description}
                </div>
              </div>

              {selectedApproval.vendorName && (
                <div>
                  <p className="text-muted-foreground text-sm mb-1">업체 정보</p>
                  <p className="text-sm font-medium">
                    {selectedApproval.vendorName}
                  </p>
                </div>
              )}

              {selectedApproval.vendorQuoteDetails && (
                <div>
                  <p className="text-muted-foreground text-sm mb-1">견적 상세</p>
                  <div className="p-3 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap">
                    {selectedApproval.vendorQuoteDetails}
                  </div>
                </div>
              )}

              {selectedApproval.urgentExecution && (
                <div className="rounded-md border border-orange-300 bg-orange-50 p-3 text-sm space-y-1">
                  <p className="font-medium text-orange-800 flex items-center gap-1">
                    <DollarSign className="w-4 h-4" /> 긴급집행 (사후결재)
                  </p>
                  {selectedApproval.urgentConsentMemo && (
                    <p className="text-xs text-orange-800 whitespace-pre-wrap">
                      유선 동의 메모: {selectedApproval.urgentConsentMemo}
                    </p>
                  )}
                </div>
              )}

              {approvalSteps.length > 0 && (
                <div>
                  <p className="text-muted-foreground text-sm mb-2 flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    결재선 ({selectedApproval.currentStep}/{selectedApproval.totalSteps}단계)
                  </p>
                  <div className="space-y-2">
                    {approvalSteps.map((step) => {
                      const isCurrent = step.stepOrder === selectedApproval.currentStep;
                      // [Task #611] 전자 결재(electronic) 단계만 결재자 본인이 직접 처리.
                      // [Task #707 review fix] 경리는 결재 결정권자에서 제외됐다.
                      //   기존에 라인에 남아 있는 경리 단계가 있더라도 화면에서
                      //   approve/reject 버튼을 띄우지 않는다 (서버도 거부하므로
                      //   UX/실제 동작을 일치시킨다).
                      const canProcess =
                        isCurrent &&
                        step.status === "pending" &&
                        step.approverId === user?.id &&
                        step.approverRole !== "accountant" &&
                        step.path !== "offline";
                      const isOffline = step.path === "offline";
                      const isRequester =
                        !!user &&
                        (selectedApproval.requesterId === user.id || user.role === "platform_admin");
                      // [Task #707 review fix] 백엔드는 같은 건물의 관리소장·경리에게도
                      //   서명본 업로드 / 오프라인 마감을 허용한다. 화면도 동일하게
                      //   적용 — 활성 건물이 결재의 buildingId 와 일치할 때만 노출.
                      const isSameBuildingStaff =
                        !!user &&
                        (user.role === "manager" || user.role === "accountant") &&
                        building?.id != null &&
                        selectedApproval.buildingId === building.id;
                      const canManageOffline = isRequester || isSameBuildingStaff;
                      const canCloseOffline =
                        isOffline &&
                        isCurrent &&
                        step.status === "pending" &&
                        canManageOffline;
                      const stepCopies = signedCopiesByStep[step.id] ?? [];
                      return (
                        <div
                          key={step.id}
                          className={`p-2 rounded-lg border ${isCurrent ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-xs shrink-0">
                                {step.stepOrder}단계
                              </Badge>
                              <span className="text-sm font-medium">{step.approverName}</span>
                              <span className="text-xs text-muted-foreground">
                                ({roleLabels[step.approverRole] || step.approverRole})
                              </span>
                              {isOffline && (
                                <Badge variant="outline" className="text-[10px] text-orange-700 border-orange-400">
                                  오프라인
                                </Badge>
                              )}
                              {step.signedCopyMissing && (
                                <Badge variant="destructive" className="text-[10px]">
                                  서명본 미첨부
                                </Badge>
                              )}
                            </div>
                            <Badge
                              variant={step.status === "approved" ? "default" : step.status === "rejected" ? "destructive" : "secondary"}
                              className="text-xs"
                            >
                              {stepStatusLabel(step.status)}
                            </Badge>
                          </div>
                          {step.comment && (
                            <p className="text-xs text-muted-foreground mt-1 ml-16">{step.comment}</p>
                          )}
                          {step.processedAt && (
                            <p className="text-xs text-muted-foreground mt-1 ml-16">
                              처리: {formatDate(step.processedAt)}
                            </p>
                          )}
                          {/* [Task #611] 오프라인 단계 — 서명본 업로드 슬롯 (모두에게 표시, 업로드는 권한 있는 사용자만) */}
                          {isOffline && (
                            <div className="mt-2 ml-16">
                              <SignedCopyUploader
                                approvalId={selectedApproval.id}
                                stepId={step.id}
                                kind="offline_scan"
                                existing={stepCopies}
                                disabled={!canManageOffline}
                                onUploaded={(summary) => {
                                  setSignedCopiesByStep((prev) => ({
                                    ...prev,
                                    [step.id]: [summary, ...(prev[step.id] ?? [])],
                                  }));
                                }}
                              />
                            </div>
                          )}
                          {/* [Task #758] 미가입 결재자(관리인/본부장) 에게 일회용 전자서명 링크 발송. */}
                          {isCurrent && (step.status === "pending" || step.status === "awaiting_offline") && canManageOffline && (
                            <GuestSignaturePanel
                              approvalId={selectedApproval.id}
                              stepId={step.id}
                              approverName={step.approverName}
                              approverRole={roleLabels[step.approverRole] || step.approverRole}
                              apiBase={API_BASE}
                              token={token}
                            />
                          )}
                          {canCloseOffline && (
                            <div className="mt-2 ml-16 flex gap-2">
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 h-7 text-xs"
                                disabled={
                                  offlineProcessingStepId === step.id ||
                                  stepCopies.length === 0
                                }
                                onClick={() => handleOfflineProcess(step.id, "approve")}
                                title={stepCopies.length === 0 ? "서명본을 1장 이상 첨부하세요" : ""}
                              >
                                <Check className="w-3 h-3 mr-1" />
                                오프라인 결재완료
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-7 text-xs"
                                disabled={offlineProcessingStepId === step.id}
                                onClick={() => {
                                  const reason = prompt("반려 사유를 입력하세요:");
                                  if (reason) handleOfflineProcess(step.id, "reject", reason);
                                }}
                              >
                                <X className="w-3 h-3 mr-1" /> 반려
                              </Button>
                            </div>
                          )}
                          {canProcess && (
                            <div className="mt-2 ml-16 space-y-2">
                              {userSignatures.length > 0 && (
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">서명:</span>
                                  <select
                                    className="text-xs border rounded px-2 py-1"
                                    value={selectedSignatureId ?? ""}
                                    onChange={(e) => setSelectedSignatureId(e.target.value ? Number(e.target.value) : null)}
                                  >
                                    <option value="">서명 없음</option>
                                    {userSignatures.map((sig) => (
                                      <option key={sig.id} value={sig.id}>
                                        {sig.signatureType === "text" ? sig.signatureData : `서명 #${sig.id}`}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="bg-green-600 hover:bg-green-700 h-7 text-xs"
                                  onClick={() => handleStepProcess(step.id, "approve")}
                                >
                                  <Check className="w-3 h-3 mr-1" /> 승인
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    const reason = prompt("반려 사유를 입력하세요:");
                                    if (reason) {
                                      handleStepProcess(step.id, "reject", reason);
                                    }
                                  }}
                                >
                                  <X className="w-3 h-3 mr-1" /> 반려
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedApproval.approverName && !isMultiStep(selectedApproval) && (
                <div>
                  <p className="text-muted-foreground text-sm mb-1">결재자</p>
                  <p className="text-sm font-medium">
                    {selectedApproval.approverName}
                    {selectedApproval.approvedAt &&
                      ` (${formatDate(selectedApproval.approvedAt)})`}
                  </p>
                </div>
              )}

              {selectedApproval.rejectionReason && (
                <div>
                  <p className="text-muted-foreground text-sm mb-1">반려 사유</p>
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
                    {selectedApproval.rejectionReason}
                  </div>
                </div>
              )}

              {/* [Task #707] 결재 최종 승인 후 "계약·증빙 등록" 단계 — 미등록이면 폼,
                  등록 완료면 요약 카드 노출. 권한은 서버에서 한 번 더 확인. */}
              {selectedApproval.status === "approved" && selectedApproval.awaitingContractEvidence && (
                <ContractEvidenceRegistration
                  approvalId={selectedApproval.id}
                  defaultVendorName={selectedApproval.vendorName}
                  urgentExecution={selectedApproval.urgentExecution}
                  onRegistered={() => {
                    // 캐시 무효화 → 상세가 다시 로드되며 이 섹션이 요약으로 바뀐다.
                    queryClient.invalidateQueries({ queryKey: getListApprovalsQueryKey() });
                    queryClient.invalidateQueries({ queryKey: getGetApprovalStatsQueryKey() });
                    setSelectedApproval(null);
                  }}
                />
              )}

              {selectedApproval.status === "approved" && selectedApproval.contractEvidenceRegisteredAt && (
                <div className="rounded-md border border-green-300 bg-green-50/60 p-3 text-sm space-y-2" data-testid="contract-evidence-summary">
                  <p className="font-medium text-green-900 flex items-center gap-1">
                    <Check className="w-4 h-4" /> 계약·증빙 등록됨
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {/* [Task #707 review fix] 다중 첨부 — 본체 단일 컬럼이 비어 있어도
                        자식 테이블의 contractFiles 가 있으면 모두 노출. */}
                    {(() => {
                      const contractList = (contractFilesByApproval[selectedApproval.id] ?? []).filter((f) => f.kind === "contract");
                      const taxList = (contractFilesByApproval[selectedApproval.id] ?? []).filter((f) => f.kind === "tax_invoice");
                      return (
                        <>
                          {(contractList.length > 0 || selectedApproval.contractFileName) && (
                            <div className="col-span-2">
                              <span className="text-muted-foreground">계약서: </span>
                              {contractList.length > 0 ? (
                                <ul className="mt-1 space-y-0.5">
                                  {contractList.map((f) => (
                                    <li key={f.id}>
                                      <a href={f.fileUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                                        {f.fileName}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              ) : selectedApproval.contractFileUrl ? (
                                <a href={selectedApproval.contractFileUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                                  {selectedApproval.contractFileName}
                                </a>
                              ) : (
                                <span>{selectedApproval.contractFileName}</span>
                              )}
                            </div>
                          )}
                          {selectedApproval.taxInvoicePending ? (
                            <div className="col-span-2">
                              <span className="text-muted-foreground">세금계산서: </span>
                              <span className="text-amber-800">미발행 — {selectedApproval.taxInvoicePendingReason}</span>
                            </div>
                          ) : (taxList.length > 0 || selectedApproval.taxInvoiceFileName) ? (
                            <div className="col-span-2">
                              <span className="text-muted-foreground">세금계산서: </span>
                              {taxList.length > 0 ? (
                                <ul className="mt-1 space-y-0.5">
                                  {taxList.map((f) => (
                                    <li key={f.id}>
                                      <a href={f.fileUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                                        {f.fileName}
                                      </a>
                                    </li>
                                  ))}
                                </ul>
                              ) : selectedApproval.taxInvoiceFileUrl ? (
                                <a href={selectedApproval.taxInvoiceFileUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                                  {selectedApproval.taxInvoiceFileName}
                                </a>
                              ) : (
                                <span>{selectedApproval.taxInvoiceFileName}</span>
                              )}
                            </div>
                          ) : null}
                        </>
                      );
                    })()}
                    {selectedApproval.contractStartDate && selectedApproval.contractEndDate && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">계약 기간: </span>
                        {selectedApproval.contractStartDate} ~ {selectedApproval.contractEndDate}
                      </div>
                    )}
                  </div>
                  {(selectedApproval.installmentMonths || selectedApproval.installmentTotalAmount) && (
                    <div className="rounded border border-amber-200 bg-white/60 p-2 mt-2" data-testid="contract-evidence-installment-summary">
                      <p className="text-xs font-medium text-amber-900 mb-1">분리부과 (부속명세서 자리표시)</p>
                      <div className="grid grid-cols-2 gap-1 text-[11px]">
                        {selectedApproval.installmentTotalAmount != null && (
                          <div>총액: {Number(selectedApproval.installmentTotalAmount).toLocaleString()}원</div>
                        )}
                        {selectedApproval.installmentMonths != null && (
                          <div>{selectedApproval.installmentMonths}개월</div>
                        )}
                        {selectedApproval.installmentMonthlyAmount != null && (
                          <div>월 {Number(selectedApproval.installmentMonthlyAmount).toLocaleString()}원</div>
                        )}
                        {selectedApproval.installmentStartDate && selectedApproval.installmentEndDate && (
                          <div>{selectedApproval.installmentStartDate} ~ {selectedApproval.installmentEndDate}</div>
                        )}
                      </div>
                    </div>
                  )}
                  {selectedApproval.contractEvidenceRegisteredByName && (
                    <p className="text-[11px] text-muted-foreground">
                      등록: {selectedApproval.contractEvidenceRegisteredByName}
                      {selectedApproval.contractEvidenceRegisteredAt &&
                        ` (${formatDate(selectedApproval.contractEvidenceRegisteredAt)})`}
                    </p>
                  )}
                </div>
              )}
            </div>

            {isManager && isSingleStepPending(selectedApproval) && (
              <ResponsiveDialogFooter className="mt-4">
                <Button
                  variant="outline"
                  className="text-red-600"
                  onClick={() => {
                    openRejectDialog(selectedApproval.id);
                  }}
                >
                  <X className="w-4 h-4 mr-1" /> 반려
                </Button>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={() => handleApprove(selectedApproval.id)}
                >
                  <Check className="w-4 h-4 mr-1" /> 승인
                </Button>
              </ResponsiveDialogFooter>
            )}
          </ResponsiveDialogContent>
        )}
      </ResponsiveDialog>

      <ResponsiveDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>결재 반려</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <div className="space-y-3">
            <Label>반려 사유</Label>
            <Textarea
              placeholder="반려 사유를 입력하세요..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
            />
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              취소
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim()}
              onClick={handleReject}
            >
              반려 처리
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}
