import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth-context";
import { Plus, Pencil, Trash2, History, AlertCircle } from "lucide-react";

interface TaskTemplate {
  id: number;
  title: string;
  description: string | null;
  category: "mandatory" | "suggested";
  classification: "legal" | "internal";
  iconName: string | null;
  color: string | null;
  frequencyType: "one_time" | "daily" | "weekly" | "monthly" | "quarterly" | "semiannual" | "annual";
  intervalValue: number | null;
  fixedMonth: number | null;
  fixedDay: number | null;
  startDate: string | null;
  scopeType: "all" | "building_ids" | "user_ids";
  scopeValues: string[];
  priority: number;
  advanceAlertDays: number;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdBy: number | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AuditLog {
  id: number;
  templateId: number | null;
  templateTitle: string | null;
  action: "create" | "update" | "delete" | "toggle";
  changes: Record<string, unknown>;
  changedBy: number | null;
  changedByName: string | null;
  createdAt: string;
}

const CATEGORY_LABEL: Record<TaskTemplate["category"], string> = {
  mandatory: "법정업무",
  suggested: "제안업무",
};
const CLASSIFICATION_LABEL: Record<TaskTemplate["classification"], string> = {
  legal: "법정",
  internal: "내부",
};
const FREQUENCY_LABEL: Record<TaskTemplate["frequencyType"], string> = {
  one_time: "1회성",
  daily: "매일",
  weekly: "매주",
  monthly: "매월",
  quarterly: "분기",
  semiannual: "반기",
  annual: "연간",
};
const SCOPE_LABEL: Record<TaskTemplate["scopeType"], string> = {
  all: "전체 건물",
  building_ids: "특정 건물(ID 목록)",
  user_ids: "특정 사용자(ID 목록)",
};
const ACTION_LABEL: Record<AuditLog["action"], string> = {
  create: "생성",
  update: "수정",
  delete: "삭제",
  toggle: "활성 토글",
};

// [Task #287] 변경 이력의 raw JSON에 노출되는 카테고리/분류 코드 값을
//   사용자 친화적인 한글 라벨로 치환해 표시한다(원본 데이터는 보존).
function humanizeAuditChanges(changes: Record<string, unknown>): Record<string, unknown> {
  const replaceCodes = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(replaceCodes);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (k === "category" && (v === "mandatory" || v === "suggested")) {
          out[k] = CATEGORY_LABEL[v as TaskTemplate["category"]];
        } else if (k === "classification" && (v === "legal" || v === "internal")) {
          out[k] = CLASSIFICATION_LABEL[v as TaskTemplate["classification"]];
        } else {
          out[k] = replaceCodes(v);
        }
      }
      return out;
    }
    return value;
  };
  return replaceCodes(changes) as Record<string, unknown>;
}

const BASE = import.meta.env.BASE_URL ?? "/";
const API_BASE = `${BASE}api`.replace(/\/+/g, "/");

// [Task #283] 역할별 노출 옵션 (UI). 빈 배열 = 전체 공통.
const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "manager", label: "관리자" },
  { value: "accountant", label: "경리/회계" },
  { value: "facility_staff", label: "시설직원" },
  { value: "partner", label: "파트너사" },
  { value: "hq_executive", label: "본사총괄" },
];

type DraftType = Omit<TaskTemplate, "id" | "createdAt" | "updatedAt" | "createdBy" | "createdByName"> & {
  targetRoles: string[];
};

function emptyDraft(defaultRole?: string): DraftType {
  return {
    title: "",
    description: "",
    category: "mandatory",
    classification: "internal",
    iconName: null,
    color: null,
    frequencyType: "annual",
    intervalValue: null,
    fixedMonth: null,
    fixedDay: null,
    startDate: null,
    scopeType: "all",
    scopeValues: [],
    priority: 50,
    advanceAlertDays: 7,
    isActive: true,
    metadata: {},
    targetRoles: defaultRole ? [defaultRole] : [],
  };
}

