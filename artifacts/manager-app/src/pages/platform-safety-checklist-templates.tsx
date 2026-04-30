import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAdminSafetyChecklistCategories,
  useCreateSafetyChecklistCategory,
  useUpdateSafetyChecklistCategory,
  useDeleteSafetyChecklistCategory,
  useCreateSafetyChecklistTemplateItem,
  useUpdateSafetyChecklistTemplateItem,
  useDeleteSafetyChecklistTemplateItem,
  getListAdminSafetyChecklistCategoriesQueryKey,
  getListEffectiveSafetyChecklistTemplatesQueryKey,
} from "@workspace/api-client-react";
import type {
  SafetyChecklistTemplateCategoryWithItems,
  SafetyChecklistTemplateItem,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown } from "lucide-react";

// [Task #650] platform_admin 전용 — 안전점검표 카테고리/기본 항목 관리.
//   직원이 새 점검표를 만들 때 기본으로 채워지는 항목들을 본사가 직접 정의한다.

type CategoryRow = SafetyChecklistTemplateCategoryWithItems;

export default function PlatformSafetyChecklistTemplatesPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data, isLoading } = useListAdminSafetyChecklistCategories();
  const categories: CategoryRow[] = data?.categories ?? [];

  const createCategory = useCreateSafetyChecklistCategory();
  const updateCategory = useUpdateSafetyChecklistCategory();
  const deleteCategory = useDeleteSafetyChecklistCategory();
  const createItem = useCreateSafetyChecklistTemplateItem();
  const updateItem = useUpdateSafetyChecklistTemplateItem();
  const deleteItem = useDeleteSafetyChecklistTemplateItem();

  const [catDialog, setCatDialog] = useState<
    | { mode: "create" }
    | { mode: "edit"; row: CategoryRow }
    | null
  >(null);
  const [itemDialog, setItemDialog] = useState<
    | { mode: "create"; categoryId: number; categoryLabel: string }
    | { mode: "edit"; row: SafetyChecklistTemplateItem; categoryLabel: string }
    | null
  >(null);

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: getListAdminSafetyChecklistCategoriesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListEffectiveSafetyChecklistTemplatesQueryKey() });
  }

  async function handleDeleteCategory(row: CategoryRow) {
    if (!confirm(`"${row.label}" 카테고리를 삭제하시겠습니까?\n산하 기본 항목도 함께 삭제됩니다.`)) return;
    await deleteCategory.mutateAsync({ id: row.id });
    invalidateAll();
    toast({ title: "카테고리가 삭제되었습니다" });
  }

  async function handleDeleteItem(row: SafetyChecklistTemplateItem) {
    if (!confirm(`"${row.itemName}" 항목을 삭제하시겠습니까?`)) return;
    await deleteItem.mutateAsync({ id: row.id });
    invalidateAll();
    toast({ title: "항목이 삭제되었습니다" });
  }

  // 위/아래 정렬은 인접한 두 항목의 sortOrder 를 swap 한다.
  async function handleMoveItem(items: SafetyChecklistTemplateItem[], idx: number, dir: -1 | 1) {
    const target = items[idx];
    const neighbor = items[idx + dir];
    if (!target || !neighbor) return;
    await Promise.all([
      updateItem.mutateAsync({
        id: target.id,
        data: { itemName: target.itemName, sortOrder: neighbor.sortOrder, isActive: target.isActive },
      }),
      updateItem.mutateAsync({
        id: neighbor.id,
        data: { itemName: neighbor.itemName, sortOrder: target.sortOrder, isActive: neighbor.isActive },
      }),
    ]);
    invalidateAll();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">안전점검표 템플릿 관리</h1>
          <p className="text-muted-foreground text-sm mt-1">
            직원의 일일점검표 카테고리(전기설비/소방시설 등)와 기본 점검 항목을 본사에서 관리합니다.
            저장 즉시 직원의 "새 점검표" 기본값에 반영됩니다.
          </p>
        </div>
        <Button onClick={() => setCatDialog({ mode: "create" })}>
          <Plus className="w-4 h-4 mr-2" /> 카테고리 추가
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ) : categories.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            등록된 카테고리가 없습니다. "카테고리 추가" 로 시작하세요.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => (
            <Card key={cat.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div className="min-w-0">
                  <CardTitle className="flex items-center gap-2 flex-wrap">
                    <span>{cat.label}</span>
                    <Badge variant="outline" className="text-xs font-mono">{cat.value}</Badge>
                    {!cat.isActive && <Badge variant="secondary" className="text-xs">비활성</Badge>}
                    <Badge variant="outline" className="text-xs">정렬 {cat.sortOrder}</Badge>
                  </CardTitle>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setCatDialog({ mode: "edit", row: cat })}>
                    <Pencil className="w-3.5 h-3.5 mr-1" /> 수정
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteCategory(cat)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> 삭제
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {cat.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">아직 기본 항목이 없습니다.</p>
                ) : (
                  <ul className="divide-y">
                    {cat.items.map((it, idx) => (
                      <li key={it.id} className="flex items-center gap-2 py-2">
                        <div className="flex flex-col gap-0.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            disabled={idx === 0}
                            onClick={() => handleMoveItem(cat.items, idx, -1)}
                            aria-label="위로"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            disabled={idx === cat.items.length - 1}
                            onClick={() => handleMoveItem(cat.items, idx, 1)}
                            aria-label="아래로"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </Button>
                        </div>
                        <span className="flex-1 text-sm">
                          {it.itemName}
                          {!it.isActive && <Badge variant="secondary" className="ml-2 text-xs">비활성</Badge>}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setItemDialog({ mode: "edit", row: it, categoryLabel: cat.label })}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDeleteItem(it)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setItemDialog({ mode: "create", categoryId: cat.id, categoryLabel: cat.label })}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> 항목 추가
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {catDialog && (
        <CategoryDialog
          state={catDialog}
          onClose={() => setCatDialog(null)}
          onSubmit={async (form) => {
            if (catDialog.mode === "create") {
              await createCategory.mutateAsync({
                data: {
                  value: form.value,
                  label: form.label,
                  sortOrder: form.sortOrder,
                  isActive: form.isActive,
                },
              });
              toast({ title: "카테고리가 생성되었습니다" });
            } else {
              await updateCategory.mutateAsync({
                id: catDialog.row.id,
                data: {
                  value: form.value,
                  label: form.label,
                  sortOrder: form.sortOrder,
                  isActive: form.isActive,
                },
              });
              toast({ title: "카테고리가 수정되었습니다" });
            }
            invalidateAll();
            setCatDialog(null);
          }}
          submitting={createCategory.isPending || updateCategory.isPending}
        />
      )}

      {itemDialog && (
        <ItemDialog
          state={itemDialog}
          onClose={() => setItemDialog(null)}
          onSubmit={async (form) => {
            if (itemDialog.mode === "create") {
              await createItem.mutateAsync({
                categoryId: itemDialog.categoryId,
                data: {
                  itemName: form.itemName,
                  sortOrder: form.sortOrder,
                  isActive: form.isActive,
                },
              });
              toast({ title: "항목이 추가되었습니다" });
            } else {
              await updateItem.mutateAsync({
                id: itemDialog.row.id,
                data: {
                  itemName: form.itemName,
                  sortOrder: form.sortOrder,
                  isActive: form.isActive,
                },
              });
              toast({ title: "항목이 수정되었습니다" });
            }
            invalidateAll();
            setItemDialog(null);
          }}
          submitting={createItem.isPending || updateItem.isPending}
        />
      )}
    </div>
  );
}

// ── 카테고리 다이얼로그 ────────────────────────────────────────
type CategoryFormState = {
  value: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
};

function CategoryDialog({
  state,
  onClose,
  onSubmit,
  submitting,
}: {
  state: { mode: "create" } | { mode: "edit"; row: CategoryRow };
  onClose: () => void;
  onSubmit: (form: CategoryFormState) => Promise<void>;
  submitting: boolean;
}) {
  const isEdit = state.mode === "edit";
  const initial: CategoryFormState = isEdit
    ? {
        value: state.row.value,
        label: state.row.label,
        sortOrder: state.row.sortOrder,
        isActive: state.row.isActive,
      }
    : { value: "", label: "", sortOrder: 100, isActive: true };

  const [form, setForm] = useState<CategoryFormState>(initial);
  const { toast } = useToast();

  async function handleSubmit() {
    if (!form.value.trim() || !form.label.trim()) {
      toast({ title: "값과 표시명을 모두 입력해주세요", variant: "destructive" });
      return;
    }
    if (!/^[a-z0-9_]+$/.test(form.value)) {
      toast({ title: "값(슬러그)은 소문자/숫자/밑줄만 허용됩니다", variant: "destructive" });
      return;
    }
    await onSubmit(form);
  }

  return (
    <ResponsiveDialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <ResponsiveDialogContent className="max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {isEdit ? "카테고리 수정" : "카테고리 추가"}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-4">
          <div>
            <Label>값 (슬러그)</Label>
            <Input
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value.trim() }))}
              placeholder="예: electrical"
              disabled={isEdit}
            />
            {isEdit && (
              <p className="text-xs text-muted-foreground mt-1">
                슬러그는 기존 점검표·사용자 묶음과 연결되어 있어 변경할 수 없습니다.
              </p>
            )}
          </div>
          <div>
            <Label>표시명</Label>
            <Input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="예: 전기설비"
            />
          </div>
          <div>
            <Label>정렬 순서</Label>
            <Input
              type="number"
              value={form.sortOrder}
              onChange={(e) =>
                setForm((f) => ({ ...f, sortOrder: Number(e.target.value) || 0 }))
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>활성</Label>
            <Switch
              checked={form.isActive}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
            />
          </div>
        </div>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "저장 중..." : "저장"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}

