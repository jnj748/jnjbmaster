import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  useListMeterReadings,
  useCreateMeterReading,
  useListMeterAnomalies,
  useUploadMeterCsv,
  getListMeterReadingsQueryKey,
  getListMeterAnomaliesQueryKey,
} from "@workspace/api-client-react";
import type {
  ListMeterReadingsMeterType,
  CreateMeterReadingBodyMeterType,
  MeterCsvUploadBodyMeterType,
  MeterReading,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Droplets,
  Zap,
  Flame,
  Thermometer,
  Plus,
  Upload,
  AlertTriangle,
  FileSpreadsheet,
} from "lucide-react";

const METER_TYPES = [
  { value: "water", label: "수도", icon: Droplets, color: "text-blue-500" },
  { value: "electricity", label: "전기", icon: Zap, color: "text-yellow-500" },
  { value: "gas", label: "가스", icon: Flame, color: "text-orange-500" },
  { value: "heating", label: "난방", icon: Thermometer, color: "text-red-500" },
] as const;

export default function Metering() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);

  const params = filter === "all" ? {} : { meterType: filter as ListMeterReadingsMeterType };
  const { data: readings = [] } = useListMeterReadings(params);
  const { data: anomalies = [] } = useListMeterAnomalies();
  const createMutation = useCreateMeterReading();
  const csvMutation = useUploadMeterCsv();

  const [form, setForm] = useState({
    unitNumber: "",
    meterType: "water" as string,
    readingDate: new Date().toISOString().slice(0, 10),
    previousReading: "",
    currentReading: "",
  });

  const [csvForm, setCsvForm] = useState({
    meterType: "water" as string,
    readingDate: new Date().toISOString().slice(0, 10),
    csvText: "",
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListMeterReadingsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListMeterAnomaliesQueryKey() });
  }, [queryClient]);

  async function handleCreate() {
    if (!form.unitNumber || !form.currentReading) {
      toast({ title: "호실과 현재 검침값을 입력하세요", variant: "destructive" });
      return;
    }
    try {
      await createMutation.mutateAsync({
        data: {
          unitNumber: form.unitNumber,
          meterType: form.meterType as CreateMeterReadingBodyMeterType,
          readingDate: form.readingDate,
          previousReading: form.previousReading ? Number(form.previousReading) : undefined,
          currentReading: Number(form.currentReading),
        },
      });
      toast({ title: "검침 데이터가 등록되었습니다" });
      setDialogOpen(false);
      setForm({ unitNumber: "", meterType: "water", readingDate: new Date().toISOString().slice(0, 10), previousReading: "", currentReading: "" });
      invalidate();
    } catch {
      toast({ title: "등록에 실패했습니다", variant: "destructive" });
    }
  }

  async function handleCsvUpload() {
    const lines = csvForm.csvText.trim().split("\n").filter(Boolean);
    if (lines.length === 0) {
      toast({ title: "CSV 데이터를 입력하세요", variant: "destructive" });
      return;
    }

    const rows = lines.map((line) => {
      const [unitNumber, prev, curr] = line.split(",").map((s) => s.trim());
      return {
        unitNumber,
        previousReading: prev ? Number(prev) : undefined,
        currentReading: Number(curr),
      };
    });

    try {
      const result = await csvMutation.mutateAsync({
        data: {
          meterType: csvForm.meterType as MeterCsvUploadBodyMeterType,
          readingDate: csvForm.readingDate,
          rows,
        },
      });
      toast({
        title: `${result.imported}건 등록, ${result.anomalies}건 이상감지`,
      });
      setCsvDialogOpen(false);
      setCsvForm({ meterType: "water", readingDate: new Date().toISOString().slice(0, 10), csvText: "" });
      invalidate();
    } catch {
      toast({ title: "업로드에 실패했습니다", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">검침 관리</h1>
          <p className="text-sm text-muted-foreground">수도/전기/가스/난방 검침 데이터를 관리합니다</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={csvDialogOpen} onOpenChange={setCsvDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Upload className="w-4 h-4 mr-1" />
                CSV 업로드
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>CSV 대량 업로드</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>검침 유형</Label>
                    <Select value={csvForm.meterType} onValueChange={(v) => setCsvForm((p) => ({ ...p, meterType: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {METER_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>검침일</Label>
                    <Input type="date" value={csvForm.readingDate} onChange={(e) => setCsvForm((p) => ({ ...p, readingDate: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>CSV 데이터 (호실,전월,금월)</Label>
                  <textarea
                    className="w-full h-32 p-2 text-sm border rounded-md font-mono"
                    placeholder={"101,1234,1345\n102,2345,2456\n103,3456,3590"}
                    value={csvForm.csvText}
                    onChange={(e) => setCsvForm((p) => ({ ...p, csvText: e.target.value }))}
                  />
                </div>
                <Button className="w-full" onClick={handleCsvUpload} disabled={csvMutation.isPending}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  업로드
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="w-4 h-4 mr-1" />
                수동 입력
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>검침 데이터 입력</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>호실</Label>
                  <Input value={form.unitNumber} onChange={(e) => setForm((p) => ({ ...p, unitNumber: e.target.value }))} placeholder="예: 101" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>검침 유형</Label>
                    <Select value={form.meterType} onValueChange={(v) => setForm((p) => ({ ...p, meterType: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {METER_TYPES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>검침일</Label>
                    <Input type="date" value={form.readingDate} onChange={(e) => setForm((p) => ({ ...p, readingDate: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>전월 검침값</Label>
                    <Input type="number" value={form.previousReading} onChange={(e) => setForm((p) => ({ ...p, previousReading: e.target.value }))} placeholder="선택" />
                  </div>
                  <div>
                    <Label>금월 검침값</Label>
                    <Input type="number" value={form.currentReading} onChange={(e) => setForm((p) => ({ ...p, currentReading: e.target.value }))} placeholder="필수" />
                  </div>
                </div>
                <Button className="w-full" onClick={handleCreate} disabled={createMutation.isPending}>등록</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {anomalies.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-sm font-medium">이상감지 {anomalies.length}건</span>
            </div>
            <div className="mt-2 space-y-1">
              {anomalies.slice(0, 3).map((a) => (
                <p key={a.id} className="text-xs text-amber-600">
                  {a.unitNumber}호 {METER_TYPES.find((t) => t.value === a.meterType)?.label}: {a.anomalyNote}
                </p>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Button
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
        >
          전체
        </Button>
        {METER_TYPES.map((t) => {
          const Icon = t.icon;
          return (
            <Button
              key={t.value}
              variant={filter === t.value ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(t.value)}
              className="gap-1"
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </Button>
          );
        })}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-3 font-medium">호실</th>
                  <th className="p-3 font-medium">유형</th>
                  <th className="p-3 font-medium">검침일</th>
                  <th className="p-3 font-medium text-right">전월</th>
                  <th className="p-3 font-medium text-right">금월</th>
                  <th className="p-3 font-medium text-right">사용량</th>
                  <th className="p-3 font-medium">상태</th>
                </tr>
              </thead>
              <tbody>
                {readings.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      검침 데이터가 없습니다
                    </td>
                  </tr>
                ) : (
                  readings.map((r) => {
                    const mt = METER_TYPES.find((t) => t.value === r.meterType);
                    const Icon = mt?.icon ?? Droplets;
                    return (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-3 font-medium">{r.unitNumber}호</td>
                        <td className="p-3">
                          <span className={`flex items-center gap-1 ${mt?.color}`}>
                            <Icon className="w-3.5 h-3.5" />
                            {mt?.label}
                          </span>
                        </td>
                        <td className="p-3">{r.readingDate}</td>
                        <td className="p-3 text-right">{r.previousReading ?? "-"}</td>
                        <td className="p-3 text-right font-medium">{r.currentReading}</td>
                        <td className="p-3 text-right">{r.usage ?? "-"}</td>
                        <td className="p-3">
                          {r.isAnomaly ? (
                            <Badge variant="destructive" className="text-[10px]">이상</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-[10px]">정상</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
