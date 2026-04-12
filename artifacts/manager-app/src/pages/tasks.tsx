import { useState } from "react";
import {
  useListTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  getListTasksQueryKey,
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
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "@/components/ui/responsive-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Check, Trash2, Edit } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";

const categoryOptions = [
  { value: "daily_check", label: "일일 점검" },
  { value: "maintenance", label: "유지보수" },
  { value: "administrative", label: "행정업무" },
  { value: "tax", label: "세무" },
  { value: "other", label: "기타" },
];

const priorityOptions = [
  { value: "high", label: "높음" },
  { value: "medium", label: "보통" },
  { value: "low", label: "낮음" },
];

const statusOptions = [
  { value: "pending", label: "대기" },
  { value: "in_progress", label: "진행 중" },
  { value: "completed", label: "완료" },
];

export default function Tasks() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [priorityFilter, setPriorityFilter] = useState<string | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const params: Record<string, string> = {};
  if (statusFilter && statusFilter !== "all") params.status = statusFilter;
  if (priorityFilter && priorityFilter !== "all") params.priority = priorityFilter;

  const { data: tasks, isLoading } = useListTasks(
    Object.keys(params).length > 0 ? params as any : undefined
  );
  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "daily_check",
    priority: "medium",
    dueDate: "",
  });

  function resetForm() {
    setForm({ title: "", description: "", category: "daily_check", priority: "medium", dueDate: "" });
    setEditingTask(null);
  }

  function openEdit(task: any) {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description || "",
      category: task.category,
      priority: task.priority,
      dueDate: task.dueDate || "",
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      title: form.title,
      description: form.description || null,
      category: form.category as any,
      priority: form.priority as any,
      dueDate: form.dueDate || null,
    };

    if (editingTask) {
      await updateMutation.mutateAsync({ id: editingTask.id, data });
      toast({ title: "업무가 수정되었습니다" });
    } else {
      await createMutation.mutateAsync({ data });
      toast({ title: "업무가 등록되었습니다" });
    }
    queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    setDialogOpen(false);
    resetForm();
  }

  async function handleStatusChange(taskId: number, status: string) {
    await updateMutation.mutateAsync({ id: taskId, data: { status: status as any } });
    queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    toast({ title: status === "completed" ? "업무가 완료되었습니다" : "상태가 변경되었습니다" });
  }

  async function handleDelete(taskId: number) {
    await deleteMutation.mutateAsync({ id: taskId });
    queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    toast({ title: "업무가 삭제되었습니다" });
  }

  const priorityColor = (p: string) => {
    switch (p) {
      case "high": return "destructive";
      case "medium": return "secondary";
      case "low": return "outline";
      default: return "outline" as const;
    }
  };

  const statusLabel = (s: string) =>
    statusOptions.find((o) => o.value === s)?.label || s;
  const categoryLabel = (c: string) =>
    categoryOptions.find((o) => o.value === c)?.label || c;
  const priorityLabel = (p: string) =>
    priorityOptions.find((o) => o.value === p)?.label || p;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">업무 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            일일/주간 업무를 관리하세요
          </p>
        </div>
        <ResponsiveDialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
          <ResponsiveDialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              업무 추가
            </Button>
          </ResponsiveDialogTrigger>
          <ResponsiveDialogContent>
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{editingTask ? "업무 수정" : "새 업무 등록"}</ResponsiveDialogTitle>
            </ResponsiveDialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>제목</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="업무 제목"
                  required
                />
              </div>
              <div>
                <Label>설명</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="업무 상세 설명"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>분류</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>우선순위</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {priorityOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>마감일</Label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                />
              </div>
              <Button type="submit" className="w-full">
                {editingTask ? "수정" : "등록"}
              </Button>
            </form>
          </ResponsiveDialogContent>
        </ResponsiveDialog>
      </div>

      <div className="flex gap-3">
        <Select value={statusFilter || "all"} onValueChange={(v) => setStatusFilter(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="상태" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            {statusOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priorityFilter || "all"} onValueChange={(v) => setPriorityFilter(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="우선순위" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 우선순위</SelectItem>
            {priorityOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : tasks && tasks.length > 0 ? (
        <div className="space-y-2">
          {tasks.map((task) => (
            <Card key={task.id} className={task.status === "completed" ? "opacity-60" : ""}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start gap-3">
                  <button
                    onClick={() =>
                      handleStatusChange(
                        task.id,
                        task.status === "completed" ? "pending" : "completed"
                      )
                    }
                    className={`w-6 h-6 mt-0.5 rounded border-2 flex items-center justify-center shrink-0 transition-colors min-h-0 min-w-0 ${
                      task.status === "completed"
                        ? "bg-accent border-accent text-white"
                        : "border-border hover:border-accent"
                    }`}
                  >
                    {task.status === "completed" && <Check className="w-3 h-3" />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-medium ${task.status === "completed" ? "line-through" : ""}`}>
                        {task.title}
                      </p>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 min-h-0 min-w-0" onClick={() => openEdit(task)}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 min-h-0 min-w-0" onClick={() => handleDelete(task.id)}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {task.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {task.description}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {categoryLabel(task.category)}
                      </Badge>
                      <Badge variant={priorityColor(task.priority) as any} className="text-xs">
                        {priorityLabel(task.priority)}
                      </Badge>
                      {task.dueDate && (
                        <span className="text-xs text-muted-foreground">{formatDate(task.dueDate)}</span>
                      )}
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
            <p className="text-muted-foreground">등록된 업무가 없습니다</p>
            <p className="text-sm text-muted-foreground mt-1">
              위의 "업무 추가" 버튼을 눌러 새 업무를 등록하세요
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
