import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/auth-context";
import { useBuilding } from "@/contexts/building-context";
import { useToast } from "@/hooks/use-toast";
import { AuthImage } from "@/components/auth-image";
import { A4DocumentFrame, type A4DocumentFrameHandle } from "@/components/a4-document-frame";
import { PhotoUploadField } from "@/components/photo-upload-field";
import { downloadElementAsPng, safeFilename } from "@/lib/document-export";
import {
  shareDocument,
  formatKoreanDate,
} from "@/lib/official-document";
import { CompletionNotice } from "@/components/completion-notice";
import {
  Wrench, Receipt, MessageSquareWarning, ChevronLeft, ChevronRight,
  CheckCircle2, AlertTriangle, Image as ImageIcon, ImageDown, Share2, Printer, NotebookPen,
  FileText,
} from "lucide-react";
import { detectFollowUp, type FollowUpDetection, type FollowUpSource } from "@/lib/follow-up-detection";
import { FollowUpSuggestionDialog, isFollowUpDismissed } from "@/components/follow-up-suggestion-dialog";
import {
  CATEGORY_ICON_CLASS,
  CATEGORY_BG_CLASS,
  WORK_LOG_CATEGORY_TOKEN,
} from "@/lib/category-colors";

type Category = "facility" | "bill" | "complaint";
type Status = "ok" | "issue";

interface WorkLogEntry {
  id: number;
  category: Category;
  memo: string;
  photoUrl: string | null;
  occurredAt: string;
  occurredDate: string;
  authorName: string;
}

interface DailyJournal {
  id: number;
  journalDate: string;
  authorName: string;
  securityStatus: Status; securityMemo: string | null; securityPhotoUrl: string | null;
  cleaningStatus: Status; cleaningMemo: string | null; cleaningPhotoUrl: string | null;
  facilityStatus: Status; facilityMemo: string | null; facilityPhotoUrl: string | null;
  complaintStatus: Status; complaintMemo: string | null; complaintPhotoUrl: string | null;
}

interface DailyReport {
  date: string;
  buildingName: string | null;
  authorName: string;
  journal: DailyJournal | null;
  entries: WorkLogEntry[];
  statutory: {
    completed: { name: string; result: string | null; memo: string | null }[];
    postponed: { id: number; name: string; nextDueDate: string | null }[];
    drafted: { id: number; title: string; draftType: string }[];
  };
}

interface WeeklyReport {
  weekStart: string; weekEnd: string;
  buildingName: string | null;
  days: { date: string; hasJournal: boolean; issueCount: number; entryCount: number; topMemos: string[] }[];
  sectionTotals: Record<"security" | "cleaning" | "facility" | "complaint", { issues: number; memos: string[] }>;
  byCategory: { facility: number; bill: number; complaint: number };
  totalEntries: number;
  totalJournals: number;
  issues: number;
  textSummary: string;
}

interface MonthlyWeekRollup {
  weekStart: string;
  weekEnd: string;
  totalJournals: number;
  totalEntries: number;
  issues: number;
  byCategory: { facility: number; bill: number; complaint: number };
  sectionTotals: Record<"security" | "cleaning" | "facility" | "complaint", { issues: number; memos: string[] }>;
  textSummary: string;
}

interface MonthlyReport {
  month: string; monthStart: string; monthEnd: string;
  buildingName: string | null;
  weeks: MonthlyWeekRollup[];
  totalEntries: number;
  totalJournals: number;
  issues: number;
  byCategory: { facility: number; bill: number; complaint: number };
  sectionTotals: Record<"security" | "cleaning" | "facility" | "complaint", { issues: number; memos: string[] }>;
  textSummary: string;
}

const CATEGORY_LABEL: Record<Category, string> = {
  facility: "시설", bill: "관리비", complaint: "민원",
};
const CATEGORY_ICON: Record<Category, typeof Wrench> = {
  facility: Wrench, bill: Receipt, complaint: MessageSquareWarning,
};

const SECTIONS: { key: "security" | "cleaning" | "facility" | "complaint"; label: string }[] = [
  { key: "security", label: "보안 / 출입" },
  { key: "cleaning", label: "청소 / 미화" },
  { key: "facility", label: "시설 / 점검" },
  { key: "complaint", label: "민원 / 소통" },
];

/** KST(UTC+9) 기준 YYYY-MM-DD. */
function toKstDateKey(d: Date): string {
  const ms = d.getTime() + 9 * 60 * 60 * 1000;
  return new Date(ms).toISOString().split("T")[0];
}
function todayISO(): string {
  return toKstDateKey(new Date());
}
function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().split("T")[0];
}
function mondayOf(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(iso, diff);
}
function formatWeekLabel(mondayIso: string): string {
  const [y, m, d] = mondayIso.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(y, m - 1, 1));
  const firstDow = firstOfMonth.getUTCDay();
  const firstMondayDay = 1 + ((8 - firstDow) % 7);
  const weekNum = Math.floor((d - firstMondayDay) / 7) + 1;
  return `${String(m).padStart(2, "0")}월 ${weekNum}주차`;
}
function thisMonth(): string {
  const today = todayISO();
  return today.slice(0, 7);
}

function useApi() {
  const { token } = useAuth();
  const BASE = import.meta.env.BASE_URL ?? "/";
  const apiBase = `${BASE}api`.replace(/\/+/g, "/");

  async function call<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${apiBase}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    if (res.status === 204) return null as T;
    return (await res.json()) as T;
  }
  return { call };
}

type WorkLogTab = "timeline" | "daily" | "weekly" | "monthly" | "activity";

function readInitialTab(): WorkLogTab {
  if (typeof window === "undefined") return "timeline";
  const sp = new URLSearchParams(window.location.search);
  const t = sp.get("tab");
  if (
    t === "daily" || t === "weekly" || t === "monthly" ||
    t === "timeline" || t === "activity"
  ) return t;
  return "timeline";
}

// [개선] 대시보드/타임라인의 "오늘 업무일지 만들기" 진입점은 일보 탭으로
// 먼저 보내지 않고, 곧장 작성 모달을 띄운다. 모달 저장 완료 후에 일보 탭으로
// 자동 이동하여 단계 수를 줄이고 두 진입점의 동작을 일관되게 만든다.
function readInitialOpenDaily(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("openDaily") === "1";
}

