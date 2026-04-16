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
  useGetComplaintHistory,
  getListComplaintsQueryKey,
} from "@workspace/api-client-react";
import type {
  ListComplaintsCategory,
  ListComplaintsStatus,
  CreateComplaintBodyCategory,
  CreateComplaintBodySensitivity,
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
  AlertTriangle,
  Repeat,
  ArrowUpCircle,
  FileText,
  Droplets,
  Zap,
  Scale,
  Users,
  Calculator,
  History,
} from "lucide-react";

const CATEGORIES = [
  { value: "noise", label: "소음", icon: Volume2 },
  { value: "parking", label: "주차", icon: Car },
  { value: "maintenance", label: "유지보수", icon: Wrench },
  { value: "cleaning", label: "청결", icon: Sparkles },
  { value: "security", label: "보안", icon: ShieldAlert },
  { value: "contract_legal", label: "계약/법무", icon: Scale },
  { value: "management_dispute", label: "관리단 분쟁", icon: Users },
  { value: "accounting_issue", label: "회계 부적정", icon: Calculator },
  { value: "water_leak", label: "누수/방수", icon: Droplets },
  { value: "elevator", label: "승강기", icon: Zap },
  { value: "floor_noise", label: "층간소음", icon: Volume2 },
  { value: "other", label: "기타", icon: MoreHorizontal },
] as const;

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  received: { label: "접수", color: "bg-gray-100 text-gray-700" },
  assigned: { label: "배정", color: "bg-blue-100 text-blue-700" },
  in_progress: { label: "처리중", color: "bg-amber-100 text-amber-700" },
  completed: { label: "완료", color: "bg-green-100 text-green-700" },
};

