import { useState } from "react";
import {
  useListInspections,
  useCreateInspection,
  useUpdateInspection,
  useDeleteInspection,
  useListInspectionPresets,
  useCompleteInspection,
  useListInspectionLogs,
  getListInspectionsQueryKey,
  getListInspectionLogsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Edit, Shield, Printer, CheckCircle, History, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import { InspectionNotice, CATEGORY_LEGAL_BASIS } from "@/components/inspection-notice";

const categoryOptions = [
  { value: "elevator", label: "승강기" },
  { value: "water_tank", label: "저수조" },
  { value: "fire_safety", label: "소방" },
  { value: "electrical", label: "전기" },
  { value: "gas", label: "가스" },
  { value: "septic", label: "정화조" },
  { value: "playground", label: "놀이터" },
  { value: "safety_check", label: "안전점검" },
  { value: "other", label: "기타" },
];

const statusOptions = [
  { value: "upcoming", label: "예정" },
  { value: "scheduled", label: "일정 확정" },
  { value: "completed", label: "완료" },
  { value: "overdue", label: "기한 초과" },
];

const resultOptions = [
  { value: "good", label: "양호" },
  { value: "fair", label: "보통" },
  { value: "poor", label: "불량" },
];

function calculateNextDueDate(lastDate: string, cycleMonths: number): string {
  const d = new Date(lastDate);
  d.setMonth(d.getMonth() + cycleMonths);
  return d.toISOString().split("T")[0];
}

export default function Inspections() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeTarget, setNoticeTarget] = useState<any>(null);
  const [completingId, setCompletingId] = useState<number | null>(null);
  const [historyId, setHistoryId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: inspections, isLoading } = useListInspections();
  const { data: presets } = useListInspectionPresets();
  const createMutation = useCreateInspection();
  const updateMutation = useUpdateInspection();
  const deleteMutation = useDeleteInspection();
  const completeMutation = useCompleteInspection();

  const { data: logs } = useListInspectionLogs(historyId ?? 0, {
    query: { enabled: historyId !== null },
  });

  const [form, setForm] = useState({
    name: "",
    category: "elevator",
    frequencyPerYear: 1,
    legalCycleMonths: null as number | null,
    lastInspectionDate: "",
    nextDueDate: "",
    notes: "",
    legalBasis: CATEGORY_LEGAL_BASIS["elevator"],
    advanceAlertDays: 30,
  });

  const [completeForm, setCompleteForm] = useState({
    inspectionDate: new Date().toISOString().split("T")[0],
    result: "good",
    memo: "",
    inspector: "",
  });

  function resetForm() {
    setForm({ name: "", category: "elevator", frequencyPerYear: 1, legalCycleMonths: null, lastInspectionDate: "", nextDueDate: "", notes: "", legalBasis: CATEGORY_LEGAL_BASIS["elevator"], advanceAlertDays: 30 });
    setEditing(null);
  }

  function handleCategoryChange(v: string) {
    const defaultLegal = CATEGORY_LEGAL_BASIS[v] || "";
    const oldDefault = CATEGORY_LEGAL_BASIS[form.category] || "";
    const shouldAutoFill = !form.legalBasis || form.legalBasis === oldDefault;
    setForm({ ...form, category: v, legalBasis: shouldAutoFill ? defaultLegal : form.legalBasis });
  }

  function handlePresetSelect(presetId: string) {
    if (!presets) return;
    const preset = presets.find((p) => p.id === parseInt(presetId));
    if (!preset) return;
    const cycleMonths = preset.legalCycleMonths;
    const freq = cycleMonths > 0 ? Math.round(12 / cycleMonths) : 1;
    setForm((prev) => ({
      ...prev,
      name: preset.name,
      category: preset.category,
      frequencyPerYear: Math.max(1, freq),
      legalCycleMonths: cycleMonths,
      advanceAlertDays: preset.defaultAlertDays,
    }));
  }

  function handleLastDateChange(lastDate: string) {
    const newForm = { ...form, lastInspectionDate: lastDate };
    if (lastDate && form.legalCycleMonths) {
      newForm.nextDueDate = calculateNextDueDate(lastDate, form.legalCycleMonths);
    }
    setForm(newForm);
  }

  function openEdit(item: any) {
    setEditing(item);
    setForm({
      name: item.name,
      category: item.category,
      frequencyPerYear: item.frequencyPerYear,
      legalCycleMonths: item.legalCycleMonths ?? null,
      lastInspectionDate: item.lastInspectionDate || "",
      nextDueDate: item.nextDueDate,
      notes: item.notes || "",
      legalBasis: item.legalBasis || CATEGORY_LEGAL_BASIS[item.category] || "",
      advanceAlertDays: item.advanceAlertDays,
    });
    setDialogOpen(true);
  }

  function openComplete(id: number) {
    setCompletingId(id);
    setCompleteForm({
      inspectionDate: new Date().toISOString().split("T")[0],
      result: "good",
      memo: "",
      inspector: "",
    });
    setCompleteDialogOpen(true);
  }

  function openHistory(id: number) {
    setHistoryId(id);
    setHistoryDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: form.name,
      category: form.category as any,
      frequencyPerYear: form.frequencyPerYear,
      legalCycleMonths: form.legalCycleMonths,
      lastInspectionDate: form.lastInspectionDate || null,
      nextDueDate: form.nextDueDate,
      notes: form.notes || null,
      legalBasis: form.legalBasis || null,
      advanceAlertDays: form.advanceAlertDays,
    };

    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, data });
      toast({ title: "점검 일정이 수정되었습니다" });
    } else {
      await createMutation.mutateAsync({ data });
      toast({ title: "점검 일정이 등록되었습니다" });
    }
    queryClient.invalidateQueries({ queryKey: getListInspectionsQueryKey() });
    setDialogOpen(false);
    resetForm();
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault();
    if (!completingId) return;
    await completeMutation.mutateAsync({
      id: completingId,
      data: {
        inspectionDate: completeForm.inspectionDate,
        result: completeForm.result as any,
        memo: completeForm.memo || null,
        inspector: completeForm.inspector || null,
      },
    });
    queryClient.invalidateQueries({ queryKey: getListInspectionsQueryKey() });
    setCompleteDialogOpen(false);
    const resultLabel = resultOptions.find((r) => r.value === completeForm.result)?.label || completeForm.result;
    toast({
      title: "점검이 완료 처리되었습니다",
      description: completeForm.result === "poor"
        ? "불량 판정으로 수선유지비 기안이 자동 생성되었습니다."
        : `결과: ${resultLabel}`,
    });
  }

  async function handleDelete(id: number) {
    await deleteMutation.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListInspectionsQueryKey() });
    toast({ title: "점검 일정이 삭제되었습니다" });
  }

  function openNotice(item: any) {
    setNoticeTarget(item);
    setNoticeOpen(true);
  }

  const categoryLabel = (c: string) =>
    categoryOptions.find((o) => o.value === c)?.label || c;
  const statusLabel = (s: string) =>
    statusOptions.find((o) => o.value === s)?.label || s;
  const resultLabel = (r: string) =>
    resultOptions.find((o) => o.value === r)?.label || r;

  const statusColor = (s: string) => {
    switch (s) {
      case "overdue": return "destructive";
      case "upcoming": return "secondary";
      case "scheduled": return "outline";
      case "completed": return "outline";
      default: return "outline" as const;
    }
  };

  const resultColor = (r: string) => {
    switch (r) {
      case "good": return "text-green-600";
      case "fair": return "text-yellow-600";
      case "poor": return "text-red-600";
      default: return "";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">법정 점검 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            승강기, 저수조, 소방 등 법정 점검 주기를 관리합니다
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              점검 등록
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "점검 수정" : "새 점검 등록"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              {!editing && presets && presets.length > 0 && (
                <div>
                  <Label>법정 프리셋 선택</Label>
                  <Select onValueChange={handlePresetSelect}>
                    <SelectTrigger><SelectValue placeholder="프리셋을 선택하면 자동으로 채워집니다" /></SelectTrigger>
                    <SelectContent>
                      {presets.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name} ({p.legalCycleMonths}개월)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>점검명</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: 승강기 정기검사" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>분류</Label>
                  <Select value={form.category} onValueChange={handleCategoryChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>법정 주기 (개월)</Label>
                  <Input type="number" min={1} value={form.legalCycleMonths ?? ""} onChange={(e) => setForm({ ...form, legalCycleMonths: e.target.value ? parseInt(e.target.value) : null })} placeholder="예: 6" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>연간 횟수</Label>
                  <Input type="number" min={1} value={form.frequencyPerYear} onChange={(e) => setForm({ ...form, frequencyPerYear: parseInt(e.target.value) || 1 })} />
                </div>
                <div>
                  <Label>사전 알림 일수</Label>
                  <Input type="number" min={1} value={form.advanceAlertDays} onChange={(e) => setForm({ ...form, advanceAlertDays: parseInt(e.target.value) || 30 })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>최근 점검일</Label>
                  <Input type="date" value={form.lastInspectionDate} onChange={(e) => handleLastDateChange(e.target.value)} />
                </div>
                <div>
                  <Label>다음 예정일 {form.legalCycleMonths && form.lastInspectionDate ? "(자동계산)" : ""}</Label>
                  <Input type="date" value={form.nextDueDate} onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })} required />
                </div>
              </div>
              <div>
                <Label>법정근거</Label>
                <Input value={form.legalBasis} onChange={(e) => setForm({ ...form, legalBasis: e.target.value })} placeholder="예: 승강기 안전관리법 제32조" />
              </div>
              <div>
                <Label>비고</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="점검 관련 메모" />
              </div>
              <Button type="submit" className="w-full">{editing ? "수정" : "등록"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>점검 완료 처리</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleComplete} className="space-y-4">
            <div>
              <Label>점검일</Label>
              <Input type="date" value={completeForm.inspectionDate} onChange={(e) => setCompleteForm({ ...completeForm, inspectionDate: e.target.value })} required />
            </div>
            <div>
              <Label>점검 결과</Label>
              <Select value={completeForm.result} onValueChange={(v) => setCompleteForm({ ...completeForm, result: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {resultOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {completeForm.result === "poor" && (
                <p className="text-xs text-destructive mt-1">
                  불량 판정 시 수선유지비 지출 기안이 자동 생성됩니다.
                </p>
              )}
            </div>
            <div>
              <Label>점검자</Label>
              <Input value={completeForm.inspector} onChange={(e) => setCompleteForm({ ...completeForm, inspector: e.target.value })} placeholder="점검 담당자명" />
            </div>
            <div>
              <Label>메모</Label>
              <Textarea value={completeForm.memo} onChange={(e) => setCompleteForm({ ...completeForm, memo: e.target.value })} placeholder="점검 결과 상세 내용" />
            </div>
            <Button type="submit" className="w-full">완료 처리</Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={historyDialogOpen} onOpenChange={(o) => { setHistoryDialogOpen(o); if (!o) setHistoryId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>점검 이력</DialogTitle>
          </DialogHeader>
          {logs && logs.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {logs.map((log) => (
                <Card key={log.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{formatDate(log.inspectionDate)}</p>
                        {log.inspector && <p className="text-xs text-muted-foreground">점검자: {log.inspector}</p>}
                      </div>
                      <Badge variant="outline" className={resultColor(log.result)}>
                        {resultLabel(log.result)}
                      </Badge>
                    </div>
                    {log.memo && <p className="text-sm text-muted-foreground mt-2">{log.memo}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">점검 이력이 없습니다</p>
          )}
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : inspections && inspections.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {inspections.map((item) => (
            <Card key={item.id}>
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-accent/10">
                      <Shield className="w-5 h-5 text-accent" />
                    </div>
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-muted-foreground">{categoryLabel(item.category)}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant={statusColor(item.status) as any}>
                          {statusLabel(item.status)}
                        </Badge>
                        {item.legalCycleMonths && (
                          <span className="text-xs text-muted-foreground">
                            {item.legalCycleMonths}개월 주기
                          </span>
                        )}
                        {!item.legalCycleMonths && (
                          <span className="text-xs text-muted-foreground">
                            연 {item.frequencyPerYear}회
                          </span>
                        )}
                      </div>
                      {item.status === "scheduled" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => openNotice(item)}
                        >
                          <Printer className="w-3.5 h-3.5 mr-1" />
                          안내문 출력
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{formatDate(item.nextDueDate)}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.advanceAlertDays}일 전 알림
                    </p>
                    <div className="flex gap-1 mt-2 justify-end">
                      {item.status !== "completed" && (
                        <Button variant="ghost" size="sm" onClick={() => openComplete(item.id)} title="완료 처리">
                          <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openHistory(item.id)} title="점검 이력">
                        <History className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">등록된 법정 점검이 없습니다</p>
            <p className="text-sm text-muted-foreground mt-1">
              "점검 등록" 버튼을 눌러 법정 점검 일정을 추가하세요
            </p>
          </CardContent>
        </Card>
      )}

      {noticeTarget && (
        <InspectionNotice
          key={noticeTarget.id}
          open={noticeOpen}
          onOpenChange={(o) => { setNoticeOpen(o); if (!o) setNoticeTarget(null); }}
          inspection={{
            name: noticeTarget.name,
            category: noticeTarget.category,
            nextDueDate: typeof noticeTarget.nextDueDate === "string" ? noticeTarget.nextDueDate : new Date(noticeTarget.nextDueDate).toISOString().split("T")[0],
            legalBasis: noticeTarget.legalBasis,
          }}
        />
      )}
    </div>
  );
}