export default function WorkLogPage() {
  const [tab, setTab] = useState<WorkLogTab>(readInitialTab);
  const [autoOpenDailyWizard, setAutoOpenDailyWizard] = useState(false);
  // [개선] 페이지 상단에서 "오늘 일지" 작성 모달을 직접 띄운다. 어떤 탭에 있든
  //   모달은 그대로 노출되고, 저장 시 탭만 daily 로 전환한다.
  const [todayWizardOpen, setTodayWizardOpen] = useState<boolean>(readInitialOpenDaily);
  const today = useMemo(() => todayISO(), []);
  const { call } = useApi();
  // 오늘자 일지(있으면 form 의 기본값으로 사용)를 가볍게 미리 가져온다.
  const todayJournalQ = useQuery({
    queryKey: ["work-log-today-journal", today],
    queryFn: () => call<DailyJournal | null>(`/daily-journals/${today}`).catch(() => null),
    staleTime: 30 * 1000,
  });

  // [Task #250] URL 의 ?tab= 변경(processing 내역에서 일지로 점프 등)에 반응해 탭을 재동기화한다.
  useEffect(() => {
    const sync = () => {
      setTab(readInitialTab());
      if (readInitialOpenDaily()) setTodayWizardOpen(true);
    };
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  // 모달이 닫히면 URL 의 openDaily 플래그를 제거해 새로고침 시 다시 열리지 않도록 한다.
  useEffect(() => {
    if (todayWizardOpen) return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("openDaily")) {
      url.searchParams.delete("openDaily");
      window.history.replaceState({}, "", url.toString());
    }
  }, [todayWizardOpen]);

  // 탭 전환 시 URL 도 함께 업데이트해 새로고침/북마크 시 동일 탭으로 복귀.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") !== tab) {
      url.searchParams.set("tab", tab);
      window.history.replaceState({}, "", url.toString());
    }
  }, [tab]);

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <NotebookPen className="w-5 h-5 text-accent" />
        <h1 className="text-xl font-bold">업무일지</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        평소엔 가볍게 메모만, 보고할 땐 자동으로 일·주·월 일지가 만들어집니다.
      </p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        {/* [Task #256] 탭 라벨/순서 정비.
            data-testid 와 value 는 라우팅·딥링크 호환을 위해 기존 키(timeline·daily·
            weekly·monthly·activity)를 그대로 유지하되, 사용자에게 보이는 라벨만 바꾼다.
            순서: 금일기록(=timeline) → 일보 → 주보(자동) → 월보(자동) → 모든기록(=activity).
        */}
        {/* [Hotfix] 좁은 모바일 폭에서도 5개 탭이 동일한 가로 폭/높이로
            보이도록 h-auto + 균일한 padding/text-size 를 강제한다.
            기존 h-9 고정 + 활성 탭의 shadow 결합이 "선택된 탭만 커 보이는"
            착시를 유발했음. */}
        <TabsList className="grid grid-cols-5 w-full h-auto p-1 gap-1">
          <TabsTrigger value="timeline" data-testid="tab-timeline" className="text-[11px] px-1 py-1.5 h-8">금일기록</TabsTrigger>
          <TabsTrigger value="daily" data-testid="tab-daily" className="text-[11px] px-1 py-1.5 h-8">일보</TabsTrigger>
          <TabsTrigger value="weekly" data-testid="tab-weekly" className="text-[11px] px-1 py-1.5 h-8">주보(자동)</TabsTrigger>
          <TabsTrigger value="monthly" data-testid="tab-monthly" className="text-[11px] px-1 py-1.5 h-8">월보(자동)</TabsTrigger>
          <TabsTrigger value="activity" data-testid="tab-activity" className="text-[11px] px-1 py-1.5 h-8">모든기록</TabsTrigger>
        </TabsList>
        <TabsContent value="timeline">
          <TimelineTab onGoDaily={() => setTodayWizardOpen(true)} />
        </TabsContent>
        <TabsContent value="daily">
          <DailyTab
            autoOpenWizard={autoOpenDailyWizard}
            onAutoOpenConsumed={() => setAutoOpenDailyWizard(false)}
          />
        </TabsContent>
        <TabsContent value="weekly"><WeeklyTab /></TabsContent>
        <TabsContent value="monthly"><MonthlyTab /></TabsContent>
        <TabsContent value="activity"><ActivityTab /></TabsContent>
      </Tabs>

      {/* [개선] 모달은 페이지 최상위에서 렌더 — 어떤 탭에서 호출되어도 동일하게 노출. */}
      {todayWizardOpen && (
        <DailyJournalWizard
          date={today}
          existing={todayJournalQ.data ?? null}
          onClose={() => setTodayWizardOpen(false)}
          onSaved={() => {
            setTodayWizardOpen(false);
            todayJournalQ.refetch();
            setTab("daily");
          }}
        />
      )}
    </div>
  );
}

