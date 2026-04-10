import { useState } from "react";
import {
  useListSafetyChecklists,
  useCreateSafetyChecklist,
  useUpdateSafetyChecklist,
  useDeleteSafetyChecklist,
  useGetSafetyChecklist,
  useUpdateSafetyChecklistItem,
  getListSafetyChecklistsQueryKey,
  getGetSafetyChecklistQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Plus, ClipboardCheck, Trash2, Eye, AlertTriangle, Wrench } from "lucide-react";

const CATEGORIES = [
  { value: "electrical", label: "전기설비" },
  { value: "fire_safety", label: "소방시설" },
  { value: "generator", label: "비상발전기" },
  { value: "water_tank", label: "저수조" },
  { value: "other", label: "기타" },
];

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "대기", variant: "outline" },
  completed: { label: "완료", variant: "default" },
  issue_found: { label: "이상발견", variant: "destructive" },
};

const DEFAULT_ITEMS: Record<string, string[]> = {
  electrical: ["누전차단기 동작 확인", "절연저항 측정", "접지 상태 확인", "배전반 점검", "전선 피복 상태"],
  fire_safety: ["소화기 점검", "스프링클러 동작 확인", "화재감지기 점검", "비상구 표시등", "방화문 상태"],
  generator: ["엔진오일 점검", "냉각수 확인", "배터리 상태", "연료량 확인", "시운전 결과"],
  water_tank: ["수질 검사", "수조 내부 청결", "배관 누수 확인", "소독 상태", "수위 확인"],
  other: [],
};

