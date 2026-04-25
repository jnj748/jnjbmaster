import { useState, useMemo, lazy, Suspense } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/auth-context";

// [Task #141] 소유자 관리(/owners) 라우트 폐지 — 호실 관리 화면의 탭으로 흡수.
//   백엔드 /api/owners 가 manager/platform_admin 만 허용하므로, 동일 권한일 때만 탭 노출.
const Owners = lazy(() => import("@/pages/owners"));
import {
  useListUnits,
  useCreateUnit,
  useUpdateUnit,
  useDeleteUnit,
  useBulkCreateUnits,
  useGenerateUnits,
  useGetUnit,
  useGetUnitsSummary,
  getListUnitsQueryKey,
  getGetUnitsSummaryQueryKey,
} from "@workspace/api-client-react";
import type { Unit, GetUnit200 } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, DownloadCloud } from "lucide-react";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { CsvUploadDialog, type CsvRow } from "@/components/units/csv-upload-dialog";
import { GenerateDialog, type GenForm } from "@/components/units/generate-dialog";
import { UnitFormDialog, type UnitFormState } from "@/components/units/unit-form-dialog";
import { UnitDetailDialog } from "@/components/units/unit-detail-dialog";
import { UnitsSummaryCards } from "@/components/units/units-summary-cards";
import { UnitsFloorList } from "@/components/units/units-floor-list";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  vacant: { label: "공실", variant: "secondary" },
  occupied: { label: "입주", variant: "default" },
  maintenance: { label: "정비중", variant: "destructive" },
};

const emptyForm: UnitFormState = {
  unitNumber: "",
  floor: "",
  exclusiveArea: "",
  commonArea: "",
  usage: "주거",
  notes: "",
  status: "vacant",
};