/* ───────────────────────── 타임라인 탭 ───────────────────────── */
function TimelineTab({ onGoDaily }: { onGoDaily: () => void }) {
  const { call } = useApi();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const { building } = useBuilding();
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [editing, setEditing] = useState<WorkLogEntry | null>(null);
  const [editMemo, setEditMemo] = useState("");
  // [Task #318] 카드별 "문서로만들기" — 필수업무 처리완료에서 쓰는 CompletionNotice
  // 모달을 그대로 띄워 공고문/보고서/기안서 흐름을 일원화한다.
  const [docEntry, setDocEntry] = useState<WorkLogEntry | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["work-logs", filter],
    queryFn: () => call<WorkLogEntry[]>(
      `/work-logs${filter === "all" ? "" : `?category=${filter}`}`,
    ),
  });

  const removeMut = useMutation({
    mutationFn: (id: number) => call<null>(`/work-logs/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "삭제되었습니다" });
      qc.invalidateQueries({ queryKey: ["work-logs"] });
    },
  });
  const editMut = useMutation({
    mutationFn: ({ id, memo }: { id: number; memo: string }) =>
      call<WorkLogEntry>(`/work-logs/${id}`, { method: "PATCH", body: JSON.stringify({ memo }) }),
    onSuccess: () => {
      toast({ title: "수정되었습니다" });
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["work-logs"] });
    },
  });

  const grouped = useMemo(() => {
    const map = new Map<string, WorkLogEntry[]>();
    (data ?? []).forEach((e) => {
      const arr = map.get(e.occurredDate) ?? [];
      arr.push(e);
      map.set(e.occurredDate, arr);
    });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [data]);

  return (
    <div className="space-y-3 pt-3">
      <Button onClick={onGoDaily} className="w-full" data-testid="timeline-goto-daily">
        오늘 업무일지 만들기
      </Button>
      <div className="flex gap-2 overflow-x-auto">
        {([
          ["all", "전체"], ["facility", "시설"], ["bill", "관리비"], ["complaint", "민원"],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setFilter(k as typeof filter)}
            data-testid={`filter-${k}`}
            className={`px-3 py-1.5 rounded-full text-xs whitespace-nowrap border ${
              filter === k ? "bg-accent text-accent-foreground border-accent" : "bg-background"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            아직 기록이 없습니다. 가운데 + 버튼으로 빠르게 추가해보세요.
          </CardContent>
        </Card>
      ) : (
        grouped.map(([date, items]) => (
          <div key={date} className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground sticky top-0 z-10 bg-background py-1">
              {formatKoreanDate(date)}
            </div>
            {items.map((e) => {
              const Icon = CATEGORY_ICON[e.category];
              // [Task #256] 카테고리별 5색 팔레트 토큰 — 시설=teal, 관리비=orange,
              // 민원=violet. 한 화면에 섞여 있을 때 색만 봐도 카테고리가 구분된다.
              const catToken = WORK_LOG_CATEGORY_TOKEN[e.category];
              const iconColor = CATEGORY_ICON_CLASS[catToken];
              const iconBg = CATEGORY_BG_CLASS[catToken];
              return (
                <Card key={e.id} id={`entry-${e.id}`} data-testid={`entry-${e.id}`}>
                  <CardContent className="p-3 flex gap-3">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}>
                      <Icon className={`w-4 h-4 ${iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-[10px]">{CATEGORY_LABEL[e.category]}</Badge>
                        <span>{e.authorName}</span>
                      </div>
                      <p className="text-sm whitespace-pre-wrap mt-1 break-words">{e.memo}</p>
                      {e.photoUrl ? (
                        <AuthImage src={e.photoUrl} alt="" className="mt-2 max-h-40 rounded-md border" />
                      ) : null}
                    </div>
                    {/* [Task #318] 액션 영역: 기안/견적 두 진입을 단일 "문서로만들기"
                        로 통합. 클릭 시 필수업무 처리완료에서 사용하는 동일한 공식
                        문서 프로세스(공고문/보고서/기안서)로 이어진다. 수정/삭제는 유지. */}
                    <div className="flex flex-col gap-1 shrink-0 text-[11px] items-start">
                      <button
                        type="button"
                        onClick={() => setDocEntry(e)}
                        title="이 기록으로 공고문·보고서·기안서 만들기"
                        className={`inline-flex items-center gap-1 ${CATEGORY_ICON_CLASS.residents} hover:opacity-80`}
                        data-testid={`make-doc-${e.id}`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>문서로만들기</span>
                      </button>
                      <div className="flex gap-2 pt-0.5">
                        <button
                          onClick={() => { setEditing(e); setEditMemo(e.memo); }}
                          className="text-muted-foreground hover:text-foreground text-left"
                          data-testid={`edit-${e.id}`}
                        >
                          수정
                        </button>
                        <button
                          onClick={() => { if (confirm("삭제할까요?")) removeMut.mutate(e.id); }}
                          className="text-muted-foreground hover:text-destructive text-left"
                          data-testid={`delete-${e.id}`}
                        >
                          삭제
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ))
      )}

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>업무 기록 수정</DialogTitle></DialogHeader>
          <Textarea
            value={editMemo}
            onChange={(e) => setEditMemo(e.target.value)}
            rows={4}
            data-testid="edit-memo-input"
          />
          <Button
            onClick={() => editing && editMut.mutate({ id: editing.id, memo: editMemo.trim() })}
            disabled={editMut.isPending || !editMemo.trim()}
            data-testid="edit-save"
          >
            저장
          </Button>
        </DialogContent>
      </Dialog>

      {/* [Task #318] 문서로만들기 — 필수업무 처리완료/제안업무 처리에서 사용하는
          CompletionNotice 모달을 그대로 띄운다. 풀페이지 /documents/preview 가 아닌
          모달 UI(상단 탭 + 하단 외부공유/이미지저장/문서로저장 + 우상단 수정)와
          빌딩명·공고NO·연락처가 포함된 정형문 빌더를 그대로 공유한다. */}
      {docEntry ? (
        <CompletionNotice
          open={!!docEntry}
          onOpenChange={(v) => { if (!v) setDocEntry(null); }}
          alertTitle={`[${CATEGORY_LABEL[docEntry.category]}] ${(docEntry.memo.split("\n")[0] || "업무일지 기록").slice(0, 80)}`}
          alertMessage={docEntry.memo}
          completedDate={docEntry.occurredDate || (docEntry.occurredAt ?? new Date().toISOString()).slice(0, 10)}
          notes={null}
          closeUpPhotoUrl={docEntry.photoUrl ?? null}
          widePhotoUrl={null}
          buildingName={building?.name}
          officeContact={
            building?.managementOfficePhone
              ? `관리사무소 ☎ ${building.managementOfficePhone}`
              : undefined
          }
          logoUrl={building?.logoUrl ?? null}
          authorName={user?.name ?? docEntry.authorName ?? null}
          initialDocKind="notice"
        />
      ) : null}
    </div>
  );
}

/* ───────────────────────── 일일 탭 (위저드 + 보고서) ───────────────────────── */
function DailyTab({ autoOpenWizard = false, onAutoOpenConsumed }: { autoOpenWizard?: boolean; onAutoOpenConsumed?: () => void } = {}) {
  // [Task #250] 처리 내역에서 일지 행을 클릭하면 ?date=YYYY-MM-DD 가 함께 전달되어
  //            해당 일자가 기본 선택되도록 한다.
  const [date, setDate] = useState(() => {
    if (typeof window === "undefined") return todayISO();
    const sp = new URLSearchParams(window.location.search);
    const d = sp.get("date");
    return d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayISO();
  });
  const [wizardOpen, setWizardOpen] = useState(false);
  const [pendingAutoOpen, setPendingAutoOpen] = useState(false);
  const { call } = useApi();

  useEffect(() => {
    if (autoOpenWizard) {
      setDate(todayISO());
      setPendingAutoOpen(true);
      onAutoOpenConsumed?.();
    }
  }, [autoOpenWizard, onAutoOpenConsumed]);

  const reportQ = useQuery({
    queryKey: ["work-log-report-daily", date],
    queryFn: () => call<DailyReport>(`/work-log-reports/daily?date=${date}`),
  });

  useEffect(() => {
    if (pendingAutoOpen && !reportQ.isLoading && !reportQ.isFetching) {
      setWizardOpen(true);
      setPendingAutoOpen(false);
    }
  }, [pendingAutoOpen, reportQ.isLoading, reportQ.isFetching]);

  return (
    <div className="space-y-3 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, -1))} data-testid="daily-prev">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-36 sm:w-40" data-testid="daily-date" />
          <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, 1))} data-testid="daily-next">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <Button size="sm" className="shrink-0 whitespace-nowrap" onClick={() => setWizardOpen(true)} data-testid="open-wizard">
          {reportQ.data?.journal ? "일지 수정" : "일지 작성"}
        </Button>
      </div>

      {reportQ.isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : reportQ.data ? (
        <DailyReportPreview report={reportQ.data} />
      ) : null}

      {wizardOpen && (
        <DailyJournalWizard
          date={date}
          existing={reportQ.data?.journal ?? null}
          onClose={() => setWizardOpen(false)}
          onSaved={() => { setWizardOpen(false); reportQ.refetch(); }}
        />
      )}
    </div>
  );
}

/**
 * [Task #205] 일/주/월 일지 공통 액션 버튼.
 * "이미지로 저장 / 공유 / 인쇄" 3개를 가로 풀폭 균등 배치한다.
 * 세 탭에서 명칭·아이콘·동작이 동일해야 한다.
 */
function ReportActionRow({
  onSaveImage, onShare, onPrint,
  saving = false, sharing = false,
  testidPrefix,
}: {
  onSaveImage: () => void;
  onShare: () => void;
  onPrint: () => void;
  saving?: boolean;
  sharing?: boolean;
  testidPrefix: string;
}) {
  // [Task #332] 모바일(약 360px)에서 1/3 컬럼이 좁아 "이미지로 저장" 라벨이
  // 컨테이너 밖으로 삐져나오는 현상을 방지한다.
  // - grid 1:1:1 균등 배치는 그대로 유지하되, 각 셀이 실제로 줄어들 수 있도록
  //   `min-w-0` 을 부여한다(grid item 기본 min-width 는 auto 라 콘텐츠를 밀어냄).
  // - Button 의 기본 `whitespace-nowrap` 을 `whitespace-normal` 로 풀고,
  //   한국어가 단어 중간에서 잘리지 않도록 `break-keep` 를 함께 적용해
  //   좁은 폭에서 "이미지로 / 저장" 처럼 자연스럽게 줄바꿈되도록 한다.
  // - 좌우 패딩(`px-2`)·아이콘 간격(`gap-1`)·폰트 크기(`text-xs sm:text-sm`)를
  //   컴팩트하게 줄여 컬럼 폭 안에서 안정적으로 표시되게 한다.
  // - 줄바꿈 시 높이가 자연스럽게 늘어나도록 `min-h-9 h-auto py-1.5` 로 보정한다.
  // - 라벨/아이콘 자체는 변경하지 않는다.
  const actionButtonClass =
    "w-full min-w-0 px-2 gap-1 text-xs sm:text-sm whitespace-normal break-keep leading-tight min-h-9 h-auto py-1.5";
  return (
    <div className="grid grid-cols-3 gap-2 print:hidden" data-testid={`${testidPrefix}-actions`}>
      <Button
        variant="outline"
        onClick={onSaveImage}
        disabled={saving}
        data-testid={`${testidPrefix}-save-image`}
        className={actionButtonClass}
      >
        <ImageDown className="w-4 h-4 shrink-0" />
        <span className="min-w-0">{saving ? "저장 중..." : "이미지로 저장"}</span>
      </Button>
      <Button
        variant="outline"
        onClick={onShare}
        disabled={sharing}
        data-testid={`${testidPrefix}-share`}
        className={actionButtonClass}
      >
        <Share2 className="w-4 h-4 shrink-0" />
        <span className="min-w-0">{sharing ? "공유 중..." : "공유"}</span>
      </Button>
      <Button
        variant="outline"
        onClick={onPrint}
        data-testid={`${testidPrefix}-print`}
        className={actionButtonClass}
      >
        <Printer className="w-4 h-4 shrink-0" />
        <span className="min-w-0">인쇄</span>
      </Button>
    </div>
  );
}

async function withReadyDoc<T>(
  frameRef: React.RefObject<A4DocumentFrameHandle | null>,
  fn: () => Promise<T> | T,
): Promise<T> {
  if (frameRef.current) return await frameRef.current.withFullScale(fn);
  return await fn();
}

function DailyReportPreview({ report }: { report: DailyReport }) {
  const ref = useRef<HTMLDivElement>(null);
  const frameRef = useRef<A4DocumentFrameHandle>(null);
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);

  async function exportPng() {
    if (!ref.current) return;
    setSaving(true);
    try {
      await withReadyDoc(frameRef, async () => {
        if (!ref.current) return;
        await downloadElementAsPng(ref.current, safeFilename(`일일일지_${report.date}`));
      });
      toast({ title: "이미지 저장 완료" });
    } catch (e) {
      toast({ title: "내보내기 실패", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }
  async function share() {
    setSharing(true);
    try {
      const text = buildDailyShareText(report);
      const r = await shareDocument({ title: `일일 일지 ${report.date}`, text });
      if (r === "copied") toast({ title: "본문이 클립보드에 복사되었습니다" });
      else if (r === "failed") toast({ title: "공유 실패", variant: "destructive" });
    } finally {
      setSharing(false);
    }
  }
  function print() {
    void withReadyDoc(frameRef, () => {
      window.print();
    });
  }

  return (
    <>
      <ReportActionRow
        testidPrefix="daily"
        onSaveImage={exportPng}
        onShare={share}
        onPrint={print}
        saving={saving}
        sharing={sharing}
      />

      <A4DocumentFrame ref={frameRef}>
        <div ref={ref} className="a4-document text-foreground space-y-3">
          <h2 className="text-2xl font-bold text-center border-b-2 border-black pb-3">일 일 업 무 보 고 서</h2>

          <table className="w-full text-sm border-collapse mt-2">
            <tbody>
              <tr>
                <td className="border border-gray-400 bg-gray-100 font-semibold w-24 p-2">건물명</td>
                <td className="border border-gray-400 p-2">{report.buildingName ?? "-"}</td>
                <td className="border border-gray-400 bg-gray-100 font-semibold w-24 p-2">일자</td>
                <td className="border border-gray-400 p-2">{formatKoreanDate(report.date)}</td>
              </tr>
              <tr>
                <td className="border border-gray-400 bg-gray-100 font-semibold p-2">작성자</td>
                <td className="border border-gray-400 p-2">{report.authorName ?? "-"}</td>
                <td className="border border-gray-400 bg-gray-100 font-semibold p-2">작성일</td>
                <td className="border border-gray-400 p-2">{formatKoreanDate(todayISO())}</td>
              </tr>
              <tr>
                <td className="border border-gray-400 bg-gray-100 font-semibold p-2">총괄</td>
                <td className="border border-gray-400 p-2" colSpan={3}>
                  업무 기록 {report.entries.length}건 · 법정업무 완료 {report.statutory.completed.length} / 미완료 {report.statutory.postponed.length} / 기안 {report.statutory.drafted.length}
                </td>
              </tr>
            </tbody>
          </table>

          <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">1. 일일 일지</p>
          {report.journal ? (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="border border-gray-400 bg-gray-100 p-2 w-28">영역</th>
                  <th className="border border-gray-400 bg-gray-100 p-2 w-24">상태</th>
                  <th className="border border-gray-400 bg-gray-100 p-2">메모</th>
                </tr>
              </thead>
              <tbody>
                {SECTIONS.map((s) => {
                  const status = report.journal![`${s.key}Status` as const] as Status;
                  const memo = report.journal![`${s.key}Memo` as const] as string | null;
                  return (
                    <tr key={s.key}>
                      <td className="border border-gray-400 p-2 font-semibold">{s.label}</td>
                      <td className="border border-gray-400 p-2 text-center">
                        {status === "ok" ? "이상 없음" : "특이사항"}
                      </td>
                      <td className="border border-gray-400 p-2 whitespace-pre-line">{memo || "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-xs text-muted-foreground border border-gray-300 rounded p-3">아직 작성되지 않았습니다.</p>
          )}

          {/* [일보] 첨부사진을 셀 안에 명함 크기(약 85mm 폭, 16:9) 고정 틀로
              자동첨부. 사진 유무·원본 비율과 무관하게 표 레이아웃이 변하지
              않도록 (1) table-layout: fixed 로 열 폭 고정, (2) 사진 없는 행도
              동일 크기의 placeholder 박스를 그려 행 높이를 일정하게 유지,
              (3) 메모 컬럼은 break-words 로 좁은 폭에서도 안정 정렬. */}
          <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">2. 금일 업무 기록 ({report.entries.length}건)</p>
          {report.entries.length === 0 ? (
            <p className="text-sm border border-gray-300 rounded p-3 text-muted-foreground">기록 없음</p>
          ) : (
            <table className="w-full text-sm border-collapse table-fixed">
              <colgroup>
                <col className="w-20" />
                <col />
                <col className="w-[200px] print:w-[90mm]" />
              </colgroup>
              <thead>
                <tr>
                  <th className="border border-gray-400 bg-gray-100 p-2">분류</th>
                  <th className="border border-gray-400 bg-gray-100 p-2">메모</th>
                  <th className="border border-gray-400 bg-gray-100 p-2">사진</th>
                </tr>
              </thead>
              <tbody>
                {report.entries.map((e) => (
                  <tr key={e.id} className="break-inside-avoid align-middle">
                    <td className="border border-gray-400 p-2 align-middle">{CATEGORY_LABEL[e.category]}</td>
                    <td className="border border-gray-400 p-2 whitespace-pre-line break-words align-middle">{e.memo}</td>
                    <td className="border border-gray-400 p-1 text-center align-middle">
                      <div
                        className={`mx-auto w-[180px] print:w-[85mm] aspect-video overflow-hidden rounded border bg-gray-50 ${
                          e.photoUrl ? "border-gray-300" : "border-dashed border-gray-300"
                        }`}
                      >
                        {e.photoUrl ? (
                          <AuthImage
                            src={e.photoUrl}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[11px] text-muted-foreground">
                            사진 없음
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">3. 법정/정기 업무</p>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className="border border-gray-400 bg-gray-100 p-2 w-24">구분</th>
                <th className="border border-gray-400 bg-gray-100 p-2 w-16">건수</th>
                <th className="border border-gray-400 bg-gray-100 p-2">내역</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-400 p-2 font-semibold">완료</td>
                <td className="border border-gray-400 p-2 text-center">{report.statutory.completed.length}</td>
                <td className="border border-gray-400 p-2">
                  {report.statutory.completed.length === 0
                    ? "-"
                    : report.statutory.completed.map((c) => c.name).join(", ")}
                </td>
              </tr>
              <tr>
                <td className="border border-gray-400 p-2 font-semibold">미완료</td>
                <td className="border border-gray-400 p-2 text-center">{report.statutory.postponed.length}</td>
                <td className="border border-gray-400 p-2">
                  {report.statutory.postponed.length === 0
                    ? "-"
                    : report.statutory.postponed.map((p) => p.name).join(", ")}
                </td>
              </tr>
              <tr>
                <td className="border border-gray-400 p-2 font-semibold">기안</td>
                <td className="border border-gray-400 p-2 text-center">{report.statutory.drafted.length}</td>
                <td className="border border-gray-400 p-2">
                  {report.statutory.drafted.length === 0
                    ? "-"
                    : report.statutory.drafted.map((d) => d.title).join(", ")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </A4DocumentFrame>
    </>
  );
}

function buildDailyShareText(r: DailyReport): string {
  const lines: string[] = [];
  lines.push(`[${r.buildingName ?? "건물"}] ${r.date} 일일 업무 보고`);
  lines.push(`작성: ${r.authorName}`);
  lines.push("");
  if (r.journal) {
    SECTIONS.forEach((s) => {
      const st = r.journal![`${s.key}Status` as const] as Status;
      const memo = r.journal![`${s.key}Memo` as const] as string | null;
      lines.push(`■ ${s.label}: ${st === "ok" ? "이상 없음" : "특이사항"}${memo ? ` — ${memo}` : ""}`);
    });
    lines.push("");
  }
  lines.push(`■ 금일 업무 기록 ${r.entries.length}건`);
  r.entries.forEach((e) => {
    lines.push(`  [${CATEGORY_LABEL[e.category]}] ${e.memo}`);
  });
  lines.push("");
  lines.push(`■ 법정업무: 완료 ${r.statutory.completed.length} / 미완료 ${r.statutory.postponed.length} / 기안 ${r.statutory.drafted.length}`);
  return lines.join("\n");
}

/* ─────────── 일일 일지 4단계 위저드 ─────────── */
function DailyJournalWizard({
  date, existing, onClose, onSaved,
}: { date: string; existing: DailyJournal | null; onClose: () => void; onSaved: () => void }) {
  const { call } = useApi();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    securityStatus: existing?.securityStatus ?? "ok" as Status,
    securityMemo: existing?.securityMemo ?? "",
    securityPhotoUrl: existing?.securityPhotoUrl ?? null as string | null,
    cleaningStatus: existing?.cleaningStatus ?? "ok" as Status,
    cleaningMemo: existing?.cleaningMemo ?? "",
    cleaningPhotoUrl: existing?.cleaningPhotoUrl ?? null as string | null,
    facilityStatus: existing?.facilityStatus ?? "ok" as Status,
    facilityMemo: existing?.facilityMemo ?? "",
    facilityPhotoUrl: existing?.facilityPhotoUrl ?? null as string | null,
    complaintStatus: existing?.complaintStatus ?? "ok" as Status,
    complaintMemo: existing?.complaintMemo ?? "",
    complaintPhotoUrl: existing?.complaintPhotoUrl ?? null as string | null,
  });

  const saveMut = useMutation({
    mutationFn: () => call<DailyJournal>(`/daily-journals/${date}`, {
      method: "PUT", body: JSON.stringify(form),
    }),
    onSuccess: () => {
      // [Task #269] 일보 저장 시 후속조치 팝업은 더 이상 띄우지 않는다.
      // 한 달 단위 누적 리마인드는 월보 탭에서만 1회 노출된다.
      toast({ title: "일일 일지가 저장되었습니다" });
      onSaved();
    },
    onError: (e) => toast({ title: "저장 실패", description: String(e), variant: "destructive" }),
  });

  // 단계 이동 시 자동 저장 (멱등 PUT). 실패해도 사용자 흐름은 막지 않는다.
  async function autoSave() {
    try {
      await call<DailyJournal>(`/daily-journals/${date}`, { method: "PUT", body: JSON.stringify(form) });
    } catch {
      // best-effort
    }
  }
  function goNext() { autoSave(); setStep(step + 1); }
  function goPrev() { autoSave(); setStep(step - 1); }

  const section = SECTIONS[step];
  const statusKey = `${section.key}Status` as const;
  const memoKey = `${section.key}Memo` as const;
  const photoKey = `${section.key}PhotoUrl` as const;

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{date} · 일일 일지 ({step + 1}/4)</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-1">
            {SECTIONS.map((_, i) => (
              <div key={i} className={`flex-1 h-1.5 rounded-full ${i <= step ? "bg-accent" : "bg-muted"}`} />
            ))}
          </div>

          <div>
            <h3 className="text-base font-semibold">{section.label}</h3>
            <p className="text-xs text-muted-foreground">오늘 이 영역에 특이사항이 있었나요?</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, [statusKey]: "ok" }))}
              data-testid={`wizard-${section.key}-ok`}
              className={`py-3 rounded-lg border flex items-center justify-center gap-1 ${
                form[statusKey] === "ok" ? "bg-emerald-50 border-emerald-500 text-emerald-700" : ""
              }`}
            >
              <CheckCircle2 className="w-4 h-4" /> 이상 없음
            </button>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, [statusKey]: "issue" }))}
              data-testid={`wizard-${section.key}-issue`}
              className={`py-3 rounded-lg border flex items-center justify-center gap-1 ${
                form[statusKey] === "issue" ? "bg-amber-50 border-amber-500 text-amber-700" : ""
              }`}
            >
              <AlertTriangle className="w-4 h-4" /> 특이사항
            </button>
          </div>

          <Textarea
            value={form[memoKey] ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, [memoKey]: e.target.value }))}
            placeholder={form[statusKey] === "issue" ? "어떤 일이 있었는지 알려주세요" : "메모 (선택)"}
            rows={3}
            data-testid={`wizard-${section.key}-memo`}
          />

          <PhotoUploadField
            label="사진 (선택)"
            value={form[photoKey] ?? null}
            onChange={(url) => setForm((f) => ({ ...f, [photoKey]: url }))}
            testId={`wizard-${section.key}-photo`}
          />

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => step === 0 ? onClose() : goPrev()} data-testid="wizard-prev">
              {step === 0 ? "취소" : "이전"}
            </Button>
            {step < 3 ? (
              <Button onClick={goNext} data-testid="wizard-next">다음</Button>
            ) : (
              <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} data-testid="wizard-save">
                {saveMut.isPending ? <Spinner className="w-4 h-4 mr-1" /> : null}
                저장
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────── 주간 탭 ───────────────────────── */
function WeeklyTab() {
  const [weekStart, setWeekStart] = useState(mondayOf(todayISO()));
  const { call } = useApi();
  const { toast } = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const frameRef = useRef<A4DocumentFrameHandle>(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["work-log-report-weekly", weekStart],
    queryFn: () => call<WeeklyReport>(`/work-log-reports/weekly?weekStart=${weekStart}`),
  });

  // [Task #269] 주보 이미지 내보내기/공유 시 후속조치 팝업은 더 이상 띄우지 않는다.
  // 한 달 단위 누적 리마인드는 월보 탭에서만 1회 노출된다.

  async function exportPng() {
    if (!ref.current || !data) return;
    setSaving(true);
    try {
      await withReadyDoc(frameRef, async () => {
        if (!ref.current) return;
        await downloadElementAsPng(ref.current, safeFilename(`주간일지_${data.weekStart}_${data.weekEnd}`));
      });
      toast({ title: "이미지 저장 완료" });
    } catch (e) {
      toast({ title: "내보내기 실패", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }
  async function share() {
    if (!data) return;
    setSharing(true);
    try {
      const lines = [
        `[${data.buildingName ?? "건물"}] 주간 업무 보고 (${data.weekStart} ~ ${data.weekEnd})`,
        `일지 ${data.totalJournals}/7일 · 기록 ${data.totalEntries}건 · 특이 ${data.issues}건`,
        "",
        data.textSummary,
        "",
        ...SECTIONS.map((s) => `■ ${s.label}: 특이 ${data.sectionTotals[s.key].issues}일`),
      ];
      const r = await shareDocument({ title: `주간 보고 ${data.weekStart}`, text: lines.join("\n") });
      if (r === "copied") {
        toast({ title: "본문이 클립보드에 복사되었습니다" });
      } else if (r === "failed") {
        toast({ title: "공유 실패", variant: "destructive" });
      }
    } finally {
      setSharing(false);
    }
  }
  function print() {
    void withReadyDoc(frameRef, () => { window.print(); });
  }

  return (
    <div className="space-y-3 pt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))} data-testid="weekly-prev"><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-medium" data-testid="weekly-range">{formatWeekLabel(weekStart)}</span>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))} data-testid="weekly-next"><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

      <ReportActionRow
        testidPrefix="weekly"
        onSaveImage={exportPng}
        onShare={share}
        onPrint={print}
        saving={saving}
        sharing={sharing}
      />

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : data ? (
        <A4DocumentFrame ref={frameRef}>
          <div ref={ref} className="a4-document text-foreground" style={{ fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif" }}>
            <WeeklyA4ReportBody report={data} />
          </div>
        </A4DocumentFrame>
      ) : null}
    </div>
  );
}

/* [Task #205] 주간 일지 — A4 보고서 양식. 내용이 길면 여러 장으로 출력된다. */
function WeeklyA4ReportBody({ report }: { report: WeeklyReport }) {
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold text-center border-b-2 border-black pb-3">주 간 업 무 보 고 서</h2>
      <table className="w-full text-sm border-collapse mt-2">
        <tbody>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold w-24 p-2">건물명</td>
            <td className="border border-gray-400 p-2">{report.buildingName ?? "-"}</td>
            <td className="border border-gray-400 bg-gray-100 font-semibold w-24 p-2">기간</td>
            <td className="border border-gray-400 p-2">{formatKoreanDate(report.weekStart)} ~ {formatKoreanDate(report.weekEnd)}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">작성일</td>
            <td className="border border-gray-400 p-2">{formatKoreanDate(todayISO())}</td>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">주차</td>
            <td className="border border-gray-400 p-2">{formatWeekLabel(report.weekStart)}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">총괄</td>
            <td className="border border-gray-400 p-2" colSpan={3}>
              일지 {report.totalJournals}/7일 · 업무 기록 {report.totalEntries}건 · 특이사항 {report.issues}건
            </td>
          </tr>
        </tbody>
      </table>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">1. 주간 요약</p>
      <div className="text-[14px] leading-7 whitespace-pre-line border border-gray-300 rounded p-3" data-testid="weekly-text-summary">
        {report.textSummary || "기록 없음"}
      </div>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">2. 요일별 일지 / 기록</p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="border border-gray-400 bg-gray-100 p-2 w-28">일자</th>
            <th className="border border-gray-400 bg-gray-100 p-2 w-20">일지</th>
            <th className="border border-gray-400 bg-gray-100 p-2 w-20">기록</th>
            <th className="border border-gray-400 bg-gray-100 p-2 w-20">특이</th>
            <th className="border border-gray-400 bg-gray-100 p-2">주요 메모</th>
          </tr>
        </thead>
        <tbody>
          {report.days.map((d) => (
            <tr key={d.date}>
              <td className="border border-gray-400 p-2">{d.date}</td>
              <td className="border border-gray-400 p-2 text-center">{d.hasJournal ? "✓" : "—"}</td>
              <td className="border border-gray-400 p-2 text-center">{d.entryCount}</td>
              <td className="border border-gray-400 p-2 text-center">{d.issueCount}</td>
              <td className="border border-gray-400 p-2">
                {d.topMemos.length === 0 ? "-" : (
                  <ul className="space-y-0.5">{d.topMemos.map((m, i) => <li key={i}>· {m}</li>)}</ul>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">3. 영역별 특이사항</p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="border border-gray-400 bg-gray-100 p-2 w-32">영역</th>
            <th className="border border-gray-400 bg-gray-100 p-2 w-20">특이일수</th>
            <th className="border border-gray-400 bg-gray-100 p-2">주요 메모</th>
          </tr>
        </thead>
        <tbody>
          {SECTIONS.map((s) => {
            const tot = report.sectionTotals[s.key];
            return (
              <tr key={s.key}>
                <td className="border border-gray-400 p-2 font-semibold">{s.label}</td>
                <td className="border border-gray-400 p-2 text-center">{tot.issues}일</td>
                <td className="border border-gray-400 p-2">
                  {tot.memos.length === 0 ? "-" : (
                    <ul className="space-y-0.5">{tot.memos.slice(0, 5).map((m, i) => <li key={i}>· {m}</li>)}</ul>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">4. 분류별 기록 합계</p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="border border-gray-400 bg-gray-100 p-2">시설</th>
            <th className="border border-gray-400 bg-gray-100 p-2">관리비</th>
            <th className="border border-gray-400 bg-gray-100 p-2">민원</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-gray-400 p-2 text-center">{report.byCategory.facility}건</td>
            <td className="border border-gray-400 p-2 text-center">{report.byCategory.bill}건</td>
            <td className="border border-gray-400 p-2 text-center">{report.byCategory.complaint}건</td>
          </tr>
        </tbody>
      </table>

      <div className="text-right pt-8 text-sm space-y-1">
        <p>{formatKoreanDate(todayISO())}</p>
        <p>작성자: {/* author 정보는 일지 단위라 주간 보고서엔 표기 생략 */} 관리자 (서명)</p>
      </div>
    </div>
  );
}

/* ───────────────────────── 월간 탭 ───────────────────────── */
function MonthlyTab() {
  const [month, setMonth] = useState(thisMonth());
  const { call } = useApi();
  const { toast } = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const frameRef = useRef<A4DocumentFrameHandle>(null);
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpDetection, setFollowUpDetection] = useState<FollowUpDetection | null>(null);
  const [followUpSource, setFollowUpSource] = useState<FollowUpSource | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["work-log-report-monthly", month],
    queryFn: () => call<MonthlyReport>(`/work-log-reports/monthly?month=${month}`),
  });

  // [Task #269] 월보 진입 시 해당 월의 메모/일보/주보 텍스트를 모아 후속조치
  // 키워드를 1회 감지하고 리마인드 팝업을 띄운다. "다음에 하기" 후엔 같은 달
  // 동안 다시 뜨지 않는다 (FollowUpSuggestionDialog 의 dismiss 셋 활용).
  useEffect(() => {
    if (!data) return;
    const memos = [
      data.textSummary,
      ...data.weeks.map((w) => w.textSummary),
      ...Object.values(data.sectionTotals).flatMap((s) => s.memos),
      ...data.weeks.flatMap((w) => Object.values(w.sectionTotals).flatMap((s) => s.memos)),
    ]
      .filter(Boolean)
      .join("\n");
    const detection = detectFollowUp(memos);
    if (!detection) return;
    // dismiss 키 안정성: 사용자 세션은 한 건물 컨텍스트만 보유하므로 month 만으로
    // 충분히 식별 가능. 건물명 변경/동명 건물 간 충돌 가능성을 피하기 위해
    // 가변적인 buildingName 은 키에서 제외한다.
    const nextSource: FollowUpSource = {
      type: "monthly_journal",
      id: data.month,
      title: `${data.month} 월간 후속조치 리마인드 — ${detection.snippet.slice(0, 30)}`,
      occurredAt: data.monthStart,
    };
    if (isFollowUpDismissed(nextSource)) return;
    setFollowUpSource(nextSource);
    setFollowUpDetection(detection);
    setFollowUpOpen(true);
  }, [data]);

  async function exportPng() {
    if (!ref.current || !data) return;
    setSaving(true);
    try {
      await withReadyDoc(frameRef, async () => {
        if (!ref.current) return;
        await downloadElementAsPng(ref.current, safeFilename(`월간일지_${data.month}`));
      });
      toast({ title: "이미지 저장 완료" });
    } catch (e) {
      toast({ title: "내보내기 실패", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }
  async function share() {
    if (!data) return;
    setSharing(true);
    try {
      const lines = [
        `[${data.buildingName ?? "건물"}] ${data.month} 월간 업무 보고`,
        `일지 ${data.totalJournals}일 · 기록 ${data.totalEntries}건 · ${data.weeks.length}주 · 특이 ${data.issues}건`,
        "",
        data.textSummary,
        "",
        ...data.weeks.map((w) => `[${w.weekStart}] ${w.textSummary}`),
      ];
      const r = await shareDocument({ title: `월간 보고 ${data.month}`, text: lines.join("\n") });
      if (r === "copied") toast({ title: "본문이 클립보드에 복사되었습니다" });
      else if (r === "failed") toast({ title: "공유 실패", variant: "destructive" });
    } finally {
      setSharing(false);
    }
  }
  function print() {
    void withReadyDoc(frameRef, () => { window.print(); });
  }

  function shiftMonth(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <div className="space-y-3 pt-3">
      <FollowUpSuggestionDialog
        open={followUpOpen}
        source={followUpSource}
        detection={followUpDetection}
        onClose={() => setFollowUpOpen(false)}
      />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => shiftMonth(-1)} data-testid="monthly-prev"><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-medium" data-testid="monthly-label">{month}</span>
          <Button variant="outline" size="sm" onClick={() => shiftMonth(1)} data-testid="monthly-next"><ChevronRight className="w-4 h-4" /></Button>
        </div>
      </div>

      <ReportActionRow
        testidPrefix="monthly"
        onSaveImage={exportPng}
        onShare={share}
        onPrint={print}
        saving={saving}
        sharing={sharing}
      />

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : data ? (
        <A4DocumentFrame ref={frameRef}>
          <div ref={ref} className="a4-document text-foreground" style={{ fontFamily: "'Noto Sans KR', 'Malgun Gothic', sans-serif" }}>
            <MonthlyA4ReportBody report={data} />
          </div>
        </A4DocumentFrame>
      ) : null}
    </div>
  );
}

/* [Task #205] 월간 일지 — A4 보고서 양식. 주차가 많을 경우 여러 장 출력 */
function MonthlyA4ReportBody({ report }: { report: MonthlyReport }) {
  return (
    <div className="space-y-3">
      <h2 className="text-2xl font-bold text-center border-b-2 border-black pb-3">월 간 업 무 보 고 서</h2>
      <table className="w-full text-sm border-collapse mt-2">
        <tbody>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold w-24 p-2">건물명</td>
            <td className="border border-gray-400 p-2">{report.buildingName ?? "-"}</td>
            <td className="border border-gray-400 bg-gray-100 font-semibold w-24 p-2">대상월</td>
            <td className="border border-gray-400 p-2">{report.month}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">기간</td>
            <td className="border border-gray-400 p-2">{formatKoreanDate(report.monthStart)} ~ {formatKoreanDate(report.monthEnd)}</td>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">작성일</td>
            <td className="border border-gray-400 p-2">{formatKoreanDate(todayISO())}</td>
          </tr>
          <tr>
            <td className="border border-gray-400 bg-gray-100 font-semibold p-2">총괄</td>
            <td className="border border-gray-400 p-2" colSpan={3}>
              일지 {report.totalJournals}일 · 업무 기록 {report.totalEntries}건 · {report.weeks.length}주차 · 특이사항 {report.issues}건
            </td>
          </tr>
        </tbody>
      </table>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">1. 월간 요약</p>
      <div className="text-[14px] leading-7 whitespace-pre-line border border-gray-300 rounded p-3" data-testid="monthly-text-summary">
        {report.textSummary || "기록 없음"}
      </div>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">2. 주차별 요약</p>
      {report.weeks.length === 0 ? (
        <p className="text-sm text-gray-600">기록 없음</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className="border border-gray-400 bg-gray-100 p-2 w-44">주차</th>
              <th className="border border-gray-400 bg-gray-100 p-2 w-20">일지</th>
              <th className="border border-gray-400 bg-gray-100 p-2 w-20">기록</th>
              <th className="border border-gray-400 bg-gray-100 p-2 w-20">특이</th>
              <th className="border border-gray-400 bg-gray-100 p-2">요약</th>
            </tr>
          </thead>
          <tbody>
            {report.weeks.map((w) => (
              <tr key={w.weekStart} data-testid={`monthly-week-${w.weekStart}`}>
                <td className="border border-gray-400 p-2">{w.weekStart}<br />~ {w.weekEnd}</td>
                <td className="border border-gray-400 p-2 text-center">{w.totalJournals}일</td>
                <td className="border border-gray-400 p-2 text-center">{w.totalEntries}건</td>
                <td className="border border-gray-400 p-2 text-center">{w.issues}건</td>
                <td className="border border-gray-400 p-2 whitespace-pre-line">{w.textSummary || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">3. 영역별 특이사항</p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="border border-gray-400 bg-gray-100 p-2 w-32">영역</th>
            <th className="border border-gray-400 bg-gray-100 p-2 w-20">특이일수</th>
            <th className="border border-gray-400 bg-gray-100 p-2">주요 메모</th>
          </tr>
        </thead>
        <tbody>
          {SECTIONS.map((s) => {
            const tot = report.sectionTotals[s.key];
            return (
              <tr key={s.key}>
                <td className="border border-gray-400 p-2 font-semibold">{s.label}</td>
                <td className="border border-gray-400 p-2 text-center">{tot.issues}일</td>
                <td className="border border-gray-400 p-2">
                  {tot.memos.length === 0 ? "-" : (
                    <ul className="space-y-0.5">{tot.memos.slice(0, 5).map((m, i) => <li key={i}>· {m}</li>)}</ul>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="font-semibold mt-4 mb-2 text-[15px] border-l-4 border-gray-700 pl-2">4. 분류별 기록 합계</p>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            <th className="border border-gray-400 bg-gray-100 p-2">시설</th>
            <th className="border border-gray-400 bg-gray-100 p-2">관리비</th>
            <th className="border border-gray-400 bg-gray-100 p-2">민원</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border border-gray-400 p-2 text-center">{report.byCategory.facility}건</td>
            <td className="border border-gray-400 p-2 text-center">{report.byCategory.bill}건</td>
            <td className="border border-gray-400 p-2 text-center">{report.byCategory.complaint}건</td>
          </tr>
        </tbody>
      </table>

      <div className="text-right pt-8 text-sm space-y-1">
        <p>{formatKoreanDate(todayISO())}</p>
        <p>작성자: 관리자 (서명)</p>
      </div>
    </div>
  );
}

/* ───────────────────────── 처리 내역 탭 (Task #250) ─────────────────────────
 * 메모(work_log_entries 단건), 후속조치(alert_actions 처리완료/연기),
 * 일일 일지(daily_journals 보고서) 를 한 화면에서 시간순(최신순)으로 본다.
 * 본 탭은 읽기 전용 통합 뷰이며, 원본 화면(메모: 타임라인 탭, 후속조치: 업무관리,
 * 일지: 일일 탭) 으로 즉시 이동할 수 있다.
 */
type ActivityKind = "memo" | "follow_up" | "journal";

interface ActivityRow {
  id: string;
  kind: ActivityKind;
  title: string;
  subtitle?: string;
  timestamp: string;
  href?: string;
  badge?: string;
}

const ACTIVITY_META: Record<ActivityKind, { label: string; className: string }> = {
  memo:      { label: "메모",     className: "border-amber-300 text-amber-700" },
  follow_up: { label: "처리완료", className: "border-blue-300 text-blue-700" },
  journal:   { label: "일지",     className: "border-emerald-300 text-emerald-700" },
};

const ACTIVITY_PAGE_SIZE = 20;

function ActivityTab() {
  const { call } = useApi();
  // [Hotfix] 사용자 요청: 분류 필터(전체/메모/처리완료/일지) 제거.
  // 모든 종류를 한 화면에 시간순으로 보여주고 기간 필터만 노출한다.
  // rangeDays = 7 / 30 / 90 + "custom" (기간검색 — startDate/endDate 직접 지정).
  type RangeMode = 7 | 30 | 90 | "custom";
  const [rangeMode, setRangeMode] = useState<RangeMode>(30);
  const [customStart, setCustomStart] = useState<string>(addDays(todayISO(), -29));
  const [customEnd, setCustomEnd] = useState<string>(todayISO());

  const startDate = useMemo(
    () => (rangeMode === "custom" ? customStart : addDays(todayISO(), -rangeMode + 1)),
    [rangeMode, customStart],
  );
  const endDate = useMemo(
    () => (rangeMode === "custom" ? customEnd : todayISO()),
    [rangeMode, customEnd],
  );

  const memosQ = useQuery({
    queryKey: ["activity-memos", startDate],
    queryFn: () => call<WorkLogEntry[]>(`/work-logs?startDate=${startDate}`),
  });

  const followUpsQ = useQuery({
    queryKey: ["activity-followups"],
    queryFn: () => call<Array<{
      id: number; alertType: string; relatedEntityType: string;
      actionType: string; notes: string | null; postponeReason: string | null;
      completedDate: string | null; createdAt: string;
    }>>(`/alert-actions`),
  });

  const journalsQ = useQuery({
    // [Task #250] 90일 필터에서 누락이 발생하지 않도록 서버 cap(100)까지 가져온다.
    queryKey: ["activity-journals"],
    queryFn: () => call<Array<{ id: number; journalDate: string; authorName: string }>>(
      `/daily-journals?limit=100`,
    ),
  });

  const isLoading = memosQ.isLoading || followUpsQ.isLoading || journalsQ.isLoading;

  const rows = useMemo<ActivityRow[]>(() => {
    const out: ActivityRow[] = [];
    // 시간 범위 = [startDate 00:00, endDate 24:00) — KST 기준 inclusive.
    const startMs = new Date(`${startDate}T00:00:00+09:00`).getTime();
    const endMs = new Date(`${endDate}T00:00:00+09:00`).getTime() + 24 * 60 * 60 * 1000;

    for (const m of memosQ.data ?? []) {
      const t = new Date(m.occurredAt).getTime();
      if (t < startMs || t >= endMs) continue;
      out.push({
        id: `memo-${m.id}`,
        kind: "memo",
        title: m.memo,
        subtitle: `${CATEGORY_LABEL[m.category]} · ${m.authorName}`,
        timestamp: m.occurredAt,
        // [Task #250] item-level deep link: 타임라인 탭으로 이동하며 해당 메모 id 를 fragment 로 전달.
        href: `/work-log?tab=timeline#entry-${m.id}`,
      });
    }
    for (const a of followUpsQ.data ?? []) {
      const t = new Date(a.createdAt).getTime();
      if (t < startMs || t >= endMs) continue;
      const action = a.actionType === "postponed" ? "연기" : "처리완료";
      out.push({
        id: `action-${a.id}`,
        kind: "follow_up",
        title: a.notes ?? a.postponeReason ?? `${a.alertType} ${action}`,
        subtitle: `${a.alertType} · ${action}`,
        timestamp: a.createdAt,
        href: "/tasks",
        badge: action,
      });
    }
    for (const j of journalsQ.data ?? []) {
      if (j.journalDate < startDate || j.journalDate > endDate) continue;
      out.push({
        id: `journal-${j.id}`,
        kind: "journal",
        title: `${j.journalDate} 일일 업무 보고서`,
        subtitle: j.authorName ? `작성자: ${j.authorName}` : undefined,
        timestamp: `${j.journalDate}T00:00:00.000Z`,
        // [Task #250] item-level deep link: 해당 일자 일지로 바로 이동.
        href: `/work-log?tab=daily&date=${j.journalDate}`,
      });
    }
    out.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));
    return out;
  }, [memosQ.data, followUpsQ.data, journalsQ.data, startDate, endDate]);

  return (
    <div className="space-y-3 pt-3">
      <p className="text-xs text-muted-foreground">
        메모·처리완료(후속조치)·일지를 한 곳에서 시간순으로 확인합니다.
      </p>
      {/* [Hotfix] 분류 필터 제거 — 모든 종류를 시간순으로 한 번에 보여주고
          기간만 선택할 수 있다. 빠른 선택(최근 7/30/90일) + 기간검색(직접 지정). */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {([7, 30, 90] as const).map((d) => (
          <button
            key={d}
            onClick={() => setRangeMode(d)}
            data-testid={`activity-range-${d}`}
            className={`px-3 py-1 rounded-full text-[11px] whitespace-nowrap border ${
              rangeMode === d
                ? "bg-accent text-accent-foreground border-accent"
                : "bg-background"
            }`}
          >
            최근 {d}일
          </button>
        ))}
        <button
          onClick={() => setRangeMode("custom")}
          data-testid="activity-range-custom"
          className={`px-3 py-1 rounded-full text-[11px] whitespace-nowrap border ${
            rangeMode === "custom"
              ? "bg-accent text-accent-foreground border-accent"
              : "bg-background"
          }`}
        >
          기간검색
        </button>
      </div>
      {rangeMode === "custom" && (
        <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="activity-range-custom-inputs">
          <Input
            type="date"
            value={customStart}
            max={customEnd}
            onChange={(e) => setCustomStart(e.target.value)}
            className="w-40 h-8 text-xs"
            data-testid="activity-range-custom-start"
          />
          <span className="text-muted-foreground">~</span>
          <Input
            type="date"
            value={customEnd}
            min={customStart}
            max={todayISO()}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="w-40 h-8 text-xs"
            data-testid="activity-range-custom-end"
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            선택한 기간에 처리 내역이 없습니다.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2" data-testid="activity-list">
          {rows.map((r) => {
            const meta = ACTIVITY_META[r.kind];
            const inner = (
              <Card data-testid={`activity-${r.id}`}>
                <CardContent className="p-3 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className={`text-[10px] ${meta.className}`}>
                      {meta.label}
                    </Badge>
                    {r.badge && (
                      <Badge variant="outline" className="text-[10px]">{r.badge}</Badge>
                    )}
                    <span className="ml-auto">
                      {formatKoreanDate(r.timestamp.slice(0, 10))}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap break-words line-clamp-3">
                    {r.title}
                  </p>
                  {r.subtitle && (
                    <p className="text-xs text-muted-foreground truncate">{r.subtitle}</p>
                  )}
                </CardContent>
              </Card>
            );
            return r.href ? (
              <a
                key={r.id}
                href={r.href}
                onClick={(e) => {
                  // 같은 페이지(/work-log) 내부 탭 이동은 부드럽게.
                  if (r.href === "/work-log?tab=daily") {
                    e.preventDefault();
                    const url = new URL(r.href, window.location.origin);
                    // [Task #250] hash 도 함께 보존해 메모 anchor(#entry-id) 가 유지되도록 한다.
                    window.history.pushState({}, "", url.pathname + url.search + url.hash);
                    window.dispatchEvent(new PopStateEvent("popstate"));
                    if (url.hash) {
                      // 다음 tick 에 anchor 로 스크롤 시도(요소 존재 시).
                      setTimeout(() => {
                        const el = document.getElementById(url.hash.slice(1));
                        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                      }, 50);
                    }
                  }
                }}
                className="block"
              >
                {inner}
              </a>
            ) : (
              <div key={r.id}>{inner}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
