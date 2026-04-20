import { useEffect, useState } from "react";
import {
  useListMaintenanceLogs,
  useCreateMaintenanceLog,
  useDeleteMaintenanceLog,
  useSendMaintenanceReport,
  getListMaintenanceLogsQueryKey,
  type CreateMaintenanceLogBody,
  type CreateMaintenanceLogBodyCategory,
  type CreateMaintenanceLogBodyStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth-context";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import { Plus, Wrench, Trash2, Send } from "lucide-react";
import { PhotoUploadField } from "@/components/photo-upload-field";
import { AuthImage } from "@/components/auth-image";

const CATEGORIES = [
  { value: "fire_safety", label: "소방" },
  { value: "electrical", label: "전기" },
  { value: "elevator", label: "승강기" },
  { value: "generator", label: "발전기" },
  { value: "water_tank", label: "저수조" },
  { value: "plumbing", label: "배관" },
  { value: "hvac", label: "냉난방" },
  { value: "bulb_replacement", label: "전구 교체" },
  { value: "drain_cleaning", label: "배수로 청소" },
  { value: "equipment_repair", label: "설비 수리" },
  { value: "other", label: "기타" },
];

interface UserRecord {
  id: number;
  name: string;
  email: string;
  role: string;
}

export default function MaintenanceLogs() {
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { token } = useAuth();

  const BASE = import.meta.env.BASE_URL ?? "/";
  const API_BASE = `${BASE}api`;

  const [userList, setUserList] = useState<UserRecord[]>([]);
  const [workerPopoverOpen, setWorkerPopoverOpen] = useState(false);

  useEffect(() => {
    async function fetchUsers() {
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE}/users`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: UserRecord[] = await res.json();
          setUserList(data);
        } else if (res.status === 401 || res.status === 403) {
          setUserList([]);
        } else {
          console.error("Failed to load users:", res.status, await res.text());
          setUserList([]);
        }
      } catch (err) {
        console.error("Failed to load users:", err);
        setUserList([]);
      }
    }
    fetchUsers();
  }, [API_BASE, token]);

  const { data: logs, isLoading } = useListMaintenanceLogs({
    category: filterCategory !== "all" ? filterCategory as any : undefined,
  });

  const createMutation = useCreateMaintenanceLog();
  const deleteMutation = useDeleteMaintenanceLog();
  const sendReport = useSendMaintenanceReport();

  const initialForm = {
    title: "",
    description: "",
    category: "fire_safety",
    workDate: new Date().toISOString().split("T")[0],
    worker: "",
    status: "completed",
    notes: "",
    closeUpPhotoUrl: null as string | null,
    widePhotoUrl: null as string | null,
  };
  const [form, setForm] = useState(initialForm);

  async function handleCreate() {
    const data: CreateMaintenanceLogBody = {
      title: form.title.trim() || "-",
      description: form.description.trim() || "-",
      category: (form.category || "other") as CreateMaintenanceLogBodyCategory,
      workDate: form.workDate || undefined,
      worker: form.worker || undefined,
      status: form.status
        ? (form.status as CreateMaintenanceLogBodyStatus)
        : undefined,
      notes: form.notes || undefined,
      closeUpPhotoUrl: form.closeUpPhotoUrl,
      widePhotoUrl: form.widePhotoUrl,
    };
    await createMutation.mutateAsync({ data });

    queryClient.invalidateQueries({ queryKey: getListMaintenanceLogsQueryKey() });
    setCreateOpen(false);
    setForm(initialForm);
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
          <h1 className="text-2xl font-bold">시설 업무 일지</h1>
          <p className="text-muted-foreground text-sm mt-1">
            소방, 전기, 승강기, 배관 등 시설 업무를 카테고리별로 통합 기록하고 관리소장에게 보고
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
              <ResponsiveDialogTitle>시설 업무 일지 작성</ResponsiveDialogTitle>
            </ResponsiveDialogHeader>
            <div className="space-y-4">
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
                <Label>제목</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="업무 제목"
                />
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
                  {userList.length > 0 ? (
                    <Popover open={workerPopoverOpen} onOpenChange={setWorkerPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Input
                          value={form.worker}
                          onChange={(e) => {
                            setForm((f) => ({ ...f, worker: e.target.value }));
                            if (!workerPopoverOpen) setWorkerPopoverOpen(true);
                          }}
                          onFocus={() => setWorkerPopoverOpen(true)}
                          placeholder="작업자 검색 또는 직접 입력"
                          autoComplete="off"
                        />
                      </PopoverTrigger>
                      <PopoverContent
                        className="p-0 w-[--radix-popover-trigger-width] max-h-60 overflow-auto"
                        align="start"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                      >
                        {(() => {
                          const q = form.worker.trim().toLowerCase();
                          const filtered = q
                            ? userList.filter((u) => u.name.toLowerCase().includes(q))
                            : userList;
                          if (filtered.length === 0) {
                            return (
                              <div className="px-3 py-2 text-sm text-muted-foreground">
                                일치하는 사용자가 없습니다. 직접 입력하세요.
                              </div>
                            );
                          }
                          return (
                            <ul className="py-1">
                              {filtered.map((u) => (
                                <li key={u.id}>
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                                    onClick={() => {
                                      setForm((f) => ({ ...f, worker: u.name }));
                                      setWorkerPopoverOpen(false);
                                    }}
                                  >
                                    {u.name}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          );
                        })()}
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <Input
                      value={form.worker}
                      onChange={(e) => setForm((f) => ({ ...f, worker: e.target.value }))}
                      placeholder="작업자 이름"
                    />
                  )}
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
              <div className="grid grid-cols-2 gap-3">
                <PhotoUploadField
                  label="원경 사진"
                  value={form.widePhotoUrl}
                  onChange={(url) => setForm((f) => ({ ...f, widePhotoUrl: url }))}
                />
                <PhotoUploadField
                  label="근경 사진"
                  value={form.closeUpPhotoUrl}
                  onChange={(url) => setForm((f) => ({ ...f, closeUpPhotoUrl: url }))}
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
                        {log.notes && ` · ${log.notes}`}
                      </p>
                      {(log.widePhotoUrl || log.closeUpPhotoUrl) && (
                        <div className="flex gap-2 mt-2 ml-6">
                          {log.widePhotoUrl && (
                            <div className="space-y-0.5">
                              <p className="text-[10px] text-muted-foreground">원경</p>
                              <AuthImage
                                src={log.widePhotoUrl}
                                alt="원경"
                                className="w-20 h-20 rounded border object-cover"
                              />
                            </div>
                          )}
                          {log.closeUpPhotoUrl && (
                            <div className="space-y-0.5">
                              <p className="text-[10px] text-muted-foreground">근경</p>
                              <AuthImage
                                src={log.closeUpPhotoUrl}
                                alt="근경"
                                className="w-20 h-20 rounded border object-cover"
                              />
                            </div>
                          )}
                        </div>
                      )}
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