export default function UnitsPage() {
  const [, navigate] = useLocation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [searchTerm, setSearchTerm] = useState("");
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [detailUnitId, setDetailUnitId] = useState<number | null>(null);
  const [csvData, setCsvData] = useState<CsvRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvParsing, setCsvParsing] = useState(false);
  const [genForm, setGenForm] = useState<GenForm>({
    startFloor: "1",
    endFloor: "10",
    unitsPerFloor: "10",
    startUnit: "1",
    prefix: "",
    usage: "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManageOwners = user?.role === "manager" || user?.role === "platform_admin";
  // [Task #141] /owners 레거시 진입은 /units?tab=owners 로 리디렉트되어 오므로 초기 탭에 반영.
  const initialUnitsTab = (() => {
    if (typeof window === "undefined") return "units";
    const t = new URLSearchParams(window.location.search).get("tab");
    return t === "owners" && canManageOwners ? "owners" : "units";
  })();

  const { data: units, isLoading } = useListUnits(
    {
      ...(filterStatus && filterStatus !== "all" ? { status: filterStatus as "vacant" | "occupied" | "maintenance" } : {}),
      ...(searchTerm ? { search: searchTerm } : {}),
    }
  );
  const { data: summary } = useGetUnitsSummary();
  const { data: unitDetail } = useGetUnit(detailUnitId!, { query: { enabled: !!detailUnitId } }) as { data: GetUnit200 | undefined };
  const createMutation = useCreateUnit();
  const updateMutation = useUpdateUnit();
  const deleteMutation = useDeleteUnit();
  const bulkMutation = useBulkCreateUnits();
  const generateMutation = useGenerateUnits();

  const [form, setForm] = useState<UnitFormState>({ ...emptyForm });

  const floorGroups = useMemo(() => {
    if (!units) return [];
    const grouped = new Map<string, Unit[]>();
    for (const u of units) {
      const arr = grouped.get(u.floor) || [];
      arr.push(u);
      grouped.set(u.floor, arr);
    }
    return Array.from(grouped.entries())
      .sort((a, b) => {
        const numA = parseInt(a[0]);
        const numB = parseInt(b[0]);
        const isNumA = !isNaN(numA);
        const isNumB = !isNaN(numB);
        if (isNumA && isNumB) return numB - numA;
        if (isNumA) return -1;
        if (isNumB) return 1;
        return a[0].localeCompare(b[0]);
      });
  }, [units]);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getListUnitsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetUnitsSummaryQueryKey() });
  }

  function resetForm() {
    setForm({ ...emptyForm });
    setEditing(null);
  }

  function openEdit(item: Unit) {
    setEditing(item);
    setForm({
      unitNumber: item.unitNumber,
      floor: item.floor,
      exclusiveArea: item.exclusiveArea || "",
      commonArea: item.commonArea || "",
      usage: item.usage || "주거",
      notes: item.notes || "",
      status: item.status,
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (editing) {
      await updateMutation.mutateAsync({
        id: editing.id,
        data: {
          unitNumber: form.unitNumber,
          floor: form.floor,
          exclusiveArea: form.exclusiveArea || null,
          commonArea: form.commonArea || null,
          usage: form.usage || null,
          notes: form.notes || null,
          status: form.status as "vacant" | "occupied" | "maintenance",
        },
      });
      toast({ title: "호실 정보가 수정되었습니다" });
    } else {
      await createMutation.mutateAsync({
        data: {
          unitNumber: form.unitNumber,
          floor: form.floor,
          exclusiveArea: form.exclusiveArea || null,
          commonArea: form.commonArea || null,
          usage: form.usage || "주거",
          notes: form.notes || null,
          status: form.status as "vacant" | "occupied" | "maintenance",
        },
      });
      toast({ title: "호실이 등록되었습니다" });
    }
    invalidateAll();
    setDialogOpen(false);
    resetForm();
  }

  async function handleDelete(id: number) {
    await deleteMutation.mutateAsync({ id });
    invalidateAll();
    toast({ title: "호실이 삭제되었습니다" });
  }

  async function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvParsing(true);
    try {
    const { default: Papa } = await import("papaparse");
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const errors: string[] = [];
        const valid: CsvRow[] = [];
        const seen = new Set<string>();
        results.data.forEach((row, i) => {
          if (!row["호실번호"] || !row["층"]) {
            errors.push(`${i + 2}행: 호실번호와 층은 필수입니다`);
            return;
          }
          if (row["전용면적"] && isNaN(Number(row["전용면적"]))) {
            errors.push(`${i + 2}행: 전용면적은 숫자여야 합니다`);
            return;
          }
          if (row["공용면적"] && isNaN(Number(row["공용면적"]))) {
            errors.push(`${i + 2}행: 공용면적은 숫자여야 합니다`);
            return;
          }
          if (seen.has(row["호실번호"])) {
            errors.push(`${i + 2}행: 호실번호 '${row["호실번호"]}'가 CSV 내에서 중복됩니다`);
            return;
          }
          seen.add(row["호실번호"]);
          valid.push(row);
        });
        setCsvData(valid);
        setCsvErrors(errors);
        setCsvParsing(false);
      },
      error() {
        setCsvParsing(false);
        toast({ title: "CSV 파싱 실패", variant: "destructive" });
      },
    });
    } catch (err) {
      setCsvParsing(false);
      toast({ title: "CSV 모듈 로드 실패", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
    }
  }

  async function handleCsvImport() {
    const unitData = csvData.map((row) => ({
      unitNumber: row["호실번호"],
      floor: row["층"],
      exclusiveArea: row["전용면적"] || null,
      commonArea: row["공용면적"] || null,
      usage: row["용도"] || null,
      notes: row["비고"] || null,
    }));

    const result = await bulkMutation.mutateAsync({ data: { units: unitData } });
    invalidateAll();
    toast({
      title: `${result.created}개 호실이 등록되었습니다`,
      description: result.errors.length > 0
        ? `${result.errors.length}건 오류 발생`
        : undefined,
    });
    setCsvDialogOpen(false);
    setCsvData([]);
    setCsvErrors([]);
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    const result = await generateMutation.mutateAsync({
      data: {
        startFloor: parseInt(genForm.startFloor),
        endFloor: parseInt(genForm.endFloor),
        unitsPerFloor: parseInt(genForm.unitsPerFloor),
        startUnit: parseInt(genForm.startUnit) || 1,
        prefix: genForm.prefix || undefined,
        usage: genForm.usage || undefined,
      },
    });
    invalidateAll();
    toast({ title: `${result.created}개 호실이 자동 생성되었습니다` });
    setGenerateDialogOpen(false);
  }

  function downloadSampleCsv() {
    const csv = "호실번호,층,전용면적,공용면적,용도,비고\n101,1,33.5,12.1,사무실,\n102,1,28.0,10.5,사무실,코너호실\n201,2,33.5,12.1,사무실,\n";
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "호실_샘플.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Tabs defaultValue={initialUnitsTab} className="space-y-6">
      <TabsList>
        <TabsTrigger value="units">호실 관리</TabsTrigger>
        {canManageOwners && <TabsTrigger value="owners">소유자 관리</TabsTrigger>}
      </TabsList>
      <TabsContent value="units" className="space-y-6 mt-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">호실 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            건물 호실을 등록하고 관리합니다
          </p>
        </div>
        <div className="flex gap-2">
          <CsvUploadDialog
            open={csvDialogOpen}
            onOpenChange={(o) => { setCsvDialogOpen(o); if (!o) { setCsvData([]); setCsvErrors([]); } }}
            csvData={csvData}
            csvErrors={csvErrors}
            csvParsing={csvParsing}
            isPending={bulkMutation.isPending}
            onFileChange={handleCsvFile}
            onImport={handleCsvImport}
            onDownloadSample={downloadSampleCsv}
          />

          <GenerateDialog
            open={generateDialogOpen}
            onOpenChange={setGenerateDialogOpen}
            genForm={genForm}
            setGenForm={setGenForm}
            isPending={generateMutation.isPending}
            onSubmit={handleGenerate}
          />

          <UnitFormDialog
            open={dialogOpen}
            onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}
            editing={!!editing}
            form={form}
            setForm={setForm}
            onSubmit={handleSubmit}
          />

          {/* [Task #348] 건축물대장 → 호실 일괄 가져오기 바로가기. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/settings/building?tab=units-import")}
          >
            <DownloadCloud className="w-4 h-4 mr-1" />
            대장 동기화
          </Button>
        </div>
      </div>

      {summary && <UnitsSummaryCards summary={summary} />}

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="호실번호, 용도 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder="상태" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="vacant">공실</SelectItem>
            <SelectItem value="occupied">입주</SelectItem>
            <SelectItem value="maintenance">정비중</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <UnitsFloorList
        isLoading={isLoading}
        units={units}
        floorGroups={floorGroups}
        statusMap={STATUS_MAP}
        onView={(id) => setDetailUnitId(id)}
        onEdit={(unit) => openEdit(unit)}
        onDelete={(id) => handleDelete(id)}
      />

      <UnitDetailDialog
        detailUnitId={detailUnitId}
        unitDetail={unitDetail}
        onClose={() => setDetailUnitId(null)}
        onEdit={() => { setDetailUnitId(null); const u = units?.find(x => x.id === detailUnitId); if (u) openEdit(u); }}
        onDelete={() => { if (detailUnitId) { handleDelete(detailUnitId); setDetailUnitId(null); } }}
      />
      </TabsContent>
      {canManageOwners && (
        <TabsContent value="owners" className="mt-0">
          <Suspense fallback={<div className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-32" /></div>}>
            <Owners />
          </Suspense>
        </TabsContent>
      )}
    </Tabs>
  );
}
