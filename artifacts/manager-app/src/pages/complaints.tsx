import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  useListComplaints,
  useCreateComplaint,
  useUpdateComplaint,
  getListComplaintsQueryKey,
} from "@workspace/api-client-react";
import type {
  ListComplaintsCategory,
  ListComplaintsStatus,
  CreateComplaintBodyCategory,
  UpdateComplaintBodyStatus,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  MessageSquare,
  Volume2,
  Car,
  Wrench,
  Sparkles,
  ShieldAlert,
  MoreHorizontal,
  User,
  CheckCircle,
} from "lucide-react";

const CATEGORIES = [
  { value: "noise", label: "소음", icon: Volume2 },
  { value: "parking", label: "주차", icon: Car },
  { value: "maintenance", label: "유지보수", icon: Wrench },
  { value: "cleaning", label: "청결", icon: Sparkles },
  { value: "security", label: "보안", icon: ShieldAlert },
  { value: "other", label: "기타", icon: MoreHorizontal },
] as const;

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  received: { label: "접수", color: "bg-gray-100 text-gray-700" },
  assigned: { label: "배정", color: "bg-blue-100 text-blue-700" },
  in_progress: { label: "처리중", color: "bg-amber-100 text-amber-700" },
  completed: { label: "완료", color: "bg-green-100 text-green-700" },
};

export default function Complaints() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterCat, setFilterCat] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState<number | null>(null);
  const [assignee, setAssignee] = useState("");

  const params: { category?: ListComplaintsCategory; status?: ListComplaintsStatus } = {};
  if (filterCat !== "all") params.category = filterCat as ListComplaintsCategory;
  if (filterStatus !== "all") params.status = filterStatus as ListComplaintsStatus;

  const { data: complaints = [] } = useListComplaints(params);
  const createMutation = useCreateComplaint();
  const updateMutation = useUpdateComplaint();

  const [form, setForm] = useState({
    unitNumber: "",
    complainantName: "",
    complainantPhone: "",
    category: "noise" as string,
    title: "",
    description: "",
  });

  async function handleCreate() {
    if (!form.unitNumber || !form.complainantName || !form.title || !form.description) {
      toast({ title: "필수 항목을 모두 입력하세요", variant: "destructive" });
      return;
    }
    try {
      await createMutation.mutateAsync({
        data: {
          unitNumber: form.unitNumber,
          complainantName: form.complainantName,
          complainantPhone: form.complainantPhone || undefined,
          category: form.category as CreateComplaintBodyCategory,
          title: form.title,
          description: form.description,
        },
      });
      toast({ title: "민원이 접수되었습니다" });
      setCreateOpen(false);
      setForm({ unitNumber: "", complainantName: "", complainantPhone: "", category: "noise", title: "", description: "" });
      queryClient.invalidateQueries({ queryKey: getListComplaintsQueryKey() });
    } catch {
      toast({ title: "접수에 실패했습니다", variant: "destructive" });
    }
  }

  async function handleAssign(id: number) {
    if (!assignee) return;
    try {
      await updateMutation.mutateAsync({
        id,
        data: { status: "assigned" as UpdateComplaintBodyStatus, assigneeName: assignee },
      });
      toast({ title: "담당자가 배정되었습니다" });
      setAssignOpen(null);
      setAssignee("");
      queryClient.invalidateQueries({ queryKey: getListComplaintsQueryKey() });
    } catch {
      toast({ title: "배정에 실패했습니다", variant: "destructive" });
    }
  }

  async function handleComplete(id: number) {
    const resolution = prompt("처리 내용을 입력하세요:");
    if (!resolution) return;
    try {
      await updateMutation.mutateAsync({
        id,
        data: { status: "completed" as UpdateComplaintBodyStatus, resolution },
      });
      toast({ title: "민원이 처리 완료되었습니다" });
      queryClient.invalidateQueries({ queryKey: getListComplaintsQueryKey() });
    } catch {
      toast({ title: "처리에 실패했습니다", variant: "destructive" });
    }
  }

  const statusCounts = complaints.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold">민원 관리</h1>
          <p className="text-sm text-muted-foreground">입주민 민원을 접수하고 처리합니다</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" />
              민원 접수
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>민원 접수</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>호실</Label>
                  <Input value={form.unitNumber} onChange={(e) => setForm((p) => ({ ...p, unitNumber: e.target.value }))} placeholder="101" />
                </div>
                <div>
                  <Label>민원분류</Label>
                  <Select value={form.category} onValueChange={(v) => setForm((p) => ({ ...p, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>민원인</Label>
                  <Input value={form.complainantName} onChange={(e) => setForm((p) => ({ ...p, complainantName: e.target.value }))} />
                </div>
                <div>
                  <Label>연락처</Label>
                  <Input value={form.complainantPhone} onChange={(e) => setForm((p) => ({ ...p, complainantPhone: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>제목</Label>
                <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
              </div>
              <div>
                <Label>내용</Label>
                <Textarea value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} rows={3} />
              </div>
              <Button className="w-full" onClick={handleCreate} disabled={createMutation.isPending}>접수하기</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {Object.entries(STATUS_LABELS).map(([key, { label, color }]) => (
          <Card key={key} className="cursor-pointer" onClick={() => setFilterStatus(filterStatus === key ? "all" : key)}>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{statusCounts[key] || 0}</p>
              <Badge className={`text-[10px] mt-1 ${color}`}>{label}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Button variant={filterCat === "all" ? "default" : "outline"} size="sm" onClick={() => setFilterCat("all")}>전체</Button>
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          return (
            <Button key={c.value} variant={filterCat === c.value ? "default" : "outline"} size="sm" onClick={() => setFilterCat(c.value)} className="gap-1">
              <Icon className="w-3.5 h-3.5" />
              {c.label}
            </Button>
          );
        })}
      </div>

      <div className="space-y-3">
        {complaints.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
              접수된 민원이 없습니다
            </CardContent>
          </Card>
        ) : (
          complaints.map((c) => {
            const cat = CATEGORIES.find((x) => x.value === c.category);
            const CatIcon = cat?.icon ?? MoreHorizontal;
            const statusInfo = STATUS_LABELS[c.status];

            return (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <CatIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{c.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {c.unitNumber}호 · {c.complainantName} · {cat?.label}
                          </p>
                        </div>
                        <Badge className={`text-[10px] shrink-0 ${statusInfo.color}`}>
                          {statusInfo.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{c.description}</p>
                      {c.assigneeName && (
                        <p className="text-xs mt-1 flex items-center gap-1">
                          <User className="w-3 h-3" />
                          담당: {c.assigneeName}
                        </p>
                      )}
                      {c.resolution && (
                        <p className="text-xs mt-1 text-emerald-600 flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          {c.resolution}
                        </p>
                      )}
                      <div className="flex gap-2 mt-3">
                        {c.status === "received" && (
                          <>
                            {assignOpen === c.id ? (
                              <div className="flex gap-1 items-center">
                                <Input
                                  className="h-7 text-xs w-32"
                                  placeholder="담당자명"
                                  value={assignee}
                                  onChange={(e) => setAssignee(e.target.value)}
                                />
                                <Button size="sm" className="h-7 text-xs" onClick={() => handleAssign(c.id)}>확인</Button>
                              </div>
                            ) : (
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAssignOpen(c.id)}>
                                담당자 배정
                              </Button>
                            )}
                          </>
                        )}
                        {(c.status === "assigned" || c.status === "in_progress") && (
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleComplete(c.id)}>
                            처리 완료
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
