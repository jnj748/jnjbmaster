import { useMemo } from "react";
import { useLocation } from "wouter";
import { useGetDashboardAlerts } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import {
  type AlertLike,
  buildEmptyQuoteRfqPrefillQuery,
  pickRfqSuggestionFromAlerts,
} from "@/lib/empty-quote-suggestion";

// [Task #388] 빈 견적 상태에서 노출되는 "비교 견적 유도" 추천 카드.
//   - SubmittedQuotesWidget(모바일 첫 화면) 와 /rfqs 페이지 빈 상태에서 공유한다.
//   - 적합한 알림(필수업무/제안업무/점검 + RFQ 발주 가능 카테고리)이 1건 잡히면
//     맞춤형 추천 카드를, 그렇지 않으면 fallback (기존 빈 상태 UI) 를 그대로 렌더한다.
//   - CTA 클릭 시 /rfqs?prefill=1&... 로 이동해 RFQ 작성 다이얼로그를 자동으로 연다.

interface Props {
  /** 적합한 추천이 없을 때 fallback 으로 노출할 기존 빈 상태 UI. */
  fallback: React.ReactNode;
  /** 카드 렌더 위치 식별용 testId 접미사 — "widget" / "rfqs-page" 등. */
  variant: string;
}

export default function EmptyQuoteRfqSuggestion({ fallback, variant }: Props) {
  const [, navigate] = useLocation();
  // 알림 응답은 매니저 대시보드에서도 동일 staleTime(기본) 으로 캐시되므로
  // 같은 화면 안에서 중복 fetch 가 일어나도 react-query 가 dedupe 한다.
  const { data: alertsRaw, isLoading } = useGetDashboardAlerts();

  const candidate = useMemo(() => {
    const alerts = (alertsRaw ?? []) as AlertLike[];
    return pickRfqSuggestionFromAlerts(alerts);
  }, [alertsRaw]);

  // 알림 fetch 가 끝나기 전에는 fallback 을 노출 — 추천 카드가 깜빡이며 들어가
  // 빈 상태 → 카드 → 빈 상태 식의 잔상이 생기지 않도록 한다.
  if (isLoading) return <>{fallback}</>;
  if (!candidate) return <>{fallback}</>;

  const handleClick = () => {
    const qs = buildEmptyQuoteRfqPrefillQuery(candidate);
    navigate(`/rfqs?${qs}`);
  };

  const dDayBadgeVariant: "destructive" | "secondary" =
    candidate.daysLeft != null && candidate.daysLeft <= 7 ? "destructive" : "secondary";

  return (
    <Card data-testid={`empty-quote-rfq-suggestion-${variant}`}>
      <CardContent className="py-5 px-4 flex flex-col items-center gap-3 text-center">
        <span className="w-9 h-9 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
          <Sparkles className="w-4 h-4" />
        </span>
        <div className="space-y-1">
          <p className="text-sm font-semibold leading-snug">
            곧{" "}
            <span className="text-primary">{candidate.alert.title}</span>
            을(를) 해야 하는 시기입니다
          </p>
          <div className="flex items-center justify-center gap-2">
            <Badge
              variant={dDayBadgeVariant}
              className="text-[11px] h-5"
              data-testid={`empty-quote-rfq-suggestion-${variant}-dday`}
            >
              {candidate.dDayLabel}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            파트너사의 비교 견적을 받아보시면 어떨까요?
          </p>
        </div>
        <Button
          size="sm"
          className="h-8 text-xs"
          onClick={handleClick}
          data-testid={`empty-quote-rfq-suggestion-${variant}-cta`}
        >
          비교 견적 요청하기
        </Button>
      </CardContent>
    </Card>
  );
}
