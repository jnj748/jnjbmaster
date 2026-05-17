import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
import { Plus, Pencil, Trash2, Layers, ChevronDown, ChevronRight } from "lucide-react";
import { VendorChangeRequestsAdminSection } from "@/components/vendor-change-requests-admin";

// [Task #740 가입흐름재설정] 본사 관리자 — 파트너 분야(카테고리) 관리 화면.
//   2단(대분류·자식)으로 구성된 vendor_categories 마스터를 직접 추가/편집/비활성/삭제한다.
//   여기서 추가한 카테고리는 가입 위저드의 분야 선택에 자동으로 반영되며,
//   매칭 모듈의 자식↔부모 자동 포함 맵도 변경 직후 즉시 갱신된다(라우트 측에서 reload).
//
//   본 화면의 운영 원칙:
//     - 비활성(active=false) 은 신규 가입의 옵션에서만 숨긴다. 기존 vendor 의
//       서브카테고리 텍스트는 보존되며, 매칭은 그대로 통과한다(데이터 보호).
//     - 자식이 있는 대분류는 삭제할 수 없다(409). 비활성으로 숨기는 것을 권장.
//     - parent_code 변경은 자식 → 다른 대분류 이동만 허용. 부모를 자식으로
//       바꾸거나(2단 초과) 자기 자신을 부모로 지정하는 것은 백엔드가 막는다.

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

interface Category {
  id: number;
  code: string;
  label: string;
  parentCode: string | null;
  active: boolean;
  sortOrder: number;
  createdAt?: string;
}

interface DraftState {
  id: number | null; // null = 신규
  code: string;
  label: string;
  parentCode: string | null; // null = 대분류
  sortOrder: number;
  active: boolean;
}

const EMPTY_DRAFT: DraftState = {
  id: null,
  code: "",
  label: "",
  parentCode: null,
  sortOrder: 0,
  active: true,
};

const PARENT_NONE = "__none__"; // Select 의 "대분류" sentinel

