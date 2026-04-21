import { useMemo, useState } from "react";
import { Megaphone, Plus, Pencil, Trash2, Save, X, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  useListPlatformAnnouncements,
  useCreatePlatformAnnouncement,
  useUpdatePlatformAnnouncement,
  useDeletePlatformAnnouncement,
  getListPlatformAnnouncementsQueryKey,
  type PlatformAnnouncement,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

type Audience =
  | "all"
  | "manager"
  | "accountant"
  | "facility_staff"
  | "partner"
  | "hq_executive";

const AUDIENCE_LABEL: Record<Audience, string> = {
  all: "전체",
  manager: "관리소장",
  accountant: "경리·행정",
  facility_staff: "시설기사",
  partner: "파트너사",
  hq_executive: "본사 임원",
};

const AUDIENCE_ORDER: Audience[] = [
  "all",
  "manager",
  "accountant",
  "facility_staff",
  "partner",
  "hq_executive",
];

interface DraftState {
  id: number | null;
  title: string;
  body: string;
  audience: Audience[];
  startsAt: string; // yyyy-MM-ddTHH:mm
  endsAt: string;
  isActive: boolean;
}

function nowLocal(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function toIsoOrNull(local: string): string | null {
  if (!local) return null;
  return new Date(local).toISOString();
}

function fromIso(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function emptyDraft(): DraftState {
  return {
    id: null,
    title: "",
    body: "",
    audience: ["all"],
    startsAt: nowLocal(),
    endsAt: "",
    isActive: true,
  };
}

function statusFor(a: PlatformAnnouncement): { label: string; tone: "active" | "scheduled" | "expired" | "inactive" } {
  if (!a.isActive) return { label: "비활성", tone: "inactive" };
  const now = Date.now();
  const start = new Date(a.startsAt).getTime();
  const end = a.endsAt ? new Date(a.endsAt).getTime() : null;
  if (start > now) return { label: "예약", tone: "scheduled" };
  if (end !== null && end < now) return { label: "종료", tone: "expired" };
  return { label: "게시중", tone: "active" };
}

export default function PlatformAnnouncementsPage() {
  const queryClient = useQueryClient();
  const { data: announcements = [], isLoading } = useListPlatformAnnouncements();
  const create = useCreatePlatformAnnouncement();
  const update = useUpdatePlatformAnnouncement();
  const remove = useDeletePlatformAnnouncement();

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");

  const sorted = useMemo(
    () =>
      [...announcements].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [announcements],
  );

  function startNew() {
    setError("");
    setInfo("");
    setDraft(emptyDraft());
  }

  function startEdit(a: PlatformAnnouncement) {
    setError("");
    setInfo("");
    setDraft({
      id: a.id,
      title: a.title,
      body: a.body,
      audience: (a.audience as Audience[]) ?? ["all"],
      startsAt: fromIso(a.startsAt) || nowLocal(),
      endsAt: fromIso(a.endsAt),
      isActive: a.isActive,
    });
  }

  function toggleAudience(role: Audience, checked: boolean) {
    if (!draft) return;
    if (role === "all") {
      setDraft({ ...draft, audience: checked ? ["all"] : [] });
      return;
    }
    let next = draft.audience.filter((r) => r !== "all");
    if (checked) next = Array.from(new Set([...next, role]));
    else next = next.filter((r) => r !== role);
    if (next.length === 0) next = ["all"];
    setDraft({ ...draft, audience: next });
  }

  function refresh() {
    queryClient.invalidateQueries({ queryKey: getListPlatformAnnouncementsQueryKey() });
  }

  async function save() {
    if (!draft) return;
    if (!draft.title.trim() || !draft.body.trim()) {
      setError("제목과 본문을 입력해 주세요");
      return;
    }
    setError("");
    setInfo("");
    const startsAtIso = toIsoOrNull(draft.startsAt) ?? new Date().toISOString();
    const endsAtIso = toIsoOrNull(draft.endsAt);
    try {
      if (draft.id === null) {
        await create.mutateAsync({
          data: {
            title: draft.title.trim(),
            body: draft.body.trim(),
            audience: draft.audience,
            startsAt: startsAtIso,
            endsAt: endsAtIso,
            isActive: draft.isActive,
          },
        });
        setInfo("공지가 등록되었습니다");
      } else {
        await update.mutateAsync({
          id: draft.id,
          data: {
            title: draft.title.trim(),
            body: draft.body.trim(),
            audience: draft.audience,
            startsAt: startsAtIso,
            endsAt: endsAtIso,
            isActive: draft.isActive,
          },
        });
        setInfo("공지가 수정되었습니다");
      }
      setDraft(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다");
    }
  }

  async function onDelete(a: PlatformAnnouncement) {
    if (!confirm(`"${a.title}" 공지를 삭제하시겠습니까?`)) return;
    try {
      await remove.mutateAsync({ id: a.id });
      refresh();
      setInfo("공지가 삭제되었습니다");
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제 중 오류가 발생했습니다");
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-slate-700" />
            <h1 className="text-xl font-semibold text-slate-900">플랫폼 공지 관리</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            서비스 업데이트·이벤트·점검 안내를 작성하면 대상 사용자의 알림 벨에 노출됩니다.
          </p>
        </div>
        <Button onClick={startNew} disabled={!!draft}>
          <Plus className="w-4 h-4 mr-1" />
          새 공지
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>
      )}
      {info && (
        <div className="p-3 rounded-lg bg-green-50 text-green-700 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {info}
        </div>
      )}

      {draft && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {draft.id === null ? "새 공지 작성" : `공지 수정 #${draft.id}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-xs">제목</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="공지 제목"
                maxLength={200}
              />
            </div>
            <div>
              <Label className="text-xs">본문</Label>
              <Textarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                placeholder="공지 본문 (여러 줄 입력 가능)"
                rows={8}
              />
            </div>
            <div>
              <Label className="text-xs">대상</Label>
              <div className="flex flex-wrap gap-3 mt-1.5">
                {AUDIENCE_ORDER.map((role) => (
                  <label key={role} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={draft.audience.includes(role)}
                      onCheckedChange={(c) => toggleAudience(role, c === true)}
                    />
                    {AUDIENCE_LABEL[role]}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                "전체"를 선택하면 모든 역할에 표시됩니다. 다른 역할을 선택하면 "전체"는 자동 해제됩니다.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">게시 시작</Label>
                <Input
                  type="datetime-local"
                  value={draft.startsAt}
                  onChange={(e) => setDraft({ ...draft, startsAt: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">게시 종료 (선택)</Label>
                <Input
                  type="datetime-local"
                  value={draft.endsAt}
                  onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.isActive}
                onCheckedChange={(c) => setDraft({ ...draft, isActive: c === true })}
              />
              활성 (체크 해제 시 게시되지 않습니다)
            </label>
            <div className="flex gap-2 pt-2 border-t">
              <Button onClick={save} disabled={create.isPending || update.isPending}>
                <Save className="w-4 h-4 mr-1" />
                저장
              </Button>
              <Button variant="outline" onClick={() => setDraft(null)}>
                <X className="w-4 h-4 mr-1" />
                취소
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">공지 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-slate-500 py-6 text-center">불러오는 중...</div>
          ) : sorted.length === 0 ? (
            <div className="text-sm text-slate-500 py-6 text-center">등록된 공지가 없습니다</div>
          ) : (
            <div className="divide-y">
              {sorted.map((a) => {
                const st = statusFor(a);
                const audience = (a.audience as Audience[]) ?? [];
                return (
                  <div key={a.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{a.title}</span>
                        <Badge
                          variant={
                            st.tone === "active"
                              ? "default"
                              : st.tone === "scheduled"
                                ? "secondary"
                                : st.tone === "expired"
                                  ? "outline"
                                  : "outline"
                          }
                          className={
                            st.tone === "active"
                              ? "bg-green-600"
                              : st.tone === "expired"
                                ? "text-slate-500"
                                : st.tone === "inactive"
                                  ? "text-slate-500"
                                  : ""
                          }
                        >
                          {st.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 whitespace-pre-line">
                        {a.body}
                      </p>
                      <div className="flex flex-wrap items-center gap-1 mt-1.5">
                        {audience.map((r) => (
                          <Badge key={r} variant="outline" className="text-[10px]">
                            {AUDIENCE_LABEL[r] ?? r}
                          </Badge>
                        ))}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        게시: {new Date(a.startsAt).toLocaleString("ko-KR")}
                        {" · "}
                        종료: {a.endsAt ? new Date(a.endsAt).toLocaleString("ko-KR") : "기한 없음"}
                        {a.createdByName ? ` · 작성자: ${a.createdByName}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(a)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete(a)}
                        disabled={remove.isPending}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
