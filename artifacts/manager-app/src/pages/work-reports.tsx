import { useState } from "react";
import {
  useListWorkReports,
  useUpdateWorkReport,
  getListWorkReportsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import {
  ClipboardCheck,
  CheckCircle,
  XCircle,
  Eye,
  Image,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import {
  IntermediaryDisclaimerBanner,
  InspectionCompletionConfirmDialog,
} from "@/components/intermediary-disclaimer";

export default function WorkReports() {
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const queryParams: any = {};
  if (filterStatus && filterStatus !== "all") {
    queryParams.status = filterStatus;
  }
  const { data: reports, isLoading } = useListWorkReports(queryParams);
  const updateMutation = useUpdateWorkReport();

  const reviewingReport = reports?.find((r: any) => r.id === reviewId);

  async function handleReview(status: "approved" | "rejected") {
    if (!reviewId) return;
    await updateMutation.mutateAsync({
      id: reviewId,
      data: { status, reviewNotes: reviewNotes || null },
    });
    queryClient.invalidateQueries({ queryKey: getListWorkReportsQueryKey() });
    toast({ title: status === "approved" ? "검수 승인되었습니다" : "검수 반려되었습니다" });
    setReviewId(null);
    setReviewNotes("");
  }

  const statusLabel = (s: string) => {
    switch (s) {
      case "submitted": return "검수 대기";
      case "approved": return "승인";
      case "rejected": return "반려";
      default: return s;
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "submitted": return "secondary";
      case "approved": return "default";
      case "rejected": return "destructive";
      default: return "outline";
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">작업 완료 보고</h1>
        <p className="text-muted-foreground text-sm mt-1">
          업체가 제출한 작업 완료 보고서를 검수합니다
        </p>
      </div>

      <div className="flex gap-3">
        <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="상태" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="submitted">검수 대기</SelectItem>
            <SelectItem value="approved">승인</SelectItem>
            <SelectItem value="rejected">반려</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : reports && reports.length > 0 ? (
        <div className="space-y-3">
          {reports.map((report: any) => (
            <Card key={report.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <ClipboardCheck className="w-4 h-4 text-primary" />
                      <h3 className="font-medium">{report.title}</h3>
                      <Badge variant={statusColor(report.status) as any}>
                        {statusLabel(report.status)}
                      </Badge>
                    </div>
                    <div className="flex gap-4 text-sm text-muted-foreground mt-2">
                      <span>업체: {report.vendorName}</span>
                      <span>완료일: {formatDate(report.completionDate)}</span>
                      <span>제출일: {new Date(report.createdAt).toLocaleDateString("ko-KR")}</span>
                    </div>
                    {report.description && (
                      <p className="text-sm text-muted-foreground mt-2">{report.description}</p>
                    )}
                    {report.photoUrls && (
                      <div className="flex items-center gap-1 mt-2 text-sm text-blue-600">
                        <Image className="w-3.5 h-3.5" />
                        첨부 사진 {report.photoUrls.split(",").length}장
                      </div>
                    )}
                    {report.reviewNotes && (
                      <p className="text-sm mt-2 p-2 bg-muted rounded">
                        검수 의견: {report.reviewNotes}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {report.status === "submitted" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => { setReviewId(report.id); setReviewNotes(""); }}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        검수
                      </Button>
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
            <p className="text-muted-foreground">작업 완료 보고가 없습니다</p>
          </CardContent>
        </Card>
      )}

      <ResponsiveDialog open={reviewId !== null} onOpenChange={(o) => { if (!o) { setReviewId(null); setReviewNotes(""); } }}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>작업 완료 검수</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          {reviewingReport && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                <p><strong>제목:</strong> {reviewingReport.title}</p>
                <p><strong>업체:</strong> {reviewingReport.vendorName}</p>
                <p><strong>완료일:</strong> {formatDate(reviewingReport.completionDate)}</p>
                {reviewingReport.description && <p><strong>설명:</strong> {reviewingReport.description}</p>}
              </div>
              {reviewingReport.photoUrls && (
                <div>
                  <Label className="text-sm font-medium">첨부 사진</Label>
                  <div className="flex gap-2 mt-1 flex-wrap">
                    {reviewingReport.photoUrls.split(",").map((url: string, i: number) => (
                      <div key={i} className="w-20 h-20 bg-muted rounded flex items-center justify-center text-xs text-muted-foreground border">
                        <Image className="w-6 h-6" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <Label>검수 의견</Label>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="검수 결과에 대한 의견을 입력하세요"
                />
              </div>
              <IntermediaryDisclaimerBanner variant="contract" />
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => setConfirmOpen(true)}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  검수 승인
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => handleReview("rejected")}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  반려
                </Button>
              </div>
            </div>
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      <InspectionCompletionConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => handleReview("approved")}
        contextRef={reviewId ? `work_report:${reviewId}` : undefined}
      />
    </div>
  );
}
