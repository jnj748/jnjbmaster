import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
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
import { Plus, Pencil, Trash2, AlertCircle } from "lucide-react";

type Frequency = "one_time" | "daily" | "weekly" | "monthly" | "quarterly" | "semiannual" | "annual";
type Category = "mandatory" | "suggested";
type TaskType = "facility" | "fee" | "accounting" | "security" | "cleaning" | "etc";
type BuildingUsage =
  | "공동주택"
  | "업무시설"
  | "근린생활시설"
  | "판매시설"
  | "교육연구시설"
  | "의료시설"
  | "숙박시설"
  | "문화및집회시설"
  | "복합건축물"
  | "기타";

interface TaskTemplate {
  id: number;
  title: string;
  description: string | null;
  category: Category;
  classification: "legal" | "internal";
  taskType: TaskType | null;
  iconName: string | null;
  color: string | null;
  frequencyType: Frequency;
  intervalValue: number | null;
  fixedMonth: number | null;
  fixedDay: number | null;
  startDate: string | null;
  weekdays: number[] | null;
  dayOfMonth: number | null;
  yearInterval: number | null;
  scopeType: "all" | "building_ids" | "user_ids";
  scopeValues: string[];
  buildingUsageScopes: BuildingUsage[];
  priority: number;
  advanceAlertDays: number;
  isActive: boolean;
  metadata: Record<string, unknown>;
  createdBy: number | null;
  createdByName: string | null;
  targetRoles?: string[] | null;
  createdAt: string;
  updatedAt: string;
}

const CATEGORY_LABEL: Record<Category, string> = {
  mandatory: "법정업무",
  suggested: "제안업무",
};

const TASK_TYPE_LABEL: Record<TaskType, string> = {
  facility: "시설",
  fee: "관리비",
  accounting: "회계",
  security: "경비",
  cleaning: "미화",
  etc: "기타",
};

const FREQUENCY_LABEL: Record<Frequency, string> = {
  one_time: "1회성",
  daily: "매일",
  weekly: "매주",
  monthly: "매월",
  quarterly: "분기",
  semiannual: "반기",
  annual: "연간",
};

const BUILDING_USAGES: BuildingUsage[] = [
  "공동주택",
  "업무시설",
  "근린생활시설",
  "판매시설",
  "교육연구시설",
  "의료시설",
  "숙박시설",
  "문화및집회시설",
  "복합건축물",
  "기타",
];

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

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

type DraftType = Omit<TaskTemplate, "id" | "createdAt" | "updatedAt" | "createdBy" | "createdByName" | "targetRoles"> & {
  targetRoles: string[];
};

function defaultAlertDaysFor(category: Category): number {
  return category === "mandatory" ? 30 : 7;
}

function emptyDraft(defaultRole?: string): DraftType {
  const category: Category = "mandatory";
  return {
    title: "",
    description: "",
    category,
    classification: "internal",
    taskType: "facility",
    iconName: null,
    color: null,
    frequencyType: "annual",
    intervalValue: null,
    fixedMonth: null,
    fixedDay: null,
    startDate: null,
    weekdays: null,
    dayOfMonth: null,
    yearInterval: 1,
    scopeType: "all",
    scopeValues: [],
    buildingUsageScopes: [],
    priority: 50,
    advanceAlertDays: defaultAlertDaysFor(category),
    isActive: true,
    metadata: {},
    targetRoles: defaultRole ? [defaultRole] : [],
  };
}

// [Task #297] 반복주기 텍스트를 사람이 읽기 좋은 형태로 표시.
//   예: "매주(월,수)", "매월 15일", "매년", "2년마다"
function formatFrequency(t: TaskTemplate): string {
  switch (t.frequencyType) {
    case "weekly": {
      const wds = t.weekdays && t.weekdays.length > 0 ? t.weekdays : null;
      if (!wds) return "매주";
      const labels = wds.map((d) => WEEKDAY_LABELS[d] ?? "?").join(",");
      return `매주(${labels})`;
    }
    case "monthly": {
      const day = t.dayOfMonth ?? t.fixedDay;
      return day ? `매월 ${day}일` : "매월";
    }
    case "annual": {
      const yr = t.yearInterval ?? 1;
      if (yr === 1) {
        if (t.fixedMonth && t.fixedDay) return `매년 ${t.fixedMonth}월 ${t.fixedDay}일`;
        return "매년";
      }
      return `${yr}년마다`;
    }
    default:
      return FREQUENCY_LABEL[t.frequencyType];
  }
}

