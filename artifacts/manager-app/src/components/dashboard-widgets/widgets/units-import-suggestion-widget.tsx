// [Task #348] 제안업무 — "건축물대장으로 호실 일괄 가져오기".
// 노출 조건: 호실이 0건이거나, 등록된 호실이 있어도 한 번도 대장 동기화 이력이 없을 때.
// 클릭 시 설정 > 건물 관리정보 > 호실 일괄 가져오기 탭으로 이동.

import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DownloadCloud, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { useListUnits } from "@workspace/api-client-react";

export default function UnitsImportSuggestionWidget() {
  const [, navigate] = useLocation();
  const { data: units, isLoading } = useListUnits();

  const { shouldShow, reason } = useMemo(() => {
    if (isLoading || !units) return { shouldShow: false, reason: "" };
    if (units.length === 0) {
      return { shouldShow: true, reason: "아직 등록된 호실이 없어요. 건축물대장으로 한 번에 채워드릴게요." };
    }
    const hasAnySync = units.some((u) => u.lastRegisterSyncedAt);
    if (!hasAnySync) {
      return { shouldShow: true, reason: "등록된 호실이 있지만 건축물대장 동기화 이력이 없어요. 출처를 정비하면 면적·용도가 더 정확해집니다." };
    }
    return { shouldShow: false, reason: "" };
  }, [units, isLoading]);

  if (!shouldShow) return null;

  return (
    <Card className="border-dashed border-emerald-300 bg-emerald-50/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="w-4 h-4 text-emerald-600" />
          제안업무 · 호실 일괄 가져오기
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{reason}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="bg-white">대장 출처</Badge>
          <Badge variant="outline" className="bg-white">미리보기 → 확정 적용</Badge>
        </div>
        <div className="flex">
          <Button
            size="sm"
            onClick={() => navigate("/settings/building?tab=units-import")}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <DownloadCloud className="w-4 h-4 mr-2" />
            지금 가져오기
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
