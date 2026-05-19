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
// [Task #397] 모바일 첫 화면 위젯 안에서는 컴팩트 가로 레이아웃(아이콘 + 2줄 텍스트
//   + 우측 D-Day 배지) 으로 노출하고, /rfqs 페이지 본문에서는 기존의 큰 세로 카드를
//   유지한다. 변경은 `compact` prop 으로 선택한다.

interface Props {
  /** 적합한 추천이 없을 때 fallback 으로 노출할 기존 빈 상태 UI. */
  fallback: React.ReactNode;
  /** 카드 렌더 위치 식별용 testId 접미사 — "widget" / "rfqs-page" 등. */
  variant: string;
  /** 모바일 첫 화면 위젯용 컴팩트 가로 레이아웃 사용 여부. 기본값은 false (기존 세로 카드). */
  compact?: boolean;
}

export default function EmptyQuoteRfqSuggestion({
  fallback,
  variant,
  compact = false,
}: Props) {
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

  if (compact) {
    // [Task #397] TodayWorkLogEntry 와 동일한 컴팩트 가로 레이아웃.
    //   왼쪽 아이콘(w-8 h-8) + 2줄 텍스트 + 우측 D-Day 배지.
    //   카드 전체가 클릭 가능하므로 별도 CTA 버튼은 두지 않고 testId 만 유지한다.
    return (
      <Card data-testid={`empty-quote-rfq-suggestion-${variant}`}>
        <CardContent className="p-3">
          <button
            type="button"
            onClick={handleClick}
            data-testid={`empty-quote-rfq-suggestion-${variant}-cta`}
            className="w-full flex items-center gap-3 py-1 px-1 hover-elevate active-elevate-2 rounded-lg text-left"
          >
            <span className="w-8 h-8 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </span>
            <span className="flex flex-col min-w-0 flex-1">
              <span className="text-xs font-semibold leading-snug truncate">
                곧 <span className="text-primary">{candidate.alert.title}</span>
                을(를) 해야 하는 시기입니다
              </span>
              <span className="text-[11px] font-medium leading-snug text-muted-foreground">
                여기를 눌러 파트너사 견적을 받아 보세요
              </span>
            </span>
            <Badge
              variant={dDayBadgeVariant}
              className="text-[10px] h-5 shrink-0"
              data-testid={`empty-quote-rfq-suggestion-${variant}-dday`}
            >
              {candidate.dDayLabel}
            </Badge>
          </button>
        </CardContent>
      </Card>
    );
  }

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
            파트너사 견적을 받아 보시면 어떨까요?
          </p>
        </div>
        <Button
          size="sm"
          className="h-8 text-xs"
          onClick={handleClick}
          data-testid={`empty-quote-rfq-suggestion-${variant}-cta`}
        >
          파트너사 견적받기
        </Button>
      </CardContent>
    </Card>
  );
}
