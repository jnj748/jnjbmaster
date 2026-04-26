// [Task #348] 호실 일괄 가져오기 단계.
// 1) "미리보기 가져오기"로 dryRun=true 호출 → 신규/갱신/유지 분류 표 노출.
// 2) "확정 적용"으로 dryRun=false 호출 → 사용자 수기 컬럼은 보존된 채 upsert.
// 사전 조건: 건물에 buildingRegisterPk(=mgmBldrgstPk) 가 저장되어 있어야 함.

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useImportUnitsFromRegister } from "@workspace/api-client-react";
import type {
  ImportUnitsFromRegisterResponse,
  ImportUnitPreviewItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

interface Props {
  existingId: number | null;
  hasRegisterPk: boolean;
}

const ACTION_BADGE: Record<ImportUnitPreviewItem["action"], { label: string; cls: string }> = {
  create: { label: "신규", cls: "bg-emerald-100 text-emerald-700" },
  update: { label: "갱신", cls: "bg-amber-100 text-amber-700" },
  skip: { label: "유지", cls: "bg-slate-100 text-slate-600" },
};

export function StepUnitsImport({ existingId, hasRegisterPk }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [preview, setPreview] = useState<ImportUnitsFromRegisterResponse | null>(null);
  const [applied, setApplied] = useState<ImportUnitsFromRegisterResponse | null>(null);

  const importMutation = useImportUnitsFromRegister();

  // [Task #412] 단일 화면 구조에서는 항상 카드 헤더(섹션 제목)를 노출해
  // ?tab=units-import 진입 시 스크롤 대상이 안정적으로 잡히도록 한다.
  if (!existingId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">호실정보 불러오기</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>
              위 ‘건물 정보 저장’ 을 먼저 완료해 주세요.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!hasRegisterPk) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">호실정보 불러오기</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>
              건축물대장 식별자가 비어 있습니다. 위 주소 카드에서 건축물대장을 먼저 조회해 주세요.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const runPreview = async () => {
    setApplied(null);
    try {
      const res = await importMutation.mutateAsync({ data: { dryRun: true } });
      setPreview(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "미리보기를 가져오지 못했습니다.";
      toast({ title: "오류", description: msg, variant: "destructive" });
    }
  };

  const runApply = async () => {
    try {
      const res = await importMutation.mutateAsync({ data: { dryRun: false } });
      setApplied(res);
      setPreview(res);
      // units 관련 캐시 폭넓게 무효화 (호실 목록/디테일/대시보드 위젯).
      await qc.invalidateQueries({ predicate: (q) => {
        const k = q.queryKey?.[0];
        return typeof k === "string" && (k.includes("Unit") || k.includes("unit") || k.includes("Building"));
      }});
      toast({
        title: "가져오기 완료",
        description: `신규 ${res.created} · 갱신 ${res.updated} · 유지 ${res.skipped}`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "호실 일괄 가져오기에 실패했습니다.";
      toast({ title: "오류", description: msg, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">호실정보 불러오기</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            건축물대장에 등록된 전유부 면적 정보를 불러와 호실(층/호실번호/전용·공용면적/용도)을 한 번에 등록합니다.
            동일한 (층 + 호실번호)가 이미 있으면 면적·용도만 갱신하고, <b>소유자/입주민/연락처/메모 등 직접 입력하신 정보는 절대 덮어쓰지 않습니다.</b>
          </p>

          <div className="flex flex-wrap gap-2">
            <Button onClick={runPreview} disabled={importMutation.isPending} variant="outline">
              {importMutation.isPending && !preview && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <RefreshCw className="w-4 h-4 mr-2" />
              미리보기 가져오기
            </Button>
            <Button onClick={runApply} disabled={importMutation.isPending || !preview}>
              {importMutation.isPending && preview && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <CheckCircle2 className="w-4 h-4 mr-2" />
              확정 적용
            </Button>
          </div>

          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge className="bg-emerald-100 text-emerald-700">신규 {preview.created}건</Badge>
                <Badge className="bg-amber-100 text-amber-700">갱신 {preview.updated}건</Badge>
                <Badge className="bg-slate-100 text-slate-600">유지 {preview.skipped}건</Badge>
                {applied?.lastSyncedAt && (
                  <Badge variant="outline">
                    마지막 동기화: {new Date(applied.lastSyncedAt).toLocaleString("ko-KR")}
                  </Badge>
                )}
              </div>

              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">구분</th>
                      <th className="px-3 py-2 text-left font-medium">층</th>
                      <th className="px-3 py-2 text-left font-medium">호실</th>
                      <th className="px-3 py-2 text-right font-medium">전용면적(㎡)</th>
                      <th className="px-3 py-2 text-right font-medium">공용면적(㎡)</th>
                      <th className="px-3 py-2 text-left font-medium">용도</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.items.map((it, i) => {
                      const b = ACTION_BADGE[it.action];
                      return (
                        <tr key={`${it.floor}-${it.unitNumber}-${i}`} className="border-t">
                          <td className="px-3 py-2"><Badge className={b.cls}>{b.label}</Badge></td>
                          <td className="px-3 py-2">{it.floor}</td>
                          <td className="px-3 py-2">{it.unitNumber}</td>
                          <td className="px-3 py-2 text-right">{it.exclusiveArea.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{it.commonArea.toFixed(2)}</td>
                          <td className="px-3 py-2">{it.usage ?? "-"}</td>
                        </tr>
                      );
                    })}
                    {preview.items.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                          가져올 호실 단위 면적 정보가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
