import { useMemo } from "react";
import { Link } from "wouter";
import { useListRfqs, useListQuotes } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bot, Hammer } from "lucide-react";
import { useBuilding } from "@/contexts/building-context";

export default function ManagerAiQuoteRow() {
  const { building } = useBuilding();
  const buildingReady = !!building;

  const { data: rfqs } = useListRfqs(undefined, {
    query: { enabled: buildingReady, staleTime: 30_000 },
  });
  const { data: quotes } = useListQuotes(undefined, {
    query: { enabled: buildingReady, staleTime: 30_000 },
  });

  const openRfqCount = useMemo(
    () => ((rfqs ?? []) as Array<{ status?: string | null }>).filter((r) => r.status === "open").length,
    [rfqs],
  );

  const receivedRfqCount = useMemo(() => {
    const rfqIds = new Set<number>();
    for (const q of (quotes ?? []) as Array<{ rfqId?: number }>) {
      if (typeof q.rfqId === "number") rfqIds.add(q.rfqId);
    }
    return rfqIds.size;
  }, [quotes]);

  return (
    <div
      className="grid grid-cols-2 gap-3 items-stretch"
      style={{ gridTemplateColumns: "1fr 1fr" }}
      data-testid="manager-ai-quote-row"
    >
      <Card className="manager-phase1-card border-brand bg-brand-light shadow-none h-full">
        <CardContent className="p-3 flex flex-col gap-3 h-full">
          <div className="flex items-center gap-2 min-w-0">
            <span className="manager-phase1-icon-wrap w-9 h-9 rounded-full flex items-center justify-center shrink-0">
              <Bot className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[17px] font-semibold truncate" style={{ color: "var(--brand-dark)" }}>
                AI 관리비서
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                건물관리 AI비서가 알려주는 TIP
              </p>
            </div>
          </div>
          <Link href="/ai-assistant" className="mt-auto">
            <Button type="button" className="manager-phase1-btn w-full" data-testid="button-ai-assistant-chat">
              대화하기
            </Button>
          </Link>
        </CardContent>
      </Card>

      <Card className="manager-phase1-card border-brand bg-brand-light shadow-none h-full">
        <CardContent className="p-3 flex flex-col gap-3 h-full">
          <div className="flex items-center gap-2 min-w-0">
            <span className="manager-phase1-icon-wrap w-9 h-9 rounded-full flex items-center justify-center shrink-0">
              <Hammer className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-[17px] font-semibold truncate" style={{ color: "var(--brand-dark)" }}>
                파트너사 견적받기
              </h3>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                파트너사의 비교견적을 받아보세요
              </p>
            </div>
          </div>
          <Link href="/rfqs?new=1">
            <Button type="button" className="manager-phase1-btn w-full" data-testid="button-request-quote">
              요청하기
            </Button>
          </Link>
          <div className="grid grid-cols-2 gap-2 mt-auto" data-testid="manager-rfq-stats">
            <Link
              href="/rfqs?status=open"
              className="rounded-lg border border-brand bg-white/80 px-2 py-2 text-center hover-elevate active-elevate-2"
              data-testid="manager-rfq-open-link"
            >
              <p className="text-[11px] text-muted-foreground leading-snug">접수중인 견적</p>
              <p className="text-base font-semibold tabular-nums" style={{ color: "var(--brand-dark)" }}>
                {openRfqCount}건
              </p>
            </Link>
            <Link
              href="/rfqs?tab=quotes"
              className="rounded-lg border border-brand bg-white/80 px-2 py-2 text-center hover-elevate active-elevate-2"
              data-testid="manager-rfq-received-link"
            >
              <p className="text-[11px] text-muted-foreground leading-snug">제출받은 견적</p>
              <p className="text-base font-semibold tabular-nums" style={{ color: "var(--brand-dark)" }}>
                {receivedRfqCount}건
              </p>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
