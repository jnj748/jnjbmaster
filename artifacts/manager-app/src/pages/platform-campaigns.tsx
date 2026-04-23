import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import ReactMarkdown from "react-markdown";
import { Megaphone, Plus, Pencil, Trash2, Save, X, CheckCircle2, StopCircle, BarChart3, Bold, Italic, Link as LinkIcon, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  useListPlatformCampaigns,
  useCreatePlatformCampaign,
  useUpdatePlatformCampaign,
  useDeletePlatformCampaign,
  useStopPlatformCampaign,
  getListPlatformCampaignsQueryKey,
  type PlatformCampaign,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

type TargetRole = "manager" | "accountant" | "facility_staff" | "hq_executive" | "partner";
type CampaignType = "required" | "suggested" | "other";
type Channel = "modal" | "banner" | "bell" | "push";
type AudienceFilter = "all" | "active";
type Recurrence = "none" | "daily" | "weekly" | "monthly";

const ROLE_LABEL: Record<TargetRole, string> = {
  manager: "관리소장",
  accountant: "경리·행정",
  facility_staff: "시설기사",
  hq_executive: "본사총괄",
  partner: "파트너사",
};
const TYPE_LABEL: Record<CampaignType, string> = {
  required: "필수",
  suggested: "제안",
  other: "기타",
};
const CHANNEL_LABEL: Record<Channel, string> = {
  modal: "앱 진입 모달",
  banner: "대시보드 배너",
  bell: "알림벨 (이벤트/캠페인)",
  push: "푸시 (모바일 전환 시)",
};
const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: "반복 없음",
  daily: "매일",
  weekly: "매주 특정 요일",
  monthly: "매월 특정 일자",
};
const WEEKDAY_LABEL = ["일", "월", "화", "수", "목", "금", "토"];

