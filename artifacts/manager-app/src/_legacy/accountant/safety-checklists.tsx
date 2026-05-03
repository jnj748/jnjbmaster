import { useEffect, useMemo, useRef, useState } from "react";
import { useSearch } from "wouter";
import {
  useListSafetyChecklists,
  useCreateSafetyChecklist,
  useUpdateSafetyChecklist,
  useDeleteSafetyChecklist,
  useGetSafetyChecklist,
  useUpdateSafetyChecklistItem,
  useListEffectiveSafetyChecklistTemplates,
  useUpsertSafetyChecklistUserTemplate,
  useResetSafetyChecklistUserTemplate,
  getListSafetyChecklistsQueryKey,
  getGetSafetyChecklistQueryKey,
  getListEffectiveSafetyChecklistTemplatesQueryKey,
  listEffectiveSafetyChecklistTemplates,
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
import { Plus, ClipboardCheck, Trash2, Eye, AlertTriangle, Wrench, Settings, RotateCcw, ArrowUp, ArrowDown } from "lucide-react";
import { OfficialDocumentTriggers } from "@/components/official-document-triggers";
import type { OfficialDocumentInput } from "@/lib/official-document";
import { MobileFilterSheet } from "@/components/mobile-filter-sheet";
import { PhotoUploadField } from "@/components/photo-upload-field";
import { AuthImage } from "@/components/auth-image";

// [Task #650] 카테고리/기본 항목은 더 이상 코드 상수가 아니라 서버 API 가 단일 소스.
//   useListEffectiveSafetyChecklistTemplates 가 (사용자 묶음 ?? 본사 기본) 항목을 돌려주며,
//   본사 admin 화면(/platform/safety-checklist-templates)에서 카테고리·기본 항목을 관리한다.

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "대기", variant: "outline" },
  completed: { label: "완료", variant: "default" },
  issue_found: { label: "이상발견", variant: "destructive" },
};

type EffectiveCategory = {
  value: string;
  label: string;
  items: string[];
  source: "user" | "default";
};

