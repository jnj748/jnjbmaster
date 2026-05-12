// [Phase1 마무리 D] 매니저 대시보드 — 현장 방문 확인 필요 섹션.
//   파트너가 제안/확정/취소한 현장방문 알림(rfq_site_visit_proposed/confirmed/
//   cancelled) 을 별도 카드 섹션으로 노출해 RFQ 상세에서 일정을 확정/조정할 수
//   있도록 한다.
//
//   알림 데이터는 /api/notifications 의 미읽 + 위 세 notificationType 으로
//   필터링한다. 클릭 시 해당 RFQ 상세(/rfqs?openVisit={rfqId}) 로 이동하고,
//   서버에는 read 처리 PATCH 를 호출한다.
import { useMemo } from "react";
import { useLocation } from "wouter";
import {
  useListNotifications,
  useMarkNotificationRead,
  getListNotificationsQueryKey,
  type Notification,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck } from "lucide-react";

const SITE_VISIT_TYPES = new Set([
  "rfq_site_visit_proposed",
  "rfq_site_visit_confirmed",
  "rfq_site_visit_cancelled",
]);

function badgeFor(type: string): { text: string; cls: string } {
  if (type === "rfq_site_visit_proposed") {
    return { text: "방문 제안", cls: "text-blue-700 border-blue-300 bg-blue-50" };
  }
  if (type === "rfq_site_visit_confirmed") {
    return { text: "방문 확정", cls: "text-green-700 border-green-300 bg-green-50" };
  }
  return { text: "방문 취소", cls: "text-red-700 border-red-300 bg-red-50" };
}

export default function SiteVisitConfirmSectionWidget() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const markRead = useMarkNotificationRead();
  const { data } = useListNotifications({
    query: { staleTime: 60 * 1000 },
  });
  const items = useMemo(() => {
    const list = (data ?? []) as Notification[];
    return list
      .filter(
        (n) =>
          !n.isRead &&
          SITE_VISIT_TYPES.has(n.notificationType) &&
          n.relatedEntityType === "rfq" &&
          typeof n.relatedEntityId === "number",
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, 5);
  }, [data]);

  if (items.length === 0) return null;

  const handleClick = (n: Notification) => {
    const rfqId = n.relatedEntityId as number;
    markRead.mutate(
      { id: n.id },
      {
        onSettled: () => {
          queryClient.invalidateQueries({
            queryKey: getListNotificationsQueryKey(),
          });
        },
      },
    );
    navigate(`/rfqs?openVisit=${rfqId}`);
  };

  return (
    <Card
      className="border-blue-200"
      data-testid="card-site-visit-confirm-section"
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarCheck className="w-4 h-4 text-blue-600 shrink-0" />
          <h3 className="text-base font-bold">현장 방문 확인 필요</h3>
          <Badge variant="outline" className="text-[10px] h-5">
            {items.length}건
          </Badge>
        </div>
        <div className="space-y-2">
          {items.map((n) => {
            const b = badgeFor(n.notificationType);
            return (
              <div
                key={n.id}
                className="flex items-start gap-3 p-2 rounded-lg border bg-card"
                data-testid={`item-site-visit-${n.id}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge variant="outline" className={`text-[10px] h-5 ${b.cls}`}>
                      {b.text}
                    </Badge>
                    <p className="text-sm font-medium truncate">{n.title}</p>
                  </div>
                  {n.message && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {n.message}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 h-8 text-xs"
                  onClick={() => handleClick(n)}
                  data-testid={`button-site-visit-confirm-${n.id}`}
                >
                  방문 일정 확인
                </Button>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