interface DraftState {
  id: number | null;
  targetRole: TargetRole;
  type: CampaignType;
  audienceFilter: AudienceFilter;
  title: string;
  body: string;
  imageUrl: string;
  channels: Channel[];
  startsAt: string;
  endsAt: string;
  recurrence: Recurrence;
  recurrenceDays: number[];
  maxImpressionsPerUser: number;
  ctaLabel: string;
  ctaUrl: string;
  achievementText: string;
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

const VALID_TARGET_ROLES = new Set(["manager", "accountant", "facility_staff", "hq_executive", "partner"]);
function readRoleFromUrl(): TargetRole {
  if (typeof window === "undefined") return "manager";
  const r = new URLSearchParams(window.location.search).get("role") ?? "";
  return (VALID_TARGET_ROLES.has(r) ? r : "manager") as TargetRole;
}

function emptyDraft(role: TargetRole): DraftState {
  return {
    id: null,
    targetRole: role,
    type: "other",
    audienceFilter: "all",
    title: "",
    body: "",
    imageUrl: "",
    channels: ["modal"],
    startsAt: nowLocal(),
    endsAt: "",
    recurrence: "none",
    recurrenceDays: [],
    maxImpressionsPerUser: 3,
    ctaLabel: "",
    ctaUrl: "",
    achievementText: "",
    isActive: true,
  };
}

function statusFor(c: PlatformCampaign): { label: string; tone: "active" | "scheduled" | "expired" | "stopped" | "inactive" } {
  if (c.isStopped) return { label: "중지", tone: "stopped" };
  if (!c.isActive) return { label: "비활성", tone: "inactive" };
  const now = Date.now();
  const start = new Date(c.startsAt).getTime();
  const end = c.endsAt ? new Date(c.endsAt).getTime() : null;
  if (start > now) return { label: "예약", tone: "scheduled" };
  if (end !== null && end < now) return { label: "종료", tone: "expired" };
  return { label: "게시중", tone: "active" };
}

// [Task #283] 캠페인 본문 리치텍스트 에디터.
//   - 마크다운 syntax 를 textarea 에 직접 저장한다 (단순/안전/검색 가능).
//   - 툴바 버튼은 현재 선택 영역을 wrap 하거나 prefix 를 삽입한다.
function CampaignBodyEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  function wrapSelection(prefix: string, suffix: string = prefix, fallback = "텍스트") {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = value.slice(0, start);
    const sel = value.slice(start, end) || fallback;
    const after = value.slice(end);
    const next = `${before}${prefix}${sel}${suffix}${after}`;
    onChange(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(before.length + prefix.length, before.length + prefix.length + sel.length);
    });
  }

  function insertLink() {
    const ta = ref.current;
    if (!ta) return;
    const url = window.prompt("링크 URL을 입력하세요", "https://");
    if (!url) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = value.slice(start, end) || "링크";
    const next = `${value.slice(0, start)}[${sel}](${url})${value.slice(end)}`;
    onChange(next);
  }

  function prefixLines(prefix: string) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = value.slice(0, start);
    const sel = value.slice(start, end) || "항목";
    const after = value.slice(end);
    const next = `${before}${sel.split("\n").map((l) => `${prefix}${l}`).join("\n")}${after}`;
    onChange(next);
  }

  return (
    <div className="border rounded-md overflow-hidden">
      <div className="flex items-center gap-1 px-2 py-1 border-b bg-slate-50">
        <button type="button" className="p-1 rounded hover:bg-slate-200" title="굵게"
          onClick={() => wrapSelection("**")} data-testid="campaign-body-bold">
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button type="button" className="p-1 rounded hover:bg-slate-200" title="기울임"
          onClick={() => wrapSelection("*")} data-testid="campaign-body-italic">
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button type="button" className="p-1 rounded hover:bg-slate-200" title="링크"
          onClick={insertLink} data-testid="campaign-body-link">
          <LinkIcon className="w-3.5 h-3.5" />
        </button>
        <button type="button" className="p-1 rounded hover:bg-slate-200" title="목록"
          onClick={() => prefixLines("- ")} data-testid="campaign-body-list">
          <List className="w-3.5 h-3.5" />
        </button>
        <span className="ml-auto text-[10px] text-slate-500">**굵게** *기울임* [링크](url) - 목록</span>
      </div>
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="본문 (마크다운: **굵게**, *기울임*, [링크](url), - 목록)"
        rows={6}
        className="border-0 rounded-none focus-visible:ring-0"
        data-testid="campaign-body-input"
      />
      {value.trim() && (
        <div className="border-t px-3 py-2 bg-white">
          <div className="text-[10px] text-slate-400 mb-1">미리보기</div>
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown>{value}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PlatformCampaignsPage() {
  const [location] = useLocation();
  const [role, setRole] = useState<TargetRole>(() => readRoleFromUrl());
  useEffect(() => { setRole(readRoleFromUrl()); }, [location]);

  const queryClient = useQueryClient();
  const { data: campaigns = [], isLoading } = useListPlatformCampaigns({ role });
  const create = useCreatePlatformCampaign();
  const update = useUpdatePlatformCampaign();
  const remove = useDeletePlatformCampaign();
  const stop = useStopPlatformCampaign();

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");

  const sorted = useMemo(
    () => [...campaigns].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [campaigns],
  );

  function refresh() {
    queryClient.invalidateQueries({ queryKey: getListPlatformCampaignsQueryKey({ role }) });
  }

  function startNew() {
    setError(""); setInfo("");
    setDraft(emptyDraft(role));
  }
  function startEdit(c: PlatformCampaign) {
    setError(""); setInfo("");
    setDraft({
      id: c.id,
      targetRole: c.targetRole as TargetRole,
      type: c.type as CampaignType,
      audienceFilter: c.audienceFilter as AudienceFilter,
      title: c.title,
      body: c.body,
      imageUrl: c.imageUrl ?? "",
      channels: (c.channels as Channel[]) ?? ["modal"],
      startsAt: fromIso(c.startsAt) || nowLocal(),
      endsAt: fromIso(c.endsAt),
      recurrence: c.recurrence as Recurrence,
      recurrenceDays: (c.recurrenceDays as number[]) ?? [],
      maxImpressionsPerUser: c.maxImpressionsPerUser,
      ctaLabel: c.ctaLabel ?? "",
      ctaUrl: c.ctaUrl ?? "",
      achievementText: c.achievementText ?? "",
      isActive: c.isActive,
    });
  }

  function toggleChannel(ch: Channel, checked: boolean) {
    if (!draft) return;
    let next = draft.channels.filter((c) => c !== ch);
    if (checked) next = [...next, ch];
    if (next.length === 0) next = ["modal"];
    setDraft({ ...draft, channels: next });
  }
  function toggleRecurrenceDay(d: number, checked: boolean) {
    if (!draft) return;
    let next = draft.recurrenceDays.filter((x) => x !== d);
    if (checked) next = [...next, d].sort((a, b) => a - b);
    setDraft({ ...draft, recurrenceDays: next });
  }

  async function save() {
    if (!draft) return;
    if (!draft.title.trim() || !draft.body.trim()) {
      setError("제목과 본문을 입력해 주세요");
      return;
    }
    setError(""); setInfo("");
    const payload = {
      targetRole: draft.targetRole,
      type: draft.type,
      audienceFilter: draft.audienceFilter,
      title: draft.title.trim(),
      body: draft.body.trim(),
      imageUrl: draft.imageUrl.trim() || null,
      channels: draft.channels,
      startsAt: toIsoOrNull(draft.startsAt) ?? new Date().toISOString(),
      endsAt: toIsoOrNull(draft.endsAt),
      recurrence: draft.recurrence,
      recurrenceDays: draft.recurrence === "weekly" || draft.recurrence === "monthly" ? draft.recurrenceDays : null,
      maxImpressionsPerUser: draft.maxImpressionsPerUser,
      ctaLabel: draft.ctaLabel.trim() || null,
      ctaUrl: draft.ctaUrl.trim() || null,
      achievementText: draft.achievementText.trim() || null,
      isActive: draft.isActive,
    };
    try {
      if (draft.id === null) {
        await create.mutateAsync({ data: payload });
        setInfo("캠페인이 등록되었습니다");
      } else {
        await update.mutateAsync({ id: draft.id, data: payload });
        setInfo("캠페인이 수정되었습니다");
      }
      setDraft(null);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 중 오류가 발생했습니다");
    }
  }

  async function onStop(c: PlatformCampaign) {
    if (!confirm(`"${c.title}" 캠페인을 중지하시겠습니까?`)) return;
    await stop.mutateAsync({ id: c.id });
    refresh();
    setInfo("캠페인이 중지되었습니다");
  }
  async function onDelete(c: PlatformCampaign) {
    if (!confirm(`"${c.title}" 캠페인을 삭제하시겠습니까?`)) return;
    await remove.mutateAsync({ id: c.id });
    refresh();
    setInfo("캠페인이 삭제되었습니다");
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4" data-testid="campaign-admin-page">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-slate-700" />
            <h1 className="text-xl font-semibold text-slate-900">
              {ROLE_LABEL[role]} 캠페인 알림
            </h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {ROLE_LABEL[role]} 사용자 대상으로 이벤트·쿠폰·앱 사용 유도 캠페인을 발송합니다. 필수 업무 알림과는 별도 채널로 노출됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* 역할은 사이드바 진입 경로(?role=)에 의해 고정된다. 페이지 안에서 변경 불가. */}
          <Badge variant="outline" data-testid="campaign-role-badge">
            대상: {ROLE_LABEL[role]}
          </Badge>
          <Button onClick={startNew} disabled={!!draft} data-testid="campaign-new-btn">
            <Plus className="w-4 h-4 mr-1" />새 캠페인
          </Button>
        </div>
      </div>

      {error && <div className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
      {info && (
        <div className="p-3 rounded-lg bg-green-50 text-green-700 text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />{info}
        </div>
      )}

      {draft && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {draft.id === null ? "새 캠페인 작성" : `캠페인 수정 #${draft.id}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">대상 역할</Label>
                <div className="px-3 py-2 border border-slate-200 rounded-md text-sm bg-slate-50">
                  {ROLE_LABEL[draft.targetRole]}
                </div>
              </div>
              <div>
                <Label className="text-xs">유형</Label>
                <select
                  value={draft.type}
                  onChange={(e) => setDraft({ ...draft, type: e.target.value as CampaignType })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                  data-testid="campaign-type-select"
                >
                  {(Object.keys(TYPE_LABEL) as CampaignType[]).map((t) => (
                    <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">추가 타깃</Label>
                <select
                  value={draft.audienceFilter}
                  onChange={(e) => setDraft({ ...draft, audienceFilter: e.target.value as AudienceFilter })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                >
                  <option value="all">전체</option>
                  <option value="active">활성 사용자만</option>
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs">제목</Label>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="캠페인 제목"
                maxLength={200}
                data-testid="campaign-title-input"
              />
            </div>
            <div>
              <Label className="text-xs">본문 (마크다운 지원)</Label>
              {/* [Task #283] 마크다운 기반 리치텍스트 본문.
                  - 툴바 버튼은 선택 영역을 마크다운 표기로 감싼다 (B/I/링크/리스트).
                  - 저장은 plain text(markdown) 그대로 저장하고, 노출 측에서는 react-markdown
                    으로 렌더링한다 (모달/배너/벨 본문 모두 동일 규칙). */}
              <CampaignBodyEditor
                value={draft.body}
                onChange={(v) => setDraft({ ...draft, body: v })}
              />
            </div>
            <div>
              <Label className="text-xs">첨부 이미지 URL (선택)</Label>
              <Input
                value={draft.imageUrl}
                onChange={(e) => setDraft({ ...draft, imageUrl: e.target.value })}
                placeholder="https://…"
              />
            </div>

            <div>
              <Label className="text-xs">노출 채널 (복수 선택)</Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1.5">
                {(Object.keys(CHANNEL_LABEL) as Channel[]).map((ch) => (
                  <label key={ch} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={draft.channels.includes(ch)}
                      onCheckedChange={(c) => toggleChannel(ch, c === true)}
                    />
                    {CHANNEL_LABEL[ch]}
                    {ch === "push" && (
                      <Badge variant="outline" className="text-[10px]">대기 (모바일 전환 시 실제 발송)</Badge>
                    )}
                  </label>
                ))}
              </div>
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">반복 주기</Label>
                <select
                  value={draft.recurrence}
                  onChange={(e) => setDraft({ ...draft, recurrence: e.target.value as Recurrence })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm bg-white"
                >
                  {(Object.keys(RECURRENCE_LABEL) as Recurrence[]).map((r) => (
                    <option key={r} value={r}>{RECURRENCE_LABEL[r]}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label className="text-xs">사용자당 최대 노출 횟수</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={draft.maxImpressionsPerUser}
                  onChange={(e) => setDraft({ ...draft, maxImpressionsPerUser: Number(e.target.value) || 1 })}
                />
              </div>
            </div>

            {draft.recurrence === "weekly" && (
              <div>
                <Label className="text-xs">반복 요일</Label>
                <div className="flex flex-wrap gap-3 mt-1.5">
                  {WEEKDAY_LABEL.map((label, idx) => (
                    <label key={idx} className="flex items-center gap-1 text-sm">
                      <Checkbox
                        checked={draft.recurrenceDays.includes(idx)}
                        onCheckedChange={(c) => toggleRecurrenceDay(idx, c === true)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            )}
            {draft.recurrence === "monthly" && (
              <div>
                <Label className="text-xs">반복 일자 (1-31, 쉼표 구분)</Label>
                <Input
                  value={draft.recurrenceDays.join(",")}
                  onChange={(e) => {
                    const parts = e.target.value
                      .split(",")
                      .map((s) => Number(s.trim()))
                      .filter((n) => Number.isFinite(n) && n >= 1 && n <= 31);
                    setDraft({ ...draft, recurrenceDays: Array.from(new Set(parts)).sort((a, b) => a - b) });
                  }}
                  placeholder="예: 1, 15"
                />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">CTA 버튼 라벨 (선택)</Label>
                <Input
                  value={draft.ctaLabel}
                  onChange={(e) => setDraft({ ...draft, ctaLabel: e.target.value })}
                  placeholder="예: 자세히 보기"
                />
              </div>
              <div>
                <Label className="text-xs">CTA 이동 URL (앱 내 라우트 또는 외부)</Label>
                <Input
                  value={draft.ctaUrl}
                  onChange={(e) => setDraft({ ...draft, ctaUrl: e.target.value })}
                  placeholder="예: /work-log"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">달성 조건 안내 (선택, 표시용 텍스트)</Label>
              <Input
                value={draft.achievementText}
                onChange={(e) => setDraft({ ...draft, achievementText: e.target.value })}
                placeholder="예: 이번달 업무일보 5회 작성 시 스타벅스 쿠폰"
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.isActive}
                onCheckedChange={(c) => setDraft({ ...draft, isActive: c === true })}
              />
              활성 (체크 해제 시 발송되지 않음)
            </label>

            <div className="flex gap-2 pt-2 border-t">
              <Button onClick={save} disabled={create.isPending || update.isPending} data-testid="campaign-save-btn">
                <Save className="w-4 h-4 mr-1" />저장
              </Button>
              <Button variant="outline" onClick={() => setDraft(null)}>
                <X className="w-4 h-4 mr-1" />취소
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">캠페인 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-slate-500 py-6 text-center">불러오는 중...</div>
          ) : sorted.length === 0 ? (
            <div className="text-sm text-slate-500 py-6 text-center" data-testid="campaign-empty">
              등록된 캠페인이 없습니다
            </div>
          ) : (
            <div className="divide-y">
              {sorted.map((c) => {
                const st = statusFor(c);
                const channels = (c.channels as Channel[]) ?? [];
                return (
                  <div key={c.id} className="py-3 flex items-start justify-between gap-3" data-testid={`campaign-row-${c.id}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">{c.title}</span>
                        <Badge variant="outline" className="text-[10px]">{TYPE_LABEL[c.type as CampaignType]}</Badge>
                        <Badge
                          variant="outline"
                          className={
                            st.tone === "active"
                              ? "bg-green-100 text-green-700 border-green-200"
                              : st.tone === "stopped"
                                ? "bg-red-50 text-red-600 border-red-200"
                                : "text-slate-500"
                          }
                        >
                          {st.label}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 whitespace-pre-line">{c.body}</p>
                      <div className="flex flex-wrap items-center gap-1 mt-1.5">
                        {channels.map((ch) => (
                          <Badge key={ch} variant="outline" className="text-[10px]">{CHANNEL_LABEL[ch]}</Badge>
                        ))}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        게시: {new Date(c.startsAt).toLocaleString("ko-KR")}
                        {" · "}종료: {c.endsAt ? new Date(c.endsAt).toLocaleString("ko-KR") : "기한 없음"}
                        {" · "}반복: {RECURRENCE_LABEL[c.recurrence as Recurrence]}
                        {" · "}최대 {c.maxImpressionsPerUser}회
                      </div>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <BarChart3 className="w-3 h-3" />
                          노출 {c.stats?.impressions ?? 0}
                        </span>
                        <span>읽음 {c.stats?.reads ?? 0}</span>
                        <span>CTA 클릭 {c.stats?.ctaClicks ?? 0}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(c)} title="수정">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      {!c.isStopped && (
                        <Button variant="ghost" size="sm" onClick={() => onStop(c)} disabled={stop.isPending} title="중지">
                          <StopCircle className="w-4 h-4 text-amber-600" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => onDelete(c)} disabled={remove.isPending} title="삭제">
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
