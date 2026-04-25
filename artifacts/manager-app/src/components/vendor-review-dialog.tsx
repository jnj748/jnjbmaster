import { useEffect, useState } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StarRating } from "@/components/star-rating";
import { useToast } from "@/hooks/use-toast";
import {
  useGetWorkReportReview,
  useCreateVendorReview,
  useUpdateVendorReview,
  getListVendorsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workReportId: number | null;
  vendorName?: string;
  workReportTitle?: string;
}

// 작업완료보고 승인 직후, 또는 검수 화면에서 호출되는 별점·한줄평 입력 다이얼로그.
// 이미 평가가 있는 경우 자동으로 수정 모드로 전환되며, 작성 7일 경과 시 입력은 비활성화된다.
export function VendorReviewDialog({
  open,
  onOpenChange,
  workReportId,
  vendorName,
  workReportTitle,
}: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: existing, isLoading } = useGetWorkReportReview(workReportId ?? 0, {
    query: { enabled: open && workReportId != null && workReportId > 0 },
  });

  const createMutation = useCreateVendorReview();
  const updateMutation = useUpdateVendorReview();

  useEffect(() => {
    if (!open) {
      setRating(5);
      setComment("");
      setSubmitting(false);
      return;
    }
    if (existing?.review) {
      setRating(existing.review.rating);
      setComment(existing.review.comment ?? "");
    } else {
      setRating(5);
      setComment("");
    }
  }, [open, existing]);

  const isEdit = !!existing?.review;
  const canEdit = existing?.canEdit ?? true;
  const lockedForEdit = isEdit && !canEdit;

  async function handleSubmit() {
    if (!workReportId) return;
    if (rating < 1 || rating > 5) {
      toast({ title: "별점을 선택하세요", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      if (isEdit && existing?.review) {
        await updateMutation.mutateAsync({
          id: existing.review.id,
          data: { rating, comment: comment || null },
        });
        toast({ title: "평가가 수정되었습니다" });
      } else {
        await createMutation.mutateAsync({
          data: { workReportId, rating, comment: comment || null },
        });
        toast({ title: "평가가 등록되었습니다" });
      }
      // 협력업체 목록의 평균 별점 업데이트.
      queryClient.invalidateQueries({ queryKey: getListVendorsQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["/work-reports"] });
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: "평가 저장 실패",
        description: err?.message ?? "잠시 후 다시 시도해주세요",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {isEdit ? "협력업체 평가 수정" : "협력업체 평가 남기기"}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-4">
          {(vendorName || workReportTitle) && (
            <div className="rounded-md bg-muted/50 p-3 text-sm space-y-1">
              {workReportTitle && <p className="font-medium">{workReportTitle}</p>}
              {vendorName && <p className="text-muted-foreground">업체: {vendorName}</p>}
            </div>
          )}
          {isLoading ? (
            <p className="text-sm text-muted-foreground">불러오는 중…</p>
          ) : (
            <>
              <div>
                <Label className="mb-2 block">
                  별점 <span className="text-destructive">*</span>
                  <span className="ml-2 text-xs text-muted-foreground">0.5 단위 (1.0 ~ 5.0)</span>
                </Label>
                <div className="flex items-center gap-3">
                  <StarRating
                    value={rating}
                    onChange={setRating}
                    readOnly={lockedForEdit}
                  />
                  <span className="text-lg font-medium">{rating.toFixed(1)}</span>
                </div>
              </div>
              <div>
                <Label className="mb-1 block">한줄평 (선택)</Label>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="작업 품질, 친절도, 마감 등 짧게 남겨주세요"
                  maxLength={500}
                  disabled={lockedForEdit}
                />
              </div>
              {lockedForEdit && (
                <p className="text-xs text-amber-600">
                  작성 7일이 지나 더 이상 수정할 수 없습니다.
                </p>
              )}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => onOpenChange(false)}
                >
                  {isEdit ? "닫기" : "건너뛰기"}
                </Button>
                {!lockedForEdit && (
                  <Button
                    className="flex-1"
                    onClick={handleSubmit}
                    disabled={submitting}
                  >
                    {isEdit ? "수정" : "등록"}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
