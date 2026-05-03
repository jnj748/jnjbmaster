import { useState } from "react";
import {
  useListTaxSchedules,
  useCreateTaxSchedule,
  useUpdateTaxSchedule,
  useDeleteTaxSchedule,
  getListTaxSchedulesQueryKey,
  useListTaxDeadlineChecklists,
  useCreateTaxDeadlineChecklist,
  useUpdateTaxDeadlineChecklist,
  useDeleteTaxDeadlineChecklist,
  useInitTaxDeadlineChecklist,
  getListTaxDeadlineChecklistsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
  Plus,
  Trash2,
  Edit,
  Calculator,
  Check,
  ClipboardList,
  AlertTriangle,
  Bell,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
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

function getDaysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr);
  due.setHours(0, 0, 0, 0);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getDeadlineAlert(dateStr: string, status: string) {
  if (status === "completed") return null;
  const days = getDaysUntil(dateStr);
  if (days < 0) return { label: "기한 초과", variant: "destructive" as const, icon: AlertTriangle };
  if (days === 0) return { label: "D-Day", variant: "destructive" as const, icon: Bell };
  if (days <= 3) return { label: `D-${days}`, variant: "destructive" as const, icon: Bell };
  if (days <= 7) return { label: `D-${days}`, variant: "secondary" as const, icon: Bell };
  return null;
}

function ChecklistPanel({ scheduleId, dueDate }: { scheduleId: number; dueDate: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: items, isLoading } = useListTaxDeadlineChecklists({ taxScheduleId: scheduleId });
  const initMutation = useInitTaxDeadlineChecklist();
  const updateMutation = useUpdateTaxDeadlineChecklist();

  async function handleInit() {
    await initMutation.mutateAsync({ taxScheduleId: scheduleId });
    queryClient.invalidateQueries({ queryKey: getListTaxDeadlineChecklistsQueryKey({ taxScheduleId: scheduleId }) });
    toast({ title: "기본 체크리스트가 생성되었습니다" });
  }

  async function handleToggle(id: number, currentState: boolean) {
    await updateMutation.mutateAsync({
      id,
      data: {
        isCompleted: !currentState,
        completedAt: !currentState ? new Date().toISOString() : null,
      },
    });
    queryClient.invalidateQueries({ queryKey: getListTaxDeadlineChecklistsQueryKey({ taxScheduleId: scheduleId }) });
  }

  if (isLoading) return <Skeleton className="h-20 mt-2" />;

  const completedCount = items?.filter((i) => i.isCompleted).length || 0;
  const totalCount = items?.length || 0;

  return (
    <div className="mt-3 border-t pt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium flex items-center gap-1.5">
          <ClipboardList className="w-4 h-4 text-chart-3" />
          자료 제출 체크리스트
          {totalCount > 0 && (
            <Badge variant="outline" className="text-xs ml-1">
              {completedCount}/{totalCount}
            </Badge>
          )}
        </p>
        {(!items || items.length === 0) && (
          <Button variant="outline" size="sm" onClick={handleInit} disabled={initMutation.isPending}>
            <Plus className="w-3.5 h-3.5 mr-1" />
            기본 항목 생성
          </Button>
        )}
      </div>

      {items && items.length > 0 ? (
        <div className="space-y-1.5">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex items-center gap-2 p-2 rounded text-sm ${
                item.isCompleted ? "bg-chart-2/5" : "bg-muted/50"
              }`}
            >
              <Checkbox
                checked={item.isCompleted}
                onCheckedChange={() => handleToggle(item.id, item.isCompleted)}
              />
              <div className="flex-1 min-w-0">
                <span className={item.isCompleted ? "line-through text-muted-foreground" : ""}>
                  {item.itemName}
                </span>
                {item.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                )}
              </div>
              {item.isCompleted && item.completedAt && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(item.completedAt).toLocaleDateString("ko-KR")}
                </span>
              )}
            </div>
          ))}
          {totalCount > 0 && completedCount === totalCount && (
            <div className="flex items-center gap-2 p-2 rounded bg-chart-2/10 text-chart-2 text-sm">
              <Check className="w-4 h-4" />
              모든 자료가 제출되었습니다
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function TaxSchedules() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
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

  const upcomingSchedules = schedules?.filter((s) => {
    if (s.status === "completed") return false;
    const days = getDaysUntil(s.dueDate);
    return days <= 7 && days >= 0;
  }) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">세무 일정</h1>
          <p className="text-muted-foreground text-sm mt-1">
            원천징수, 부가세, 재산세 등 세무 일정을 관리합니다
          </p>
        </div>
        <ResponsiveDialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <ResponsiveDialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              일정 추가
            </Button>
          </ResponsiveDialogTrigger>
          <ResponsiveDialogContent>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{editing ? "일정 수정" : "새 세무 일정"}</ResponsiveDialogTitle>
            </ResponsiveDialogHeader>
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
          </ResponsiveDialogContent>
        </ResponsiveDialog>
      </div>

      {upcomingSchedules.length > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <p className="font-medium text-sm">마감 임박 알림</p>
            </div>
            <div className="space-y-1.5">
              {upcomingSchedules.map((s) => {
                const alert = getDeadlineAlert(s.dueDate, s.status);
                return (
                  <div key={s.id} className="flex items-center justify-between text-sm">
                    <span>{s.title}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">{formatDate(s.dueDate)}</span>
                      {alert && (
                        <Badge variant={alert.variant}>{alert.label}</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground mt-2">
                세무사에게 자료를 미리 준비하세요. 체크리스트를 확인하고 필요 서류를 제출하세요.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : schedules && schedules.length > 0 ? (
        <div className="space-y-2">
          {schedules.map((item) => {
            const alert = getDeadlineAlert(item.dueDate, item.status);
            const isExpanded = expandedId === item.id;
            return (
              <Card key={item.id} className={item.status === "completed" ? "opacity-60" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                        className="p-2 rounded-lg bg-chart-3/10 hover:bg-chart-3/20 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-5 h-5 text-chart-3" />
                        ) : (
                          <ChevronRight className="w-5 h-5 text-chart-3" />
                        )}
                      </button>
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
                        <div className="flex items-center gap-1 justify-end">
                          <Badge variant={statusColor(item.status) as any} className="text-xs">
                            {statusLabel(item.status)}
                          </Badge>
                          {alert && (
                            <Badge variant={alert.variant} className="text-xs">
                              {alert.label}
                            </Badge>
                          )}
                        </div>
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
                  {isExpanded && (
                    <ChecklistPanel scheduleId={item.id} dueDate={item.dueDate} />
                  )}
                </CardContent>
              </Card>
            );
          })}
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
