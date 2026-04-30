// [Task #675] 호실 기초정보 영역 — 설정 → 건물정보 수정 안에서
// 호실 추가 / 수정 / 삭제 / CSV 업로드 / 자동 생성을 한곳에서 수행한다.
//
// 종전엔 호실관리 화면(/units)의 우상단 액션바에 흩어져 있던 버튼들을 그대로
// 재사용해, 권한 체계와 mutation/캐시 무효화 흐름을 동일하게 유지한다.
// 일상 조회 화면(/units)은 펼침 전용으로 단순화되어, 잘못된 클릭으로
// 관리비 부과·이력에 영향이 가는 사고를 줄이기 위해 분리됐다.

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  useListUnits,
  useCreateUnit,
  useUpdateUnit,
  useDeleteUnit,
  useBulkCreateUnits,
  useGenerateUnits,
  getListUnitsQueryKey,
  getGetUnitsSummaryQueryKey,
  type Unit,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Edit, Search, Trash2 } from "lucide-react";
import { CsvUploadDialog, type CsvRow } from "@/components/units/csv-upload-dialog";
import { GenerateDialog, type GenForm } from "@/components/units/generate-dialog";
import { UnitFormDialog, type UnitFormState } from "@/components/units/unit-form-dialog";
import { useAuth } from "@/contexts/auth-context";

const emptyForm: UnitFormState = {
  unitNumber: "",
  floor: "",
  exclusiveArea: "",
  commonArea: "",
  usage: "주거",
  notes: "",
  status: "vacant",
};

const STATUS_LABEL: Record<string, string> = {
  vacant: "공실",
  occupied: "입주",
  maintenance: "정비중",
};

export function StepUnitsBaseInfo() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // [Task #675] 호실 기초정보 변경은 호실관리 화면과 동일한 권한 집합에서만 노출.
  //   서버는 manager / accountant / platform_admin 만 호실 mutation 을 허용한다.
  const canManageUnits =
    user?.role === "manager" ||
    user?.role === "accountant" ||
    user?.role === "platform_admin";

  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [csvData, setCsvData] = useState<CsvRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [csvParsing, setCsvParsing] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [form, setForm] = useState<UnitFormState>({ ...emptyForm });
  const [genForm, setGenForm] = useState<GenForm>({
    startFloor: "1",
    endFloor: "10",
    unitsPerFloor: "10",
    startUnit: "1",
    prefix: "",
    usage: "",
  });

  const { data: units, isLoading } = useListUnits(
    search ? { search } : undefined,
    { query: { enabled: canManageUnits } },
  );
  const createMutation = useCreateUnit();
  const updateMutation = useUpdateUnit();
  const deleteMutation = useDeleteUnit();
  const bulkMutation = useBulkCreateUnits();
  const generateMutation = useGenerateUnits();

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

  async function handleConfirmDelete() {
    if (!confirmDeleteId) return;
    await deleteMutation.mutateAsync({ id: confirmDeleteId });
    invalidateAll();
    toast({ title: "호실이 삭제되었습니다" });
    setConfirmDeleteId(null);
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
              errors.push(
                `${i + 2}행: 호실번호 '${row["호실번호"]}'가 CSV 내에서 중복됩니다`,
              );
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
      toast({
        title: "CSV 모듈 로드 실패",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
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
      description:
        result.errors.length > 0 ? `${result.errors.length}건 오류 발생` : undefined,
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
    const csv =
      "호실번호,층,전용면적,공용면적,용도,비고\n101,1,33.5,12.1,사무실,\n102,1,28.0,10.5,사무실,코너호실\n201,2,33.5,12.1,사무실,\n";
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "호실_샘플.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // [Task #675] 권한이 없는 사용자에게는 영역 자체를 노출하지 않는다(접근만 가능).
  if (!canManageUnits) return null;

  return (
    <Card data-testid="card-units-base-info">
      <CardHeader>
        <CardTitle className="text-lg">호실 기초정보</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* [Task #675] 시니어 사용자 안전장치 — 호실 정보 변경이 미치는 영향 안내. */}
        <Alert variant="destructive" data-testid="alert-units-base-info-warning">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>
            호실 정보를 변경하거나 삭제하면 관리비 부과·이력에 영향이 갈 수 있습니다.
            반드시 내용을 한 번 더 확인하고 진행해 주세요.
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap gap-2">
          <CsvUploadDialog
            open={csvDialogOpen}
            onOpenChange={(o) => {
              setCsvDialogOpen(o);
              if (!o) {
                setCsvData([]);
                setCsvErrors([]);
              }
            }}
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
            onOpenChange={(o) => {
              setDialogOpen(o);
              if (!o) resetForm();
            }}
            editing={!!editing}
            form={form}
            setForm={setForm}
            onSubmit={handleSubmit}
          />
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="호실번호로 빠른 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-units-base-info-search"
          />
        </div>

        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">층</TableHead>
                <TableHead className="w-[120px]">호실</TableHead>
                <TableHead>용도</TableHead>
                <TableHead>면적</TableHead>
                <TableHead className="w-[80px]">상태</TableHead>
                <TableHead className="w-[120px] text-right">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    불러오는 중...
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && (!units || units.length === 0) && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    {search
                      ? "검색 결과가 없습니다."
                      : "등록된 호실이 없습니다. 위 버튼으로 호실을 추가하거나 CSV 업로드/자동 생성을 진행해 주세요."}
                  </TableCell>
                </TableRow>
              )}
              {!isLoading &&
                units &&
                units.map((u) => (
                  <TableRow key={u.id} data-testid={`row-base-unit-${u.id}`}>
                    <TableCell className="font-mono text-xs">{u.floor}</TableCell>
                    <TableCell className="font-medium">{u.unitNumber}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{u.usage || "-"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.exclusiveArea ? `${u.exclusiveArea}m²` : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px]">
                        {STATUS_LABEL[u.status] || u.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEdit(u)}
                          data-testid={`btn-base-unit-edit-${u.id}`}
                          title="호실 정보 수정"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setConfirmDeleteId(u.id)}
                          data-testid={`btn-base-unit-delete-${u.id}`}
                          title="호실 삭제"
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>

        <AlertDialog
          open={!!confirmDeleteId}
          onOpenChange={(o) => {
            if (!o) setConfirmDeleteId(null);
          }}
        >
          <AlertDialogContent data-testid="dialog-confirm-delete-unit">
            <AlertDialogHeader>
              <AlertDialogTitle>이 호실을 삭제할까요?</AlertDialogTitle>
              <AlertDialogDescription>
                삭제된 호실은 되돌릴 수 없으며, 해당 호실을 참조한 관리비 부과·이력에
                영향이 갈 수 있습니다. 정말 삭제하시겠어요?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>취소</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmDelete}
                data-testid="btn-confirm-delete-unit"
              >
                삭제
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