export default function TaskTemplatesPage() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "platform_admin";

  const [search, setSearch] = useState("");
  // [Task #287] 법정업무/제안업무를 두 섹션 탭으로 분리. "전체 보기" 옵션도 함께 제공.
  const [filterCategory, setFilterCategory] = useState<"all" | "mandatory" | "suggested">("mandatory");
  const [editing, setEditing] = useState<TaskTemplate | null>(null);
  const [draft, setDraft] = useState<ReturnType<typeof emptyDraft> | null>(null);
  const [showAuditFor, setShowAuditFor] = useState<TaskTemplate | null>(null);

  const headers = useMemo(
    () => ({
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }),
    [token],
  );

  // [Task #283] ?role= 컨텍스트가 있으면 서버 측에서 targetRoles 기준으로 필터된
  //   템플릿만 반환받는다.
  const _roleFromUrl = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("role") ?? ""
    : "";
  const { data: templates = [], isLoading } = useQuery<TaskTemplate[]>({
    queryKey: ["task-templates", _roleFromUrl],
    queryFn: async () => {
      const url = _roleFromUrl
        ? `${API_BASE}/platform/task-templates?role=${encodeURIComponent(_roleFromUrl)}`
        : `${API_BASE}/platform/task-templates`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("템플릿 목록을 불러올 수 없습니다");
      return res.json();
    },
    enabled: isAdmin,
  });

  const { data: auditLogs = [] } = useQuery<AuditLog[]>({
    queryKey: ["task-template-audit", showAuditFor?.id ?? "all"],
    queryFn: async () => {
      const url = showAuditFor
        ? `${API_BASE}/platform/task-templates/${showAuditFor.id}/audit-logs`
        : `${API_BASE}/platform/task-templates/audit-logs`;
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error("이력을 불러올 수 없습니다");
      return res.json();
    },
    enabled: isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: async (body: ReturnType<typeof emptyDraft>) => {
      const res = await fetch(`${API_BASE}/platform/task-templates`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "생성 실패");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-templates"] });
      queryClient.invalidateQueries({ queryKey: ["task-template-audit"] });
      toast({ title: "템플릿이 생성되었습니다" });
      setDraft(null);
      setEditing(null);
    },
    onError: (e: Error) => toast({ title: "생성 실패", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }: { id: number; body: Partial<TaskTemplate> }) => {
      const res = await fetch(`${API_BASE}/platform/task-templates/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "수정 실패");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-templates"] });
      queryClient.invalidateQueries({ queryKey: ["task-template-audit"] });
      toast({ title: "템플릿이 수정되었습니다" });
      setDraft(null);
      setEditing(null);
    },
    onError: (e: Error) => toast({ title: "수정 실패", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`${API_BASE}/platform/task-templates/${id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "삭제 실패");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-templates"] });
      queryClient.invalidateQueries({ queryKey: ["task-template-audit"] });
      toast({ title: "템플릿이 삭제되었습니다" });
    },
    onError: (e: Error) => toast({ title: "삭제 실패", description: e.message, variant: "destructive" }),
  });

  function startCreate() {
    setEditing(null);
    const base = emptyDraft(_roleFromUrl || undefined);
    // [Task #287] 현재 활성화된 섹션(법정/제안)이 기본 카테고리로 채워지도록.
    //   "전체 보기" 상태에서 진입하면 법정업무를 기본값으로 둔다.
    base.category = filterCategory === "suggested" ? "suggested" : "mandatory";
    setDraft(base);
  }

  function startEdit(t: TaskTemplate) {
    setEditing(t);
    setDraft({
      title: t.title,
      description: t.description ?? "",
      category: t.category,
      classification: t.classification,
      iconName: t.iconName,
      color: t.color,
      frequencyType: t.frequencyType,
      intervalValue: t.intervalValue,
      fixedMonth: t.fixedMonth,
      fixedDay: t.fixedDay,
      startDate: t.startDate,
      scopeType: t.scopeType,
      scopeValues: t.scopeValues,
      priority: t.priority,
      advanceAlertDays: t.advanceAlertDays,
      isActive: t.isActive,
      metadata: t.metadata,
      targetRoles: ((t as unknown as { targetRoles?: string[] | null }).targetRoles) ?? [],
    });
  }

  function handleSave() {
    if (!draft) return;
    if (!draft.title.trim()) {
      toast({ title: "제목을 입력해주세요", variant: "destructive" });
      return;
    }
    const body = { ...draft, description: draft.description || null };
    if (editing) {
      updateMutation.mutate({ id: editing.id, body });
    } else {
      createMutation.mutate(body);
    }
  }

  function handleToggleActive(t: TaskTemplate) {
    updateMutation.mutate({ id: t.id, body: { isActive: !t.isActive } });
  }

  function handleDelete(t: TaskTemplate) {
    if (!confirm(`"${t.title}" 템플릿을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return;
    deleteMutation.mutate(t.id);
  }

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (filterCategory !== "all" && t.category !== filterCategory) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [templates, search, filterCategory]);

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-amber-500" />
          이 화면은 플랫폼 관리자 전용입니다.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">업무 템플릿 관리</h1>
            {(() => {
              // [Task #283] 사이드바에서 ?role= 으로 진입한 컨텍스트를 헤더에 표시.
              if (typeof window === "undefined") return null;
              const r = new URLSearchParams(window.location.search).get("role") ?? "";
              const map: Record<string, string> = {
                manager: "관리소장",
                accountant: "경리·행정",
                facility_staff: "시설기사",
                hq_executive: "본사총괄",
              };
              const label = map[r];
              if (!label) return null;
              return (
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                  {label} 컨텍스트
                </span>
              );
            })()}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            관리소장 대시보드의 법정업무·제안업무 항목을 본사가 일괄 관리합니다.
          </p>
          {(() => {
            // [Task #283] 업무 템플릿은 '전역 공통 리소스'로 명세 확정.
            //   사이드바 ?role= 컨텍스트에서 들어오더라도 등록·수정한 템플릿은
            //   해당 역할이 아니라 시스템 전체에 동일하게 반영된다.
            if (typeof window === "undefined") return null;
            const r = new URLSearchParams(window.location.search).get("role") ?? "";
            const map: Record<string, string> = {
              manager: "관리소장",
              accountant: "경리·행정",
              facility_staff: "시설기사",
              hq_executive: "본사총괄",
            };
            const label = map[r];
            if (!label) return null;
            return (
              <div className="mt-2 p-2 rounded-md bg-amber-50 border border-amber-200 text-[12px] text-amber-800">
                업무 템플릿은 모든 역할이 공유하는 <b>전역 공통 리소스</b>입니다.
                <b> {label}</b> 메뉴로 진입했지만, 등록·수정한 템플릿은 시스템 전체에 동일하게 적용됩니다.
              </div>
            );
          })()}
        </div>
        <Button onClick={startCreate} data-testid="btn-create-template">
          <Plus className="w-4 h-4 mr-1" />새 템플릿
        </Button>
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">템플릿 목록</TabsTrigger>
          <TabsTrigger value="audit">변경 이력</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-3 mt-4">
          {/* [Task #287] 법정업무/제안업무 두 섹션 + 전체 보기 탭. 검색·정렬 상태는 공유. */}
          <Tabs
            value={filterCategory}
            onValueChange={(v) => setFilterCategory(v as typeof filterCategory)}
          >
            <TabsList>
              <TabsTrigger value="mandatory" data-testid="tab-category-mandatory">
                {CATEGORY_LABEL.mandatory}
              </TabsTrigger>
              <TabsTrigger value="suggested" data-testid="tab-category-suggested">
                {CATEGORY_LABEL.suggested}
              </TabsTrigger>
              <TabsTrigger value="all" data-testid="tab-category-all">전체 보기</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex gap-2">
            <Input
              placeholder="제목으로 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">불러오는 중...</p>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                등록된 템플릿이 없습니다.
              </CardContent>
            </Card>
          ) : (
            (() => {
              // [Task #287] 단일 카테고리 탭에서는 평면 목록, "전체 보기"에서는
              //   법정업무/제안업무 두 그룹 헤더로 분리해 표시한다.
              const renderRow = (t: TaskTemplate) => (
                <Card key={t.id} data-testid={`template-row-${t.id}`}>
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                          variant={t.category === "mandatory" ? "default" : "secondary"}
                          data-testid={`badge-category-${t.id}`}
                        >
                          {CATEGORY_LABEL[t.category]}
                        </Badge>
                        <Badge variant="outline" title="법정 의무 여부에 따른 분류">
                          분류: {CLASSIFICATION_LABEL[t.classification]}
                        </Badge>
                        <Badge variant="outline">{FREQUENCY_LABEL[t.frequencyType]}</Badge>
                        <Badge variant="outline">{SCOPE_LABEL[t.scopeType]}</Badge>
                        <span className="text-xs text-muted-foreground">우선순위 {t.priority}</span>
                        <span className="text-xs text-muted-foreground">사전알림 D-{t.advanceAlertDays}</span>
                        {!t.isActive && <Badge variant="destructive">비활성</Badge>}
                      </div>
                      <h3 className="text-sm font-semibold mt-1">{t.title}</h3>
                      {t.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch
                        checked={t.isActive}
                        onCheckedChange={() => handleToggleActive(t)}
                        aria-label="활성화"
                      />
                      <Button size="sm" variant="ghost" onClick={() => setShowAuditFor(t)}>
                        <History className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => startEdit(t)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(t)}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );

              if (filterCategory !== "all") {
                return <div className="space-y-2">{filtered.map(renderRow)}</div>;
              }

              const groups: { key: TaskTemplate["category"]; items: TaskTemplate[] }[] = [
                { key: "mandatory", items: filtered.filter((t) => t.category === "mandatory") },
                { key: "suggested", items: filtered.filter((t) => t.category === "suggested") },
              ];
              return (
                <div className="space-y-6">
                  {groups.map((g) => (
                    <section key={g.key} data-testid={`group-${g.key}`}>
                      <h2 className="text-sm font-semibold mb-2 flex items-center gap-2">
                        <Badge variant={g.key === "mandatory" ? "default" : "secondary"}>
                          {CATEGORY_LABEL[g.key]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {g.items.length}건
                        </span>
                      </h2>
                      {g.items.length === 0 ? (
                        <p className="text-xs text-muted-foreground pl-1">
                          해당 카테고리의 템플릿이 없습니다.
                        </p>
                      ) : (
                        <div className="space-y-2">{g.items.map(renderRow)}</div>
                      )}
                    </section>
                  ))}
                </div>
              );
            })()
          )}
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">최근 변경 이력 (최대 200건)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {auditLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground">기록된 변경 이력이 없습니다.</p>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="border rounded p-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{ACTION_LABEL[log.action]}</Badge>
                      <span className="font-medium">{log.templateTitle ?? `#${log.templateId}`}</span>
                      <span className="text-muted-foreground">
                        {new Date(log.createdAt).toLocaleString("ko-KR")}
                      </span>
                      <span className="text-muted-foreground">· {log.changedByName ?? "시스템"}</span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "템플릿 수정" : "새 업무 템플릿"}</DialogTitle>
            <DialogDescription>
              관리소장·본부관리자 대시보드에 표시될 업무 항목을 정의합니다.
            </DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div>
                <Label>제목</Label>
                <Input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  data-testid="input-template-title"
                />
              </div>
              <div>
                <Label>설명</Label>
                <Textarea
                  value={draft.description ?? ""}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  rows={2}
                />
              </div>
              {/* [Task #287] 카테고리(법정업무/제안업무)와 분류(법정/내부)는 별개 개념.
                  라벨 문구로 의미를 명확히 구분한다. */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>카테고리 (법정업무 / 제안업무)</Label>
                  <Select
                    value={draft.category}
                    onValueChange={(v) => setDraft({ ...draft, category: v as TaskTemplate["category"] })}
                  >
                    <SelectTrigger data-testid="select-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mandatory">{CATEGORY_LABEL.mandatory}</SelectItem>
                      <SelectItem value="suggested">{CATEGORY_LABEL.suggested}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>분류 (법정 / 내부)</Label>
                  <Select
                    value={draft.classification}
                    onValueChange={(v) => setDraft({ ...draft, classification: v as TaskTemplate["classification"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="legal">{CLASSIFICATION_LABEL.legal}</SelectItem>
                      <SelectItem value="internal">{CLASSIFICATION_LABEL.internal}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>주기</Label>
                  <Select
                    value={draft.frequencyType}
                    onValueChange={(v) => setDraft({ ...draft, frequencyType: v as TaskTemplate["frequencyType"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(FREQUENCY_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>주기 간격(반복 횟수, 선택)</Label>
                  <Input
                    type="number"
                    min={1}
                    placeholder="예: 매2주 → 2"
                    value={draft.intervalValue ?? ""}
                    onChange={(e) => setDraft({ ...draft, intervalValue: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>지정 월(선택)</Label>
                  <Input
                    type="number" min={1} max={12}
                    value={draft.fixedMonth ?? ""}
                    onChange={(e) => setDraft({ ...draft, fixedMonth: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
                <div>
                  <Label>지정 일(선택)</Label>
                  <Input
                    type="number" min={1} max={31}
                    value={draft.fixedDay ?? ""}
                    onChange={(e) => setDraft({ ...draft, fixedDay: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>
                <div>
                  <Label>시작일(선택)</Label>
                  <Input
                    type="date"
                    value={draft.startDate ?? ""}
                    onChange={(e) => setDraft({ ...draft, startDate: e.target.value || null })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>적용 범위</Label>
                  <Select
                    value={draft.scopeType}
                    onValueChange={(v) => setDraft({ ...draft, scopeType: v as TaskTemplate["scopeType"] })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(SCOPE_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>적용 대상(쉼표 구분, 선택)</Label>
                  <Input
                    placeholder="예: residential,office"
                    value={draft.scopeValues.join(",")}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        scopeValues: e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                    disabled={draft.scopeType === "all"}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>우선순위 (0-100)</Label>
                  <Input
                    type="number" min={0} max={100}
                    value={draft.priority}
                    onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>사전 알림 (D-)</Label>
                  <Input
                    type="number" min={0} max={365}
                    value={draft.advanceAlertDays}
                    onChange={(e) => setDraft({ ...draft, advanceAlertDays: Number(e.target.value) })}
                  />
                </div>
                <div className="flex items-end gap-2">
                  <Switch
                    checked={draft.isActive}
                    onCheckedChange={(c) => setDraft({ ...draft, isActive: c })}
                  />
                  <Label>활성</Label>
                </div>
              </div>

              {/* [Task #283] 노출 대상 역할 (미선택 = 전체 공통). ?role=… 진입 시 기본 선택. */}
              <div>
                <Label>노출 대상 역할 (선택 안 하면 전체 공통)</Label>
                <div className="flex flex-wrap gap-2 mt-1.5">
                  {ROLE_OPTIONS.map((opt) => {
                    const checked = draft.targetRoles.includes(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className={`text-xs px-2 py-1 rounded border cursor-pointer ${
                          checked ? "bg-primary text-primary-foreground border-primary" : "bg-white border-slate-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? draft.targetRoles.filter((r) => r !== opt.value)
                              : [...draft.targetRoles, opt.value];
                            setDraft({ ...draft, targetRoles: next });
                          }}
                        />
                        {opt.label}
                      </label>
                    );
                  })}
                </div>
              </div>
              {/* [Task #221] 대시보드 알림에 노출될 아이콘/색상 (선택). */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>아이콘 이름 (선택)</Label>
                  <Input
                    placeholder="예: shield, calendar, alert-triangle"
                    value={draft.iconName ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        iconName: e.target.value.trim() === "" ? null : e.target.value,
                      })
                    }
                    data-testid="input-template-icon"
                  />
                </div>
                <div>
                  <Label>색상 (선택)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="color"
                      className="h-9 w-14 p-1"
                      value={draft.color ?? "#3b82f6"}
                      onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                    />
                    <Input
                      placeholder="#3b82f6"
                      value={draft.color ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          color: e.target.value.trim() === "" ? null : e.target.value,
                        })
                      }
                      data-testid="input-template-color"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraft(null)}>취소</Button>
            <Button onClick={handleSave} data-testid="btn-save-template">저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!showAuditFor} onOpenChange={(o) => !o && setShowAuditFor(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>변경 이력: {showAuditFor?.title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {auditLogs.length === 0 ? (
              <p className="text-sm text-muted-foreground">기록이 없습니다.</p>
            ) : (
              auditLogs.map((log) => (
                <div key={log.id} className="border rounded p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{ACTION_LABEL[log.action]}</Badge>
                    <span className="text-muted-foreground">
                      {new Date(log.createdAt).toLocaleString("ko-KR")}
                    </span>
                    <span className="text-muted-foreground">· {log.changedByName ?? "시스템"}</span>
                  </div>
                  <pre className="text-[10px] mt-1 overflow-x-auto bg-muted/30 p-1 rounded">
                    {JSON.stringify(humanizeAuditChanges(log.changes), null, 2)}
                  </pre>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
