// [Task #516] /onboarding/units-master — 호실·소유자 마스터 세팅 풀스크린 마법사.
//
// 의도:
//   - 첫 필수업무 카드(units-import-suggestion)에서 진입하는 단독 풀스크린 화면.
//   - 사용자가 한 번에 (1) 미리보기 → (2) 확정 적용 → (3) 결과 요약/다음 행동을 끝낼 수 있게 묶어 둔다.
//   - 다동(아파트 단지)일 때는 표제부 동(棟) 목록과 동기화 진행 상황을 함께 노출한다.
//
// 서버 동작:
//   - 백엔드 POST /buildings/units/import-from-register 가 buildings.registerDongPks 를
//     순회해 동별 전유부 페이징을 모두 수행하고, best-effort 로 소유자 자동 조회를 함께 시도한다.
//   - 사용자 수기 컬럼(소유자 이름·주소·연락처 등)은 절대 덮어쓰지 않으며,
//     비어 있는 칸에 한해서만 자동 조회 결과를 채운다.

import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useImportUnitsFromRegister,
  useListUnits,
} from "@workspace/api-client-react";
import type {
  ImportUnitPreviewItem,
  ImportUnitsFromRegisterResponse,
} from "@workspace/api-client-react";
import { useBuilding } from "@/contexts/building-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  DownloadCloud,
  Loader2,
  RefreshCw,
  Settings,
  Sparkles,
} from "lucide-react";

const ACTION_BADGE: Record<ImportUnitPreviewItem["action"], { label: string; cls: string }> = {
  create: { label: "신규", cls: "bg-emerald-100 text-emerald-700" },
  update: { label: "갱신", cls: "bg-amber-100 text-amber-700" },
  skip: { label: "유지", cls: "bg-slate-100 text-slate-600" },
};