// ── 항목 다이얼로그 ────────────────────────────────────────────
type ItemFormState = {
  itemName: string;
  sortOrder: number;
  isActive: boolean;
};

function ItemDialog({
  state,
  onClose,
  onSubmit,
  submitting,
}: {
  state:
    | { mode: "create"; categoryId: number; categoryLabel: string }
    | { mode: "edit"; row: SafetyChecklistTemplateItem; categoryLabel: string };
  onClose: () => void;
  onSubmit: (form: ItemFormState) => Promise<void>;
  submitting: boolean;
}) {
  const isEdit = state.mode === "edit";
  const initial: ItemFormState = isEdit
    ? {
        itemName: state.row.itemName,
        sortOrder: state.row.sortOrder,
        isActive: state.row.isActive,
      }
    : { itemName: "", sortOrder: 100, isActive: true };
  const [form, setForm] = useState<ItemFormState>(initial);
  const { toast } = useToast();

  async function handleSubmit() {
    if (!form.itemName.trim()) {
      toast({ title: "항목명을 입력해주세요", variant: "destructive" });
      return;
    }
    await onSubmit(form);
  }

  return (
    <ResponsiveDialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <ResponsiveDialogContent className="max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {isEdit ? "항목 수정" : `${state.categoryLabel} · 항목 추가`}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="space-y-4">
          <div>
            <Label>항목명</Label>
            <Input
              value={form.itemName}
              onChange={(e) => setForm((f) => ({ ...f, itemName: e.target.value }))}
              placeholder="예: 누전차단기 동작 확인"
            />
          </div>
          <div>
            <Label>정렬 순서</Label>
            <Input
              type="number"
              value={form.sortOrder}
              onChange={(e) =>
                setForm((f) => ({ ...f, sortOrder: Number(e.target.value) || 0 }))
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <Label>활성</Label>
            <Switch
              checked={form.isActive}
              onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
            />
          </div>
        </div>
        <ResponsiveDialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "저장 중..." : "저장"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
