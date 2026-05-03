import { useLocation, Redirect } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Construction } from "lucide-react";

/**
 * T6 회계엔진(#778) / T2 부과엔진이 머지된 뒤로 아래 stub 라우트들은
 * 실제 화면(/erp/accounting 의 탭, /erp/billing) 으로 곧장 보낸다.
 * 사이드바 코드는 그대로 두고 라우트 단에서만 회수한다.
 */
const REDIRECTS: Record<string, string> = {
  "/accountant/charging/auto-journal": "/erp/accounting?tab=journal",
  "/accountant/charging/rules": "/erp/billing",
  "/accountant/ledger": "/erp/accounting?tab=gl",
  "/accountant/balance-sheet": "/erp/accounting?tab=bs",
  "/accountant/income-statement": "/erp/accounting?tab=is",
  "/accountant/settings/categories": "/erp/accounting?tab=coa",
};

/**
 * [Task #772] 경리 신 IA 의 신규 메뉴(자동분개·총계정원장·재무상태표·월마감 등)
 * 들이 라우트는 살아 있되 실제 동작은 후속 엔진 태스크(T2~T10)에서 채워질 때까지
 * 사용자에게 노출되는 "준비 중" 안내 화면.
 *
 * 라우트별 라벨/엔진 매핑은 `COMING_SOON_LABELS` 한 곳에서만 관리한다.
 */
const COMING_SOON_LABELS: Record<string, { title: string; engine: string; description: string }> = {
  "/accountant/charging/auto-journal": {
    title: "자동분개",
    engine: "T2 — 부과·분개 엔진",
    description: "검침·고지·수납에서 발생한 거래를 회계 분개로 자동 변환합니다.",
  },
  "/accountant/charging/rules": {
    title: "부과 기준",
    engine: "T2 — 부과·분개 엔진",
    description: "호실/면적/세대원수 기반 부과 룰셋을 정의합니다.",
  },
  "/accountant/ledger": {
    title: "총계정원장",
    engine: "T4 — 회계 엔진",
    description: "계정과목별 차변/대변 원장 — 키보드 사절 7규칙 기반 조회.",
  },
  "/accountant/balance-sheet": {
    title: "재무상태표",
    engine: "T4 — 회계 엔진",
    description: "현재 시점 자산/부채/자본 스냅샷.",
  },
  "/accountant/income-statement": {
    title: "손익계산서",
    engine: "T4 — 회계 엔진",
    description: "기간별 수익·비용·당기순이익 보고.",
  },
  "/accountant/closing/monthly": {
    title: "월마감",
    engine: "T8 — 보고·마감 엔진",
    description: "한 번의 큰 버튼으로 끝나는 월별 마감 워크플로.",
  },
  "/accountant/closing/yearly": {
    title: "연마감",
    engine: "T8 — 보고·마감 엔진",
    description: "연 단위 결산 + 차년도 이월 자동화.",
  },
  "/accountant/settings/categories": {
    title: "계정과목 설정",
    engine: "T9 — 설정 엔진",
    description: "건물별 계정과목/카테고리/태그 마스터.",
  },
};

export default function AccountantComingSoon() {
  const [location] = useLocation();
  const redirectTo = REDIRECTS[location];
  if (redirectTo) return <Redirect to={redirectTo} />;
  const meta = COMING_SOON_LABELS[location] ?? {
    title: "준비 중",
    engine: "후속 엔진 태스크",
    description: "곧 만나보실 수 있어요.",
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <Card className="w-full max-w-xl">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <Construction className="size-7" />
          </div>
          <Badge variant="secondary" className="gap-1">
            <Sparkles className="size-3" />
            준비 중
          </Badge>
          <h1 className="text-2xl font-bold tracking-tight">{meta.title}</h1>
          <p className="text-muted-foreground">{meta.description}</p>
          <div className="rounded-lg bg-muted/50 px-4 py-2 text-sm text-muted-foreground">
            엔진: <span className="font-medium text-foreground">{meta.engine}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
