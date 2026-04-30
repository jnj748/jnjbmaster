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
import { VoiceInputButton } from "@/components/voice-input-dialog";
// [Task #697] 역할 다중선택 UI 의 단일 출처. 라벨은 ROLE_LABELS, 기본값
//   계산은 categoryToTargetRoles 를 사용해 서버/클라이언트가 같은 SoT 를 본다.
import { ROLE_LABELS, type AppRole } from "@workspace/shared/role-labels";
import { categoryToTargetRoles } from "@workspace/shared/role-routing";

const categoryOptions = [
  { value: "daily_check", label: "일일 점검" },
  { value: "maintenance", label: "유지보수" },
  { value: "administrative", label: "행정업무" },
  { value: "tax", label: "세무" },
  { value: "other", label: "기타" },
];

// [Task #697] 건물 포털 3개 역할만 라우팅 대상. (본부장/관리자/파트너/관리인은
//   대시보드 "필수업무현황" 카드에 노출되지 않으므로 수동업무 라우팅 대상이 아님.)
const TASK_ROLE_OPTIONS: { value: AppRole; label: string }[] = [
  { value: "manager", label: ROLE_LABELS.manager },
  { value: "accountant", label: ROLE_LABELS.accountant },
  { value: "facility_staff", label: ROLE_LABELS.facility_staff },
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

  const [form, setForm] = useState<{
    title: string;
    description: string;
    category: string;
    priority: string;
    dueDate: string;
    // [Task #697] 빈 배열은 "카테고리 기반 기본값 사용" 을 의미. 사용자가 한 개라도
    //   체크하면 그 값이 그대로 서버로 전송돼 우선 적용된다.
    targetRoles: AppRole[];
    // [Task #697] 사용자가 체크박스를 한번이라도 만진 적이 있는지 추적. 만지지
    //   않았다면 카테고리 변경에 따라 기본값이 자동으로 따라가게 한다.
    targetRolesTouched: boolean;
  }>({
    title: "",
    description: "",
    category: "daily_check",
    priority: "medium",
    dueDate: "",
    targetRoles: categoryToTargetRoles("daily_check"),
    targetRolesTouched: false,
  });

  function resetForm() {
    setForm({
      title: "",
      description: "",
      category: "daily_check",
      priority: "medium",
      dueDate: "",
      targetRoles: categoryToTargetRoles("daily_check"),
      targetRolesTouched: false,
    });
    setEditingTask(null);
  }

  function openEdit(task: any) {
    setEditingTask(task);
    const existing: AppRole[] = Array.isArray(task.targetRoles)
      ? (task.targetRoles as AppRole[])
      : [];
    setForm({
      title: task.title,
      description: task.description || "",
      category: task.category,
      priority: task.priority,
      dueDate: task.dueDate || "",
      // [Task #697] 기존 업무에 targetRoles 가 비어있으면 카테고리 기반 기본값을
      //   미리 채워 사용자에게 보여준다. (수정 시 빈값으로 보내면 서버가 카테고리
      //   기본값으로 재설정하지만, UI 상으로는 미리 보이는 편이 명확함.)
      targetRoles: existing.length > 0 ? existing : categoryToTargetRoles(task.category),
      targetRolesTouched: existing.length > 0,
    });
    setDialogOpen(true);
  }

  function onCategoryChange(value: string) {
    setForm((prev) => ({
      ...prev,
      category: value,
      // 사용자가 직접 체크박스를 만지지 않은 동안에는 카테고리 변경에 맞춰
      // 기본 역할도 따라가도록 자동 갱신.
      targetRoles: prev.targetRolesTouched
        ? prev.targetRoles
        : categoryToTargetRoles(value),
    }));
  }

  function toggleRole(role: AppRole) {
    setForm((prev) => {
      const has = prev.targetRoles.includes(role);
      const next = has
        ? prev.targetRoles.filter((r) => r !== role)
        : [...prev.targetRoles, role];
      return { ...prev, targetRoles: next, targetRolesTouched: true };
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      title: form.title,
      description: form.description || null,
      category: form.category as any,
      priority: form.priority as any,
      dueDate: form.dueDate || null,
      // [Task #697] 빈 배열을 보내면 서버는 "카테고리 기반 기본값으로 재설정"
      //   으로 해석한다. 한 개 이상 체크돼 있으면 그 배열을 그대로 저장한다.
      targetRoles: form.targetRoles,
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
                <div className="flex items-center justify-between">
                  <Label>설명</Label>
                  <VoiceInputButton
                    title="설명 음성 입력"
                    ariaLabel="설명 음성 입력"
                    testId="task-description-voice"
                    onInsert={(text) =>
                      setForm({
                        ...form,
                        description: form.description
                          ? `${form.description}${form.description.endsWith("\n") ? "" : "\n"}${text}`
                          : text,
                      })
                    }
                  />
                </div>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="업무 상세 설명"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>분류</Label>
                  <Select value={form.category} onValueChange={onCategoryChange}>
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
              {/* [Task #697] 역할별 노출 체크박스. 빈 상태로 두면 카테고리 기반
                   기본값(시설→소장+시설기사, 회계→소장+경리, 그 외→소장)이
                   서버에서 자동 적용된다. 기본은 항상 관리소장(manager) 포함. */}
              <div>
                <Label>대상 역할</Label>
                <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                  체크된 역할의 대시보드 "필수업무현황" 카드에 노출됩니다. 비워두면 분류에 따라 자동 지정됩니다.
                </p>
                <div className="flex flex-wrap gap-3">
                  {TASK_ROLE_OPTIONS.map((opt) => {
                    const checked = form.targetRoles.includes(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className="flex items-center gap-2 text-sm cursor-pointer select-none"
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={checked}
                          onChange={() => toggleRole(opt.value)}
                          data-testid={`task-role-${opt.value}`}
                        />
                        <span>{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
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
                        <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => openEdit(task)}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => handleDelete(task.id)}>
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