export default function TaskTemplatesPage() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "platform_admin";

  const [search, setSearch] = useState("");
  // [Task #297] 탭 순서: 전체 보기 → 법정업무 → 제안업무. 기본값은 "전체 보기".
  const [filterCategory, setFilterCategory] = useState<"all" | Category>("all");
  const [editing, setEditing] = useState<TaskTemplate | null>(null);
  const [draft, setDraft] = useState<DraftType | null>(null);

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

  const createMutation = useMutation({
    mutationFn: async (body: DraftType) => {
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
      toast({ title: "템플릿이 삭제되었습니다" });
    },
    onError: (e: Error) => toast({ title: "삭제 실패", description: e.message, variant: "destructive" }),
  });

  function startCreate() {
    setEditing(null);
    const base = emptyDraft(_roleFromUrl || undefined);
    // 현재 활성화된 섹션(법정/제안)이 기본 카테고리로 채워지도록.
    if (filterCategory === "suggested") {
      base.category = "suggested";
      base.advanceAlertDays = defaultAlertDaysFor("suggested");
    }
    setDraft(base);
  }

  function startEdit(t: TaskTemplate) {
    setEditing(t);
    setDraft({
      title: t.title,
      description: t.description ?? "",
      category: t.category,
      classification: t.classification,
      taskType: t.taskType ?? "etc",
      iconName: t.iconName,
      color: t.color,
      frequencyType: t.frequencyType,
      intervalValue: t.intervalValue,
      fixedMonth: t.fixedMonth,
      fixedDay: t.fixedDay,
      startDate: t.startDate,
      weekdays: t.weekdays,
      dayOfMonth: t.dayOfMonth ?? t.fixedDay ?? null,
      yearInterval: t.yearInterval ?? (t.frequencyType === "annual" ? 1 : null),
      scopeType: t.scopeType,
      scopeValues: t.scopeValues,
      buildingUsageScopes: t.buildingUsageScopes ?? [],
      priority: t.priority,
      advanceAlertDays: t.advanceAlertDays,
      isActive: t.isActive,
      metadata: t.metadata,
      targetRoles: t.targetRoles ?? [],
    });
  }

  function handleSave() {
    if (!draft) return;
    if (!draft.title.trim()) {
      toast({ title: "제목을 입력해주세요", variant: "destructive" });
      return;
    }
    // [#297] 반복주기 보조 입력값 검증
    if (draft.frequencyType === "weekly" && (!draft.weekdays || draft.weekdays.length === 0)) {
      toast({ title: "반복할 요일을 1개 이상 선택해 주세요", variant: "destructive" });
      return;
    }
    if (draft.frequencyType === "monthly" && !draft.dayOfMonth) {
      toast({ title: "매월 며칠에 반복할지 입력해 주세요", variant: "destructive" });
      return;
    }
    if (draft.frequencyType === "annual" && (!draft.yearInterval || draft.yearInterval < 1)) {
      toast({ title: "몇 년마다 반복할지 입력해 주세요", variant: "destructive" });
      return;
    }
    const body: DraftType = { ...draft, description: draft.description || null };
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

  // [#297] 카테고리 변경 시 사전알림 디폴트를 자동 세팅. 사용자가 직접 바꾼 값이
  //   (이전 디폴트와 다르게) 들어 있을 때는 덮어쓰지 않는다.
  function handleCategoryChange(next: Category) {
    if (!draft) return;
    const prevDefault = defaultAlertDaysFor(draft.category);
    const userOverridden = draft.advanceAlertDays !== prevDefault;
    setDraft({
      ...draft,
      category: next,
      advanceAlertDays: userOverridden ? draft.advanceAlertDays : defaultAlertDaysFor(next),
    });
  }

  function handleFrequencyChange(next: Frequency) {
    if (!draft) return;
    setDraft({
      ...draft,
      frequencyType: next,
      // 반복주기를 바꾸면 보조 입력값을 안전한 디폴트로 리셋.
      weekdays: next === "weekly" ? draft.weekdays ?? [] : null,
      dayOfMonth: next === "monthly" ? draft.dayOfMonth ?? 1 : null,
      yearInterval: next === "annual" ? draft.yearInterval ?? 1 : null,
    });
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
              if (typeof window === "undefined") return null;
              const r = new URLSearchParams(window.location.search).get("role") ?? "";
              const map: Record<string, string> = {
                manager: "관리소장",
                accountant: "경리·회계",
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
        </div>
        <Button onClick={startCreate} data-testid="btn-create-template">
          <Plus className="w-4 h-4 mr-1" />새 템플릿
        </Button>
      </div>

      {/* [Task #297] 상단 탭: 전체 보기 → 법정업무 → 제안업무. 변경 이력 탭은 제거. */}
      <Tabs
        value={filterCategory}
        onValueChange={(v) => setFilterCategory(v as typeof filterCategory)}
      >
        <TabsList>
          <TabsTrigger value="all" data-testid="tab-category-all">전체 보기</TabsTrigger>
          <TabsTrigger value="mandatory" data-testid="tab-category-mandatory">
            {CATEGORY_LABEL.mandatory}
          </TabsTrigger>
          <TabsTrigger value="suggested" data-testid="tab-category-suggested">
            {CATEGORY_LABEL.suggested}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={filterCategory} className="space-y-3 mt-4">
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
                        {/* [#297] 분류(법정/내부) 배지 제거. 대신 업무유형 배지 노출. */}
                        <Badge variant="outline" data-testid={`badge-task-type-${t.id}`}>
                          {TASK_TYPE_LABEL[(t.taskType as TaskType) ?? "etc"]}
                        </Badge>
                        <Badge variant="outline" data-testid={`badge-frequency-${t.id}`}>
                          {formatFrequency(t)}
                        </Badge>
                        {t.buildingUsageScopes && t.buildingUsageScopes.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            적용 건물: {t.buildingUsageScopes.join(", ")}
                          </span>
                        )}
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

              const groups: { key: Category; items: TaskTemplate[] }[] = [
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

              {/* [#297] 카테고리 + 업무유형 (분류는 제거됨). */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>카테고리</Label>
                  <Select
                    value={draft.category}
                    onValueChange={(v) => handleCategoryChange(v as Category)}
                  >
                    <SelectTrigger data-testid="select-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mandatory">{CATEGORY_LABEL.mandatory}</SelectItem>
                      <SelectItem value="suggested">{CATEGORY_LABEL.suggested}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>업무유형</Label>
                  <Select
                    value={draft.taskType ?? "etc"}
                    onValueChange={(v) => setDraft({ ...draft, taskType: v as TaskType })}
                  >
                    <SelectTrigger data-testid="select-task-type"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(TASK_TYPE_LABEL) as TaskType[]).map((k) => (
                        <SelectItem key={k} value={k}>{TASK_TYPE_LABEL[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* [#297] 반복주기 + 동적 보조 입력. 지정월/지정일/시작일은 모두 제거. */}
              <div className="grid grid-cols-2 gap-3 items-start">
                <div>
                  <Label>반복주기</Label>
                  <Select
                    value={draft.frequencyType}
                    onValueChange={(v) => handleFrequencyChange(v as Frequency)}
                  >
                    <SelectTrigger data-testid="select-frequency"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((k) => (
                        <SelectItem key={k} value={k}>{FREQUENCY_LABEL[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {draft.frequencyType === "weekly" && (
                  <div>
                    <Label>요일 선택</Label>
                    <div className="flex flex-wrap gap-1.5 mt-1.5" data-testid="frequency-weekdays">
                      {WEEKDAY_LABELS.map((label, idx) => {
                        const checked = (draft.weekdays ?? []).includes(idx);
                        return (
                          <button
                            type="button"
                            key={idx}
                            onClick={() => {
                              const cur = draft.weekdays ?? [];
                              const next = checked
                                ? cur.filter((d) => d !== idx)
                                : [...cur, idx].sort((a, b) => a - b);
                              setDraft({ ...draft, weekdays: next });
                            }}
                            className={`text-xs px-2.5 py-1 rounded border ${
                              checked
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-white border-slate-300"
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {draft.frequencyType === "monthly" && (
                  <div>
                    <Label>며칠</Label>
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={draft.dayOfMonth ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          dayOfMonth: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      data-testid="input-day-of-month"
                      placeholder="1~31"
                    />
                  </div>
                )}

                {draft.frequencyType === "annual" && (
                  <div>
                    <Label>몇 년마다</Label>
                    <Input
                      type="number"
                      min={1}
                      max={50}
                      value={draft.yearInterval ?? ""}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          yearInterval: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      data-testid="input-year-interval"
                      placeholder="예: 1, 2, 3"
                    />
                  </div>
                )}
              </div>

              {/* [#297] 적용 건물(주용도 다중 선택). 빈 선택 = 전체 건물. */}
              <div>
                <Label>적용 건물</Label>
                <p className="text-[11px] text-muted-foreground mb-1.5">
                  표제부 주용도 기준. 선택하지 않으면 전체 건물에 적용됩니다.
                </p>
                <div className="flex flex-wrap gap-1.5" data-testid="building-usage-scopes">
                  {BUILDING_USAGES.map((u) => {
                    const checked = draft.buildingUsageScopes.includes(u);
                    return (
                      <button
                        type="button"
                        key={u}
                        onClick={() => {
                          const next = checked
                            ? draft.buildingUsageScopes.filter((x) => x !== u)
                            : [...draft.buildingUsageScopes, u];
                          setDraft({ ...draft, buildingUsageScopes: next });
                        }}
                        className={`text-xs px-2.5 py-1 rounded border ${
                          checked
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-white border-slate-300"
                        }`}
                      >
                        {u}
                      </button>
                    );
                  })}
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
                  <Label>
                    사전 알림 (D-)
                    <span className="text-[10px] text-muted-foreground ml-1">
                      (디폴트 {defaultAlertDaysFor(draft.category)}일)
                    </span>
                  </Label>
                  <Input
                    type="number" min={0} max={365}
                    value={draft.advanceAlertDays}
                    onChange={(e) => setDraft({ ...draft, advanceAlertDays: Number(e.target.value) })}
                    data-testid="input-advance-alert-days"
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

              {/* [Task #283] 노출 대상 역할 (미선택 = 전체 공통). */}
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
    </div>
  );
}