export default function SafetyChecklists() {
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: checklists, isLoading } = useListSafetyChecklists({
    category: filterCategory !== "all" ? filterCategory as any : undefined,
    status: filterStatus !== "all" ? filterStatus as any : undefined,
  });

  const createMutation = useCreateSafetyChecklist();
  const updateMutation = useUpdateSafetyChecklist();
  const deleteMutation = useDeleteSafetyChecklist();

  const [form, setForm] = useState({
    category: "electrical",
    title: "",
    inspectionDate: new Date().toISOString().split("T")[0],
    inspector: "",
    notes: "",
    items: [] as { itemName: string; checked: boolean }[],
  });

  function handleCategoryChange(cat: string) {
    const items = (DEFAULT_ITEMS[cat] || []).map((name) => ({
      itemName: name,
      checked: false,
    }));
    setForm((f) => ({ ...f, category: cat, items }));
  }

  async function handleCreate() {
    if (!form.title || !form.inspector) {
      toast({ title: "필수 항목을 입력해주세요", variant: "destructive" });
      return;
    }

    await createMutation.mutateAsync({
      data: {
        category: form.category as any,
        title: form.title,
        inspectionDate: form.inspectionDate,
        inspector: form.inspector,
        notes: form.notes || undefined,
        items: form.items.length > 0 ? form.items : undefined,
      },
    });

    queryClient.invalidateQueries({ queryKey: getListSafetyChecklistsQueryKey() });
    setCreateOpen(false);
    setForm({
      category: "electrical",
      title: "",
      inspectionDate: new Date().toISOString().split("T")[0],
      inspector: "",
      notes: "",
      items: [],
    });
    toast({ title: "안전점검표가 생성되었습니다" });
  }

  async function handleDelete(id: number) {
    await deleteMutation.mutateAsync({ id });
    queryClient.invalidateQueries({ queryKey: getListSafetyChecklistsQueryKey() });
    toast({ title: "점검표가 삭제되었습니다" });
  }

  async function handleStatusChange(id: number, status: string) {
    await updateMutation.mutateAsync({ id, data: { status: status as any } });
    queryClient.invalidateQueries({ queryKey: getListSafetyChecklistsQueryKey() });
    toast({ title: "상태가 변경되었습니다" });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">안전점검표</h1>
          <p className="text-muted-foreground text-sm mt-1">
            전기설비, 소방시설, 비상발전기, 저수조 등 카테고리별 안전점검
          </p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleCategoryChange("electrical")}>
              <Plus className="w-4 h-4 mr-2" />
              점검표 작성
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>안전점검표 작성</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>카테고리</Label>
                <Select value={form.category} onValueChange={handleCategoryChange}>
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
                  placeholder="점검 제목"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>점검일</Label>
                  <Input
                    type="date"
                    value={form.inspectionDate}
                    onChange={(e) => setForm((f) => ({ ...f, inspectionDate: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>점검자</Label>
                  <Input
                    value={form.inspector}
                    onChange={(e) => setForm((f) => ({ ...f, inspector: e.target.value }))}
                    placeholder="점검자 이름"
                  />
                </div>
              </div>
              {form.items.length > 0 && (
                <div>
                  <Label>점검 항목</Label>
                  <div className="space-y-2 mt-2">
                    {form.items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 border rounded">
                        <Checkbox
                          checked={item.checked}
                          onCheckedChange={(checked) => {
                            const newItems = [...form.items];
                            newItems[idx] = { ...item, checked: !!checked };
                            setForm((f) => ({ ...f, items: newItems }));
                          }}
                        />
                        <span className="text-sm flex-1">{item.itemName}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
          </DialogContent>
        </Dialog>
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
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="상태" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            <SelectItem value="pending">대기</SelectItem>
            <SelectItem value="completed">완료</SelectItem>
            <SelectItem value="issue_found">이상발견</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : checklists && checklists.length > 0 ? (
        <div className="space-y-3">
          {checklists.map((cl) => {
            const statusInfo = STATUS_MAP[cl.status] || STATUS_MAP.pending;
            const catLabel = CATEGORIES.find((c) => c.value === cl.category)?.label || cl.category;
            return (
              <Card key={cl.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <ClipboardCheck className="w-4 h-4 text-muted-foreground shrink-0" />
                        <p className="font-medium">{cl.title}</p>
                        <Badge variant="secondary" className="text-xs">{catLabel}</Badge>
                        <Badge variant={statusInfo.variant} className="text-xs">{statusInfo.label}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 ml-6">
                        {formatDate(cl.inspectionDate)} &middot; 점검자: {cl.inspector}
                        {cl.notes && ` &middot; ${cl.notes}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDetailId(cl.id)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {cl.status === "pending" && (
                        <Select
                          value=""
                          onValueChange={(val) => handleStatusChange(cl.id, val)}
                        >
                          <SelectTrigger className="h-8 w-[100px] text-xs">
                            <SelectValue placeholder="상태변경" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="completed">완료</SelectItem>
                            <SelectItem value="issue_found">이상발견</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(cl.id)}
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
            <ClipboardCheck className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">등록된 점검표가 없습니다</p>
          </CardContent>
        </Card>
      )}

      {detailId && (
        <ChecklistDetailDialog
          id={detailId}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}

function ChecklistDetailDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: detail, isLoading } = useGetSafetyChecklist(id);
  const updateItem = useUpdateSafetyChecklistItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  async function handleToggleItem(itemId: number, checked: boolean) {
    await updateItem.mutateAsync({ itemId, data: { checked } });
    queryClient.invalidateQueries({ queryKey: getGetSafetyChecklistQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListSafetyChecklistsQueryKey() });
    toast({ title: checked ? "항목 점검 완료" : "항목 점검 취소" });
  }

  async function handleResultChange(itemId: number, result: string) {
    await updateItem.mutateAsync({ itemId, data: { result } });
    queryClient.invalidateQueries({ queryKey: getGetSafetyChecklistQueryKey(id) });
    queryClient.invalidateQueries({ queryKey: getListSafetyChecklistsQueryKey() });
    if (result === "불량") {
      toast({
        title: "불량 항목 발견",
        description: "보수 업무가 자동 생성되었습니다. 관리소장에게 알림이 발송되었습니다.",
        variant: "destructive",
      });
    } else {
      toast({ title: "점검 결과가 저장되었습니다" });
    }
  }

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isLoading ? "로딩 중..." : detail?.title}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : detail ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">카테고리:</span>{" "}
                {CATEGORIES.find((c) => c.value === detail.category)?.label}
              </div>
              <div>
                <span className="text-muted-foreground">점검일:</span> {formatDate(detail.inspectionDate)}
              </div>
              <div>
                <span className="text-muted-foreground">점검자:</span> {detail.inspector}
              </div>
              <div>
                <span className="text-muted-foreground">상태:</span>{" "}
                <Badge variant={STATUS_MAP[detail.status]?.variant || "outline"}>
                  {STATUS_MAP[detail.status]?.label || detail.status}
                </Badge>
              </div>
            </div>
            {detail.notes && (
              <p className="text-sm text-muted-foreground">{detail.notes}</p>
            )}
            {detail.items && detail.items.length > 0 && (
              <div>
                <Label className="mb-2 block">점검 항목</Label>
                <div className="space-y-2">
                  {detail.items.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-2 border rounded ${item.result === "불량" ? "border-destructive bg-destructive/5" : ""}`}
                    >
                      <Checkbox
                        checked={item.checked}
                        onCheckedChange={(checked) => handleToggleItem(item.id, !!checked)}
                      />
                      <span className={`text-sm flex-1 ${item.checked ? "line-through text-muted-foreground" : ""}`}>
                        {item.itemName}
                      </span>
                      <Select
                        value={item.result || ""}
                        onValueChange={(val) => handleResultChange(item.id, val)}
                      >
                        <SelectTrigger className="h-7 w-[80px] text-xs">
                          <SelectValue placeholder="결과" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="양호">양호</SelectItem>
                          <SelectItem value="불량">불량</SelectItem>
                        </SelectContent>
                      </Select>
                      {item.result === "불량" && (
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
                          <Wrench className="w-3.5 h-3.5 text-chart-3" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-4">점검표를 찾을 수 없습니다</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
