import { useState } from "react";
import {
  useListMaintenanceLogs,
  useCreateMaintenanceLog,
  useDeleteMaintenanceLog,
  useSendMaintenanceReport,
  getListMaintenanceLogsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogTrigger,
} from "@/components/ui/responsive-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import { Plus, Wrench, Trash2, Send } from "lucide-react";

const CATEGORIES = [
  { value: "bulb_replacement", label: "전구 교체" },
  { value: "drain_cleaning", label: "배수로 청소" },
  { value: "equipment_repair", label: "설비 수리" },
  { value: "plumbing", label: "배관" },
  { value: "hvac", label: "냉난방" },
  { value: "other", label: "기타" },
];

export default function MaintenanceLogs() {
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: logs, isLoading } = useListMaintenanceLogs({
    category: filterCategory !== "all" ? filterCategory as any : undefined,
  });

  const createMutation = useCreateMaintenanceLog();
  const deleteMutation = useDeleteMaintenanceLog();
  const sendReport = useSendMaintenanceReport();

  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "equipment_repair",
    workDate: new Date().toISOString().split("T")[0],
    worker: "",
    status: "completed",
    notes: "",
  });

  async function handleCreate() {
    if (!form.title || !form.description || !form.worker) {
      toast({ title: "필수 항목을 입력해주세요", variant: "destructive" });
      return;
    }

    await createMutation.mutateAsync({
      data: {
        title: form.title,
        description: form.description,
        category: form.category as any,
        workDate: form.workDate,
        worker: form.worker,
        status: form.status as any,
        notes: form.notes || undefined,
      },
    });

    queryClient.invalidateQueries({ queryKey: getListMaintenanceLogsQueryKey() });
    setCreateOpen(false);
    setForm({
      title: "",
      description: "",
      category: "equipment_repair",
      workDate: new Date().toISOString().split("T")[0],
      worker: "",
      status: "completed",
      notes: "",
    });
    toast({ title: "업무 일지가 등록되었습니다" });
  }

  async function handleDelete(id: number) {
    await deleteMutation.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListMaintenanceLogsQueryKey() });
    toast({ title: "업무 일지가 삭제되었습니다" });
  }

  async function handleSendReport(id: number) {
    await sendReport.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListMaintenanceLogsQueryKey() });
    toast({ title: "관리소장에게 보고가 전송되었습니다" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">기전 업무 일지</h1>
          <p className="text-muted-foreground text-sm mt-1">
            전구 교체, 배수로 청소, 설비 수리 등 일상 업무를 기록하고 관리소장에게 보고
          </p>
        </div>
        <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
          <ResponsiveDialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              업무 기록
            </Button>
          </ResponsiveDialogTrigger>
          <ResponsiveDialogContent className="max-w-lg">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>기전 업무 일지 작성</ResponsiveDialogTitle>
            </ResponsiveDialogHeader>
            <div className="space-y-4">
              <div>
                <Label>제목</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="업무 제목"
                />
              </div>
              <div>
                <Label>카테고리</Label>
                <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>작업 내용</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="작업 내용을 상세히 기록해주세요"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>작업일</Label>
                  <Input
                    type="date"
                    value={form.workDate}
                    onChange={(e) => setForm((f) => ({ ...f, workDate: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>작업자</Label>
                  <Input
                    value={form.worker}
                    onChange={(e) => setForm((f) => ({ ...f, worker: e.target.value }))}
                    placeholder="작업자 이름"
                  />
                </div>
              </div>
              <div>
                <Label>상태</Label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed">완료</SelectItem>
                    <SelectItem value="in_progress">진행중</SelectItem>
                    <SelectItem value="pending">대기</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>비고</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="특이사항"
                  rows={2}
                />
              </div>
              <Button onClick={handleCreate} className="w-full" disabled={createMutation.isPending}>
                {createMutation.isPending ? "저장 중..." : "저장"}
              </Button>
            </div>
          </ResponsiveDialogContent>
        </ResponsiveDialog>
      </div>

      <div className="flex gap-3">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="카테고리" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 카테고리</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : logs && logs.length > 0 ? (
        <div className="space-y-3">
          {logs.map((log) => {
            const catLabel = CATEGORIES.find((c) => c.value === log.category)?.label || log.category;
            return (
              <Card key={log.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Wrench className="w-4 h-4 text-muted-foreground shrink-0" />
                        <p className="font-medium">{log.title}</p>
                        <Badge variant="secondary" className="text-xs">{catLabel}</Badge>
                        <Badge
                          variant={log.status === "completed" ? "default" : log.status === "in_progress" ? "secondary" : "outline"}
                          className="text-xs"
                        >
                          {log.status === "completed" ? "완료" : log.status === "in_progress" ? "진행중" : "대기"}
                        </Badge>
                        {log.reportSent && (
                          <Badge variant="default" className="text-xs bg-green-600">보고완료</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1.5 ml-6">{log.description}</p>
                      <p className="text-xs text-muted-foreground mt-1 ml-6">
                        {formatDate(log.workDate)} &middot; 작업자: {log.worker}
                        {log.notes && ` &middot; ${log.notes}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-3">
                      {!log.reportSent && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSendReport(log.id)}
                          disabled={sendReport.isPending}
                        >
                          <Send className="w-3.5 h-3.5 mr-1" />
                          보고
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(log.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Wrench className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">등록된 업무 일지가 없습니다</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
