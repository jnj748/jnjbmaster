import { useEffect, useState } from "react";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { StarRating, VendorRatingInline } from "@/components/star-rating";
import { useListVendorReviews, type VendorReviewWithContext } from "@workspace/api-client-react";
import { formatDate } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  vendor: { id: number; name: string; avgRating?: number | null; reviewCount?: number | null } | null;
}

// 협력업체에 누적된 별점·한줄평을 최신순으로 보여주는 다이얼로그.
const PAGE_SIZE = 20;

export function VendorReviewsListDialog({ open, onOpenChange, vendor }: Props) {
  // [Task #339] limit 만 키우는 단순한 "더보기" 페이지네이션.
  const [limit, setLimit] = useState(PAGE_SIZE);
  useEffect(() => {
    if (open) setLimit(PAGE_SIZE);
  }, [open, vendor?.id]);

  const { data, isLoading, isFetching } = useListVendorReviews(
    vendor?.id ?? 0,
    { limit },
    { query: { enabled: open && !!vendor?.id } },
  );
  const canLoadMore = !!data && data.length >= limit;

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{vendor?.name ?? ""} 평가</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-3">
          {vendor && (
            <div className="rounded-md border bg-muted/30 px-3 py-2 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">평균 별점</span>
              <VendorRatingInline avgRating={vendor.avgRating} reviewCount={vendor.reviewCount} />
            </div>
          )}
          {isLoading ? (
            <p className="text-sm text-muted-foreground">불러오는 중…</p>
          ) : !data || data.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              아직 등록된 평가가 없습니다
            </p>
          ) : (
            <ScrollArea className="max-h-[60vh]">
              <ul className="space-y-3 pr-2">
                {data.map((r: VendorReviewWithContext) => (
                  <li
                    key={r.id}
                    className="rounded-md border p-3 space-y-1.5"
                    data-testid={`review-item-${r.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <StarRating value={r.rating} readOnly size={16} />
                      <span className="text-xs text-muted-foreground">
                        {formatDate(r.createdAt)}
                      </span>
                    </div>
                    {(r.workReportTitle || r.buildingName) && (
                      <p className="text-xs text-muted-foreground">
                        {[r.buildingName, r.workReportTitle].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {r.comment && <p className="text-sm whitespace-pre-wrap">{r.comment}</p>}
                  </li>
                ))}
              </ul>
              {canLoadMore && (
                <div className="flex justify-center pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isFetching}
                    onClick={() => setLimit((n) => n + PAGE_SIZE)}
                    data-testid="reviews-load-more"
                  >
                    {isFetching ? "불러오는 중…" : "더보기"}
                  </Button>
                </div>
              )}
            </ScrollArea>
          )}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