export default function PlatformVendorCategoriesPage() {
  const { user, token } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const prev = document.title;
    document.title = "파트너 분야 관리 · 관리의달인";
    return () => {
      document.title = prev;
    };
  }, []);

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  // 접힘 상태 — top.code 가 들어 있으면 접힘. 토글·저장·삭제 후에도 유지된다.
  const [collapsedTops, setCollapsedTops] = useState<Set<string>>(new Set());

  // silent=true 면 화면 전체를 "불러오는 중..." 으로 바꾸지 않는다 (스크롤 점프 방지).
  async function load(opts: { silent?: boolean } = {}) {
    if (!opts.silent) setLoading(true);
    setErrorMsg("");
    try {
      // 비활성 항목까지 모두 조회 (관리자 화면).
      const res = await fetch(`${API_BASE}/vendor-categories?includeInactive=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`불러오기 실패 (${res.status})`);
      const data = (await res.json()) as { categories: Category[] };
      setCategories(data.categories ?? []);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "오류");
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }

  function toggleCollapsed(code: string) {
    setCollapsedTops((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function collapseAll() {
    setCollapsedTops(new Set(categories.filter((c) => !c.parentCode).map((c) => c.code)));
  }
  function expandAll() {
    setCollapsedTops(new Set());
  }

  useEffect(() => {
    if (token) void load();
  }, [token]);

  // 대분류 + 자식을 부모별로 묶고, sort_order 로 정렬.
  const grouped = useMemo(() => {
    const tops = categories
      .filter((c) => !c.parentCode)
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "ko"));
    return tops.map((top) => ({
      top,
      children: categories
        .filter((c) => c.parentCode === top.code)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "ko")),
    }));
  }, [categories]);

  const topLevels = useMemo(
    () =>
      categories
        .filter((c) => !c.parentCode)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "ko")),
    [categories],
  );

  function openCreate(parentCode: string | null) {
    // 새 항목 추가 — 부모가 지정되어 있으면 자식 모드로 시작.
    setDraft({
      ...EMPTY_DRAFT,
      parentCode,
      sortOrder: nextSortOrderUnder(parentCode),
    });
    setDialogOpen(true);
  }

  function openEdit(c: Category) {
    setDraft({
      id: c.id,
      code: c.code,
      label: c.label,
      parentCode: c.parentCode,
      sortOrder: c.sortOrder,
      active: c.active,
    });
    setDialogOpen(true);
  }

  function nextSortOrderUnder(parentCode: string | null): number {
    const siblings = categories.filter((c) =>
      parentCode == null ? !c.parentCode : c.parentCode === parentCode,
    );
    if (siblings.length === 0) return parentCode == null ? 100 : 1;
    const maxOrder = Math.max(...siblings.map((s) => s.sortOrder));
    return maxOrder + (parentCode == null ? 10 : 1);
  }

  async function save() {
    if (!draft.label.trim()) {
      toast({ title: "라벨은 필수입니다", variant: "destructive" });
      return;
    }
    if (!draft.id && !draft.code.trim()) {
      toast({ title: "코드는 필수입니다", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const url = draft.id
        ? `${API_BASE}/vendor-categories/${draft.id}`
        : `${API_BASE}/vendor-categories`;
      const method = draft.id ? "PUT" : "POST";
      const body: Record<string, unknown> = {
        label: draft.label.trim(),
        parentCode: draft.parentCode,
        sortOrder: draft.sortOrder,
        active: draft.active,
      };
      if (!draft.id) body.code = draft.code.trim();
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `저장 실패 (${res.status})`);
      }
      toast({ title: draft.id ? "수정되었습니다" : "추가되었습니다" });
      setDialogOpen(false);
      // silent reload — 화면을 "불러오는 중..." 으로 바꾸지 않아 스크롤 위치가 유지된다.
      await load({ silent: true });
    } catch (e) {
      toast({
        title: "저장 실패",
        description: e instanceof Error ? e.message : "오류",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: Category) {
    // 옵티미스틱 업데이트 — 즉시 화면을 바꾸고, 실패 시 되돌린다.
    //   load() 를 호출하지 않으므로 스크롤 위치도 유지된다.
    setCategories((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, active: !c.active } : x)),
    );
    try {
      const res = await fetch(`${API_BASE}/vendor-categories/${c.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ active: !c.active }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `변경 실패 (${res.status})`);
      }
      toast({ title: c.active ? "비활성으로 전환했습니다" : "활성으로 전환했습니다" });
    } catch (e) {
      // 실패 시 원복.
      setCategories((prev) =>
        prev.map((x) => (x.id === c.id ? { ...x, active: c.active } : x)),
      );
      toast({
        title: "전환 실패",
        description: e instanceof Error ? e.message : "오류",
        variant: "destructive",
      });
    }
  }

  async function remove(c: Category) {
    const childCount = categories.filter((x) => x.parentCode === c.code).length;
    const confirmMsg =
      childCount > 0
        ? `'${c.label}' 에는 자식 ${childCount}개가 있어 삭제할 수 없습니다. 먼저 자식을 삭제하거나 '비활성' 으로 숨기세요.`
        : `'${c.label}' 항목을 정말 삭제할까요? 같은 코드의 vendor 데이터는 그대로 남지만, 신규 가입 옵션에서는 사라집니다.`;
    if (childCount > 0) {
      toast({ title: "삭제할 수 없습니다", description: confirmMsg, variant: "destructive" });
      return;
    }
    if (!window.confirm(confirmMsg)) return;
    try {
      const res = await fetch(`${API_BASE}/vendor-categories/${c.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `삭제 실패 (${res.status})`);
      }
      toast({ title: "삭제했습니다" });
      await load({ silent: true });
    } catch (e) {
      toast({
        title: "삭제 실패",
        description: e instanceof Error ? e.message : "오류",
        variant: "destructive",
      });
    }
  }

  if (user?.role !== "platform_admin") {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">플랫폼 관리자만 접근할 수 있습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12" data-testid="page-platform-vendor-categories">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Layers className="w-6 h-6" /> 파트너 분야 관리
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          파트너사가 가입할 때 선택할 수 있는 분야(대분류·자식 2단)를 관리합니다.
          여기서 추가/수정한 항목은 가입 화면에 즉시 반영됩니다.
          비활성(숨김) 은 가입 옵션에서만 빠지고 기존 데이터는 보존됩니다.
        </p>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={collapseAll}
          disabled={loading || grouped.length === 0}
          data-testid="button-collapse-all"
        >
          모두 접기
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={expandAll}
          disabled={loading || collapsedTops.size === 0}
          data-testid="button-expand-all"
        >
          모두 펼치기
        </Button>
        <Button variant="outline" onClick={() => openCreate(null)}>
          <Plus className="w-4 h-4 mr-1" /> 대분류 추가
        </Button>
      </div>

      {errorMsg ? (
        <Card>
          <CardContent className="py-4 text-sm text-destructive">{errorMsg}</CardContent>
        </Card>
      ) : null}

      {loading ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">불러오는 중...</CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ top, children }) => {
            const isCollapsed = collapsedTops.has(top.code);
            return (
            <Card key={top.id} className={top.active ? "" : "opacity-60"}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                {/* 좌측: 클릭하면 접기/펼치기 — 우측 액션 버튼과 분리. */}
                <button
                  type="button"
                  onClick={() => toggleCollapsed(top.code)}
                  className="flex items-center gap-2 min-w-0 flex-1 text-left hover:opacity-80 -m-1 p-1 rounded"
                  aria-expanded={!isCollapsed}
                  data-testid={`button-collapse-${top.code}`}
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 shrink-0 text-muted-foreground" />
                  )}
                  <CardTitle className="text-base truncate">{top.label}</CardTitle>
                  <Badge variant="outline" className="text-xs font-mono">
                    {top.code}
                  </Badge>
                  {!top.active && (
                    <Badge variant="secondary" className="text-xs">
                      비활성
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">정렬 {top.sortOrder}</span>
                  {isCollapsed && children.length > 0 && (
                    <span className="text-xs text-muted-foreground ml-1">
                      · 자식 {children.length}
                    </span>
                  )}
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(top)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <div className="flex items-center gap-1 ml-2">
                    <Switch
                      checked={top.active}
                      onCheckedChange={() => toggleActive(top)}
                      aria-label="활성 토글"
                    />
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => remove(top)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              {!isCollapsed && (
              <CardContent className="pt-0">
                {children.length === 0 ? (
                  <p className="text-xs text-muted-foreground mb-2">자식 없음</p>
                ) : (
                  <ul className="space-y-1 mb-3">
                    {children.map((c) => (
                      <li
                        key={c.id}
                        className={`flex items-center justify-between gap-2 py-1.5 px-2 rounded hover:bg-muted/50 ${
                          c.active ? "" : "opacity-60"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate">{c.label}</span>
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {c.code}
                          </Badge>
                          {!c.active && (
                            <Badge variant="secondary" className="text-[10px]">
                              비활성
                            </Badge>
                          )}
                          <span className="text-[10px] text-muted-foreground">
                            정렬 {c.sortOrder}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Switch
                            checked={c.active}
                            onCheckedChange={() => toggleActive(c)}
                            aria-label="활성 토글"
                          />
                          <Button size="sm" variant="ghost" onClick={() => remove(c)}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openCreate(top.code)}
                  disabled={!top.active}
                  title={top.active ? "" : "대분류가 비활성이라 자식 추가는 권장되지 않습니다"}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> '{top.label}' 자식 추가
                </Button>
              </CardContent>
              )}
            </Card>
            );
          })}
        </div>
      )}

      {/* [Bugfix] 분야 관리 화면에서 파트너 분야 변경 신청을 같은 흐름으로 검토할 수 있도록
          본사 관리자 검토 큐를 하단에 함께 노출. 기존엔 /users 페이지 맨 아래에만 묻혀 있어
          발견이 어려웠음. 권한 SoT 는 vendors.ts ADMIN_VENDOR_CHANGE_ROLES = ["platform_admin"]. */}
      {user?.role === "platform_admin" && token && (
        <VendorChangeRequestsAdminSection token={token} apiBase={API_BASE} />
      )}

      <ResponsiveDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <ResponsiveDialogContent className="max-w-md">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>
              {draft.id ? "분야 수정" : draft.parentCode ? "자식 분야 추가" : "대분류 추가"}
            </ResponsiveDialogTitle>
          </ResponsiveDialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">코드 (영문, 추가 후 변경 불가)</Label>
              <Input
                value={draft.code}
                disabled={draft.id != null}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, code: e.target.value.replace(/[^a-z0-9_]/gi, "_").toLowerCase() }))
                }
                placeholder="예: cl_window"
              />
            </div>
            <div>
              <Label className="text-xs">라벨 (사장님 화면 표시)</Label>
              <Input
                value={draft.label}
                onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                placeholder="예: 유리창 청소"
              />
            </div>
            <div>
              <Label className="text-xs">상위 분류</Label>
              <Select
                value={draft.parentCode ?? PARENT_NONE}
                onValueChange={(v) =>
                  setDraft((d) => ({
                    ...d,
                    parentCode: v === PARENT_NONE ? null : v,
                    // 부모 변경 시 정렬값을 적당히 재계산.
                    sortOrder:
                      d.id == null
                        ? nextSortOrderUnder(v === PARENT_NONE ? null : v)
                        : d.sortOrder,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PARENT_NONE}>(없음 — 대분류로)</SelectItem>
                  {topLevels
                    .filter((t) => t.id !== draft.id) // 자기 자신은 제외
                    .map((t) => (
                      <SelectItem key={t.code} value={t.code}>
                        {t.label} ({t.code})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">정렬 순서 (작을수록 위)</Label>
              <Input
                type="number"
                value={draft.sortOrder}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, sortOrder: Number(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-xs">활성 (가입 옵션 노출)</Label>
              <Switch
                checked={draft.active}
                onCheckedChange={(v) => setDraft((d) => ({ ...d, active: v }))}
              />
            </div>
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              취소
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "저장 중..." : "저장"}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </div>
  );
}