const SENSITIVITY_LABELS: Record<string, { label: string; color: string }> = {
  normal: { label: "일반", color: "bg-gray-50 text-gray-600 border-gray-200" },
  caution: { label: "주의", color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  sensitive: { label: "민감", color: "bg-orange-50 text-orange-700 border-orange-200" },
  urgent: { label: "긴급", color: "bg-red-50 text-red-700 border-red-200" },
};

const SENSITIVE_CATEGORIES = ["contract_legal", "management_dispute", "accounting_issue"];

export default function Complaints() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterCat, setFilterCat] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState<number | null>(null);
  const [assignee, setAssignee] = useState("");
  const [historyOpen, setHistoryOpen] = useState<number | null>(null);

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
    sensitivity: "normal" as string,
    isUrgent: false,
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
          sensitivity: form.sensitivity as CreateComplaintBodySensitivity,
          isUrgent: form.isUrgent || undefined,
        },
      });
      toast({ title: "민원이 접수되었습니다" });
      setCreateOpen(false);
      setForm({ unitNumber: "", complainantName: "", complainantPhone: "", category: "noise", title: "", description: "", sensitivity: "normal", isUrgent: false });
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

  const sensitiveCount = complaints.filter(c => c.sensitivity === "sensitive" || c.sensitivity === "urgent").length;
  const recurringCount = complaints.filter(c => c.isRecurring).length;
  const escalatedCount = complaints.filter(c => c.escalatedToHq).length;

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
          <DialogContent className="max-w-lg">
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>민감도</Label>
                  <Select value={form.sensitivity} onValueChange={(v) => setForm((p) => ({ ...p, sensitivity: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">일반</SelectItem>
                      <SelectItem value="caution">주의</SelectItem>
                      <SelectItem value="sensitive">민감</SelectItem>
                      <SelectItem value="urgent">긴급</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant={form.isUrgent ? "destructive" : "outline"}
                    className="w-full"
                    onClick={() => setForm((p) => ({ ...p, isUrgent: !p.isUrgent }))}
                  >
                    <AlertTriangle className="w-4 h-4 mr-1" />
                    {form.isUrgent ? "긴급 설정됨" : "긴급 에스컬레이션"}
                  </Button>
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
              {SENSITIVE_CATEGORIES.includes(form.category) && (
                <div className="p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-700">
                  <AlertTriangle className="w-3 h-3 inline mr-1" />
                  민감 카테고리입니다. 접수 시 자동으로 HQ에 에스컬레이션됩니다.
                </div>
              )}
              <Button className="w-full" onClick={handleCreate} disabled={createMutation.isPending}>접수하기</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {Object.entries(STATUS_LABELS).map(([key, { label, color }]) => (
          <Card key={key} className="cursor-pointer" onClick={() => setFilterStatus(filterStatus === key ? "all" : key)}>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{statusCounts[key] || 0}</p>
              <Badge className={`text-[10px] mt-1 ${color}`}>{label}</Badge>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Card className="border-orange-200">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-orange-600">{sensitiveCount}</p>
            <p className="text-[10px] text-muted-foreground">민감 민원</p>
          </CardContent>
        </Card>
        <Card className="border-blue-200">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-blue-600">{recurringCount}</p>
            <p className="text-[10px] text-muted-foreground">반복 민원</p>
          </CardContent>
        </Card>
        <Card className="border-red-200">
          <CardContent className="p-3 text-center">
            <p className="text-lg font-bold text-red-600">{escalatedCount}</p>
            <p className="text-[10px] text-muted-foreground">HQ 에스컬레이션</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <Button variant={filterCat === "all" ? "default" : "outline"} size="sm" onClick={() => setFilterCat("all")}>전체</Button>
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          return (
            <Button key={c.value} variant={filterCat === c.value ? "default" : "outline"} size="sm" onClick={() => setFilterCat(c.value)} className="gap-1 whitespace-nowrap">
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
            const sensitivityInfo = SENSITIVITY_LABELS[c.sensitivity || "normal"];
            const isWarrantyRelated = ["water_leak", "elevator", "maintenance"].includes(c.category);

            return (
              <Card key={c.id} className={c.escalatedToHq ? "border-red-300" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-muted">
                      <CatIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-medium">{c.title}</p>
                            {c.isRecurring && (
                              <Badge variant="outline" className="text-[9px] border-blue-300 text-blue-600 gap-0.5">
                                <Repeat className="w-2.5 h-2.5" />
                                반복 ({c.recurringCount}회)
                              </Badge>
                            )}
                            {c.hasRiskKeyword && (
                              <Badge variant="destructive" className="text-[9px] gap-0.5">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                위험
                              </Badge>
                            )}
                            {c.escalatedToHq && (
                              <Badge className="text-[9px] bg-red-100 text-red-700 gap-0.5">
                                <ArrowUpCircle className="w-2.5 h-2.5" />
                                HQ
                              </Badge>
                            )}
                            {isWarrantyRelated && (
                              <Badge variant="outline" className="text-[9px] border-purple-300 text-purple-600 gap-0.5">
                                <FileText className="w-2.5 h-2.5" />
                                하자확인
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {c.unitNumber}호 · {c.complainantName} · {cat?.label}
                          </p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {sensitivityInfo && c.sensitivity !== "normal" && (
                            <Badge className={`text-[10px] ${sensitivityInfo.color}`}>
                              {sensitivityInfo.label}
                            </Badge>
                          )}
                          <Badge className={`text-[10px] ${statusInfo.color}`}>
                            {statusInfo.label}
                          </Badge>
                        </div>
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
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => setHistoryOpen(historyOpen === c.id ? null : c.id)}
                        >
                          <History className="w-3 h-3" />
                          이력
                        </Button>
                      </div>
                      {historyOpen === c.id && (
                        <ComplaintHistoryPanel complaintId={c.id} />
                      )}
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

function ComplaintHistoryPanel({ complaintId }: { complaintId: number }) {
  const { data: history = [], isLoading } = useGetComplaintHistory(complaintId);

  if (isLoading) {
    return <div className="mt-2 p-2 text-xs text-muted-foreground">불러오는 중...</div>;
  }

  if (history.length === 0) {
    return <div className="mt-2 p-2 text-xs text-muted-foreground bg-muted rounded">과거 관련 민원이 없습니다</div>;
  }

  return (
    <div className="mt-2 border rounded p-2 bg-muted/30 space-y-1.5">
      <p className="text-[10px] font-medium text-muted-foreground">관련 이력 ({history.length}건)</p>
      {history.slice(0, 5).map((h) => {
        const cat = CATEGORIES.find((x) => x.value === h.category);
        return (
          <div key={h.id} className="flex items-center justify-between text-xs p-1.5 bg-background rounded">
            <div className="flex items-center gap-1.5">
              <span>{h.unitNumber}호</span>
              <span className="text-muted-foreground">·</span>
              <span>{cat?.label || h.category}</span>
              <span className="text-muted-foreground">·</span>
              <span className="truncate max-w-[150px]">{h.title}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Badge className={`text-[9px] ${STATUS_LABELS[h.status]?.color}`}>
                {STATUS_LABELS[h.status]?.label}
              </Badge>
              <span className="text-[10px] text-muted-foreground">
                {new Date(h.createdAt!).toLocaleDateString("ko-KR")}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