export default function SafetyChecklists() {
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  // [Task #669] 시설담당 대시보드 "금주 안전점검 작성" 위젯이 카테고리 슬러그를
  //   넘겨 진입할 때 자동으로 상단 카테고리 필터를 그 값으로 맞춘다. 사용자가
  //   이후 수동으로 필터를 다시 바꾸면 그 선택을 우선해 무한 덮어쓰기를 방지한다.
  const search = useSearch();
  const requestedCategory = useMemo(() => {
    const params = new URLSearchParams(search);
    const v = params.get("category");
    return v && v.length > 0 ? v : null;
  }, [search]);
  const appliedCategoryRef = useRef<string | null>(null);
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

  // [Task #650] 본사 기본 + 사용자 묶음이 합쳐진 효과 템플릿. 카테고리 셀렉트와
  //   "새 점검표" 자동 채움이 모두 이 데이터를 단일 소스로 사용한다.
  const { data: effectiveData } = useListEffectiveSafetyChecklistTemplates();
  const effectiveCategories: EffectiveCategory[] = useMemo(
    () => effectiveData?.categories ?? [],
    [effectiveData],
  );
  const itemsByCategory = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of effectiveCategories) m.set(c.value, c.items);
    return m;
  }, [effectiveCategories]);
  const labelByCategory = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of effectiveCategories) m.set(c.value, c.label);
    return m;
  }, [effectiveCategories]);

  const [editTplOpen, setEditTplOpen] = useState(false);
  const initialCategory = effectiveCategories[0]?.value ?? "electrical";

  const [form, setForm] = useState({
    category: initialCategory,
    title: "",
    inspectionDate: new Date().toISOString().split("T")[0],
    inspector: "",
    notes: "",
    closeUpPhotoUrl: null as string | null,
    widePhotoUrl: null as string | null,
    items: [] as { itemName: string; checked: boolean; custom?: boolean }[],
  });
  const [customItemInput, setCustomItemInput] = useState("");

  // [Task #669] URL 의 ?category= 슬러그가 effectiveCategories 안에 있으면
  //   상단 카테고리 필터를 그 값으로 한 번 자동 선택한다. 이후 사용자가 다시
  //   필터를 바꾸면 ref 가 잠겨 있어 같은 슬러그를 두 번 적용하지 않는다.
  //   슬러그가 없거나 카테고리 목록에 없으면 기본값("all") 그대로 둔다.
  useEffect(() => {
    if (!requestedCategory) return;
    if (effectiveCategories.length === 0) return;
    if (appliedCategoryRef.current === requestedCategory) return;
    const exists = effectiveCategories.some((c) => c.value === requestedCategory);
    if (!exists) {
      appliedCategoryRef.current = requestedCategory;
      return;
    }
    appliedCategoryRef.current = requestedCategory;
    setFilterCategory(requestedCategory);
  }, [requestedCategory, effectiveCategories]);

  // 효과 템플릿이 처음 도착했거나 사용자 묶음이 갱신된 경우, 폼이 비어 있으면
  //   현재 카테고리의 기본 항목으로 자동 채워준다(직원 입력 중인 항목은 보존).
  useEffect(() => {
    if (effectiveCategories.length === 0) return;
    setForm((f) => {
      const cur = effectiveCategories.find((c) => c.value === f.category)
        ? f.category
        : effectiveCategories[0]!.value;
      if (f.items.length === 0) {
        const items = (itemsByCategory.get(cur) ?? []).map((name) => ({
          itemName: name,
          checked: false,
        }));
        return { ...f, category: cur, items };
      }
      return cur === f.category ? f : { ...f, category: cur };
    });
  }, [effectiveCategories, itemsByCategory]);

  function handleCategoryChange(cat: string) {
    setForm((f) => {
      const defaults = (itemsByCategory.get(cat) ?? []).map((name) => ({
        itemName: name,
        checked: false,
      }));
      const defaultNames = new Set(defaults.map((d) => d.itemName));
      const customItems = f.items.filter(
        (i) => i.custom && !defaultNames.has(i.itemName),
      );
      return { ...f, category: cat, items: [...defaults, ...customItems] };
    });
  }

  function handleAddCustomItem() {
    const name = customItemInput.trim();
    if (!name) return;
    setForm((f) => {
      if (f.items.some((i) => i.itemName === name)) return f;
      return {
        ...f,
        items: [...f.items, { itemName: name, checked: false, custom: true }],
      };
    });
    setCustomItemInput("");
  }

  function handleRemoveCustomItem(idx: number) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
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
        closeUpPhotoUrl: form.closeUpPhotoUrl,
        widePhotoUrl: form.widePhotoUrl,
        items: form.items.length > 0 ? form.items.map(({ itemName, checked }) => ({ itemName, checked })) : undefined,
      },
    });

    queryClient.invalidateQueries({ queryKey: getListSafetyChecklistsQueryKey() });
    setCreateOpen(false);
    // [Task #650] HQ 카테고리가 본사에서 동적으로 관리되므로 폼 리셋도 첫 번째 활성 카테고리로 맞춘다.
    setForm({
      category: effectiveCategories[0]?.value ?? form.category,
      title: "",
      inspectionDate: new Date().toISOString().split("T")[0],
      inspector: "",
      notes: "",
      closeUpPhotoUrl: null,
      widePhotoUrl: null,
      items: [],
    });
    setCustomItemInput("");
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
        <div className="flex gap-2 flex-wrap">
          {/* [Task #650] 본인의 카테고리별 항목 묶음을 저장해 다음 점검부터 그대로 쓰게 한다. */}
          <Button variant="outline" onClick={() => setEditTplOpen(true)}>
            <Settings className="w-4 h-4 mr-2" />
            일일점검표 항목 수정하기
          </Button>
        <ResponsiveDialog open={createOpen} onOpenChange={setCreateOpen}>
          <ResponsiveDialogTrigger asChild>
            <Button
              onClick={() => {
                const first = effectiveCategories[0]?.value ?? "electrical";
                handleCategoryChange(first);
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              점검표 작성
            </Button>
          </ResponsiveDialogTrigger>
          <ResponsiveDialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>안전점검표 작성</ResponsiveDialogTitle>
            </ResponsiveDialogHeader>
            <div className="space-y-4">
              <div>
                <Label>카테고리</Label>
                <Select value={form.category} onValueChange={handleCategoryChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {effectiveCategories.map((c) => (
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
              <div>
                <Label>점검 항목</Label>
                {form.items.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {form.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 px-2 py-1 border-b last:border-b-0"
                      >
                        <Checkbox
                          checked={item.checked}
                          onCheckedChange={(checked) => {
                            const newItems = [...form.items];
                            newItems[idx] = { ...item, checked: !!checked };
                            setForm((f) => ({ ...f, items: newItems }));
                          }}
                          className="h-4 w-4"
                        />
                        <span className="text-xs flex-1 leading-tight">{item.itemName}</span>
                        {item.custom && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => handleRemoveCustomItem(idx)}
                            aria-label="항목 삭제"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <Input
                    value={customItemInput}
                    onChange={(e) => setCustomItemInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddCustomItem();
                      }
                    }}
                    placeholder="기타 (직접입력)"
                    className="h-8 text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddCustomItem}
                    className="h-8 px-3"
                  >
                    추가
                  </Button>
                </div>
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
      </div>

      {/* [Task #650] 일일점검표 본인 묶음 편집 다이얼로그 */}
      {editTplOpen && (
        <UserTemplateDialog
          categories={effectiveCategories}
          onClose={() => setEditTplOpen(false)}
        />
      )}

      <div className="hidden desktop:flex gap-3">
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[160px] h-11"><SelectValue placeholder="카테고리" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 카테고리</SelectItem>
            {effectiveCategories.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[140px] h-11"><SelectValue placeholder="상태" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            <SelectItem value="pending">대기</SelectItem>
            <SelectItem value="completed">완료</SelectItem>
            <SelectItem value="issue_found">이상발견</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <MobileFilterSheet activeCount={(filterCategory !== "all" ? 1 : 0) + (filterStatus !== "all" ? 1 : 0)}>
        <div>
          <Label className="mb-2 block">카테고리</Label>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="w-full h-11"><SelectValue placeholder="카테고리" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 카테고리</SelectItem>
              {effectiveCategories.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-2 block">상태</Label>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-full h-11"><SelectValue placeholder="상태" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 상태</SelectItem>
              <SelectItem value="pending">대기</SelectItem>
              <SelectItem value="completed">완료</SelectItem>
              <SelectItem value="issue_found">이상발견</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </MobileFilterSheet>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
      ) : checklists && checklists.length > 0 ? (
        <div className="space-y-3">
          {checklists.map((cl) => {
            const statusInfo = STATUS_MAP[cl.status] || STATUS_MAP.pending;
            const catLabel = labelByCategory.get(cl.category) ?? cl.category;
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
                          <SelectTrigger className="h-11 w-[110px] text-xs">
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

// [Task #650] 직원이 본인의 카테고리별 항목 묶음을 추가/삭제/정렬하고 저장하는 다이얼로그.
//   저장은 PUT /safety-checklist-templates/user/:category, 되돌리기는 DELETE.
function UserTemplateDialog({
  categories,
  onClose,
}: {
  categories: EffectiveCategory[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const upsert = useUpsertSafetyChecklistUserTemplate();
  const reset = useResetSafetyChecklistUserTemplate();

  const [activeCategory, setActiveCategory] = useState<string>(
    categories[0]?.value ?? "",
  );
  // 카테고리별 편집 중인 항목들. 다이얼로그가 열린 동안 카테고리 전환 시에도 보존된다.
  const [drafts, setDrafts] = useState<Record<string, string[]>>(() => {
    const seed: Record<string, string[]> = {};
    for (const c of categories) seed[c.value] = [...c.items];
    return seed;
  });
  const [newItem, setNewItem] = useState("");

  const items = drafts[activeCategory] ?? [];
  const activeMeta = categories.find((c) => c.value === activeCategory);

  function setItems(next: string[]) {
    setDrafts((d) => ({ ...d, [activeCategory]: next }));
  }

  function addItem() {
    const name = newItem.trim();
    if (!name) return;
    if (items.includes(name)) {
      toast({ title: "이미 추가된 항목입니다", variant: "destructive" });
      return;
    }
    setItems([...items, name]);
    setNewItem("");
  }

  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }

  function moveItem(idx: number, dir: -1 | 1) {
    const next = [...items];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j]!, next[idx]!];
    setItems(next);
  }

  async function handleSave() {
    if (!activeCategory) return;
    await upsert.mutateAsync({
      category: activeCategory,
      data: { items },
    });
    queryClient.invalidateQueries({
      queryKey: getListEffectiveSafetyChecklistTemplatesQueryKey(),
    });
    toast({ title: `"${activeMeta?.label ?? activeCategory}" 항목 묶음이 저장되었습니다` });
  }

  async function handleReset() {
    if (!activeCategory) return;
    if (!confirm("본사 기본 템플릿으로 되돌리시겠습니까?")) return;
    await reset.mutateAsync({ category: activeCategory });
    // 되돌리기 후 본사 기본 항목으로 초안을 다시 채운다.
    queryClient.invalidateQueries({
      queryKey: getListEffectiveSafetyChecklistTemplatesQueryKey(),
    });
    // [Task #650] 생성된 API 함수를 직접 호출해 최신 effective template 을 가져온다.
    //   queryClient.fetchQuery({ queryKey }) 만 쓰면 queryFn 이 등록돼 있을 때만
    //   동작해 fragile 하므로 codegen 함수를 명시적으로 사용한다.
    const fresh = await listEffectiveSafetyChecklistTemplates();
    const cat = fresh.categories.find((c) => c.value === activeCategory);
    if (cat) setItems([...cat.items]);
    toast({ title: "본사 기본 템플릿으로 되돌렸습니다" });
  }

  return (
    <ResponsiveDialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <ResponsiveDialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>일일점검표 항목 수정</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            카테고리별로 본인이 매일 쓰는 항목을 저장하면 다음 점검표부터 그대로 채워집니다.
            저장하지 않은 카테고리는 본사 기본 템플릿이 그대로 사용됩니다.
          </p>
          <div>
            <Label>카테고리</Label>
            <Select value={activeCategory} onValueChange={setActiveCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                    {c.source === "user" ? " (저장됨)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeMeta && (
              <p className="text-xs text-muted-foreground mt-1">
                {activeMeta.source === "user"
                  ? "현재 본인이 저장한 항목 묶음을 사용 중입니다."
                  : "현재 본사 기본 템플릿을 사용 중입니다. 저장 시 본인 묶음으로 전환됩니다."}
              </p>
            )}
          </div>
          <div>
            <Label>점검 항목</Label>
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground py-2">항목이 없습니다.</p>
            ) : (
              <ul className="divide-y border rounded mt-1">
                {items.map((it, idx) => (
                  <li key={`${it}-${idx}`} className="flex items-center gap-1 px-2 py-1.5">
                    <div className="flex flex-col gap-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0"
                        disabled={idx === 0}
                        onClick={() => moveItem(idx, -1)}
                        aria-label="위로"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-5 w-5 p-0"
                        disabled={idx === items.length - 1}
                        onClick={() => moveItem(idx, 1)}
                        aria-label="아래로"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </Button>
                    </div>
                    <span className="flex-1 text-sm">{it}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeItem(idx)}
                      aria-label="삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 mt-2">
              <Input
                value={newItem}
                onChange={(e) => setNewItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addItem();
                  }
                }}
                placeholder="새 항목 입력"
              />
              <Button type="button" variant="outline" onClick={addItem}>
                추가
              </Button>
            </div>
          </div>
          <div className="flex gap-2 pt-2 flex-wrap">
            <Button onClick={handleSave} disabled={upsert.isPending} className="flex-1">
              {upsert.isPending ? "저장 중..." : "이 카테고리 저장"}
            </Button>
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={reset.isPending || activeMeta?.source !== "user"}
            >
              <RotateCcw className="w-4 h-4 mr-1" />
              기본값으로 되돌리기
            </Button>
            <Button variant="ghost" onClick={onClose}>닫기</Button>
          </div>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

function ChecklistDetailDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: detail, isLoading } = useGetSafetyChecklist(id);
  const updateItem = useUpdateSafetyChecklistItem();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // [Task #650] 카테고리 라벨 변환은 더 이상 코드 상수가 아니라 효과 템플릿 응답에서 가져온다.
  const { data: effectiveData } = useListEffectiveSafetyChecklistTemplates();
  const labelByCategory = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of effectiveData?.categories ?? []) m.set(c.value, c.label);
    return m;
  }, [effectiveData]);

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
    <ResponsiveDialog open onOpenChange={() => onClose()}>
      <ResponsiveDialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{isLoading ? "로딩 중..." : detail?.title}</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : detail ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">카테고리:</span>{" "}
                {labelByCategory.get(detail.category) ?? detail.category}
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
                        <SelectTrigger className="h-11 w-[88px] text-xs">
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
            {detail.status !== "pending" && (
              <OfficialDocumentTriggers
                buildInput={(): OfficialDocumentInput => {
                  const items = (detail.items ?? []).map((it) => ({
                    label: it.itemName,
                    status:
                      it.result === "불량"
                        ? ("bad" as const)
                        : it.result === "양호"
                        ? ("good" as const)
                        : it.checked
                        ? ("good" as const)
                        : ("info" as const),
                    meta: it.checked ? "점검완료" : "미점검",
                  }));
                  const goodCount = items.filter((i) => i.status === "good").length;
                  const badCount = items.filter((i) => i.status === "bad").length;
                  const catLabel =
                    labelByCategory.get(detail.category) ??
                    detail.category;
                  return {
                    source: "safety-checklists",
                    sourceLabel: `안전점검 (${catLabel})`,
                    title: detail.title,
                    date: detail.inspectionDate,
                    authorName: detail.inspector,
                    summary: [
                      { label: "카테고리", value: catLabel },
                      { label: "총 항목", value: `${items.length}건` },
                      { label: "양호", value: `${goodCount}건` },
                      { label: "불량", value: `${badCount}건` },
                      {
                        label: "결과",
                        value:
                          detail.status === "issue_found"
                            ? "이상발견"
                            : detail.status === "completed"
                            ? "완료"
                            : "진행",
                      },
                    ],
                    items,
                    notes: detail.notes ?? undefined,
                    photos: [detail.widePhotoUrl, detail.closeUpPhotoUrl].filter(
                      (p): p is string => !!p,
                    ),
                  };
                }}
              />
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-center py-4">점검표를 찾을 수 없습니다</p>
        )}
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
