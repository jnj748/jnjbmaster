// [Task #348/#516] 첫 필수업무 — "호실·소유자 마스터 세팅".
//
// 동작 모드:
//   1. setup: 호실이 0건이거나 동기화 이력이 없을 때 — 강조된 진입 카드를 노출.
//   2. complete: 호실 ≥1 AND 마지막 동기화 이력이 있을 때 — 부드러운 완료 요약 카드.
//
// 클릭 시 풀스크린 마법사(/onboarding/units-master) 로 이동한다.
// 기존 진입점(/settings/building?tab=units-import) 도 보조 링크로 남겨 두어
// 단계별 설정에서 다시 들어올 수 있게 한다.

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, CheckCircle2, DownloadCloud, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { useListUnits } from "@workspace/api-client-react";

const WIZARD_PATH = "/onboarding/units-master";
const SETTINGS_PATH = "/settings/building?tab=units-import";

export default function UnitsImportSuggestionWidget() {
  const [, navigate] = useLocation();
  const { data: units, isLoading } = useListUnits();

  const summary = useMemo(() => {
    if (isLoading || !units) {
      return null;
    }
    const total = units.length;
    const synced = units.filter((u) => u.lastRegisterSyncedAt).length;
    const lastSyncedAt = units
      .map((u) => u.lastRegisterSyncedAt)
      .filter(Boolean)
      .sort()
      .slice(-1)[0] ?? null;
    return { total, synced, lastSyncedAt };
  }, [units, isLoading]);

  if (!summary) return null;

  // 모드 결정.
  if (summary.total === 0 || summary.synced === 0) {
    const reason = summary.total === 0
      ? "아직 등록된 호실이 없어요. 건축물대장에서 동·층·호실을 한 번에 채워드릴게요."
      : "등록된 호실이 있지만 건축물대장 동기화 이력이 없어요. 면적·용도·소유자 정보를 한 번에 정비합니다.";
    return (
      <Card className="border-emerald-300 bg-gradient-to-br from-emerald-50 to-emerald-50/40">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="w-5 h-5 text-emerald-600" />
            첫 필수업무 · 호실·소유자 마스터 세팅
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground leading-relaxed">{reason}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className="bg-white">건축물대장 자동 가져오기</Badge>
            <Badge variant="outline" className="bg-white">소유자 자동 조회 (가능 시)</Badge>
            <Badge variant="outline" className="bg-white">미리보기 → 확정 적용</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => navigate(WIZARD_PATH)}
              className="bg-emerald-600 hover:bg-emerald-700"
              data-testid="btn-units-master-start"
            >
              <DownloadCloud className="w-4 h-4 mr-2" />
              지금 시작하기
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate(SETTINGS_PATH)}
              data-testid="btn-units-master-settings"
            >
              건물 설정에서 단계별로 보기
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // complete 모드: 부드러운 완료 요약 + 다시 동기화 버튼.
  const lastLabel = summary.lastSyncedAt
    ? new Date(summary.lastSyncedAt).toLocaleString("ko-KR")
    : null;
  return (
    <Card className="border-slate-200 bg-white">
      <CardContent className="py-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
          <div className="flex-1 space-y-1.5">
            <div className="font-medium text-sm">호실·소유자 마스터가 정비되어 있어요.</div>
            <div className="text-xs text-muted-foreground">
              현재 호실 {summary.total.toLocaleString()}개 · 대장 동기화 {summary.synced.toLocaleString()}개
              {lastLabel ? ` · 마지막 동기화 ${lastLabel}` : ""}
            </div>
            <div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(WIZARD_PATH)}
                data-testid="btn-units-master-resync"
              >
                다시 동기화 / 결과 보기
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
