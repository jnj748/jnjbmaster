import { useState, useMemo } from "react";
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
import type { Unit } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "@/components/ui/responsive-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Trash2,
  Edit,
  Search,
  Upload,
  Download,
  Layers,
  DoorOpen,
  Building2,
  Eye,
  Users,
  UserCheck,
  Car,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Papa from "papaparse";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> = {
  vacant: { label: "공실", variant: "secondary" },
  occupied: { label: "입주", variant: "default" },
  maintenance: { label: "정비중", variant: "destructive" },
};

const USAGE_OPTIONS = ["주거", "사무실", "상가", "기타"] as const;

const emptyForm = {
  unitNumber: "",
  floor: "",
  exclusiveArea: "",
  commonArea: "",
  usage: "주거",
  notes: "",
  status: "vacant" as string,
};

interface CsvRow {
  호실번호: string;
  층: string;
  전용면적?: string;
  공용면적?: string;
  용도?: string;
  비고?: string;
}

export default function UnitsPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | undefined>();
  const [searchTerm, setSearchTerm] = useState("");
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [detailUnitId, setDetailUnitId] = useState<number | null>(null);
  const [csvData, setCsvData] = useState<CsvRow[]>([]);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [genForm, setGenForm] = useState({
    startFloor: "1",
    endFloor: "10",
    unitsPerFloor: "10",
    startUnit: "1",
    prefix: "",
    usage: "",
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: units, isLoading } = useListUnits(
    {
      ...(filterStatus && filterStatus !== "all" ? { status: filterStatus as "vacant" | "occupied" | "maintenance" } : {}),
      ...(searchTerm ? { search: searchTerm } : {}),
    }
  );
  const { data: summary } = useGetUnitsSummary();
  const { data: unitDetail } = useGetUnit(detailUnitId!, { query: { enabled: !!detailUnitId } });
  const createMutation = useCreateUnit();
  const updateMutation = useUpdateUnit();
  const deleteMutation = useDeleteUnit();
  const bulkMutation = useBulkCreateUnits();
  const generateMutation = useGenerateUnits();

  const [form, setForm] = useState({ ...emptyForm });

  const floorGroups = useMemo(() => {
    if (!units) return [];
    const grouped = new Map<number, Unit[]>();
    for (const u of units) {
      const arr = grouped.get(u.floor) || [];
      arr.push(u);
      grouped.set(u.floor, arr);
    }
    return Array.from(grouped.entries())
      .sort((a, b) => b[0] - a[0]);
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
      floor: String(item.floor),
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
          floor: parseInt(form.floor),
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
          floor: parseInt(form.floor),
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

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
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
          if (isNaN(parseInt(row["층"]))) {
            errors.push(`${i + 2}행: 층은 숫자여야 합니다`);
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
      },
    });
  }

  async function handleCsvImport() {
    const unitData = csvData.map((row) => ({
      unitNumber: row["호실번호"],
      floor: parseInt(row["층"]),
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">호실 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            건물 호실을 등록하고 관리합니다
          </p>
        </div>
        <div className="flex gap-2">
          <ResponsiveDialog open={csvDialogOpen} onOpenChange={(o) => { setCsvDialogOpen(o); if (!o) { setCsvData([]); setCsvErrors([]); } }}>
            <ResponsiveDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Upload className="w-4 h-4 mr-1" />
                <span className="hidden desktop:inline">CSV 업로드</span>
              </Button>
            </ResponsiveDialogTrigger>
            <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <ResponsiveDialogHeader>
                <ResponsiveDialogTitle>CSV 일괄 등록</ResponsiveDialogTitle>
              </ResponsiveDialogHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Button variant="link" size="sm" className="p-0 h-auto" onClick={downloadSampleCsv}>
                    <Download className="w-3.5 h-3.5 mr-1" />
                    샘플 CSV 다운로드
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  CSV 형식: 호실번호, 층, 전용면적, 공용면적, 용도, 비고
                </p>
                <Input type="file" accept=".csv" onChange={handleCsvFile} />
                {csvErrors.length > 0 && (
                  <div className="bg-destructive/10 p-3 rounded text-sm space-y-1">
                    {csvErrors.map((err, i) => (
                      <p key={i} className="text-destructive">{err}</p>
                    ))}
                  </div>
                )}
                {csvData.length > 0 && (
                  <>
                    <p className="text-sm font-medium">{csvData.length}개 호실 미리보기</p>
                    <div className="max-h-60 overflow-y-auto border rounded">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>호실번호</TableHead>
                            <TableHead>층</TableHead>
                            <TableHead>전용면적</TableHead>
                            <TableHead>공용면적</TableHead>
                            <TableHead>용도</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {csvData.slice(0, 20).map((row, i) => (
                            <TableRow key={i}>
                              <TableCell>{row["호실번호"]}</TableCell>
                              <TableCell>{row["층"]}</TableCell>
                              <TableCell>{row["전용면적"] || "-"}</TableCell>
                              <TableCell>{row["공용면적"] || "-"}</TableCell>
                              <TableCell>{row["용도"] || "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {csvData.length > 20 && (
                        <p className="text-xs text-muted-foreground text-center py-2">
                          ... 외 {csvData.length - 20}개
                        </p>
                      )}
                    </div>
                    <Button className="w-full" onClick={handleCsvImport} disabled={bulkMutation.isPending}>
                      {bulkMutation.isPending ? "등록 중..." : `${csvData.length}개 호실 등록`}
                    </Button>
                  </>
                )}
              </div>
            </ResponsiveDialogContent>
          </ResponsiveDialog>

          <ResponsiveDialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
            <ResponsiveDialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Layers className="w-4 h-4 mr-1" />
                <span className="hidden desktop:inline">자동 생성</span>
              </Button>
            </ResponsiveDialogTrigger>
            <ResponsiveDialogContent>
              <ResponsiveDialogHeader>
                <ResponsiveDialogTitle>호실 자동 생성</ResponsiveDialogTitle>
              </ResponsiveDialogHeader>
              <form onSubmit={handleGenerate} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>시작 층</Label>
                    <Input type="number" value={genForm.startFloor} onChange={(e) => setGenForm({ ...genForm, startFloor: e.target.value })} required />
                  </div>
                  <div>
                    <Label>끝 층</Label>
                    <Input type="number" value={genForm.endFloor} onChange={(e) => setGenForm({ ...genForm, endFloor: e.target.value })} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>층당 호실 수</Label>
                    <Input type="number" value={genForm.unitsPerFloor} onChange={(e) => setGenForm({ ...genForm, unitsPerFloor: e.target.value })} required />
                  </div>
                  <div>
                    <Label>시작 호수</Label>
                    <Input type="number" value={genForm.startUnit} onChange={(e) => setGenForm({ ...genForm, startUnit: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>접두어 (선택)</Label>
                    <Input value={genForm.prefix} onChange={(e) => setGenForm({ ...genForm, prefix: e.target.value })} placeholder="예: A동" />
                  </div>
                  <div>
                    <Label>용도 (선택)</Label>
                    <Input value={genForm.usage} onChange={(e) => setGenForm({ ...genForm, usage: e.target.value })} placeholder="예: 사무실" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {genForm.startFloor && genForm.endFloor && genForm.unitsPerFloor
                    ? `${(parseInt(genForm.endFloor) - parseInt(genForm.startFloor) + 1) * parseInt(genForm.unitsPerFloor)}개 호실이 생성됩니다`
                    : ""}
                </p>
                <Button type="submit" className="w-full" disabled={generateMutation.isPending}>
                  {generateMutation.isPending ? "생성 중..." : "호실 생성"}
                </Button>
              </form>
            </ResponsiveDialogContent>
          </ResponsiveDialog>

          <ResponsiveDialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
            <ResponsiveDialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-1" />
                <span className="hidden desktop:inline">호실 추가</span>
              </Button>
            </ResponsiveDialogTrigger>
            <ResponsiveDialogContent>
              <ResponsiveDialogHeader>
                <ResponsiveDialogTitle>{editing ? "호실 수정" : "새 호실 등록"}</ResponsiveDialogTitle>
              </ResponsiveDialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>호실번호 *</Label>
                    <Input value={form.unitNumber} onChange={(e) => setForm({ ...form, unitNumber: e.target.value })} placeholder="예: 101" required />
                  </div>
                  <div>
                    <Label>층 *</Label>
                    <Input type="number" value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>전용면적 (m²)</Label>
                    <Input type="number" step="0.01" value={form.exclusiveArea} onChange={(e) => setForm({ ...form, exclusiveArea: e.target.value })} />
                  </div>
                  <div>
                    <Label>공용면적 (m²)</Label>
                    <Input type="number" step="0.01" value={form.commonArea} onChange={(e) => setForm({ ...form, commonArea: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>용도</Label>
                    <Select value={form.usage} onValueChange={(v) => setForm({ ...form, usage: v })}>
                      <SelectTrigger><SelectValue placeholder="용도 선택" /></SelectTrigger>
                      <SelectContent>
                        {USAGE_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>상태</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="vacant">공실</SelectItem>
                        <SelectItem value="occupied">입주</SelectItem>
                        <SelectItem value="maintenance">정비중</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>비고</Label>
                  <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
                <Button type="submit" className="w-full">{editing ? "수정" : "등록"}</Button>
              </form>
            </ResponsiveDialogContent>
          </ResponsiveDialog>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 desktop:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">전체</p>
                  <p className="text-xl font-bold">{summary.total}</p>
                </div>
                <Building2 className="w-5 h-5 text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">입주</p>
                  <p className="text-xl font-bold text-primary">{summary.occupied}</p>
                </div>
                <DoorOpen className="w-5 h-5 text-primary/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">공실</p>
                  <p className="text-xl font-bold text-amber-500">{summary.vacant}</p>
                </div>
                <DoorOpen className="w-5 h-5 text-amber-500/50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">정비중</p>
                  <p className="text-xl font-bold text-destructive">{summary.maintenance}</p>
                </div>
                <Building2 className="w-5 h-5 text-destructive/50" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : units && units.length > 0 ? (
        <div className="space-y-4">
          {floorGroups.map(([floor, floorUnits]) => (
            <div key={floor}>
              <div className="flex items-center gap-2 mb-2">
                <Layers className="w-4 h-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">{floor}층</h3>
                <Badge variant="outline" className="text-xs">{floorUnits.length}개</Badge>
              </div>

              <div className="hidden desktop:block">
                <Card>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>호실</TableHead>
                          <TableHead>상태</TableHead>
                          <TableHead>전용면적</TableHead>
                          <TableHead>공용면적</TableHead>
                          <TableHead>용도</TableHead>
                          <TableHead>비고</TableHead>
                          <TableHead className="text-right">관리</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {floorUnits.map((unit) => {
                          const st = STATUS_MAP[unit.status] || STATUS_MAP.vacant;
                          return (
                            <TableRow key={unit.id}>
                              <TableCell className="font-medium">{unit.unitNumber}</TableCell>
                              <TableCell>
                                <Badge variant={st.variant}>{st.label}</Badge>
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {unit.exclusiveArea ? `${unit.exclusiveArea}m²` : "-"}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {unit.commonArea ? `${unit.commonArea}m²` : "-"}
                              </TableCell>
                              <TableCell className="text-muted-foreground">{unit.usage || "-"}</TableCell>
                              <TableCell className="text-muted-foreground text-xs max-w-[200px] truncate">{unit.notes || "-"}</TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => setDetailUnitId(unit.id)}>
                                    <Eye className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => openEdit(unit)}>
                                    <Edit className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => handleDelete(unit.id)}>
                                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>

              <div className="desktop:hidden grid grid-cols-3 gap-2">
                {floorUnits.map((unit) => {
                  const st = STATUS_MAP[unit.status] || STATUS_MAP.vacant;
                  return (
                    <Card
                      key={unit.id}
                      className={`cursor-pointer active:bg-muted/50 ${
                        unit.status === "occupied"
                          ? "border-primary/30"
                          : unit.status === "maintenance"
                          ? "border-destructive/30"
                          : ""
                      }`}
                      onClick={() => setDetailUnitId(unit.id)}
                    >
                      <CardContent className="p-2.5">
                        <div className="text-center">
                          <p className="font-semibold text-sm">{unit.unitNumber}</p>
                          <Badge variant={st.variant} className="text-[10px] mt-1">{st.label}</Badge>
                          {unit.usage && (
                            <p className="text-[10px] text-muted-foreground mt-1 truncate">{unit.usage}</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground mb-4">등록된 호실이 없습니다</p>
            <p className="text-sm text-muted-foreground">
              호실을 개별 추가하거나, CSV 업로드 또는 자동 생성으로 일괄 등록하세요
            </p>
          </CardContent>
        </Card>
      )}

      <ResponsiveDialog open={!!detailUnitId} onOpenChange={(o) => { if (!o) setDetailUnitId(null); }}>
        <ResponsiveDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>호실 상세</ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          {unitDetail && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">호실번호:</span> <span className="font-medium">{unitDetail.unitNumber}</span></div>
                <div><span className="text-muted-foreground">층:</span> <span className="font-medium">{unitDetail.floor}층</span></div>
                <div>
                  <span className="text-muted-foreground">상태:</span>{" "}
                  <Badge variant={STATUS_MAP[unitDetail.status]?.variant || "secondary"}>
                    {STATUS_MAP[unitDetail.status]?.label || unitDetail.status}
                  </Badge>
                </div>
                <div><span className="text-muted-foreground">용도:</span> {unitDetail.usage || "-"}</div>
                <div><span className="text-muted-foreground">전용면적:</span> {unitDetail.exclusiveArea ? `${unitDetail.exclusiveArea}m²` : "-"}</div>
                <div><span className="text-muted-foreground">공용면적:</span> {unitDetail.commonArea ? `${unitDetail.commonArea}m²` : "-"}</div>
                {unitDetail.notes && (
                  <div className="col-span-2"><span className="text-muted-foreground">비고:</span> {unitDetail.notes}</div>
                )}
              </div>

              {"tenants" in unitDetail && Array.isArray((unitDetail as Record<string, unknown>).tenants) && (
                <div className="border-t pt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium">입주자</p>
                  </div>
                  {((unitDetail as Record<string, unknown>).tenants as Array<{tenantName: string; phone?: string | null; status: string}>).length > 0 ? (
                    <div className="space-y-2">
                      {((unitDetail as Record<string, unknown>).tenants as Array<{tenantName: string; phone?: string | null; status: string}>).map((t, i) => (
                        <div key={i} className="flex items-center justify-between text-sm bg-muted/50 rounded p-2">
                          <span>{t.tenantName}</span>
                          <span className="text-muted-foreground">{t.phone || "-"}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">해당 호실에 등록된 입주자가 없습니다</p>
                  )}
                </div>
              )}

              {"owners" in unitDetail && Array.isArray((unitDetail as Record<string, unknown>).owners) && (
                <div className="border-t pt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <UserCheck className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium">소유자</p>
                  </div>
                  {((unitDetail as Record<string, unknown>).owners as Array<{ownerName: string; phone?: string | null; status: string}>).length > 0 ? (
                    <div className="space-y-2">
                      {((unitDetail as Record<string, unknown>).owners as Array<{ownerName: string; phone?: string | null; status: string}>).map((o, i) => (
                        <div key={i} className="flex items-center justify-between text-sm bg-muted/50 rounded p-2">
                          <span>{o.ownerName}</span>
                          <span className="text-muted-foreground">{o.phone || "-"}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">해당 호실에 등록된 소유자가 없습니다</p>
                  )}
                </div>
              )}

              {"vehicles" in unitDetail && Array.isArray((unitDetail as Record<string, unknown>).vehicles) && (
                <div className="border-t pt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Car className="w-4 h-4 text-muted-foreground" />
                    <p className="text-sm font-medium">등록 차량</p>
                  </div>
                  {((unitDetail as Record<string, unknown>).vehicles as Array<{vehicleNumber: string; vehicleType?: string | null; ownerName?: string | null}>).length > 0 ? (
                    <div className="space-y-2">
                      {((unitDetail as Record<string, unknown>).vehicles as Array<{vehicleNumber: string; vehicleType?: string | null; ownerName?: string | null}>).map((v, i) => (
                        <div key={i} className="flex items-center justify-between text-sm bg-muted/50 rounded p-2">
                          <span className="font-medium">{v.vehicleNumber}</span>
                          <span className="text-muted-foreground">{v.vehicleType || ""} {v.ownerName ? `(${v.ownerName})` : ""}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">해당 호실에 등록된 차량이 없습니다</p>
                  )}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => { setDetailUnitId(null); const u = units?.find(x => x.id === detailUnitId); if (u) openEdit(u); }}>
                  <Edit className="w-4 h-4 mr-1" />
                  수정
                </Button>
                <Button variant="destructive" className="flex-1" onClick={() => { if (detailUnitId) { handleDelete(detailUnitId); setDetailUnitId(null); } }}>
                  <Trash2 className="w-4 h-4 mr-1" />
                  삭제
                </Button>
              </div>
            </div>
          )}
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}
