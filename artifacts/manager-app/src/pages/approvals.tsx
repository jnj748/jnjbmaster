import { useState, useEffect } from "react";
import {
  useListApprovals,
  useApproveApproval,
  useRejectApproval,
  getListApprovalsQueryKey,
  getGetApprovalStatsQueryKey,
  getGetExecutiveKpiQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
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
  const [, setLocation] = useLocation();
  const isExecutive = user?.role === "executive";
  const isManager = user?.role === "manager";
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedApproval, setSelectedApproval] = useState<ApprovalItem | null>(null);
  const [approvalSteps, setApprovalSteps] = useState<ApprovalStep[]>([]);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [userSignatures, setUserSignatures] = useState<SignatureItem[]>([]);
  const [selectedSignatureId, setSelectedSignatureId] = useState<number | null>(null);
  const [showDrafts, setShowDrafts] = useState(false);
  const [drafts, setDrafts] = useState<ApprovalItem[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const BASE = import.meta.env.BASE_URL ?? "/";
  const API_BASE = `${BASE}api`;

  const { data: approvals, isLoading } = useListApprovals(
    statusFilter ? { status: statusFilter } : {}
  );

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
    if (selectedApproval && selectedApproval.totalSteps > 1) {
      fetch(`${API_BASE}/approvals/${selectedApproval.id}/steps`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => (res.ok ? res.json() : []))
        .then((data: ApprovalStep[]) => setApprovalSteps(data))
        .catch(() => setApprovalSteps([]));
    } else {
      setApprovalSteps([]);
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
  }, [selectedApproval, API_BASE, token]);

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

  const roleLabels: Record<string, string> = {
    manager: "관리소장",
    executive: "본부장",
    facility_staff: "시설관리 담당자",
  };

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
            {isExecutive
              ? "결재 요청을 확인하고 승인 또는 반려 처리하세요"
              : "제출한 결재 요청의 처리 현황을 확인하세요"}
          </p>
        </div>
        {!isExecutive && (
          <Button size="sm" className="gap-1" onClick={() => setLocation("/approvals/create")}>
            <Plus className="w-4 h-4" />
            결재 요청
          </Button>
        )}
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
        {!isExecutive && (
          <Button
            variant={showDrafts ? "default" : "outline"}
            size="sm"
            onClick={() => setShowDrafts(!showDrafts)}
          >
            임시저장
          </Button>
        )}
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
                    {isExecutive && isSingleStepPending(approval) && (
                      <div className="flex gap-1 ml-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
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
                          className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
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

      <Dialog
        open={!!selectedApproval}
        onOpenChange={(open) => !open && setSelectedApproval(null)}
      >
        {selectedApproval && (
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5" />
                결재 상세
              </DialogTitle>
            </DialogHeader>
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

              {isMultiStep(selectedApproval) && approvalSteps.length > 0 && (
                <div>
                  <p className="text-muted-foreground text-sm mb-2 flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    결재선 ({selectedApproval.currentStep}/{selectedApproval.totalSteps}단계)
                  </p>
                  <div className="space-y-2">
                    {approvalSteps.map((step) => {
                      const isCurrent = step.stepOrder === selectedApproval.currentStep;
                      const canProcess = isCurrent && step.status === "pending" && step.approverId === user?.userId;
                      return (
                        <div
                          key={step.id}
                          className={`p-2 rounded-lg border ${isCurrent ? "border-blue-300 bg-blue-50" : "border-gray-200"}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs shrink-0">
                                {step.stepOrder}단계
                              </Badge>
                              <span className="text-sm font-medium">{step.approverName}</span>
                              <span className="text-xs text-muted-foreground">
                                ({roleLabels[step.approverRole] || step.approverRole})
                              </span>
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
            </div>

            {isExecutive && isSingleStepPending(selectedApproval) && (
              <DialogFooter className="mt-4">
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
              </DialogFooter>
            )}
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>결재 반려</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Label>반려 사유</Label>
            <Textarea
              placeholder="반려 사유를 입력하세요..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
