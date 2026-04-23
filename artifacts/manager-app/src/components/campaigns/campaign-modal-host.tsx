import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useLocation } from "wouter";
import { Megaphone, Trophy } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  useListActiveCampaigns,
  useRecordCampaignImpression,
  useMarkCampaignRead,
  useRecordCampaignCtaClick,
  useDismissCampaign,
  getListActiveCampaignsQueryKey,
  type ActiveCampaign,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const TYPE_PRIORITY: Record<string, number> = {
  required: 0,
  suggested: 1,
  other: 2,
};

function pickNext(campaigns: ActiveCampaign[]): ActiveCampaign | null {
  // [Task #283] 모달 후보 필터: required 도 maxImpressionsPerUser 캡을 동일 적용한다.
  //   서버 modalEligible 로 1차 필터되며, 클라이언트에서도 동일 규칙으로 방어적 재필터.
  const eligible = campaigns.filter(
    (c) =>
      c.modalEligible &&
      (c.channels ?? []).includes("modal") &&
      c.impressionCount < c.maxImpressionsPerUser,
  );
  if (eligible.length === 0) return null;
  return [...eligible].sort(
    (a, b) =>
      (TYPE_PRIORITY[a.type] ?? 9) - (TYPE_PRIORITY[b.type] ?? 9) ||
      new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  )[0];
}

export function CampaignModalHost() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: campaigns = [] } = useListActiveCampaigns({
    query: { staleTime: 60_000, refetchInterval: 5 * 60_000 },
  });
  const recordImpression = useRecordCampaignImpression();
  const markRead = useMarkCampaignRead();
  const recordCta = useRecordCampaignCtaClick();
  const dismiss = useDismissCampaign();

  const [shownIds, setShownIds] = useState<Set<number>>(new Set());
  const [activeId, setActiveId] = useState<number | null>(null);

  const filteredCampaigns = useMemo(
    () => campaigns.filter((c) => !shownIds.has(c.id)),
    [campaigns, shownIds],
  );

  useEffect(() => {
    if (activeId !== null) return;
    const next = pickNext(filteredCampaigns);
    if (!next) return;
    setActiveId(next.id);
    setShownIds((prev) => new Set([...Array.from(prev), next.id]));
    recordImpression
      .mutateAsync({ id: next.id })
      .then(() =>
        queryClient.invalidateQueries({ queryKey: getListActiveCampaignsQueryKey() }),
      )
      .catch(() => undefined);
  }, [activeId, filteredCampaigns, queryClient, recordImpression]);

  const active = useMemo(
    () => campaigns.find((c) => c.id === activeId) ?? null,
    [campaigns, activeId],
  );

  function close(refresh = false) {
    setActiveId(null);
    if (refresh) {
      queryClient.invalidateQueries({ queryKey: getListActiveCampaignsQueryKey() });
    }
  }

  async function onCta() {
    if (!active) return;
    try {
      await recordCta.mutateAsync({ id: active.id });
      await markRead.mutateAsync({ id: active.id });
    } catch {
      /* tolerate */
    }
    if (active.ctaUrl) {
      if (active.ctaUrl.startsWith("http")) {
        window.open(active.ctaUrl, "_blank", "noopener");
      } else {
        setLocation(active.ctaUrl);
      }
    }
    close(true);
  }

  async function onDismiss(mode: "today" | "forever") {
    if (!active) return;
    try {
      await dismiss.mutateAsync({ id: active.id, data: { mode } });
    } catch {
      /* tolerate */
    }
    close(true);
  }

  if (!active) return null;

  const isRequired = active.type === "required";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        // Required campaigns are non-dismissible: only CTA can close them.
        if (!open && !isRequired) close(false);
      }}
    >
      <DialogContent
        className="max-w-md"
        data-testid="campaign-modal"
        onPointerDownOutside={(e) => {
          if (isRequired) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (isRequired) e.preventDefault();
        }}
        hideClose={isRequired}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-blue-600" />
            <span className="truncate">{active.title}</span>
          </DialogTitle>
          {active.achievementText && (
            <DialogDescription className="flex items-center gap-1 text-xs text-amber-700">
              <Trophy className="w-3 h-3" />
              {active.achievementText}
            </DialogDescription>
          )}
        </DialogHeader>
        {active.imageUrl && (
          <img
            src={active.imageUrl}
            alt=""
            className="w-full max-h-48 object-cover rounded"
          />
        )}
        {/* [Task #283] 본문은 마크다운으로 작성된 리치텍스트이므로 동일 렌더러로 표시. */}
        <div className="text-sm max-h-[40vh] overflow-y-auto text-slate-700 prose prose-sm max-w-none">
          <ReactMarkdown>{active.body}</ReactMarkdown>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          {!isRequired && (
            <>
              <Button variant="ghost" size="sm" onClick={() => onDismiss("forever")}>
                다시 보지 않기
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onDismiss("today")}>
                오늘은 그만
              </Button>
            </>
          )}
          {!isRequired && (
            <Button variant="outline" size="sm" onClick={() => close(false)}>
              닫기
            </Button>
          )}
          {active.ctaLabel ? (
            <Button size="sm" onClick={onCta} data-testid="campaign-cta">
              {active.ctaLabel}
            </Button>
          ) : (
            // CTA 가 비어있는 필수 캠페인이 데드락에 빠지지 않도록, 읽음을 기록하고
            // 닫는 안전한 "확인" 액션을 항상 제공한다.
            isRequired && (
              <Button
                size="sm"
                data-testid="campaign-ack"
                onClick={async () => {
                  try {
                    await markRead.mutateAsync({ id: active.id });
                  } catch {
                    /* tolerate */
                  }
                  close(true);
                }}
              >
                확인
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
