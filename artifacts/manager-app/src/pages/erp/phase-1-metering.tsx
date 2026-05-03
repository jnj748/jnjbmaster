// [Task #630] 검침 입력 화면 — 같은 건물의 manager / accountant / facility_staff
//   가 모두 입력·조회할 수 있고, 입력 즉시 building-records · 이사 정산 등과 동일한
//   meter_readings 데이터원을 공유한다.
import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import {
  useListUnits,
  useListMeterReadings,
  useListLatestMeterReadings,
  useCreateMeterReading,
  useUpdateMeterReading,
  useDeleteMeterReading,
  useListMeterReadingAudits,
  useUploadMeterCsv,
  useMeterPhotoOcr,
  useListTenants,
  type MeterReading,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  Droplet,
  Zap,
  Flame,
  Thermometer,
  Camera,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  Search,
  X,
  History,
  Pencil,
  Trash2,
} from "lucide-react";
import { roleLabel } from "@workspace/shared/role-labels";

type MeterType = "water" | "electricity" | "gas" | "heating" | "hot_water";
type ReadingType = "regular" | "interim";

const METER_OPTS: Array<{ value: MeterType; label: string; icon: typeof Droplet; color: string }> = [
  { value: "water", label: "수도", icon: Droplet, color: "text-blue-500" },
  { value: "electricity", label: "전기", icon: Zap, color: "text-yellow-500" },
  { value: "hot_water", label: "온수", icon: Droplet, color: "text-indigo-500" },
  { value: "heating", label: "난방", icon: Thermometer, color: "text-red-500" },
  { value: "gas", label: "가스", icon: Flame, color: "text-orange-500" },
];

// [Task #798] /metering/* 하위 라우트에서 미터 종류를 고정한 단일-종류 화면으로 재사용.
//   presetMeterType 이 주어지면 종류 선택 탭을 숨기고 해당 미터 입력만 노출한다.
export type Phase1MeteringProps = { presetMeterType?: MeterType };

function todayStr(): string { return new Date().toISOString().slice(0, 10); }
function daysAgoStr(d: number): string {
  const x = new Date();
  x.setDate(x.getDate() - d);
  return x.toISOString().slice(0, 10);
}

