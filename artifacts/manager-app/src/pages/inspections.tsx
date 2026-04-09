import { useState } from "react";
import {
  useListInspections,
  useCreateInspection,
  useUpdateInspection,
  useDeleteInspection,
  getListInspectionsQueryKey,
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
import { Plus, Trash2, Edit, Shield, Printer } from "lucide-react";
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
  { value: "other", label: "기타" },
];

const statusOptions = [
  { value: "upcoming", label: "예정" },
  { value: "scheduled", label: "일정 확정" },
  { value: "completed", label: "완료" },
  { value: "overdue", label: "기한 초과" },
];

export default function Inspections() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeTarget, setNoticeTarget] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: inspections, isLoading } = useListInspections();
  const createMutation = useCreateInspection();
  const updateMutation = useUpdateInspection();
  const deleteMutation = useDeleteInspection();

  const [form, setForm] = useState({
    name: "",
    category: "elevator",
    frequencyPerYear: 1,
    lastInspectionDate: "",
    nextDueDate: "",
    notes: "",
    legalBasis: CATEGORY_LEGAL_BASIS["elevator"],
    advanceAlertDays: 30,
  });

  function resetForm() {
    setForm({ name: "", category: "elevator", frequencyPerYear: 1, lastInspectionDate: "", nextDueDate: "", notes: "", legalBasis: CATEGORY_LEGAL_BASIS["elevator"], advanceAlertDays: 30 });
    setEditing(null);
  }

  function handleCategoryChange(v: string) {
    const defaultLegal = CATEGORY_LEGAL_BASIS[v] || "";
    const oldDefault = CATEGORY_LEGAL_BASIS[form.category] || "";
    const shouldAutoFill = !form.legalBasis || form.legalBasis === oldDefault;
    setForm({ ...form, category: v, legalBasis: shouldAutoFill ? defaultLegal : form.legalBasis });
  }

  function openEdit(item: any) {
    setEditing(item);
    setForm({
      name: item.name,
      category: item.category,
      frequencyPerYear: item.frequencyPerYear,
      lastInspectionDate: item.lastInspectionDate || "",
      nextDueDate: item.nextDueDate,
      notes: item.notes || "",
      legalBasis: item.legalBasis || CATEGORY_LEGAL_BASIS[item.category] || "",
      advanceAlertDays: item.advanceAlertDays,
    });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data = {
      name: form.name,
      category: form.category as any,
      frequencyPerYear: form.frequencyPerYear,
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

  const statusColor = (s: string) => {
    switch (s) {
      case "overdue": return "destructive";
      case "upcoming": return "secondary";
      case "scheduled": return "outline";
      case "completed": return "outline";
      default: return "outline" as const;
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "점검 수정" : "새 점검 등록"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  <Label>연간 횟수</Label>
                  <Input type="number" min={1} value={form.frequencyPerYear} onChange={(e) => setForm({ ...form, frequencyPerYear: parseInt(e.target.value) || 1 })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>최근 점검일</Label>
                  <Input type="date" value={form.lastInspectionDate} onChange={(e) => setForm({ ...form, lastInspectionDate: e.target.value })} />
                </div>
                <div>
                  <Label>다음 예정일</Label>
                  <Input type="date" value={form.nextDueDate} onChange={(e) => setForm({ ...form, nextDueDate: e.target.value })} required />
                </div>
              </div>
              <div>
                <Label>법정근거</Label>
                <Input value={form.legalBasis} onChange={(e) => setForm({ ...form, legalBasis: e.target.value })} placeholder="예: 승강기 안전관리법 제32조" />
              </div>
              <div>
                <Label>사전 알림 일수</Label>
                <Input type="number" min={1} value={form.advanceAlertDays} onChange={(e) => setForm({ ...form, advanceAlertDays: parseInt(e.target.value) || 30 })} />
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
                        <span className="text-xs text-muted-foreground">
                          연 {item.frequencyPerYear}회
                        </span>
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