export default function UnitsMasterWizardPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { building, isLoading: buildingLoading } = useBuilding();
  const unitsQuery = useListUnits();
  const importMutation = useImportUnitsFromRegister();

  const [preview, setPreview] = useState<ImportUnitsFromRegisterResponse | null>(null);
  const [applied, setApplied] = useState<ImportUnitsFromRegisterResponse | null>(null);
  const [dongFilter, setDongFilter] = useState<string>("__all__");

  const buildingRegisterPk: string | null = building?.buildingRegisterPk ?? null;
  const dongPks = building?.registerDongPks ?? null;
  const dongCount = dongPks?.length ?? (buildingRegisterPk ? 1 : 0);

  // 진입 시 자동으로 미리보기를 한 번 가져온다(이미 가져온 동기화 이력이 있어도 최신 상태 표시).
  useEffect(() => {
    if (buildingLoading) return;
    if (!buildingRegisterPk && dongCount === 0) return;
    if (preview || applied || importMutation.isPending) return;
    void runPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildingLoading, buildingRegisterPk, dongCount]);

  const runPreview = async () => {
    setApplied(null);
    try {
      const res = await importMutation.mutateAsync({ data: { dryRun: true, includeOwners: true } });
      setPreview(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "미리보기를 가져오지 못했습니다.";
      toast({ title: "오류", description: msg, variant: "destructive" });
    }
  };

  const runApply = async () => {
    try {
      const res = await importMutation.mutateAsync({ data: { dryRun: false, includeOwners: true } });
      setApplied(res);
      setPreview(res);
      await qc.invalidateQueries({
        predicate: (q) => {
          const k = q.queryKey?.[0];
          return typeof k === "string" && (k.includes("Unit") || k.includes("unit") || k.includes("Building"));
        },
      });
      toast({
        title: "가져오기 완료",
        description: `신규 ${res.created} · 갱신 ${res.updated} · 유지 ${res.skipped}`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "호실 일괄 가져오기에 실패했습니다.";
      toast({ title: "오류", description: msg, variant: "destructive" });
    }
  };

  const items = preview?.items ?? [];
  const dongsInItems = useMemo(() => {
    const set = new Set<string>();
    for (const it of items) set.add(it.dong ?? "");
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ko"));
  }, [items]);
  const filteredItems = useMemo(() => {
    const base = dongFilter === "__all__" ? items : items.filter((it) => (it.dong ?? "") === dongFilter);
    return [...base].sort((a, b) => {
      const ad = a.dong ?? "";
      const bd = b.dong ?? "";
      if (ad !== bd) return ad.localeCompare(bd, "ko");
      const af = parseInt(a.floor, 10);
      const bf = parseInt(b.floor, 10);
      if (Number.isFinite(af) && Number.isFinite(bf) && af !== bf) return af - bf;
      return a.unitNumber.localeCompare(b.unitNumber, "ko", { numeric: true });
    });
  }, [items, dongFilter]);

  const goSettings = () => navigate("/settings/building?tab=units-import");
  const goUnits = () => navigate("/units");
  const goHome = () => navigate("/");

  // 사전 조건: 건물이 없거나 건축물대장 식별자가 비어 있으면 안내.
  if (buildingLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!building) {
    return (
      <div className="min-h-screen p-6 max-w-3xl mx-auto space-y-4">
        <Button variant="ghost" onClick={goHome} className="text-muted-foreground"><ArrowLeft className="w-4 h-4 mr-2" /> 대시보드로</Button>
        <Card>
          <CardHeader><CardTitle className="text-lg">건물 정보가 필요합니다</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Alert><AlertCircle className="w-4 h-4" /><AlertDescription>건물 정보가 등록되어 있지 않아 호실 가져오기를 진행할 수 없습니다.</AlertDescription></Alert>
            <Button onClick={goSettings}><Settings className="w-4 h-4 mr-2" /> 건물 설정으로 이동</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!buildingRegisterPk && dongCount === 0) {
    return (
      <div className="min-h-screen p-6 max-w-3xl mx-auto space-y-4">
        <Button variant="ghost" onClick={goHome} className="text-muted-foreground"><ArrowLeft className="w-4 h-4 mr-2" /> 대시보드로</Button>
        <Card>
          <CardHeader><CardTitle className="text-lg">건축물대장 식별자가 비어 있습니다</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Alert variant="destructive"><AlertCircle className="w-4 h-4" /><AlertDescription>
              건물 설정의 ‘건물 주소’ 카드에서 [건축물대장 다시 조회] 버튼을 눌러 식별자를 받아 와 주세요.
            </AlertDescription></Alert>
            <Button onClick={goSettings}><Settings className="w-4 h-4 mr-2" /> 건물 설정으로 이동</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const totalUnits = unitsQuery.data?.length ?? 0;
  const lastSyncedAt = applied?.lastSyncedAt
    ?? (unitsQuery.data ?? []).map((u) => u.lastRegisterSyncedAt).filter(Boolean).sort().slice(-1)[0]
    ?? null;
  const syncedRecently = !!lastSyncedAt && totalUnits > 0;

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={goHome} className="text-muted-foreground" data-testid="btn-back-home">
            <ArrowLeft className="w-4 h-4 mr-2" /> 대시보드로
          </Button>
          <Button variant="outline" onClick={goUnits} data-testid="btn-go-units">
            호실 관리로
          </Button>
        </div>

        <Card className="border-emerald-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="w-5 h-5 text-emerald-600" />
              호실·소유자 마스터 세팅
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              건축물대장에서 동(棟)·층·호실·면적을 한 번에 가져와 호실 마스터를 정비합니다.
              기존에 직접 입력하신 소유자/입주민/연락처는 절대 덮어쓰지 않습니다.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline" className="bg-white">
                <Building2 className="w-3.5 h-3.5 mr-1" />
                동 {dongCount.toLocaleString()}개
              </Badge>
              <Badge variant="outline" className="bg-white">현재 호실 {totalUnits.toLocaleString()}개</Badge>
              {syncedRecently && lastSyncedAt && (
                <Badge variant="outline" className="bg-white">
                  마지막 동기화: {new Date(lastSyncedAt).toLocaleString("ko-KR")}
                </Badge>
              )}
              {preview?.ownerLookupEnabled && (
                <Badge className="bg-blue-100 text-blue-700">
                  소유자 자동 조회 적중 {preview.ownerLookupHit}/{preview.ownerLookupAttempted}
                </Badge>
              )}
            </div>

            {dongPks && dongPks.length > 1 && (
              <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                <span className="self-center mr-1">동 목록:</span>
                {dongPks.slice(0, 16).map((d) => (
                  <Badge key={d.mgmBldrgstPk} variant="outline" className="bg-white">
                    {d.dongName || "(이름없음)"}{d.isMain ? " · 주" : ""}
                  </Badge>
                ))}
                {dongPks.length > 16 && (
                  <Badge variant="outline" className="bg-white">+{dongPks.length - 16}개 더</Badge>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                onClick={runPreview}
                disabled={importMutation.isPending}
                variant="outline"
                data-testid="btn-units-master-preview"
              >
                {importMutation.isPending && !preview && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <RefreshCw className="w-4 h-4 mr-2" />
                미리보기 새로고침
              </Button>
              <Button
                onClick={runApply}
                disabled={importMutation.isPending || !preview || filteredItems.length === 0}
                className="bg-emerald-600 hover:bg-emerald-700"
                data-testid="btn-units-master-apply"
              >
                {importMutation.isPending && preview && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <DownloadCloud className="w-4 h-4 mr-2" />
                확정 적용
              </Button>
            </div>
          </CardContent>
        </Card>

        {applied && (
          <Card className="border-emerald-200 bg-emerald-50/40">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5" />
                <div className="space-y-1.5">
                  <div className="font-medium">호실 마스터를 정비했습니다.</div>
                  <div className="text-sm text-muted-foreground">
                    신규 {applied.created}건 · 갱신 {applied.updated}건 · 유지 {applied.skipped}건
                    {applied.lastSyncedAt && ` · ${new Date(applied.lastSyncedAt).toLocaleString("ko-KR")}`}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={goUnits} data-testid="btn-applied-go-units">
                      호실 관리에서 확인하기
                    </Button>
                    <Button size="sm" variant="ghost" onClick={goHome}>대시보드로</Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>가져올 호실 미리보기 ({preview ? items.length.toLocaleString() : 0}건)</span>
              {dongsInItems.length > 1 && (
                <select
                  value={dongFilter}
                  onChange={(e) => setDongFilter(e.target.value)}
                  className="text-sm border rounded px-2 py-1 bg-white"
                  data-testid="select-dong-filter"
                >
                  <option value="__all__">동 전체</option>
                  {dongsInItems.map((d) => (
                    <option key={d || "__none__"} value={d}>{d || "(동 없음)"}</option>
                  ))}
                </select>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!preview && !importMutation.isPending && (
              <div className="text-sm text-muted-foreground py-6 text-center">
                ‘미리보기 새로고침’ 을 눌러 호실 목록을 가져와 주세요.
              </div>
            )}
            {importMutation.isPending && !preview && (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                건축물대장에서 호실을 가져오는 중입니다…
              </div>
            )}
            {preview && (
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">구분</th>
                      <th className="px-3 py-2 text-left font-medium">동</th>
                      <th className="px-3 py-2 text-left font-medium">층</th>
                      <th className="px-3 py-2 text-left font-medium">호실</th>
                      <th className="px-3 py-2 text-right font-medium">전용(㎡)</th>
                      <th className="px-3 py-2 text-right font-medium">공용(㎡)</th>
                      <th className="px-3 py-2 text-left font-medium">용도</th>
                      <th className="px-3 py-2 text-left font-medium">소유자</th>
                      <th className="px-3 py-2 text-left font-medium">소유자 주소</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((it, i) => {
                      const b = ACTION_BADGE[it.action];
                      return (
                        <tr key={`${it.dong}-${it.floor}-${it.unitNumber}-${i}`} className="border-t">
                          <td className="px-3 py-2"><Badge className={b.cls}>{b.label}</Badge></td>
                          <td className="px-3 py-2">{it.dong || "-"}</td>
                          <td className="px-3 py-2">{it.floor}</td>
                          <td className="px-3 py-2">{it.unitNumber}</td>
                          <td className="px-3 py-2 text-right">{it.exclusiveArea.toFixed(2)}</td>
                          <td className="px-3 py-2 text-right">{it.commonArea.toFixed(2)}</td>
                          <td className="px-3 py-2">{it.usage ?? "-"}</td>
                          <td className="px-3 py-2">
                            {it.ownerName ? (
                              <span className="inline-flex items-center gap-1">
                                {it.ownerName}
                                <Badge variant="outline" className="text-[10px] py-0">자동</Badge>
                              </span>
                            ) : "-"}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{it.ownerAddress ?? "-"}</td>
                        </tr>
                      );
                    })}
                    {preview && filteredItems.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                          가져올 호실 단위 면적 정보가 없습니다.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