export default function Phase1MeteringPage({ presetMeterType }: Phase1MeteringProps = {}) {
  const { token, user } = useAuth();
  // [Task #630] 본부장은 검침을 읽기만 가능 — 입력·OCR·CSV·수정·삭제 모든 쓰기를 숨긴다.
  const readOnly = user?.role === "hq_executive";
  const isManagerLike = user?.role === "manager" || user?.role === "platform_admin";
  const currentUserId = user?.id ?? null;
  const { toast } = useToast();
  const qc = useQueryClient();
  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");

  const [meterType, setMeterType] = useState<MeterType>(presetMeterType ?? "water");
  // presetMeterType 이 바뀌면(같은 컴포넌트 재사용) 동기화.
  useEffect(() => { if (presetMeterType) setMeterType(presetMeterType); }, [presetMeterType]);
  const [readingType, setReadingType] = useState<ReadingType>("regular");
  const [readingDate, setReadingDate] = useState<string>(todayStr());
  const [unitFilter, setUnitFilter] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [currentReading, setCurrentReading] = useState<string>("");
  const [periodStart, setPeriodStart] = useState<string>("");
  const [periodEnd, setPeriodEnd] = useState<string>("");
  const [tenantId, setTenantId] = useState<number | null>(null);
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [ocrPath, setOcrPath] = useState<string | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [auditFor, setAuditFor] = useState<number | null>(null);
  const [editFor, setEditFor] = useState<MeterReading | null>(null);

  const unitsQuery = useListUnits();
  const tenantsQuery = useListTenants({ status: "active" });
  const latestQuery = useListLatestMeterReadings({ meterType });
  const historyQuery = useListMeterReadings(
    selectedUnitId
      ? { unitId: selectedUnitId, meterType, limit: 12 }
      : { meterType, limit: 30, from: daysAgoStr(180) },
  );

  const units = unitsQuery.data ?? [];
  const tenants = tenantsQuery.data ?? [];
  const latest = latestQuery.data ?? [];
  const history = historyQuery.data ?? [];

  const filteredUnits = useMemo(() => {
    if (!unitFilter.trim()) return units;
    const q = unitFilter.trim().toLowerCase();
    return units.filter((u) => u.unitNumber.toLowerCase().includes(q));
  }, [units, unitFilter]);

  const selectedUnit = useMemo(
    () => units.find((u) => u.id === selectedUnitId) ?? null,
    [units, selectedUnitId],
  );

  // 호실별 직전 검침 lookup (같은 미터 종류) — 전월값 자동 표시 + "이미 입력됨" 마커.
  const latestByUnit = useMemo(() => {
    const m = new Map<number, typeof latest[number]>();
    for (const r of latest) {
      if (r.unitId != null) m.set(r.unitId, r);
    }
    return m;
  }, [latest]);

  const previousReading = selectedUnitId
    ? Number(latestByUnit.get(selectedUnitId)?.currentReading ?? "")
    : NaN;
  const previousValid = Number.isFinite(previousReading);

  const usage = (() => {
    const cur = Number(currentReading);
    if (!Number.isFinite(cur) || !previousValid) return null;
    return cur - previousReading;
  })();

  // 이상치 즉시 표시 — 호실 이력 평균의 1.3배 초과면 빨간 경고.
  const recentAvgUsage = useMemo(() => {
    const valid = history.filter((h) => h.usage != null).slice(0, 3);
    if (valid.length === 0) return null;
    const total = valid.reduce((s, h) => s + Number(h.usage), 0);
    return total / valid.length;
  }, [history]);
  const anomalyHint = usage != null && recentAvgUsage != null && recentAvgUsage > 0
    && usage > recentAvgUsage * 1.3;

  const createMut = useCreateMeterReading({
    mutation: {
      onSuccess: () => {
        toast({ title: "검침이 저장되었습니다", description: "다음 호실로 이동합니다" });
        qc.invalidateQueries({ queryKey: [`/api/meters/latest`] });
        qc.invalidateQueries({ queryKey: [`/api/meters`] });
        qc.invalidateQueries({ queryKey: [`/api/building-records`] });
        // 다음 호실로 자동 이동 — 같은 미터 종류로 아직 오늘 입력 안 된 첫 호실.
        const idx = filteredUnits.findIndex((u) => u.id === selectedUnitId);
        const next = filteredUnits.slice(idx + 1).find((u) => {
          const last = latestByUnit.get(u.id);
          return !last || last.readingDate !== readingDate;
        });
        setCurrentReading("");
        setOcrConfidence(null);
        setOcrPath(null);
        if (next) setSelectedUnitId(next.id);
      },
      onError: (err: Error) => toast({
        title: "저장 실패",
        description: err.message,
        variant: "destructive",
      }),
    },
  });

  const updateMut = useUpdateMeterReading({
    mutation: {
      onSuccess: () => {
        toast({ title: "검침이 수정되었습니다" });
        qc.invalidateQueries({ queryKey: [`/api/meters/latest`] });
        qc.invalidateQueries({ queryKey: [`/api/meters`] });
        qc.invalidateQueries({ queryKey: [`/api/building-records`] });
        setEditFor(null);
      },
      onError: (err: Error) => toast({
        title: "수정 실패", description: err.message, variant: "destructive",
      }),
    },
  });
  const deleteMut = useDeleteMeterReading({
    mutation: {
      onSuccess: () => {
        toast({ title: "검침이 삭제되었습니다", description: "감사 이력은 보존됩니다" });
        qc.invalidateQueries({ queryKey: [`/api/meters/latest`] });
        qc.invalidateQueries({ queryKey: [`/api/meters`] });
        qc.invalidateQueries({ queryKey: [`/api/building-records`] });
      },
      onError: (err: Error) => toast({
        title: "삭제 실패", description: err.message, variant: "destructive",
      }),
    },
  });
  const deleteReading = (id: number) => {
    if (!window.confirm("이 검침을 삭제하시겠습니까? 감사 이력은 보존됩니다.")) return;
    deleteMut.mutate({ id });
  };

  const ocrMut = useMeterPhotoOcr({
    mutation: {
      onSuccess: (res) => {
        if (res.currentReading != null) {
          setCurrentReading(String(res.currentReading));
          setOcrConfidence(res.confidence);
          toast({
            title: "사진 인식 완료",
            description: `${res.currentReading} (신뢰도 ${(res.confidence * 100).toFixed(0)}%) — 확인 후 저장하세요`,
          });
        } else {
          toast({
            title: "숫자를 읽지 못했습니다",
            description: "직접 입력해 주세요",
            variant: "destructive",
          });
        }
      },
      onError: (err: Error) => toast({
        title: "사진 인식 실패",
        description: err.message,
        variant: "destructive",
      }),
    },
  });

  const { uploadFile, isUploading } = useUpload({
    basePath: `${apiBase}/storage`,
    authToken: token,
    onSuccess: (response) => {
      setOcrPath(response.objectPath);
      ocrMut.mutate({
        data: {
          objectPath: response.objectPath,
          meterType,
        },
      });
    },
    onError: (err) => toast({
      title: "사진 업로드 실패",
      description: err.message,
      variant: "destructive",
    }),
  });

  function handleSave() {
    if (!selectedUnit) {
      toast({ title: "호실을 선택해 주세요", variant: "destructive" });
      return;
    }
    const cur = Number(currentReading);
    if (!Number.isFinite(cur)) {
      toast({ title: "금월 검침값을 입력해 주세요", variant: "destructive" });
      return;
    }
    if (readingType === "interim" && (!periodStart || !periodEnd)) {
      toast({
        title: "중간 검침은 책임 구간이 필요합니다",
        description: "시작·종료 날짜를 입력해 주세요",
        variant: "destructive",
      });
      return;
    }
    createMut.mutate({
      data: {
        unitNumber: selectedUnit.unitNumber,
        unitId: selectedUnit.id,
        meterType,
        readingType,
        readingDate,
        previousReading: previousValid ? previousReading : undefined,
        currentReading: cur,
        periodStart: readingType === "interim" ? periodStart : undefined,
        periodEnd: readingType === "interim" ? periodEnd : undefined,
        tenantId: readingType === "interim" && tenantId ? tenantId : undefined,
        inputMethod: ocrPath ? "photo" : "manual",
        photoObjectPath: ocrPath ?? undefined,
      },
    });
  }

  function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "사진이 너무 큽니다",
        description: "최대 10MB",
        variant: "destructive",
      });
      return;
    }
    setOcrPath(null);
    setOcrConfidence(null);
    uploadFile(file);
  }

  // 사용자 입력 기간/호실/미터 종류 필터로 CSV 내보내기 (다이얼로그 내부에서 호출).
  function exportWith(filters: { from: string; to: string; unitNumber: string; meterType: MeterType | "all" }) {
    const params = new URLSearchParams({ from: filters.from, to: filters.to });
    if (filters.meterType !== "all") params.set("meterType", filters.meterType);
    if (filters.unitNumber.trim()) params.set("unitNumber", filters.unitNumber.trim());
    const url = `${apiBase}/meters/export?${params.toString()}`;
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then((r) => {
        if (!r.ok) throw new Error("내보내기에 실패했습니다");
        return r.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `meter-${filters.meterType}-${todayStr()}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((err: Error) => toast({
        title: "내보내기 실패",
        description: err.message,
        variant: "destructive",
      }));
  }
  const [exportOpen, setExportOpen] = useState(false);

  // [Task #630] 호실/미터 종류가 바뀔 때 이전값/이력에 맞춰 입력 폼을 리셋.
  useEffect(() => {
    setCurrentReading("");
    setOcrConfidence(null);
    setOcrPath(null);
  }, [selectedUnitId, meterType, readingType]);

  // 중간 검침 모드 진입 시 책임 구간 시작값을 직전 검침일로 자동 제안.
  useEffect(() => {
    if (readingType !== "interim" || !selectedUnitId) return;
    const last = latestByUnit.get(selectedUnitId);
    if (last?.readingDate) {
      setPeriodStart((cur) => cur || last.readingDate);
      setPeriodEnd((cur) => cur || readingDate);
    }
  }, [readingType, selectedUnitId, latestByUnit, readingDate]);

  return (
    <div className="container max-w-7xl py-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold mb-1">검침 {readOnly ? "조회" : "입력"}</h1>
          <p className="text-sm text-muted-foreground">
            {readOnly
              ? "본부장 — 관할 건물 묶음의 검침 데이터를 조회합니다 (수정·삭제 불가)."
              : "소장·경리·시설 직원이 함께 사용하는 검침 입력 화면입니다. 저장 즉시 입주자카드·이사 정산과 동일한 데이터로 공유됩니다."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)}>
            <Download className="w-4 h-4 mr-1" /> CSV 내보내기
          </Button>
          <ExportDialog
            open={exportOpen}
            onOpenChange={setExportOpen}
            defaultMeterType={meterType}
            onExport={exportWith}
          />
          {!readOnly && (
            <CsvUploadButton
              meterType={meterType}
              readingDate={readingDate}
              open={csvOpen}
              onOpenChange={setCsvOpen}
              onUploaded={() => {
                qc.invalidateQueries({ queryKey: [`/api/meters/latest`] });
                qc.invalidateQueries({ queryKey: [`/api/meters`] });
              }}
              templateRows={filteredUnits.map((u) => {
                const last = latestByUnit.get(u.id);
                return {
                  unitNumber: u.unitNumber,
                  previousReading: last ? Number(last.currentReading) : "",
                };
              })}
            />
          )}
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className={`grid gap-3 ${presetMeterType ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
            {!presetMeterType && (
              <div>
                <Label className="text-xs">미터 종류</Label>
                <div className="grid grid-cols-5 gap-1 mt-1">
                  {METER_OPTS.map((opt) => (
                    <Button
                      key={opt.value}
                      variant={meterType === opt.value ? "default" : "outline"}
                      size="sm"
                      onClick={() => setMeterType(opt.value)}
                      className="flex flex-col h-auto py-2"
                    >
                      <opt.icon className={`h-4 w-4 ${meterType === opt.value ? "" : opt.color}`} />
                      <span className="text-[11px] mt-1">{opt.label}</span>
                    </Button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label className="text-xs">검침 유형</Label>
              <Tabs value={readingType} onValueChange={(v) => setReadingType(v as ReadingType)} className="mt-1">
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="regular">정기 검침</TabsTrigger>
                  <TabsTrigger value="interim">중간 검침 (이사)</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            <div>
              <Label className="text-xs">검침일</Label>
              <Input type="date" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} className="mt-1" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">호실 선택</CardTitle>
            <CardDescription className="text-xs">
              초록 체크는 <strong>오늘({readingDate}) 이미 입력</strong>된 호실입니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="호실 검색"
                value={unitFilter}
                onChange={(e) => setUnitFilter(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="max-h-[420px] overflow-y-auto border rounded-md divide-y">
              {filteredUnits.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  {unitsQuery.isLoading ? "불러오는 중..." : "호실이 없습니다"}
                </div>
              ) : filteredUnits.map((u) => {
                const last = latestByUnit.get(u.id);
                const enteredToday = last?.readingDate === readingDate;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedUnitId(u.id)}
                    className={`w-full text-left px-3 py-2 hover:bg-accent flex items-center justify-between ${selectedUnitId === u.id ? "bg-accent" : ""}`}
                  >
                    <div>
                      <div className="font-medium text-sm">{u.unitNumber}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {last ? `직전 ${last.readingDate} · ${last.currentReading}` : "이력 없음"}
                      </div>
                    </div>
                    {enteredToday && <CheckCircle2 className="h-4 w-4 text-green-600" />}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {selectedUnit ? `${selectedUnit.unitNumber} 호` : "호실을 선택해 주세요"}
            </CardTitle>
            <CardDescription className="text-xs">
              전월값은 자동 표시됩니다. 사진 버튼으로 계량기 사진을 찍으면 숫자가 자동 입력됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <Label className="text-xs">전월 검침값</Label>
                <Input
                  value={previousValid ? String(previousReading) : ""}
                  readOnly
                  placeholder={previousValid ? "" : "이력 없음 — 사용량 계산 안 됨"}
                  className="mt-1 bg-muted"
                />
              </div>
              <div>
                <Label className="text-xs flex items-center justify-between">
                  <span>금월 검침값</span>
                  {ocrConfidence != null && (
                    <Badge variant="outline" className="text-[10px]">
                      OCR 신뢰도 {(ocrConfidence * 100).toFixed(0)}%
                    </Badge>
                  )}
                </Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={currentReading}
                    onChange={(e) => { setCurrentReading(e.target.value); setOcrConfidence(null); }}
                    placeholder={readOnly ? "조회 전용" : "숫자만 입력"}
                    className="text-xl font-bold"
                    readOnly={readOnly}
                    disabled={readOnly}
                  />
                  {!readOnly && (
                    <PhotoButton onPick={handlePhotoPick} disabled={isUploading || ocrMut.isPending} loading={isUploading || ocrMut.isPending} />
                  )}
                </div>
              </div>
            </div>

            {usage != null && (
              <div className={`rounded-md border p-3 ${anomalyHint ? "border-red-300 bg-red-50 dark:bg-red-950/30" : "bg-muted"}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">사용량 (금월 - 전월)</div>
                    <div className="text-2xl font-bold">{usage.toLocaleString()}</div>
                  </div>
                  {anomalyHint && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      평균 대비 30% 초과
                    </Badge>
                  )}
                </div>
                {recentAvgUsage != null && (
                  <div className="text-[11px] text-muted-foreground mt-1">
                    최근 평균 {recentAvgUsage.toFixed(1)}
                  </div>
                )}
              </div>
            )}

            {readingType === "interim" && (
              <div className="rounded-md border-2 border-dashed border-orange-300 p-3 space-y-3 bg-orange-50/50 dark:bg-orange-950/20">
                <div className="text-xs font-medium text-orange-700 dark:text-orange-300">
                  중간 검침 — 책임 구간을 입력하면 임대인/임차인 분할 정산에 사용됩니다.
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">구간 시작</Label>
                    <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">구간 종료</Label>
                    <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">책임자 (선택)</Label>
                  <Select value={tenantId ? String(tenantId) : ""} onValueChange={(v) => setTenantId(v ? Number(v) : null)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder={selectedUnit ? "현 임차인 선택" : "호실 먼저 선택"} />
                    </SelectTrigger>
                    <SelectContent>
                      {tenants
                        .filter((t) => !selectedUnit || t.unit === selectedUnit.unitNumber)
                        .map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            {t.tenantName} ({t.unit})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => { setCurrentReading(""); setOcrConfidence(null); setOcrPath(null); }}
                disabled={readOnly || !currentReading}
              >
                지우기
              </Button>
              <Button
                onClick={handleSave}
                disabled={readOnly || createMut.isPending || !selectedUnit || !currentReading}
              >
                {readOnly ? "조회 전용" : "저장 후 다음 호실"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedUnit && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{selectedUnit.unitNumber} 호실 이력</CardTitle>
            <CardDescription className="text-xs">
              최근 12건. 정기/중간 검침이 함께 표시되며, 중간 검침은 책임 구간이 시각화됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">이력이 없습니다</div>
            ) : (
              <div className="space-y-1">
                {history.map((h) => {
                  const canEdit = !readOnly && (isManagerLike || (currentUserId != null && h.authorId === currentUserId));
                  const canDelete = !readOnly && isManagerLike;
                  return (
                    <div key={h.id} className="flex items-center justify-between text-sm border-b py-2 last:border-b-0 gap-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="font-medium tabular-nums">{h.readingDate}</span>
                        <Badge variant={h.readingType === "interim" ? "secondary" : "outline"} className="text-[10px]">
                          {h.readingType === "interim" ? "중간" : "정기"}
                        </Badge>
                        {h.inputMethod === "photo" && <Camera className="h-3 w-3 text-muted-foreground" />}
                        {h.inputMethod === "csv" && <Upload className="h-3 w-3 text-muted-foreground" />}
                        {h.isAnomaly && <AlertTriangle className="h-3 w-3 text-red-500" />}
                        {h.authorRole && (
                          <Badge variant="outline" className="text-[10px]">
                            {roleLabel(h.authorRole)}
                          </Badge>
                        )}
                        {h.readingType === "interim" && h.periodStart && h.periodEnd && (
                          <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                            <span className="px-1 py-0.5 rounded bg-amber-100 text-amber-900">
                              전 입주자 책임 ~ {h.periodEnd}
                            </span>
                            <span className="text-muted-foreground">/</span>
                            <span className="px-1 py-0.5 rounded bg-emerald-100 text-emerald-900">
                              새 입주자 책임 {h.periodEnd} ~
                            </span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <span className="tabular-nums">{h.currentReading}</span>
                          {h.usage != null && (
                            <span className="text-[11px] text-muted-foreground ml-2">사용 {Number(h.usage).toLocaleString()}</span>
                          )}
                        </div>
                        <Button
                          type="button" variant="ghost" size="sm" className="h-7 w-7 p-0"
                          title="감사 이력"
                          onClick={() => setAuditFor(h.id)}
                        >
                          <History className="h-3.5 w-3.5" />
                        </Button>
                        {canEdit && (
                          <Button
                            type="button" variant="ghost" size="sm" className="h-7 w-7 p-0"
                            title="수정"
                            onClick={() => setEditFor(h)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"
                            title="삭제 (관리소장만)"
                            onClick={() => deleteReading(h.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <AuditDialog readingId={auditFor} onClose={() => setAuditFor(null)} />
      <EditReadingDialog
        reading={editFor}
        onClose={() => setEditFor(null)}
        onSubmit={(data) => editFor && updateMut.mutate({ id: editFor.id, data })}
        submitting={updateMut.isPending}
      />
    </div>
  );
}

function AuditDialog({ readingId, onClose }: { readingId: number | null; onClose: () => void }) {
  const auditsQuery = useListMeterReadingAudits(readingId ?? 0, {
    query: { enabled: readingId != null },
  });
  const audits = auditsQuery.data ?? [];
  return (
    <ResponsiveDialog open={readingId != null} onOpenChange={(o) => !o && onClose()}>
      <ResponsiveDialogContent className="max-w-lg">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center gap-2">
            <History className="h-4 w-4" /> 검침 감사 이력
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {auditsQuery.isLoading && <div className="text-sm text-muted-foreground">불러오는 중…</div>}
          {!auditsQuery.isLoading && audits.length === 0 && (
            <div className="text-sm text-muted-foreground py-4 text-center">감사 이력이 없습니다.</div>
          )}
          {audits.map((a) => (
            <div key={a.id} className="border rounded p-2 text-xs space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={a.action === "delete" ? "destructive" : a.action === "update" ? "secondary" : "outline"}>
                  {a.action === "create" ? "생성" : a.action === "update" ? "수정" : "삭제"}
                </Badge>
                {a.actorRole && <span className="text-muted-foreground">{roleLabel(a.actorRole)}</span>}
                <span className="text-muted-foreground ml-auto tabular-nums">
                  {new Date(a.createdAt).toLocaleString("ko-KR")}
                </span>
              </div>
              {a.diffSummary && <div className="text-muted-foreground whitespace-pre-wrap">{a.diffSummary}</div>}
            </div>
          ))}
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function EditReadingDialog({ reading, onClose, onSubmit, submitting }: {
  reading: MeterReading | null;
  onClose: () => void;
  onSubmit: (data: { currentReading: number; readingDate: string; editReason: string }) => void;
  submitting: boolean;
}) {
  const [val, setVal] = useState("");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (reading) {
      setVal(String(reading.currentReading ?? ""));
      setDate(reading.readingDate ?? "");
      setReason("");
    }
  }, [reading]);
  return (
    <ResponsiveDialog open={reading != null} onOpenChange={(o) => !o && onClose()}>
      <ResponsiveDialogContent className="max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" /> 검침 수정
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">검침일</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">현재 지침</Label>
            <Input
              type="number" inputMode="decimal"
              value={val} onChange={(e) => setVal(e.target.value)}
              className="text-lg font-bold"
            />
          </div>
          <div>
            <Label className="text-xs">수정 사유 (감사로그)</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="예: 오기재 정정" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>취소</Button>
            <Button
              onClick={() => onSubmit({ currentReading: Number(val), readingDate: date, editReason: reason })}
              disabled={submitting || !val || !date}
            >
              저장
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function PhotoButton({ onPick, disabled, loading }: {
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled: boolean;
  loading: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPick}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => ref.current?.click()}
        disabled={disabled}
        className="shrink-0"
      >
        <Camera className="h-4 w-4 mr-1" />
        {loading ? "인식 중..." : "사진"}
      </Button>
    </>
  );
}

function CsvUploadButton(props: {
  meterType: MeterType;
  readingDate: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploaded: () => void;
  templateRows: Array<{ unitNumber: string; previousReading: number | "" }>;
}) {
  const { meterType, readingDate, open, onOpenChange, onUploaded, templateRows } = props;
  const { toast } = useToast();
  const [rows, setRows] = useState<Array<{ unitNumber: string; currentReading: number; previousReading?: number }>>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);

  const [report, setReport] = useState<{ imported: number; anomalies: number; errors: string[] } | null>(null);
  const upload = useUploadMeterCsv({
    mutation: {
      onSuccess: (res) => {
        // [Task #630] 행별 오류·이상치 리포트를 다이얼로그에 그대로 보여 준다.
        //   토스트만 띄우고 닫으면 운영자가 어떤 행이 실패했는지 모르므로
        //   res.errors 가 있으면 닫지 않고 리포트 패널을 표시.
        setReport({ imported: res.imported, anomalies: res.anomalies, errors: res.errors ?? [] });
        toast({
          title: "CSV 업로드 완료",
          description: `${res.imported}건 저장 / 이상치 ${res.anomalies}건 / 실패 ${(res.errors ?? []).length}건`,
        });
        onUploaded();
        if (!res.errors || res.errors.length === 0) {
          setRows([]);
          setErrors([]);
        }
      },
      onError: (err: Error) => toast({
        title: "업로드 실패",
        description: err.message,
        variant: "destructive",
      }),
    },
  });

  // 공통 파싱: 객체 배열 → rows 검증 (CSV·Excel 모두 동일 검증으로 모음).
  function ingest(records: Array<Record<string, unknown>>) {
    const errs: string[] = [];
    const out: typeof rows = [];
    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const unitNumber = String(row["호실번호"] ?? row["unitNumber"] ?? "").trim();
      const curRaw = row["금월검침"] ?? row["currentReading"];
      const prevRaw = row["전월검침"] ?? row["previousReading"];
      if (!unitNumber) { errs.push(`행 ${i + 2}: 호실번호 누락`); continue; }
      const cur = Number(typeof curRaw === "string" ? curRaw.trim() : curRaw);
      if (!Number.isFinite(cur)) { errs.push(`행 ${i + 2}: 금월검침이 숫자가 아님 (${String(curRaw ?? "")})`); continue; }
      const prevStr = typeof prevRaw === "string" ? prevRaw.trim() : prevRaw;
      const prev = prevStr != null && prevStr !== "" ? Number(prevStr) : undefined;
      out.push({
        unitNumber,
        currentReading: cur,
        ...(prev != null && Number.isFinite(prev) ? { previousReading: prev } : {}),
      });
    }
    setRows(out);
    setErrors(errs);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setParsing(true);
    setErrors([]);
    const isExcel = /\.xlsx?$/i.test(file.name);
    if (isExcel) {
      // [Task #630] SheetJS 로 .xlsx / .xls 파싱. 첫 시트만 사용.
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const wb = XLSX.read(reader.result, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
          ingest(data);
        } catch (err) {
          setErrors([err instanceof Error ? err.message : String(err)]);
        } finally {
          setParsing(false);
        }
      };
      reader.onerror = () => { setErrors(["엑셀 파일을 읽지 못했습니다"]); setParsing(false); };
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          ingest(result.data);
          setParsing(false);
        },
        error: (err) => { setErrors([err.message]); setParsing(false); },
      });
    }
  }

  function downloadSample(kind: "csv" | "xlsx") {
    // [Task #630] 빈 템플릿이 아니라 실제 호실 + 직전 정기 검침을 미리 채워 내려준다.
    //   현장에서 금월 칸만 채워 다시 올리면 되도록 한다.
    const fallback: Array<{ unitNumber: string; previousReading: number | "" }> = [
      { unitNumber: "101", previousReading: "" },
      { unitNumber: "102", previousReading: "" },
    ];
    const data = templateRows.length > 0 ? templateRows : fallback;
    const fname = `meter-template-${meterType}-${readingDate}`;
    if (kind === "csv") {
      const lines = ["호실번호,금월검침,전월검침"];
      for (const r of data) lines.push(`${r.unitNumber},,${r.previousReading}`);
      const csv = "\uFEFF" + lines.join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${fname}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } else {
      const aoa: (string | number)[][] = [["호실번호", "금월검침", "전월검침"]];
      for (const r of data) aoa.push([r.unitNumber, "", r.previousReading]);
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "검침");
      XLSX.writeFile(wb, `${fname}.xlsx`);
    }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <Button variant="outline" size="sm" onClick={() => onOpenChange(true)}>
        <Upload className="w-4 h-4 mr-1" /> CSV 업로드
      </Button>
      <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>검침 CSV 일괄 업로드</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            <strong>{METER_OPTS.find((o) => o.value === meterType)?.label}</strong> 미터 / 검침일 <strong>{readingDate}</strong> 으로 저장됩니다.
            형식: <code>호실번호, 금월검침, 전월검침(선택)</code>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => downloadSample("csv")}>
              <Download className="w-3.5 h-3.5 mr-1" /> CSV 샘플
            </Button>
            <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => downloadSample("xlsx")}>
              <Download className="w-3.5 h-3.5 mr-1" /> Excel 샘플
            </Button>
          </div>
          <Input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} disabled={parsing} />
          {parsing && <p className="text-xs text-muted-foreground">파일 파싱 중...</p>}
          {errors.length > 0 && (
            <div className="bg-destructive/10 p-3 rounded text-xs space-y-1 max-h-40 overflow-y-auto">
              {errors.map((e, i) => <p key={i} className="text-destructive">{e}</p>)}
            </div>
          )}
          {rows.length > 0 && (
            <div className="border rounded-md max-h-60 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-xs sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">호실</th>
                    <th className="text-right px-3 py-2">금월</th>
                    <th className="text-right px-3 py-2">전월</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 100).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-1.5">{r.unitNumber}</td>
                      <td className="text-right px-3 py-1.5 tabular-nums">{r.currentReading}</td>
                      <td className="text-right px-3 py-1.5 tabular-nums">{r.previousReading ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 100 && (
                <div className="text-xs text-muted-foreground text-center py-2">+{rows.length - 100}행 더 있음</div>
              )}
            </div>
          )}
          {report && (
            <div className="border rounded-md p-3 text-xs space-y-2 bg-muted/30">
              <div className="flex flex-wrap gap-2 items-center font-medium">
                <Badge variant="outline">저장 {report.imported}건</Badge>
                {report.anomalies > 0 && <Badge variant="secondary">이상치 {report.anomalies}건</Badge>}
                {report.errors.length > 0 && <Badge variant="destructive">실패 {report.errors.length}건</Badge>}
              </div>
              {report.errors.length > 0 && (
                <div className="bg-destructive/10 p-2 rounded space-y-0.5 max-h-40 overflow-y-auto">
                  {report.errors.map((e, i) => <p key={i} className="text-destructive">{e}</p>)}
                </div>
              )}
              <p className="text-muted-foreground">
                실패 행은 수정 후 다시 업로드하거나 검침 화면에서 직접 입력해 주세요.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => { setReport(null); onOpenChange(false); }}>
              <X className="w-4 h-4 mr-1" /> {report ? "닫기" : "취소"}
            </Button>
            <Button
              onClick={() => { setReport(null); upload.mutate({ data: { meterType, readingDate, rows } }); }}
              disabled={rows.length === 0 || upload.isPending}
            >
              {rows.length}건 업로드
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

// [Task #630] 사용자 입력 기간/호실/미터 종류 필터로 CSV 내보내기 다이얼로그.
function ExportDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMeterType: MeterType;
  onExport: (filters: { from: string; to: string; unitNumber: string; meterType: MeterType | "all" }) => void;
}) {
  const { open, onOpenChange, defaultMeterType, onExport } = props;
  const [from, setFrom] = useState(daysAgoStr(180));
  const [to, setTo] = useState(todayStr());
  const [unitNumber, setUnitNumber] = useState("");
  const [type, setType] = useState<MeterType | "all">(defaultMeterType);
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>검침 내보내기</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">시작일</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">종료일</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">미터 종류</Label>
            <Select value={type} onValueChange={(v) => setType(v as MeterType | "all")}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                {METER_OPTS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">호실 번호 (선택)</Label>
            <Input value={unitNumber} onChange={(e) => setUnitNumber(e.target.value)} placeholder="예: 101 — 비우면 전체" className="mt-1" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
            <Button onClick={() => { onExport({ from, to, unitNumber, meterType: type }); onOpenChange(false); }}>
              <Download className="w-4 h-4 mr-1" /> 내보내기
            </Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
