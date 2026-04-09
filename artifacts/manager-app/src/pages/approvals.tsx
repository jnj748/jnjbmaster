import { useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { CreateApprovalDialog } from "@/components/create-approval-dialog";
import {
  ClipboardCheck,
  Check,
  X,
  Eye,
  DollarSign,
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
    case "approved":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">승인</Badge>;
    case "rejected":
      return <Badge variant="destructive">반려</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

export default function Approvals() {
  const { user } = useAuth();
  const isExecutive = user?.role === "executive";
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [selectedApproval, setSelectedApproval] = useState<any>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: approvals, isLoading } = useListApprovals(
    statusFilter ? { status: statusFilter as any } : {}
  );

  const approveMutation = useApproveApproval();
  const rejectMutation = useRejectApproval();

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
    { label: "승인", value: "approved" },
    { label: "반려", value: "rejected" },
  ];

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
        {!isExecutive && <CreateApprovalDialog />}
      </div>

      <div className="flex gap-2">
        {filters.map((f) => (
          <Button
            key={f.value}
            variant={statusFilter === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : approvals && approvals.length > 0 ? (
        <div className="space-y-3">
          {approvals.map((approval) => (
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
                    {approval.estimatedAmount && (
                      <div className="text-right">
                        <p className="text-sm font-bold">
                          ₩{approval.estimatedAmount.toLocaleString()}
                        </p>
                      </div>
                    )}
                    {isExecutive && approval.status === "pending" && (
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
          <DialogContent className="max-w-lg">
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
                {selectedApproval.estimatedAmount && (
                  <div>
                    <p className="text-muted-foreground">예상 금액</p>
                    <p className="font-medium flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />₩
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

              {selectedApproval.approverName && (
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

            {isExecutive && selectedApproval.status === "pending" && (
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
