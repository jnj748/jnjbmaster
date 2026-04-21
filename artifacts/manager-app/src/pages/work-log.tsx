import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/auth-context";
import { useToast } from "@/hooks/use-toast";
import { AuthImage } from "@/components/auth-image";
import { downloadElementAsPng, safeFilename } from "@/lib/document-export";
import { shareDocument, formatKoreanDate } from "@/lib/official-document";
import {
  Wrench, Receipt, MessageSquareWarning, ChevronLeft, ChevronRight,
  CheckCircle2, AlertTriangle, Image as ImageIcon, Download, Share2, NotebookPen,
} from "lucide-react";
import { detectFollowUp, type FollowUpDetection, type FollowUpSource } from "@/lib/follow-up-detection";
import { FollowUpSuggestionDialog } from "@/components/follow-up-suggestion-dialog";

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
  securityStatus: Status; securityMemo: string | null;
  cleaningStatus: Status; cleaningMemo: string | null;
  facilityStatus: Status; facilityMemo: string | null;
  complaintStatus: Status; complaintMemo: string | null;
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

export default function WorkLogPage() {
  const [tab, setTab] = useState<"timeline" | "daily" | "weekly" | "monthly">("timeline");
  const [autoOpenDailyWizard, setAutoOpenDailyWizard] = useState(false);

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <NotebookPen className="w-5 h-5 text-accent" />
        <h1 className="text-xl font-bold">업무 기록</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        평소엔 가볍게 메모만, 보고할 땐 자동으로 일·주·월 보고서가 만들어집니다.
      </p>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="timeline" data-testid="tab-timeline">타임라인</TabsTrigger>
          <TabsTrigger value="daily" data-testid="tab-daily">일일</TabsTrigger>
          <TabsTrigger value="weekly" data-testid="tab-weekly">주간</TabsTrigger>
          <TabsTrigger value="monthly" data-testid="tab-monthly">월간</TabsTrigger>
        </TabsList>
        <TabsContent value="timeline">
          <TimelineTab onGoDaily={() => { setAutoOpenDailyWizard(true); setTab("daily"); }} />
        </TabsContent>
        <TabsContent value="daily">
          <DailyTab
            autoOpenWizard={autoOpenDailyWizard}
            onAutoOpenConsumed={() => setAutoOpenDailyWizard(false)}
          />
        </TabsContent>
        <TabsContent value="weekly"><WeeklyTab /></TabsContent>
        <TabsContent value="monthly"><MonthlyTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ───────────────────────── 타임라인 탭 ───────────────────────── */
function TimelineTab({ onGoDaily }: { onGoDaily: () => void }) {
  const { call } = useApi();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [editing, setEditing] = useState<WorkLogEntry | null>(null);
  const [editMemo, setEditMemo] = useState("");

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
            아직 기록이 없습니다. 우측 하단의 + 버튼으로 빠르게 추가해보세요.
          </CardContent>
        </Card>
      ) : (
        grouped.map(([date, items]) => (
          <div key={date} className="space-y-2">
            <div className="text-xs font-semibold text-muted-foreground sticky top-0 bg-background py-1">
              {formatKoreanDate(date)}
            </div>
            {items.map((e) => {
              const Icon = CATEGORY_ICON[e.category];
              return (
                <Card key={e.id} data-testid={`entry-${e.id}`}>
                  <CardContent className="p-3 flex gap-3">
                    <div className="w-9 h-9 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-accent" />
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
                    <div className="flex flex-col gap-1 shrink-0 text-xs">
                      <button
                        onClick={() => { setEditing(e); setEditMemo(e.memo); }}
                        className="text-muted-foreground hover:text-foreground"
                        data-testid={`edit-${e.id}`}
                      >
                        수정
                      </button>
                      <button
                        onClick={() => { if (confirm("삭제할까요?")) removeMut.mutate(e.id); }}
                        className="text-muted-foreground hover:text-destructive"
                        data-testid={`delete-${e.id}`}
                      >
                        삭제
                      </button>
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
    </div>
  );
}

/* ───────────────────────── 일일 탭 (위저드 + 보고서) ───────────────────────── */
function DailyTab({ autoOpenWizard = false, onAutoOpenConsumed }: { autoOpenWizard?: boolean; onAutoOpenConsumed?: () => void } = {}) {
  const [date, setDate] = useState(todayISO());
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, -1))} data-testid="daily-prev">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" data-testid="daily-date" />
          <Button variant="outline" size="sm" onClick={() => setDate(addDays(date, 1))} data-testid="daily-next">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <Button onClick={() => setWizardOpen(true)} data-testid="open-wizard">
          {reportQ.data?.journal ? "일일 일지 수정" : "일일 일지 작성"}
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

function DailyReportPreview({ report }: { report: DailyReport }) {
  const ref = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  async function exportPng() {
    if (!ref.current) return;
    try {
      await downloadElementAsPng(ref.current, safeFilename(`일일보고서_${report.date}`));
    } catch (e) {
      toast({ title: "내보내기 실패", description: String(e), variant: "destructive" });
    }
  }
  async function share() {
    const text = buildDailyShareText(report);
    const r = await shareDocument({ title: `일일 보고서 ${report.date}`, text });
    if (r === "copied") toast({ title: "본문이 클립보드에 복사되었습니다" });
    else if (r === "failed") toast({ title: "공유 실패", variant: "destructive" });
  }

  return (
    <>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={exportPng} data-testid="daily-export-png">
          <Download className="w-4 h-4 mr-1" /> PNG
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()} data-testid="daily-print">
          인쇄/PDF
        </Button>
        <Button variant="outline" size="sm" onClick={share} data-testid="daily-share">
          <Share2 className="w-4 h-4 mr-1" /> 공유
        </Button>
      </div>

      <div ref={ref} className="bg-white text-foreground p-4 rounded-lg border space-y-4">
        <header className="border-b pb-2">
          <h2 className="text-lg font-bold">일일 업무 보고서</h2>
          <p className="text-xs text-muted-foreground">
            {report.buildingName ?? "건물"} · {formatKoreanDate(report.date)} · 작성 {report.authorName}
          </p>
        </header>

        <section>
          <h3 className="text-sm font-semibold mb-2">1. 일일 일지</h3>
          {report.journal ? (
            <div className="space-y-1.5">
              {SECTIONS.map((s) => {
                const status = report.journal![`${s.key}Status` as const] as Status;
                const memo = report.journal![`${s.key}Memo` as const] as string | null;
                return (
                  <div key={s.key} className="flex items-start gap-2 text-sm">
                    {status === "ok" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    )}
                    <div className="flex-1">
                      <div className="font-medium">{s.label} <span className="text-xs text-muted-foreground">{status === "ok" ? "이상 없음" : "특이사항"}</span></div>
                      {memo ? <div className="text-xs text-muted-foreground whitespace-pre-wrap">{memo}</div> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">아직 작성되지 않았습니다.</p>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold mb-2">2. 금일 업무 기록 ({report.entries.length}건)</h3>
          {report.entries.length === 0 ? (
            <p className="text-xs text-muted-foreground">기록 없음</p>
          ) : (
            <ul className="space-y-1.5">
              {report.entries.map((e) => (
                <li key={e.id} className="text-sm flex gap-2">
                  <Badge variant="outline" className="text-[10px] h-5 shrink-0">{CATEGORY_LABEL[e.category]}</Badge>
                  <span className="flex-1">{e.memo}{e.photoUrl ? <ImageIcon className="inline w-3 h-3 ml-1 text-muted-foreground" /> : null}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-sm font-semibold mb-2">3. 법정/정기 업무</h3>
          <div className="grid sm:grid-cols-3 gap-2 text-xs">
            <div className="border rounded p-2">
              <div className="font-medium text-emerald-700 mb-1">완료 ({report.statutory.completed.length})</div>
              {report.statutory.completed.length === 0 ? <span className="text-muted-foreground">없음</span> :
                <ul className="space-y-0.5">{report.statutory.completed.map((c, i) => <li key={i}>· {c.name}</li>)}</ul>}
            </div>
            <div className="border rounded p-2">
              <div className="font-medium text-amber-700 mb-1">미완료 ({report.statutory.postponed.length})</div>
              {report.statutory.postponed.length === 0 ? <span className="text-muted-foreground">없음</span> :
                <ul className="space-y-0.5">{report.statutory.postponed.map((p) => <li key={p.id}>· {p.name}</li>)}</ul>}
            </div>
            <div className="border rounded p-2">
              <div className="font-medium text-blue-700 mb-1">기안 ({report.statutory.drafted.length})</div>
              {report.statutory.drafted.length === 0 ? <span className="text-muted-foreground">없음</span> :
                <ul className="space-y-0.5">{report.statutory.drafted.map((d) => <li key={d.id}>· {d.title}</li>)}</ul>}
            </div>
          </div>
        </section>
      </div>
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
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpDetection, setFollowUpDetection] = useState<FollowUpDetection | null>(null);
  const [followUpSource, setFollowUpSource] = useState<FollowUpSource | null>(null);
  const [form, setForm] = useState({
    securityStatus: existing?.securityStatus ?? "ok" as Status,
    securityMemo: existing?.securityMemo ?? "",
    cleaningStatus: existing?.cleaningStatus ?? "ok" as Status,
    cleaningMemo: existing?.cleaningMemo ?? "",
    facilityStatus: existing?.facilityStatus ?? "ok" as Status,
    facilityMemo: existing?.facilityMemo ?? "",
    complaintStatus: existing?.complaintStatus ?? "ok" as Status,
    complaintMemo: existing?.complaintMemo ?? "",
  });

  const saveMut = useMutation({
    mutationFn: () => call<DailyJournal>(`/daily-journals/${date}`, {
      method: "PUT", body: JSON.stringify(form),
    }),
    onSuccess: (saved) => {
      toast({ title: "일일 일지가 저장되었습니다" });
      // [Task #197] 4개 영역 메모를 합쳐 후속 조치 키워드를 감지한다.
      const combined = SECTIONS
        .map((s) => `${s.label}: ${form[`${s.key}Memo` as const] ?? ""}`)
        .join("\n");
      const detection = detectFollowUp(combined);
      if (detection) {
        setFollowUpSource({
          type: "daily_journal",
          id: saved?.id ?? date,
          title: `${date} 일일업무일지 — ${detection.snippet.slice(0, 40)}`,
          occurredAt: date,
        });
        setFollowUpDetection(detection);
        setFollowUpOpen(true);
      } else {
        onSaved();
      }
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

  return (
    <>
    <FollowUpSuggestionDialog
      open={followUpOpen}
      source={followUpSource}
      detection={followUpDetection}
      onClose={() => { setFollowUpOpen(false); onSaved(); }}
    />
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
    </>
  );
}

/* ───────────────────────── 주간 탭 ───────────────────────── */
function WeeklyTab() {
  const [weekStart, setWeekStart] = useState(mondayOf(todayISO()));
  const { call } = useApi();
  const { toast } = useToast();
  const ref = useRef<HTMLDivElement>(null);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpDetection, setFollowUpDetection] = useState<FollowUpDetection | null>(null);
  const [followUpSource, setFollowUpSource] = useState<FollowUpSource | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["work-log-report-weekly", weekStart],
    queryFn: () => call<WeeklyReport>(`/work-log-reports/weekly?weekStart=${weekStart}`),
  });

  // [Task #197] 주간 보고서를 "생성/공유" 하는 시점에 후속 조치 키워드를 감지한다.
  // (단순 페이지 진입/탭 이동에는 띄우지 않는다.)
  function maybeOfferFollowUp(report: WeeklyReport) {
    const memos = [
      ...Object.values(report.sectionTotals).flatMap((s) => s.memos),
      ...report.days.flatMap((d) => d.topMemos),
    ].join("\n");
    const detection = detectFollowUp(memos);
    if (!detection) return;
    setFollowUpSource({
      type: "weekly_journal",
      id: report.weekStart,
      title: `${report.weekStart}~${report.weekEnd} 주간보고 — ${detection.snippet.slice(0, 30)}`,
      occurredAt: report.weekStart,
    });
    setFollowUpDetection(detection);
    setFollowUpOpen(true);
  }

  async function exportPng() {
    if (!ref.current || !data) return;
    try {
      await downloadElementAsPng(ref.current, safeFilename(`주간보고서_${data.weekStart}_${data.weekEnd}`));
      maybeOfferFollowUp(data);
    } catch (e) {
      toast({ title: "내보내기 실패", description: String(e), variant: "destructive" });
    }
  }
  async function share() {
    if (!data) return;
    const lines = [
      `[${data.buildingName ?? "건물"}] 주간 업무 보고 (${data.weekStart} ~ ${data.weekEnd})`,
      `일지 ${data.totalJournals}/7일 · 기록 ${data.totalEntries}건 · 특이 ${data.issues}건`,
      "",
      data.textSummary,
      "",
      ...SECTIONS.map((s) => `■ ${s.label}: 특이 ${data.sectionTotals[s.key].issues}일`),
    ];
    const r = await shareDocument({ title: `주간 보고 ${data.weekStart}`, text: lines.join("\n") });
    if (r === "copied") toast({ title: "본문이 클립보드에 복사되었습니다" });
    else if (r === "failed") {
      toast({ title: "공유 실패", variant: "destructive" });
      return;
    }
    maybeOfferFollowUp(data);
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
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))} data-testid="weekly-prev"><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-medium" data-testid="weekly-range">{formatWeekLabel(weekStart)}</span>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))} data-testid="weekly-next"><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportPng} data-testid="weekly-export-png">
            <Download className="w-4 h-4 mr-1" /> PNG
          </Button>
          <Button variant="outline" size="sm" onClick={share} data-testid="weekly-share">
            <Share2 className="w-4 h-4 mr-1" /> 공유
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : data ? (
        <div ref={ref} className="bg-white p-4 rounded-lg border space-y-4">
          <header className="border-b pb-2">
            <h2 className="text-lg font-bold">주간 업무 보고서</h2>
            <p className="text-xs text-muted-foreground">{data.buildingName ?? "건물"} · {formatWeekLabel(data.weekStart)}</p>
          </header>

          <section className="grid grid-cols-3 gap-2 text-center">
            <Stat label="작성된 일지" value={`${data.totalJournals}/7`} />
            <Stat label="업무 기록" value={`${data.totalEntries}건`} />
            <Stat label="특이사항" value={`${data.issues}건`} />
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-2">주간 요약</h3>
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap" data-testid="weekly-text-summary">
              {data.textSummary}
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-2">요일별 요약</h3>
            <div className="grid grid-cols-7 gap-1">
              {data.days.map((d) => (
                <div key={d.date} className="border rounded p-1.5 text-center text-[11px]">
                  <div className="font-medium">{d.date.slice(5)}</div>
                  <div className={d.hasJournal ? "text-emerald-600" : "text-muted-foreground"}>
                    {d.hasJournal ? "✓" : "—"}
                  </div>
                  <div className="text-muted-foreground">{d.entryCount}건</div>
                  {d.issueCount > 0 && <div className="text-amber-600">⚠ {d.issueCount}</div>}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-2">영역별 특이사항</h3>
            <div className="space-y-2">
              {SECTIONS.map((s) => {
                const tot = data.sectionTotals[s.key];
                return (
                  <div key={s.key} className="text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{s.label}</span>
                      <span className="text-muted-foreground">{tot.issues}일</span>
                    </div>
                    {tot.memos.length > 0 && (
                      <ul className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                        {tot.memos.slice(0, 3).map((m, i) => <li key={i}>· {m}</li>)}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-2">분류별 기록</h3>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <Stat label="시설" value={`${data.byCategory.facility}`} />
              <Stat label="관리비" value={`${data.byCategory.bill}`} />
              <Stat label="민원" value={`${data.byCategory.complaint}`} />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

/* ───────────────────────── 월간 탭 ───────────────────────── */
function MonthlyTab() {
  const [month, setMonth] = useState(thisMonth());
  const { call } = useApi();
  const { toast } = useToast();
  const ref = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["work-log-report-monthly", month],
    queryFn: () => call<MonthlyReport>(`/work-log-reports/monthly?month=${month}`),
  });

  async function exportPng() {
    if (!ref.current || !data) return;
    try {
      await downloadElementAsPng(ref.current, safeFilename(`월간보고서_${data.month}`));
    } catch (e) {
      toast({ title: "내보내기 실패", description: String(e), variant: "destructive" });
    }
  }
  async function share() {
    if (!data) return;
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
  }

  function shiftMonth(delta: number) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }

  return (
    <div className="space-y-3 pt-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => shiftMonth(-1)} data-testid="monthly-prev"><ChevronLeft className="w-4 h-4" /></Button>
          <span className="text-sm font-medium" data-testid="monthly-label">{month}</span>
          <Button variant="outline" size="sm" onClick={() => shiftMonth(1)} data-testid="monthly-next"><ChevronRight className="w-4 h-4" /></Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportPng} data-testid="monthly-export-png">
            <Download className="w-4 h-4 mr-1" /> PNG
          </Button>
          <Button variant="outline" size="sm" onClick={share} data-testid="monthly-share">
            <Share2 className="w-4 h-4 mr-1" /> 공유
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : data ? (
        <div ref={ref} className="bg-white p-4 rounded-lg border space-y-4">
          <header className="border-b pb-2">
            <h2 className="text-lg font-bold">월간 업무 보고서</h2>
            <p className="text-xs text-muted-foreground">{data.buildingName ?? "건물"} · {data.month}</p>
          </header>

          <section className="grid grid-cols-4 gap-2">
            <Stat label="작성된 일지" value={`${data.totalJournals}일`} />
            <Stat label="업무 기록" value={`${data.totalEntries}건`} />
            <Stat label="총 주차" value={`${data.weeks.length}주`} />
            <Stat label="특이사항" value={`${data.issues}건`} />
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-2">월간 요약</h3>
            <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap" data-testid="monthly-text-summary">
              {data.textSummary}
            </p>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-2">주차별 요약</h3>
            <div className="space-y-1.5">
              {data.weeks.length === 0 ? (
                <p className="text-xs text-muted-foreground">기록 없음</p>
              ) : data.weeks.map((w) => (
                <Card key={w.weekStart} data-testid={`monthly-week-${w.weekStart}`}>
                  <CardContent className="p-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="font-medium">{w.weekStart} ~ {w.weekEnd}</span>
                      <span className="text-xs text-muted-foreground">일지 {w.totalJournals}일 · 기록 {w.totalEntries}건 · 특이 {w.issues}건</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                      {w.textSummary}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-2">분류별 합계</h3>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat label="시설" value={`${data.byCategory.facility}`} />
              <Stat label="관리비" value={`${data.byCategory.bill}`} />
              <Stat label="민원" value={`${data.byCategory.complaint}`} />
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-3 text-center">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
