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
import { ApiError } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

interface Props {
  existingId: number | null;
  hasRegisterPk: boolean;
  // [Task #469] 호실관리 페이지의 모달에서도 동일 컴포넌트를 재사용한다.
  // 확정 적용이 성공한 직후 호출되어 다이얼로그를 닫는 등 후속 처리를 위임할 수 있다.
  onApplied?: (res: ImportUnitsFromRegisterResponse) => void;
  // [Task #469] 사전 조건이 미충족(건물 미선택/식별자 없음)일 때 노출할
  // 보조 액션. 다이얼로그 진입점에서는 "건물 설정으로 이동" 버튼으로 사용한다.
  onGoToBuildingSettings?: () => void;
}

const ACTION_BADGE: Record<ImportUnitPreviewItem["action"], { label: string; cls: string }> = {
  create: { label: "신규", cls: "bg-emerald-100 text-emerald-700" },
  update: { label: "갱신", cls: "bg-amber-100 text-amber-700" },
  skip: { label: "유지", cls: "bg-slate-100 text-slate-600" },
};

export function StepUnitsImport({ existingId, hasRegisterPk, onApplied, onGoToBuildingSettings }: Props) {
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
        <CardContent className="space-y-3">
          <Alert>
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>
              위 ‘건물 정보 저장’ 을 먼저 완료해 주세요.
            </AlertDescription>
          </Alert>
          {/* [Task #469] 다이얼로그 진입점에서는 사용자가 곧바로 건물 설정으로
              이동할 수 있도록 보조 버튼을 노출한다. */}
          {onGoToBuildingSettings && (
            <div className="flex justify-end">
              <Button variant="outline" onClick={onGoToBuildingSettings} data-testid="btn-units-import-go-settings">
                건물 설정으로 이동
              </Button>
            </div>
          )}
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
        <CardContent className="space-y-3">
          <Alert variant="destructive">
            <AlertCircle className="w-4 h-4" />
            {/* [Task #427] 잠긴 주소에서도 식별자만 다시 받을 수 있는 동선이 생겼으므로,
                사용자가 정확히 어디서 무엇을 눌러야 하는지 한 줄로 안내한다. */}
            <AlertDescription>
              건축물대장 식별자가 비어 있습니다. 위 ‘건물 주소’ 카드에서 [건축물대장 다시 조회] 버튼을 눌러 주세요.
            </AlertDescription>
          </Alert>
          {onGoToBuildingSettings && (
            <div className="flex justify-end">
              <Button variant="outline" onClick={onGoToBuildingSettings} data-testid="btn-units-import-go-settings">
                건물 설정으로 이동
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // [Task #698] 외부 API 일시 장애·미리보기 만료 등 머신 판별 가능한 에러를 한국어
  //   안내 메시지로 매핑한다. 서버는 503 / 410 응답에 code + error 를 함께 담는다.
  function describeApiError(e: unknown, fallback: string): { title: string; description: string } {
    if (e instanceof ApiError) {
      const data = (e.data ?? null) as { code?: string; error?: string } | null;
      const code = data?.code;
      // 503 REGISTER_FETCH_FAILED — 외부 건축물대장 조회 일시 지연.
      if (code === "REGISTER_FETCH_FAILED") {
        return {
          title: "건축물대장 조회 일시 지연",
          description: data?.error ?? "건축물대장 조회가 일시적으로 지연되고 있어요. 잠시 후 다시 시도해 주세요.",
        };
      }
      if (code === "REGISTER_API_KEY_MISSING") {
        return {
          title: "오류",
          description: data?.error ?? "건축물대장 API 키가 설정되지 않았습니다.",
        };
      }
      if (code === "PREVIEW_EXPIRED") {
        return {
          title: "미리보기를 다시 받아 주세요",
          description: data?.error ?? "미리보기 결과가 만료되었습니다. 미리보기를 다시 가져온 후 적용해 주세요.",
        };
      }
      // 그 외 — 502/네트워크 오류 등은 e.message 가 "HTTP 502 Bad Gateway" 같은 일반 문구이지만,
      // 사용자 안내는 한국어 폴백으로 통일한다.
      if (e.status === 502 || e.status === 504) {
        return {
          title: "일시 통신 오류",
          description: "서버 응답이 지연되고 있어요. 잠시 후 다시 시도해 주세요.",
        };
      }
      return { title: "오류", description: data?.error ?? e.message ?? fallback };
    }
    const msg = e instanceof Error ? e.message : fallback;
    return { title: "오류", description: msg };
  }

  const runPreview = async () => {
    setApplied(null);
    try {
      const res = await importMutation.mutateAsync({ data: { dryRun: true } });
      setPreview(res);
      return res;
    } catch (e) {
      const { title, description } = describeApiError(e, "미리보기를 가져오지 못했습니다.");
      toast({ title, description, variant: "destructive" });
      return null;
    }
  };

  // [Task #698] 캐시된 미리보기 토큰을 보내 외부 API 재호출 없이 적용한다. 토큰이
  //   만료된 경우(410 PREVIEW_EXPIRED)는 자동으로 미리보기를 다시 받아 한 번 더 시도하고,
  //   그래도 실패하면 사용자에게 명확한 안내를 띄운다.
  async function applyWithToken(token: string): Promise<ImportUnitsFromRegisterResponse> {
    return importMutation.mutateAsync({ data: { dryRun: false, previewToken: token } });
  }

  const runApply = async () => {
    if (!preview?.previewToken) {
      // 방어적 폴백: 어떤 이유로 토큰이 없으면 미리보기를 한 번 받아 토큰을 채운다.
      const refreshed = await runPreview();
      if (!refreshed?.previewToken) return;
      setPreview(refreshed);
      // 사용자에게 다시 한 번 적용을 누르게 한다 — 신규 분류 결과를 확인할 시간 제공.
      toast({
        title: "미리보기를 새로 받았어요",
        description: "내용을 확인한 뒤 [확정 적용] 을 다시 눌러 주세요.",
      });
      return;
    }
    try {
      let res: ImportUnitsFromRegisterResponse;
      try {
        res = await applyWithToken(preview.previewToken);
      } catch (e) {
        // [Task #698] 미리보기 토큰 만료 — 자동으로 미리보기 한 번 더 받고 다시 시도.
        if (e instanceof ApiError && e.status === 410) {
          const refreshed = await runPreview();
          if (!refreshed?.previewToken) return;
          setPreview(refreshed);
          res = await applyWithToken(refreshed.previewToken);
        } else {
          throw e;
        }
      }
      setApplied(res);
      setPreview(res);
      // units 관련 캐시 폭넓게 무효화 (호실 목록/디테일/대시보드 위젯).
      await qc.invalidateQueries({ predicate: (q) => {
        const k = q.queryKey?.[0];
        return typeof k === "string" && (k.includes("Unit") || k.includes("unit") || k.includes("Building"));
      }});
      // [Task #689] 일반건축물·빈 응답이면 안내 토스트만 띄우고 다이얼로그를 닫지 않는다.
      //   이렇게 해야 사용자가 안내 메시지를 읽고 수기 등록/엑셀 업로드로 자연스럽게 이어갈 수 있다.
      if (res.noUnitData) {
        toast({ title: "가져올 호실 자료가 없습니다", description: res.noUnitData.message });
        return;
      }
      toast({
        title: "가져오기 완료",
        description: `신규 ${res.created} · 갱신 ${res.updated} · 유지 ${res.skipped}`,
      });
      // [Task #469] 호실관리 다이얼로그처럼 외부 컨테이너가 있을 때
      // 확정 적용 결과를 알리고 자동으로 닫히도록 한다.
      onApplied?.(res);
    } catch (e) {
      const { title, description } = describeApiError(e, "호실 일괄 가져오기에 실패했습니다.");
      toast({ title, description, variant: "destructive" });
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
            {/* [Task #689] noUnitData 가 잡힌 미리보기에서는 적용해도 들어올 호실이 없으므로 버튼을 잠근다. */}
            <Button
              onClick={runApply}
              disabled={importMutation.isPending || !preview || Boolean(preview?.noUnitData)}
            >
              {importMutation.isPending && preview && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <CheckCircle2 className="w-4 h-4 mr-2" />
              확정 적용
            </Button>
          </div>

          {preview && (
            <div className="space-y-3">
              {/* [Task #689] 일반건축물(다가구·단독)·빈 응답 케이스는 표 대신 안내 카드를 노출.
                  API 오류와 분명히 구분되도록 메시지 + 수기/엑셀 업로드 진입을 함께 보여 준다. */}
              {preview.noUnitData ? (
                <Alert>
                  <AlertCircle className="w-4 h-4" />
                  <AlertDescription className="space-y-2">
                    <p data-testid="text-no-unit-data">{preview.noUnitData.message}</p>
                    {onGoToBuildingSettings && (
                      <div className="text-xs text-muted-foreground">
                        호실 관리 페이지에서 ‘직접 추가’ 또는 ‘엑셀 업로드’ 로 호실을 등록할 수 있습니다.
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              ) : (
                <>
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
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
