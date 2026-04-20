import { useListApprovals } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { ClipboardCheck } from "lucide-react";
import { formatDate } from "@/lib/utils";

/**
 * Local view-model for the fields this widget actually renders.
 * The OpenAPI-generated response type is wider and (for legacy reasons)
 * loosely typed across approval flows; we narrow to exactly what the
 * widget needs and read fields defensively.
 */
interface PendingApprovalRow {
  id: number | string;
  title: string;
  requesterName?: string | null;
  createdAt?: string | null;
  estimatedAmount?: number | null;
}

/**
 * 결재 대기 위젯 — 자신의 결재 대기열 상위 3건을 보여주고 전체보기 링크를 제공.
 * 결재 시스템에 접근 가능한 모든 역할(관리소장 / 경리·행정 / 플랫폼 관리자)이
 * 동일한 컴포넌트를 사용한다.
 */
export default function PendingApprovalsWidget() {
  const { data: pending, isLoading } = useListApprovals({ status: "pending" });
  const items: PendingApprovalRow[] = (pending ?? []) as PendingApprovalRow[];
  const visible = items.slice(0, 3);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-chart-1" />
            결재
            {items.length > 0 && (
              <span className="text-xs font-normal text-muted-foreground ml-1">
                대기 {items.length}건
              </span>
            )}
          </h2>
          <p className="text-[10px] text-muted-foreground mt-1">
            나의 결재 대기 항목입니다
          </p>
        </div>
        <Link href="/approvals">
          <button className="text-xs text-primary hover:underline font-medium">
            전체 보기 →
          </button>
        </Link>
      </div>
      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-sm text-muted-foreground">
              결재 대기 중인 항목이 없습니다
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visible.map((a) => (
            <Link key={a.id} href="/approvals">
              <div className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{a.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {a.requesterName ? `요청자: ${a.requesterName} · ` : ""}
                    {a.createdAt ? formatDate(a.createdAt) : ""}
                  </p>
                </div>
                {typeof a.estimatedAmount === "number" && (
                  <span className="text-xs font-semibold shrink-0">
                    {"\u20A9"}
                    {a.estimatedAmount.toLocaleString()}
                  </span>
                )}
                <Badge variant="outline" className="text-[10px] shrink-0">
                  대기
                </Badge>
              </div>
            </Link>
          ))}
          {items.length > visible.length && (
            <p className="text-xs text-center text-muted-foreground pt-1">
              외 {items.length - visible.length}건 더 있음
            </p>
          )}
        </div>
      )}
    </div>
  );
}
