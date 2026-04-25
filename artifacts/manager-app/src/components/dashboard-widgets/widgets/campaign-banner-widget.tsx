import { useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { useLocation } from "wouter";
import { Megaphone, Trophy, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useListActiveCampaigns,
  useRecordCampaignImpression,
  useRecordCampaignCtaClick,
  useDismissCampaign,
  useMarkCampaignRead,
  getListActiveCampaignsQueryKey,
  type ActiveCampaign,
} from "@workspace/api-client-react";

const TYPE_RANK: Record<string, number> = {
  required: 0,
  suggested: 1,
  other: 2,
};

export function CampaignBannerWidget() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: campaigns = [] } = useListActiveCampaigns({
    query: { staleTime: 60_000, refetchInterval: 5 * 60_000 },
  });
  const recordCta = useRecordCampaignCtaClick();
  const dismiss = useDismissCampaign();
  const recordImpression = useRecordCampaignImpression();
  const markRead = useMarkCampaignRead();

  const banner = useMemo<ActiveCampaign | null>(() => {
    const eligible = campaigns
      .filter(
        (c) =>
          (c.channels ?? []).includes("banner") &&
          c.impressionCount < c.maxImpressionsPerUser,
      )
      .sort(
        (a, b) =>
          (TYPE_RANK[a.type] ?? 9) - (TYPE_RANK[b.type] ?? 9) ||
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      );
    return eligible[0] ?? null;
  }, [campaigns]);

  // [Task #283] 배너 노출 추적: 배너가 화면에 그려질 때 캠페인 ID 별 1회씩 임프레션을 적재.
  //   세션 동안 중복 호출을 방지해 maxImpressionsPerUser 정책이 배너 채널에서도 동작하게 한다.
  const recordedRef = useRef<Set<number>>(new Set());
  useEffect(() => {
    if (!banner) return;
    if (recordedRef.current.has(banner.id)) return;
    recordedRef.current.add(banner.id);
    recordImpression
      .mutateAsync({ id: banner.id })
      .then(() =>
        queryClient.invalidateQueries({ queryKey: getListActiveCampaignsQueryKey() }),
      )
      .catch(() => undefined);
  }, [banner, queryClient, recordImpression]);

  if (!banner) return null;

  function refresh() {
    queryClient.invalidateQueries({ queryKey: getListActiveCampaignsQueryKey() });
  }

  async function handleCta() {
    if (!banner) return;
    try {
      await recordCta.mutateAsync({ id: banner.id });
      await markRead.mutateAsync({ id: banner.id });
      // [Task #283] 노출은 첫 렌더 useEffect에서 1회만 기록한다.
      //   CTA 클릭 시 추가 기록하면 동일 노출이 중복 카운트되어
      //   maxImpressionsPerUser 캡에 조기 도달한다.
    } catch {
      /* tolerate */
    }
    if (banner.ctaUrl) {
      if (banner.ctaUrl.startsWith("http")) {
        window.open(banner.ctaUrl, "_blank", "noopener");
      } else {
        setLocation(banner.ctaUrl);
      }
    }
    refresh();
  }

  async function handleDismiss(mode: "today" | "forever" = "today") {
    if (!banner) return;
    try {
      await dismiss.mutateAsync({ id: banner.id, data: { mode } });
    } catch {
      /* tolerate */
    }
    refresh();
  }

  return (
    <Card className="border-blue-200 bg-card" data-testid="campaign-banner">
      <CardContent className="p-3 flex items-start gap-3">
        {/* [사용자 요청 2026-04] 아이콘 컨테이너 배경 제거 — 색은 아이콘만으로 표현. */}
        <div className="shrink-0 w-9 h-9 rounded-full text-blue-700 flex items-center justify-center">
          <Megaphone className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm text-slate-900 truncate">{banner.title}</p>
            {banner.type === "required" && (
              <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 text-[10px]">
                필수
              </Badge>
            )}
            {banner.type === "suggested" && (
              <Badge variant="outline" className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]">
                제안
              </Badge>
            )}
          </div>
          {/* [Task #283] 본문은 마크다운 리치텍스트로 렌더한다. line-clamp 유지 위해 prose 사용. */}
          <div className="text-xs text-slate-600 line-clamp-2 mt-0.5 prose prose-xs max-w-none">
            <ReactMarkdown>{banner.body}</ReactMarkdown>
          </div>
          {banner.achievementText && (
            <p className="text-[11px] text-amber-700 mt-1 inline-flex items-center gap-1">
              <Trophy className="w-3 h-3" />
              {banner.achievementText}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2">
            {banner.ctaLabel && (
              <Button size="sm" className="h-7 text-xs" onClick={handleCta} data-testid="campaign-banner-cta">
                {banner.ctaLabel}
              </Button>
            )}
            {banner.type !== "required" && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => handleDismiss("today")}
                  data-testid="campaign-banner-dismiss-today"
                >
                  오늘은 그만
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-slate-500"
                  onClick={() => handleDismiss("forever")}
                  data-testid="campaign-banner-dismiss-forever"
                >
                  다시 보지 않기
                </Button>
              </>
            )}
          </div>
        </div>
        {banner.type !== "required" && (
          <button
            type="button"
            onClick={() => handleDismiss("today")}
            className="text-slate-400 hover:text-slate-600 p-1 -m-1"
            aria-label="배너 닫기"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </CardContent>
    </Card>
  );
}
