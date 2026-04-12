import { useState } from "react";
import {
  useListSafetyTrainings,
  useCreateSafetyTraining,
  useUpdateSafetyTraining,
  useDeleteSafetyTraining,
  getListSafetyTrainingsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Plus, GraduationCap, Trash2, CheckCircle2, Calendar } from "lucide-react";

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: `${i + 1}월`,
}));

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  scheduled: { label: "예정", variant: "outline" },
  completed: { label: "이수완료", variant: "default" },
  cancelled: { label: "취소", variant: "destructive" },
};

export default function SafetyTraining() {
  const currentYear = new Date().getFullYear();
  const [filterYear, setFilterYear] = useState(currentYear);
  const [filterMonth, setFilterMonth] = useState<number | undefined>(undefined);
  const [createOpen, setCreateOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: trainings, isLoading } = useListSafetyTrainings({
    year: filterYear,
    month: filterMonth,
  });

  const createMutation = useCreateSafetyTraining();
  const updateMutation = useUpdateSafetyTraining();
  const deleteMutation = useDeleteSafetyTraining();

  const [form, setForm] = useState({
    title: "",
    trainingDate: new Date().toISOString().split("T")[0],
    trainingMonth: new Date().getMonth() + 1,
    trainingYear: currentYear,
    trainer: "",
    attendees: "",
    attendeeCount: 0,
    duration: "",
    content: "",
    notes: "",
  });

  async function handleCreate() {
    if (!form.title || !form.trainer || !form.attendeeCount) {
      toast({ title: "필수 항목을 입력해주세요", variant: "destructive" });
      return;
    }

    await createMutation.mutateAsync({
      data: {
        title: form.title,
        trainingDate: form.trainingDate,
        trainingMonth: form.trainingMonth,
        trainingYear: form.trainingYear,
        trainer: form.trainer,
        attendees: form.attendees || undefined,
        attendeeCount: form.attendeeCount,
        duration: form.duration || undefined,
        content: form.content || undefined,
        notes: form.notes || undefined,
      },
    });

    queryClient.invalidateQueries({ queryKey: getListSafetyTrainingsQueryKey() });
    setCreateOpen(false);
    setForm({
      title: "",
      trainingDate: new Date().toISOString().split("T")[0],
      trainingMonth: new Date().getMonth() + 1,
      trainingYear: currentYear,
      trainer: "",
      attendees: "",
      attendeeCount: 0,
      duration: "",
      content: "",
      notes: "",
    });
    toast({ title: "안전교육이 등록되었습니다" });
  }

  async function handleStatusChange(id: number, status: string) {
    await updateMutation.mutateAsync({ id, data: { status: status as any } });
    queryClient.invalidateQueries({ queryKey: getListSafetyTrainingsQueryKey() });
    toast({ title: "상태가 변경되었습니다" });
  }

  async function handleDelete(id: number) {
    await deleteMutation.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListSafetyTrainingsQueryKey() });
    toast({ title: "안전교육이 삭제되었습니다" });
  }

  const completedCount = trainings?.filter((t) => t.status === "completed").length ?? 0;
  const totalCount = trainings?.length ?? 0;
  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">안전교육 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            월별 안전교육 이수 현황을 등록하고 관리
          </p>
        </div>
        <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
          <ResponsiveDialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              교육 등록
            </Button>
          </ResponsiveDialogTrigger>
          <ResponsiveDialogContent className="max-w-lg">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>안전교육 등록</ResponsiveDialogTitle>
            </ResponsiveDialogHeader>
            <div className="space-y-4">
              <div>
                <Label>교육명</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="교육 제목"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>교육일</Label>
                  <Input
                    type="date"
                    value={form.trainingDate}
                    onChange={(e) => {
                      const d = new Date(e.target.value);
                      setForm((f) => ({
                        ...f,
                        trainingDate: e.target.value,
                        trainingMonth: d.getMonth() + 1,
                        trainingYear: d.getFullYear(),
                      }));
                    }}
                  />
                </div>
                <div>
                  <Label>연도</Label>
                  <Input
                    type="number"
                    value={form.trainingYear}
                    onChange={(e) => setForm((f) => ({ ...f, trainingYear: parseInt(e.target.value) || currentYear }))}
                  />
                </div>
                <div>
                  <Label>월</Label>
                  <Select
                    value={String(form.trainingMonth)}
                    onValueChange={(v) => setForm((f) => ({ ...f, trainingMonth: parseInt(v) }))}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m) => (
                        <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>강사</Label>
                  <Input
                    value={form.trainer}
                    onChange={(e) => setForm((f) => ({ ...f, trainer: e.target.value }))}
                    placeholder="강사명"
                  />
                </div>
                <div>
                  <Label>교육시간</Label>
                  <Input
                    value={form.duration}
                    onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
                    placeholder="예: 2시간"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>참석인원</Label>
                  <Input
                    type="number"
                    value={form.attendeeCount}
                    onChange={(e) => setForm((f) => ({ ...f, attendeeCount: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div>
                  <Label>참석자 목록</Label>
                  <Input
                    value={form.attendees}
                    onChange={(e) => setForm((f) => ({ ...f, attendees: e.target.value }))}
                    placeholder="홍길동, 김철수"
                  />
                </div>
              </div>
              <div>
                <Label>교육내용</Label>
                <Textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  placeholder="교육 내용 요약"
                  rows={3}
                />
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <GraduationCap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{completionRate}%</p>
              <p className="text-xs text-muted-foreground">이수율</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{completedCount}/{totalCount}</p>
              <p className="text-xs text-muted-foreground">이수 완료</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100">
              <Calendar className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {trainings?.filter((t) => t.status === "scheduled").length ?? 0}
              </p>
              <p className="text-xs text-muted-foreground">예정된 교육</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-3">
        <Select value={String(filterYear)} onValueChange={(v) => setFilterYear(parseInt(v))}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
              <SelectItem key={y} value={String(y)}>{y}년</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filterMonth ? String(filterMonth) : "all"}
          onValueChange={(v) => setFilterMonth(v === "all" ? undefined : parseInt(v))}
        >
          <SelectTrigger className="w-[120px]"><SelectValue placeholder="전체 월" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 월</SelectItem>
            {MONTHS.map((m) => (
              <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : trainings && trainings.length > 0 ? (
        <div className="space-y-3">
          {trainings.map((t) => {
            const statusInfo = STATUS_MAP[t.status] || STATUS_MAP.scheduled;
            return (
              <Card key={t.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <GraduationCap className="w-4 h-4 text-muted-foreground shrink-0" />
                        <p className="font-medium">{t.title}</p>
                        <Badge variant={statusInfo.variant} className="text-xs">{statusInfo.label}</Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1.5 ml-6 space-y-0.5">
                        <p>
                          {formatDate(t.trainingDate)} &middot; 강사: {t.trainer}
                          {t.duration && ` &middot; ${t.duration}`}
                        </p>
                        <p>
                          참석인원: {t.attendeeCount}명
                          {t.attendees && ` (${t.attendees})`}
                        </p>
                        {t.content && <p>{t.content}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-3">
                      {t.status === "scheduled" && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStatusChange(t.id, "completed")}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          이수완료
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(t.id)}
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
            <GraduationCap className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">등록된 안전교육이 없습니다</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
