// [Phase1 마무리 A] 매니저 대시보드 진입 카드 — "업체 견적 받기".
//   AlertSection 아래, SubmittedQuotesWidget 위에 노출되어 견적 요청 흐름의
//   진입을 명시적으로 안내한다. manager 역할 한정으로 마운트 측에서 가드한다.
import { Link } from "wouter";
import { Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function RequestQuoteCtaWidget() {
  return (
    <Card data-testid="card-request-quote-cta">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center">
            <Wrench className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold leading-snug">업체 견적 받기</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              수리, 교체, 점검이 필요한 곳을 알려주시면 파트너사 견적을 받아드려요
            </p>
          </div>
        </div>
        <Link href="/rfqs?new=1">
          <Button
            className="w-full h-12 text-[15px]"
            data-testid="button-request-quote-cta"
          >
            견적 요청하기
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
