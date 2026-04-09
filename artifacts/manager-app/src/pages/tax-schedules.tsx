import { useState } from "react";
import {
  useListTaxSchedules,
  useCreateTaxSchedule,
  useUpdateTaxSchedule,
  useDeleteTaxSchedule,
  getListTaxSchedulesQueryKey,
} from "@workspace/api-client-react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Edit, Calculator, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

const typeOptions = [
  { value: "withholding_tax", label: "원천징수" },
  { value: "vat", label: "부가가치세" },
  { value: "property_tax", label: "재산세" },
  { value: "insurance", label: "보험" },
  { value: "other", label: "기타" },
];

const recurrenceOptions = [
  { value: "monthly", label: "매월" },
  { value: "quarterly", label: "분기" },
  { value: "biannual", label: "반기" },
  { value: "annual", label: "연간" },
  { value: "one_time", label: "1회" },
];

export default function TaxSchedules() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: schedules, isLoading } = useListTaxSchedules();
  const createMutation = useCreateTaxSchedule();
  const updateMutation = useUpdateTaxSchedule();
  const deleteMutation = useDeleteTaxSchedule();

  const [form, setForm] = useState({
    title: "",
    description: "",
    scheduleType: "withholding_tax",
    dueDate: "",
    recurrence: "monthly",
  });

  function resetForm() {
    setForm({ title: "", description: "", scheduleType: "withholding_tax", dueDate: "", recurrence: "monthly" });
    setEditing(null);
  }

  function openEdit(item: any) {
    setEditing(item);
    setForm({
      title: item.title,
      description: item.description || "",
      scheduleType: item.scheduleType,
      dueDate: item.dueDate,
      recurrence: item.recurrence,
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      title: form.title,
      description: form.description || null,
      scheduleType: form.scheduleType as any,
      dueDate: form.dueDate,
      recurrence: form.recurrence as any,
    };

    if (editing) {
      await updateMutation.mutateAsync({ id: editing.id, data });
      toast({ title: "세무 일정이 수정되었습니다" });
    } else {
      await createMutation.mutateAsync({ data });
      toast({ title: "세무 일정이 등록되었습니다" });
    }
    queryClient.invalidateQueries({ queryKey: getListTaxSchedulesQueryKey() });
    setDialogOpen(false);
    resetForm();
  }

  async function handleComplete(id: number) {
    await updateMutation.mutateAsync({ id, data: { status: "completed" } });
    queryClient.invalidateQueries({ queryKey: getListTaxSchedulesQueryKey() });
    toast({ title: "세무 일정이 완료 처리되었습니다" });
  }

  async function handleDelete(id: number) {
    await deleteMutation.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListTaxSchedulesQueryKey() });
    toast({ title: "세무 일정이 삭제되었습니다" });
  }

  const typeLabel = (t: string) => typeOptions.find((o) => o.value === t)?.label || t;
  const recurrenceLabel = (r: string) => recurrenceOptions.find((o) => o.value === r)?.label || r;

  const statusColor = (s: string) => {
    switch (s) {
      case "overdue": return "destructive";
      case "pending": return "secondary";
      case "completed": return "outline";
      default: return "outline" as const;
    }
  };
  const statusLabel = (s: string) => {
    switch (s) {
      case "pending": return "대기";
      case "completed": return "완료";
      case "overdue": return "기한 초과";
      default: return s;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">세무 일정</h1>
          <p className="text-muted-foreground text-sm mt-1">
            원천징수, 부가세, 재산세 등 세무 일정을 관리합니다
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              일정 추가
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "일정 수정" : "새 세무 일정"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>제목</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="예: 4월 원천징수 신고" required />
              </div>
              <div>
                <Label>설명</Label>
                <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="세무 일정 상세" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>유형</Label>
                  <Select value={form.scheduleType} onValueChange={(v) => setForm({ ...form, scheduleType: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {typeOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>반복 주기</Label>
                  <Select value={form.recurrence} onValueChange={(v) => setForm({ ...form, recurrence: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {recurrenceOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>마감일</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required />
              </div>
              <Button type="submit" className="w-full">{editing ? "수정" : "등록"}</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : schedules && schedules.length > 0 ? (
        <div className="space-y-2">
          {schedules.map((item) => (
            <Card key={item.id} className={item.status === "completed" ? "opacity-60" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-chart-3/10">
                      <Calculator className="w-5 h-5 text-chart-3" />
                    </div>
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">{typeLabel(item.scheduleType)}</Badge>
                        <span className="text-xs text-muted-foreground">{recurrenceLabel(item.recurrence)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatDate(item.dueDate)}</p>
                      <Badge variant={statusColor(item.status) as any} className="text-xs">
                        {statusLabel(item.status)}
                      </Badge>
                    </div>
                    {item.status !== "completed" && (
                      <Button variant="ghost" size="sm" onClick={() => handleComplete(item.id)}>
                        <Check className="w-4 h-4 text-chart-2" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Calculator className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-muted-foreground">등록된 세무 일정이 없습니다</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
